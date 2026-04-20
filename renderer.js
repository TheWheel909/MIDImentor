// MIDI Teacher Renderer Logic

// UI Elements
const skillQuestionScreen = document.getElementById('skill-question-screen');
const assessmentScreen = document.getElementById('assessment-screen');
const libraryScreen = document.getElementById('library-screen');
const selectionScreen = document.getElementById('selection-screen');
const calibrationScreen = document.getElementById('calibration-screen');
const lessonPanel = document.getElementById('lesson-panel');
const visualizer = document.getElementById('visualizer');
const feedbackPanel = document.getElementById('feedback-panel');
const pianoContainer = document.getElementById('piano-container');
const deviceStatusDot = document.querySelector('.status-dot');
const deviceStatusText = document.querySelector('.status-text');
const midiLog = document.getElementById('midi-log');
const lessonTitle = document.getElementById('lesson-title');
const lessonDesc = document.getElementById('lesson-desc');
const progressBar = document.getElementById('progress-bar');
const nextLessonBtn = document.getElementById('next-lesson');
const resetAppBtn = document.getElementById('reset-app');
const calStepTitle = document.getElementById('cal-step-title');
const calStepDesc = document.getElementById('cal-step-desc');
const calNoteIndicator = document.getElementById('cal-note-indicator');
const selectPianoBtn = document.getElementById('select-piano');
const skillNoBtn = document.getElementById('skill-no');
const skillYesBtn = document.getElementById('skill-yes');
const skipToSongsBtn = document.getElementById('skip-to-songs');
const songGrid = document.getElementById('song-grid');
const assessmentTimerText = document.getElementById('assessment-timer-text');
const assessmentTimerPath = document.getElementById('assessment-timer-path');
const assessmentStatus = document.getElementById('assessment-status');

// Application State
let appState = 'SKILL_CHECK'; 
let selectedInstrument = null;
let midiAccess = null;

// Calibration Data
let calibration = JSON.parse(localStorage.getItem('miditeacher_cal')) || {
    step: 0,
    middleC: 60,
    lowNote: null,
    highNote: null
};

// Lesson Data
const PIANO_LESSONS = [];
// Generate 45 lessons + periodic songs
for (let i = 1; i <= 50; i++) {
    if (i % 10 === 0) {
        PIANO_LESSONS.push({
            title: `Milestone: Song ${i / 10}`,
            desc: "Let's put it all together! Play this sequence of notes.",
            sequence: [0, 2, 4, 0, 0, 2, 4, 0], // Frere Jacques start
            type: 'song'
        });
    } else {
        const offset = (Math.floor(i / 2)) % 12;
        PIANO_LESSONS.push({
            offset: offset,
            title: `Lesson ${i}: New Note`,
            desc: `Master the ${offset === 0 ? 'C' : 'next'} note in your journey.`
        });
    }
}

const FAMOUS_SONGS = [
    { title: "Ode to Joy", artist: "Beethoven", sequence: [4, 4, 5, 7, 7, 5, 4, 2, 0, 0, 2, 4, 4, 2, 2], difficulty: "Easy" },
    { title: "Twinkle Twinkle", artist: "Mozart", sequence: [0, 0, 7, 7, 9, 9, 7, 5, 5, 4, 4, 2, 2, 0], difficulty: "Beginner" },
    { title: "Fur Elise", artist: "Beethoven", sequence: [16, 15, 16, 15, 16, 11, 14, 12, 9], difficulty: "Intermediate" }
];

let currentLessonIndex = 0;
let sequenceIndex = 0; 
let currentSequence = null; // Holds the active sequence of notes
const keysMap = new Map();

// Recording Data
let assessmentData = [];
let assessmentStartTime = 0;
let isRecording = false;
let assessmentTimer = null;

const CAL_STEPS = [
    { title: "Middle C", desc: "Press Middle C on your piano (the one near the center)." },
    { title: "Lowest Note", desc: "Press the lowest white key on your piano." },
    { title: "Highest Note", desc: "Press the highest white key on your piano." }
];

// --- Initialization ---

function init() {
    // Check for saved calibration
    const savedCal = localStorage.getItem('miditeacher_cal');
    const savedInst = localStorage.getItem('miditeacher_inst');
    
    if (savedCal && savedInst) {
        calibration = JSON.parse(savedCal);
        selectedInstrument = savedInst;
        log('System: Calibration loaded from memory.', 'system');
    }

    showScreen(skillQuestionScreen);
    
    selectPianoBtn.addEventListener('click', () => startCalibration('piano'));
    skillNoBtn.addEventListener('click', () => handleSkillChoice(false));
    skillYesBtn.addEventListener('click', () => handleSkillChoice(true));
    skipToSongsBtn.addEventListener('click', () => openLibrary(true));
    resetAppBtn.addEventListener('click', resetToMenu);
    nextLessonBtn.addEventListener('click', advanceLesson);
    initMIDI();
}

function handleSkillChoice(hasExperience) {
    if (selectedInstrument && calibration.lowNote) {
        // We have calibration, jump to assessment or start
        if (hasExperience) startAssessment();
        else finishAppPrep();
    } else {
        // Need to choose instrument and calibrate first
        startNormalFlow();
    }
}

function resetToMenu() {
    location.reload();
}

function startNormalFlow() {
    appState = 'SELECTION';
    showScreen(selectionScreen);
}

function startAssessment() {
    appState = 'RECORDING';
    showScreen(assessmentScreen);
    log('System: AI level assessment starting...', 'system');
}

function openLibrary(skipped = false) {
    appState = 'LIBRARY';
    showScreen(libraryScreen);
    renderLibrary();
    if (skipped) log('System: Jumped to the good part!', 'system');
}

function renderLibrary() {
    songGrid.innerHTML = '';
    FAMOUS_SONGS.forEach((song, idx) => {
        const card = document.createElement('div');
        card.className = 'song-card';
        card.innerHTML = `
            <div class="difficulty">${song.difficulty}</div>
            <h4>${song.title}</h4>
            <div style="font-size: 0.8rem; color: var(--text-secondary)">${song.artist}</div>
        `;
        card.onclick = () => loadSong(song);
        songGrid.appendChild(card);
    });
}

function showScreen(...screens) {
    screens.forEach(s => s.classList.remove('hidden'));
}

function hideScreen(...screens) {
    screens.forEach(s => s.classList.add('hidden'));
}

// --- MIDI Handling ---

async function initMIDI() {
    if (navigator.requestMIDIAccess) {
        try {
            midiAccess = await navigator.requestMIDIAccess();
            midiAccess.onstatechange = updateStatus;
            updateStatus();
        } catch (err) {
            log('System: MIDI access denied.', 'error');
            deviceStatusText.innerText = 'MIDI blocked';
        }
    } else {
        log('System: Web MIDI API not supported.', 'error');
        deviceStatusText.innerText = 'Not supported';
    }
}

function updateStatus() {
    const inputs = Array.from(midiAccess.inputs.values());
    if (inputs.length > 0) {
        deviceStatusDot.classList.add('connected');
        deviceStatusText.innerText = `${inputs[0].name} connected`;
        inputs.forEach(input => {
            input.onmidimessage = handleMIDIMessage;
        });
    } else {
        deviceStatusDot.classList.remove('connected');
        deviceStatusText.innerText = 'No device';
    }
}

function handleMIDIMessage(event) {
    const [status, note, velocity] = event.data;
    const isNoteOn = status >= 144 && status <= 159 && velocity > 0;
    const isNoteOff = (status >= 128 && status <= 143) || (status >= 144 && status <= 159 && velocity === 0);

    if (isNoteOn) {
        handleNoteInput(note, velocity);
    } else if (isNoteOff) {
        handleNoteOff(note);
    }
}

function handleNoteInput(note, velocity) {
    if (appState === 'RECORDING') {
        if (!isRecording) startRecording();
        assessmentData.push({ note, velocity, time: Date.now() });
        assessmentStatus.innerText = "Analyzing performance intensity...";
    } else if (appState === 'CALIBRATING') {
        processCalibration(note);
    } else if (appState === 'LESSON') {
        noteOn(note);
    }
}

function startRecording() {
    isRecording = true;
    assessmentStartTime = Date.now();
    let timeLeft = 10;
    
    assessmentTimer = setInterval(() => {
        timeLeft--;
        assessmentTimerText.innerText = `${timeLeft}s`;
        
        const offset = 283 - (timeLeft / 10) * 283;
        assessmentTimerPath.style.strokeDashoffset = offset;
        
        if (timeLeft <= 0) {
            clearInterval(assessmentTimer);
            finishAssessment();
        }
    }, 1000);
}

// --- Assessment AI ---

function startAssessment() {
    appState = 'RECORDING';
    showScreen(assessmentScreen);
    hideScreen(skillQuestionScreen);
    log('System: AI is listening for your performance...', 'system');
}

function finishAssessment() {
    isRecording = false;
    
    // AI Analysis (Simulated)
    const uniqueNotes = new Set(assessmentData.map(d => d.note)).size;
    const noteCount = assessmentData.length;
    const duration = 10;
    const notesPerSecond = noteCount / duration;
    
    let level = 'Beginner';
    let startIndex = 0;
    
    if (notesPerSecond > 5 || uniqueNotes > 24) {
        level = 'Advanced';
        startIndex = 5;
    } else if (notesPerSecond > 2 || uniqueNotes > 12) {
        level = 'Intermediate';
        startIndex = 3;
    }
    
    currentLessonIndex = startIndex;
    log(`AI Analysis Complete: ${level} Level detected.`, 'system');
    
    setTimeout(() => {
        const message = level === 'Beginner' 
            ? "We've analyzed your technique. Let's start with the basics."
            : level === 'Intermediate' 
            ? "Impressive! You have a good grasp. Skipping to intermediate theory."
            : "Masterful! Our AI detected high proficiency. Jumping to advanced lessons.";
            
        alert(`AI Analysis: ${level} Level Detected\n\n${message}`);
        finishAppPrep();
    }, 1000);
}

function finishAppPrep() {
    appState = 'LESSON';
    showScreen(lessonPanel, visualizer, feedbackPanel);
    hideScreen(skillQuestionScreen, assessmentScreen, selectionScreen);
    loadLesson(currentLessonIndex);
}

// --- Calibration ---

function handleNoteOff(note) {
    noteOff(note);
}

// --- Calibration ---

function startCalibration(instrument) {
    selectedInstrument = instrument;
    appState = 'CALIBRATING';
    calibration.step = 0;
    calibration.lowNote = null;
    calibration.highNote = null;
    
    showScreen(calibrationScreen, feedbackPanel);
    hideScreen(selectionScreen);
    updateCalibrationUI();
    log(`System: Starting ${instrument} calibration...`, 'system');
}

function updateCalibrationUI() {
    const step = CAL_STEPS[calibration.step];
    calStepTitle.innerText = step.title;
    calStepDesc.innerText = step.desc;
    calNoteIndicator.innerText = '--';
}

function processCalibration(note) {
    calNoteIndicator.innerText = note;
    
    if (calibration.step === 0) {
        calibration.middleC = note;
        log(`Calibrated Middle C to ${note}`, 'system');
    } else if (calibration.step === 1) {
        calibration.lowNote = note;
        log(`Calibrated Low Note to ${note}`, 'system');
    } else if (calibration.step === 2) {
        calibration.highNote = note;
        log(`Calibrated High Note to ${note}`, 'system');
    }

    calibration.step++;

    if (calibration.step < CAL_STEPS.length) {
        setTimeout(updateCalibrationUI, 500);
    } else {
        setTimeout(finishCalibration, 800);
    }
}

function finishCalibration() {
    // Save calibration for future sessions
    localStorage.setItem('miditeacher_cal', JSON.stringify(calibration));
    localStorage.setItem('miditeacher_inst', selectedInstrument);

    appState = 'SKILL_CHECK';
    showScreen(skillQuestionScreen);
    hideScreen(calibrationScreen);
    
    createPiano();
    log('System: Calibration saved to browser memory.', 'system');
}

// --- Piano Rendering ---

function createPiano() {
    pianoContainer.innerHTML = '';
    keysMap.clear();
    
    const low = calibration.lowNote || 48;
    const high = calibration.highNote || 72;
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    for (let midi = low; midi <= high; midi++) {
        const key = document.createElement('div');
        const noteName = notes[midi % 12];
        const isBlack = noteName.includes('#');
        
        key.className = `key ${isBlack ? 'black' : 'white'}`;
        key.dataset.midi = midi;
        
        pianoContainer.appendChild(key);
        keysMap.set(midi, key);
    }
}

// --- Lesson Logic ---

function loadLesson(index) {
    const lesson = PIANO_LESSONS[index];
    lessonTitle.innerText = lesson.title;
    lessonDesc.innerText = lesson.desc;
    progressBar.style.width = '0%';
    nextLessonBtn.classList.add('hidden');
    sequenceIndex = 0;
    
    keysMap.forEach(k => k.classList.remove('target', 'correct', 'wrong'));
    
    if (lesson.sequence) {
        currentSequence = lesson.sequence;
        highlightNextInSequence();
    } else {
        currentSequence = null;
        const targetNote = calibration.middleC + lesson.offset;
        const targetKey = keysMap.get(targetNote);
        if (targetKey) targetKey.classList.add('target');
    }
}

function loadSong(song) {
    appState = 'LESSON';
    showScreen(lessonPanel, visualizer, feedbackPanel);
    hideScreen(libraryScreen);
    
    lessonTitle.innerText = `Learning: ${song.title}`;
    lessonDesc.innerText = `Follow the highlights to play ${song.title} by ${song.artist}.`;
    progressBar.style.width = '0%';
    nextLessonBtn.classList.add('hidden');
    sequenceIndex = 0;
    currentSequence = song.sequence;
    
    createPiano(); // Ensure keys are there
    highlightNextInSequence();
}

function highlightNextInSequence() {
    keysMap.forEach(k => k.classList.remove('target'));
    if (currentSequence && sequenceIndex < currentSequence.length) {
        const targetNote = calibration.middleC + currentSequence[sequenceIndex];
        const targetKey = keysMap.get(targetNote);
        if (targetKey) targetKey.classList.add('target');
    }
}

function advanceLesson() {
    currentLessonIndex++;
    
    // Unlock Library at 45 lessons
    if (currentLessonIndex === 45) {
        log('System: 45 Lessons Complete! Song Library Unlocked.', 'system');
        setTimeout(() => {
            alert("Congratulations! You've completed 45 lessons and unlocked the Famous Songs library!");
            openLibrary();
        }, 800);
        return;
    }

    if (currentLessonIndex < PIANO_LESSONS.length) {
        loadLesson(currentLessonIndex);
    } else {
        lessonTitle.innerText = "Congratulations!";
        lessonDesc.innerText = "You've completed the basic piano lessons. More coming soon!";
        progressBar.style.width = '100%';
        nextLessonBtn.classList.add('hidden');
        
        setTimeout(() => openLibrary(), 2000);
    }
}

function noteOn(note) {
    const key = keysMap.get(note);
    if (key) {
        key.classList.add('active');
        
        let isCorrect = false;
        if (currentSequence) {
            const targetNote = calibration.middleC + currentSequence[sequenceIndex];
            if (note === targetNote) {
                isCorrect = true;
                sequenceIndex++;
                progressBar.style.width = `${(sequenceIndex / currentSequence.length) * 100}%`;
                
                if (sequenceIndex >= currentSequence.length) {
                    key.classList.add('correct');
                    handleLessonSuccess();
                } else {
                    highlightNextInSequence();
                }
            }
        } else {
            const targetNote = calibration.middleC + PIANO_LESSONS[currentLessonIndex].offset;
            if (note === targetNote) {
                isCorrect = true;
                key.classList.add('correct');
                handleLessonSuccess();
            }
        }

        if (!isCorrect) {
            key.classList.add('wrong');
            setTimeout(() => key.classList.remove('wrong'), 500);
        }
    }
}

function noteOff(note) {
    const key = keysMap.get(note);
    if (key) {
        key.classList.remove('active');
    }
}

function handleLessonSuccess() {
    progressBar.style.width = '100%';
    nextLessonBtn.classList.remove('hidden');
    log('Success: Correct note!', 'system');
    
    // Auto-progress like Duolingo
    setTimeout(() => {
        if (appState === 'LESSON' && currentLessonIndex < PIANO_LESSONS.length - 1) {
            advanceLesson();
        }
    }, 1500);
}

function log(msg, type) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerText = msg;
    midiLog.appendChild(entry);
    midiLog.scrollTop = midiLog.scrollHeight;
}

// Start
init();
