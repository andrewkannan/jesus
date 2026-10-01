const socket = io();

// UI Elements
const authScreen = document.getElementById('auth-screen');
const controlScreen = document.getElementById('control-screen');
const pinDisplay = document.getElementById('pin-display');
const authError = document.getElementById('auth-error');

const remoteStatus = document.getElementById('remote-status');
const micStatus = document.getElementById('mic-status');
const valLevel = document.getElementById('val-level');
const barLevel = document.getElementById('bar-level');
const valPeak = document.getElementById('val-peak');
const valAvg = document.getElementById('val-avg');

const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnReset = document.getElementById('btn-reset');
const btnOverrideMinus = document.getElementById('btn-override-minus');
const btnOverridePlus = document.getElementById('btn-override-plus');
const valOverride = document.getElementById('val-override');
const effectBtns = document.querySelectorAll('.btn-effect');

// State
let pin = '';
let currentPinInput = '';
let isListening = false;
let manualOverride = false;
let overrideLevel = 73;
let currentEffect = 'cinematic';
let peakLevel = 0;
let levelHistory = [];

// Audio Context
let audioContext;
let analyser;
let microphone;

// --- AUTHENTICATION ---
const pinInput = document.getElementById('pin-input');
const btnSubmitPin = document.getElementById('btn-submit-pin');

btnSubmitPin.addEventListener('click', submitPin);
pinInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        submitPin();
    }
});

async function submitPin() {
    const inputVal = pinInput.value.trim().toUpperCase();
    if (inputVal.length === 0) return;
    
    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: inputVal })
        });
        
        const data = await response.json();
        
        if (data.success) {
            pin = inputVal;
            authScreen.classList.remove('active');
            controlScreen.classList.add('active');
            
            // To ensure the keyboard dismisses on iOS
            pinInput.blur();
        } else {
            authError.innerText = 'INVALID PIN';
            pinInput.value = '';
        }
    } catch (e) {
        authError.innerText = 'CONNECTION ERROR';
    }
}

// --- SOCKET CONNECTION ---
socket.on('connect', () => {
    remoteStatus.innerText = '● CONNECTED';
    remoteStatus.classList.add('active');
});

socket.on('disconnect', () => {
    remoteStatus.innerText = '● DISCONNECTED';
    remoteStatus.classList.remove('active');
});

// --- AUDIO PROCESSING ---
async function startListening() {
    if (isListening) return;
    
    // Safari requires AudioContext to be created or resumed upon user gesture
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);

        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;

        microphone.connect(analyser);

        isListening = true;
        micStatus.innerText = '● LISTENING';
        micStatus.classList.add('active');

        // Loop using requestAnimationFrame (works better on mobile than ScriptProcessorNode)
        function processAudio() {
            if (!isListening) return;
            
            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);
            
            let values = 0;
            const length = array.length;
            for (let i = 0; i < length; i++) {
                values += (array[i]);
            }
            
            // Calculate basic volume 0-100
            let volume = values / length;
            // Boost volume visually
            let mappedLevel = Math.min(100, Math.round((volume / 128) * 100 * 2.0));
            
            if (mappedLevel > peakLevel) peakLevel = mappedLevel;
            
            levelHistory.push(mappedLevel);
            if (levelHistory.length > 50) levelHistory.shift();
            
            const avg = Math.round(levelHistory.reduce((a, b) => a + b, 0) / levelHistory.length);

            updateUI(mappedLevel, peakLevel, avg);
            sendUpdate(mappedLevel, peakLevel, avg);
            
            window.animationFrameId = requestAnimationFrame(processAudio);
        }
        
        processAudio();
        
    } catch (err) {
        console.error(err);
        alert('Microphone access denied or not available.');
    }
}

function stopListening() {
    if (!isListening) return;
    
    if (window.animationFrameId) cancelAnimationFrame(window.animationFrameId);
    if (analyser) analyser.disconnect();
    if (microphone) microphone.disconnect();
    
    isListening = false;
    micStatus.innerText = '● IDLE';
    micStatus.classList.remove('active');
    
    updateUI(0, peakLevel, 0);
    sendUpdate(0, peakLevel, 0);
}

// --- DATA SYNC ---
function sendUpdate(level, peak, avg) {
    if (!pin) return; // Not authenticated
    
    socket.emit('remote_update', {
        pin: pin,
        level: manualOverride ? overrideLevel : level,
        peak: peak,
        average: avg,
        status: isListening ? 'listening' : 'idle',
        effect: currentEffect,
        manualOverride: manualOverride
    });
}

function sendCommand(cmd) {
    if (!pin) return;
    socket.emit('command', {
        pin: pin,
        command: cmd
    });
}

// --- UI UPDATES ---
function updateUI(level, peak, avg) {
    const displayLevel = manualOverride ? overrideLevel : level;
    
    valLevel.innerText = `${displayLevel}%`;
    barLevel.style.width = `${displayLevel}%`;
    
    valPeak.innerText = `${peak}%`;
    valAvg.innerText = `${avg}%`;
}

// --- CONTROLS ---
btnStart.addEventListener('click', startListening);

btnPause.addEventListener('click', stopListening);

btnReset.addEventListener('click', () => {
    peakLevel = 0;
    levelHistory = [];
    updateUI(0, 0, 0);
    sendCommand('reset');
});

btnOverrideMinus.addEventListener('click', () => {
    if (!manualOverride) manualOverride = true;
    overrideLevel = Math.max(0, overrideLevel - 5);
    valOverride.innerText = `${overrideLevel}%`;
    if (!isListening) sendUpdate(0, peakLevel, 0); // Force update if not streaming
});

btnOverridePlus.addEventListener('click', () => {
    if (!manualOverride) manualOverride = true;
    overrideLevel = Math.min(100, overrideLevel + 5);
    valOverride.innerText = `${overrideLevel}%`;
    if (!isListening) sendUpdate(0, peakLevel, 0);
});

valOverride.addEventListener('click', () => {
    manualOverride = false;
    valOverride.innerText = 'OFF';
    if (!isListening) sendUpdate(0, peakLevel, 0);
});

effectBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        effectBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentEffect = e.target.getAttribute('data-effect');
        if (!isListening) sendUpdate(0, peakLevel, 0);
    });
});
