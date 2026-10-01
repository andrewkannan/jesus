const socket = io();

// UI Elements
const authScreen = document.getElementById('auth-screen');
const controlScreen = document.getElementById('control-screen');
const authError = document.getElementById('auth-error');
const pinInput = document.getElementById('pin-input');
const btnSubmitPin = document.getElementById('btn-submit-pin');

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
let isListening = false;
let manualOverride = false;
let overrideLevel = 73; // Animation visual level
let currentEffect = 'cinematic';
let peakDb = 0;
let dbHistory = [];

// Audio Context
let audioContext;
let analyser;
let microphone;

// --- AUTHENTICATION ---
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

        function processAudio() {
            if (!isListening) return;
            
            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);
            
            let values = 0;
            const length = array.length;
            for (let i = 0; i < length; i++) {
                values += (array[i]);
            }
            
            let volume = values / length;
            
            // Visual Animation Level (0-100 clamped)
            let visualLevel = Math.min(100, Math.round((volume / 128) * 100 * 2.0));
            
            // Decibel approximation mapping (feels limitless up to ~130dB)
            let currentDb = volume > 2 ? Math.round(40 + (volume * 0.6)) : 0;
            
            if (currentDb > peakDb) peakDb = currentDb;
            
            dbHistory.push(currentDb);
            if (dbHistory.length > 50) dbHistory.shift();
            
            const avgDb = Math.round(dbHistory.reduce((a, b) => a + b, 0) / dbHistory.length);

            updateUI(currentDb, peakDb, avgDb, visualLevel);
            sendUpdate(visualLevel, peakDb, avgDb);
            
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
    
    updateUI(0, peakDb, 0, 0);
    sendUpdate(0, peakDb, 0);
}

// --- DATA SYNC ---
function sendUpdate(visualLevel, peak, avg) {
    if (!pin) return; 
    
    socket.emit('remote_update', {
        pin: pin,
        level: manualOverride ? overrideLevel : visualLevel,
        peak: peak, // sending peakDb as peak
        average: avg, // sending avgDb as average
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
function updateUI(currentDb, peak, avg, visualLevel) {
    const displayLevel = manualOverride ? overrideLevel : visualLevel;
    
    // We update the big value to dB, but keep the bar percentage tied to visualLevel
    valLevel.innerText = manualOverride ? `${displayLevel}%` : `${currentDb} dB`;
    barLevel.style.width = `${displayLevel}%`;
    
    valPeak.innerText = `${peak} dB`;
    valAvg.innerText = `${avg} dB`;
}

// --- CONTROLS ---
btnStart.addEventListener('click', startListening);

btnPause.addEventListener('click', stopListening);

btnReset.addEventListener('click', () => {
    peakDb = 0;
    dbHistory = [];
    updateUI(0, 0, 0, 0);
    sendCommand('reset');
});

btnOverrideMinus.addEventListener('click', () => {
    if (!manualOverride) manualOverride = true;
    overrideLevel = Math.max(0, overrideLevel - 5);
    valOverride.innerText = `${overrideLevel}%`;
    if (!isListening) sendUpdate(overrideLevel, peakDb, 0);
});

btnOverridePlus.addEventListener('click', () => {
    if (!manualOverride) manualOverride = true;
    overrideLevel = Math.min(100, overrideLevel + 5);
    valOverride.innerText = `${overrideLevel}%`;
    if (!isListening) sendUpdate(overrideLevel, peakDb, 0);
});

valOverride.addEventListener('click', () => {
    manualOverride = false;
    valOverride.innerText = 'OFF';
    if (!isListening) sendUpdate(0, peakDb, 0);
});

effectBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        effectBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentEffect = e.target.getAttribute('data-effect');
        if (!isListening) sendUpdate(0, peakDb, 0);
    });
});
