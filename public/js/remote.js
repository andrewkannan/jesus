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
const tierStatus = document.getElementById('tier-status');
const valPeak = document.getElementById('val-peak');
const valAvg = document.getElementById('val-avg');

const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnReset = document.getElementById('btn-reset');
const valOverride = document.getElementById('val-override');

// State
let pin = '';
let isListening = false;
let manualOverride = false;
let overrideLevel = 40;
let peakDb = 0;
let dbHistory = [];
let lastDb = 0;

let currentTier = 0;
let achievementTimer = null;

const TIER_THRESHOLDS = [
    { db: 120, tier: 4, name: "TIER 4: OMEGA CRIMSON", color: "#ff0033" }, 
    { db: 115, tier: 3, name: "TIER 3: NEON AMETHYST", color: "#cc00ff" }, 
    { db: 110, tier: 2, name: "TIER 2: HOLY FIRE", color: "#ff8c00" }, 
    { db: 105, tier: 1, name: "TIER 1: ELECTRIC BLUE", color: "#00aaff" }  
];

// Audio Context
let audioContext;
let analyser;
let microphone;
let mediaStream;

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

let lastSendTime = 0;
let lastSentDb = -1;

// --- CENTRAL DATA PROCESSOR ---
function processSimulatedDb(currentDb) {
    lastDb = currentDb;
    
    if (currentDb > peakDb) peakDb = currentDb;
    
    dbHistory.push(currentDb);
    if (dbHistory.length > 50) dbHistory.shift();
    
    const avgDb = Math.round(dbHistory.reduce((a, b) => a + b, 0) / dbHistory.length);

    // Determine Tier
    let newTier = 0;
    for (const t of TIER_THRESHOLDS) {
        if (currentDb >= t.db) {
            newTier = t.tier;
            break;
        }
    }
    
    if (manualOverride) {
        // When testing/controlling with manual override slider, allow moving up and down across all tiers freely
        currentTier = newTier;
        if (achievementTimer) {
            clearTimeout(achievementTimer);
            achievementTimer = null;
        }
    } else if (newTier > currentTier) {
        // Live mic: lock highest reached tier for 10 seconds
        currentTier = newTier;
        if (achievementTimer) clearTimeout(achievementTimer);
        achievementTimer = setTimeout(() => {
            currentTier = 0;
            achievementTimer = null;
            updateTierUI();
        }, 10000);
    }

    // Map 40-130 dB to 0-100% for the remote progress bar (matches T1-T4 tick marks accurately)
    const barPercent = Math.max(0, Math.min(100, ((currentDb - 40) / 90) * 100));
    
    // If locked into a tier, send max visual level (100) to the main display while keeping true barPercent on remote
    const displayVisualLevel = currentTier > 0 ? 100 : barPercent;

    updateUI(currentDb, peakDb, avgDb, barPercent);
    
    const now = Date.now();
    // Only blast socket updates if dB actually changed or 50ms has passed (max 20fps to prevent network bloat)
    if (currentDb !== lastSentDb || now - lastSendTime > 50) {
        sendUpdate(displayVisualLevel, peakDb, avgDb, currentDb);
        lastSentDb = currentDb;
        lastSendTime = now;
    }
}

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
        // Disable browser AGC, noise suppression, and echo cancellation so loud crowd roars aren't dampened
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            },
            video: false
        });
        
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(mediaStream);

        analyser.smoothingTimeConstant = 0.4; // Fast response
        analyser.fftSize = 1024;

        microphone.connect(analyser);

        isListening = true;
        micStatus.innerText = '● LISTENING';
        micStatus.classList.add('active');

        function processAudio() {
            if (!isListening) return;
            
            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);
            
            // Focus on vocal and crowd energy frequencies (bins 1..120, ~43Hz to ~5.1kHz) using RMS
            const vocalBins = Math.min(120, array.length);
            let sumSquares = 0;
            for (let i = 1; i < vocalBins; i++) {
                sumSquares += array[i] * array[i];
            }
            const rms = Math.sqrt(sumSquares / (vocalBins - 1));
            
            // Map vocal RMS (0-255) into the 40-130 dB show range so full crowd energy reaches Tiers 1-4
            let currentDb = rms > 2 ? Math.min(130, Math.round(40 + (rms * 0.52))) : 0;
            
            if (manualOverride) {
                currentDb = overrideLevel;
            }

            processSimulatedDb(currentDb);
            
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
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    isListening = false;
    micStatus.innerText = '● MIC IDLE';
    micStatus.classList.remove('active');
    
    if (!manualOverride) {
        updateUI(0, peakDb, 0, 0);
        sendUpdate(0, peakDb, 0, 0);
    }
}

// --- DATA SYNC ---
function sendUpdate(visualLevel, peak, avg, currentDb) {
    if (!pin) return; 
    
    socket.emit('remote_update', {
        pin: pin,
        level: visualLevel, 
        db: currentDb,
        peak: peak,
        average: avg, 
        status: isListening ? 'listening' : 'idle',
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
function updateTierUI() {
    if (currentTier === 0) {
        tierStatus.innerText = 'NORMAL';
        tierStatus.style.color = '#888';
        tierStatus.style.borderColor = '#333';
        tierStatus.style.boxShadow = 'none';
        barLevel.style.backgroundColor = '#fff';
    } else {
        const t = TIER_THRESHOLDS.find(x => x.tier === currentTier);
        tierStatus.innerText = t.name;
        tierStatus.style.color = t.color;
        tierStatus.style.borderColor = t.color;
        tierStatus.style.boxShadow = `0 0 10px ${t.color}`;
        barLevel.style.backgroundColor = t.color;
    }
}

function updateUI(currentDb, peak, avg, barPercent) {
    updateTierUI();
    
    valLevel.innerText = `${currentDb} dB`;
    barLevel.style.width = `${barPercent}%`;
    valPeak.innerText = `${peak} dB`;
    valAvg.innerText = `${avg} dB`;
}

// --- CONTROLS ---
const sliderOverride = document.getElementById('slider-override');
const btnOverrideOff = document.getElementById('btn-override-off');

btnStart.addEventListener('click', startListening);

btnPause.addEventListener('click', stopListening);

btnReset.addEventListener('click', () => {
    peakDb = 0;
    dbHistory = [];
    currentTier = 0;
    lastSentDb = -1;
    manualOverride = false;
    overrideLevel = 40;
    valOverride.innerText = 'OFF';
    valOverride.style.color = '#ff453a';
    sliderOverride.value = 40;
    if (achievementTimer) {
        clearTimeout(achievementTimer);
        achievementTimer = null;
    }
    updateUI(0, 0, 0, 0);
    sendCommand('reset');
});

sliderOverride.addEventListener('input', (e) => {
    if (!manualOverride) manualOverride = true;
    overrideLevel = parseInt(e.target.value, 10);
    valOverride.innerText = `${overrideLevel} dB`;
    valOverride.style.color = '#32d74b'; // green when active
    if (!isListening) processSimulatedDb(overrideLevel);
});

btnOverrideOff.addEventListener('click', () => {
    manualOverride = false;
    overrideLevel = 40;
    currentTier = 0;
    lastSentDb = -1;
    if (achievementTimer) {
        clearTimeout(achievementTimer);
        achievementTimer = null;
    }
    valOverride.innerText = 'OFF';
    valOverride.style.color = '#ff453a'; // red when off
    sliderOverride.value = 40;
    if (!isListening) {
        updateUI(0, peakDb, 0, 0);
        sendUpdate(0, peakDb, 0, 0);
    }
});
