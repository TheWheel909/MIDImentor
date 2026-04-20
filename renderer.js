// MIDI Teacher Renderer Logic

// UI Elements
const skillQuestionScreen = document.getElementById('skill-question-screen');
const assessmentScreen = document.getElementById('assessment-screen');
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
const assessmentTimerText = document.getElementById('assessment-timer-text');
const assessmentTimerPath = document.getElementById('assessment-timer-path');
const assessmentStatus = document.getElementById('assessment-status');

// Application State
let appState = 'SKILL_CHECK'; // SKILL_CHECK, RECORDING, SELECTION, CALIBRATING, LESSON
let selectedInstrument = null;
let midiAccess = null;

// Recording Data
let assessmentData = [];
let assessmentStartTime = 0;
let isRecording = false;
let assessmentTimer = null;

// Calibration Data
let calibration = {
    step: 0,
    middleC: 60,
    lowNote: null,
    highNote: null
};

const CAL_STEPS = [
    { title: "Middle C", desc: "Press Middle C on your piano (the one near the center)." },
    { title: "Lowest Note", desc: "Press the lowest white key on your piano." },
    { title: "Highest Note", desc: "Press the highest white key on your piano." }
];

// Lesson Data
const PIANO_LESSONS = [
    // Beginning
    { offset: 0, title: "Lesson 1: Middle C", desc: "Find Middle C and press it. It's the white key just to the left of the group of two black keys." },
    { offset: 2, title: "Lesson 2: Note D", desc: "Excellent! Now press D. It's the white key in between the two black keys." },
    { offset: 4, title: "Lesson 3: Note E", desc: "Great! Now press E. It's the white key to the right of the two black keys." },
    // Intermediate
    { offset: 7, title: "Lesson 4: Note G", desc: "Moving up! Press G. It's in the group of three black keys." },
    { offset: 12, title: "Lesson 5: Octave C", desc: "High C! Find the C one octave above Middle C." },
    // Advanced/Complex
    { offset: -1, title: "Lesson 6: Note B", desc: "Step down. Press B, the white key just below Middle C." },
    { offset: 1, title: "Lesson 7: C# (Black Key)", desc: "The first black key in the pair. This is C sharp!" }
];

let currentLessonIndex = 0;
const keysMap = new Map();

// --- Initialization ---

function init() {
    // Starting screen: Selection
    showScreen(selectionScreen);
    hideScreen(skillQuestionScreen, calibrationScreen, assessmentScreen, lessonPanel, visualizer, feedbackPanel);

    selectPianoBtn.addEventListener('click', () => startCalibration('piano'));
    skillNoBtn.addEventListener('click', () => finishAppPrep());
    skillYesBtn.addEventListener('click', () => startAssessment());
    resetAppBtn.addEventListener('click', resetToMenu);
    nextLessonBtn.addEventListener('click', advanceLesson);
    initMIDI();
}

function resetToMenu() {
    location.reload();
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
    appState = 'SKILL_CHECK';
    showScreen(skillQuestionScreen);
    hideScreen(calibrationScreen);
    
    createPiano();
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
    
    // Highlight target note
    keysMap.forEach(k => k.classList.remove('target', 'correct', 'wrong'));
    const targetNote = calibration.middleC + lesson.offset;
    const targetKey = keysMap.get(targetNote);
    if (targetKey) targetKey.classList.add('target');
}

function advanceLesson() {
    currentLessonIndex++;
    if (currentLessonIndex < PIANO_LESSONS.length) {
        loadLesson(currentLessonIndex);
    } else {
        lessonTitle.innerText = "Congratulations!";
        lessonDesc.innerText = "You've completed the basic piano lessons. More coming soon!";
        progressBar.style.width = '100%';
        nextLessonBtn.classList.add('hidden');
    }
}

function noteOn(note) {
    const key = keysMap.get(note);
    if (key) {
        key.classList.add('active');
        
        const targetNote = calibration.middleC + PIANO_LESSONS[currentLessonIndex].offset;
        if (note === targetNote) {
            key.classList.add('correct');
            handleLessonSuccess();
        } else {
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
