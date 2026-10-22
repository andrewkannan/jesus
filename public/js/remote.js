const socket = io();

// UI Elements
const authScreen = document.getElementById('auth-screen');
const controlScreen = document.getElementById('control-screen');
const authError = document.getElementById('auth-error');
const pinInput = document.getElementById('pin-input');
const btnSubmitPin = document.getElementById('btn-submit-pin');

const remoteStatus = document.getElementById('remote-status');
const micStatus = document.getElementById('mic-status');
const btnCurtainClose = document.getElementById('btn-curtain-close');
const btnCurtainOpen = document.getElementById('btn-curtain-open');
const remoteStageLabel = document.getElementById('remote-stage-label');
const remoteStageWord = document.getElementById('remote-stage-word');
const stageBtns = document.querySelectorAll('.btn-stage');
const btnFinalWin = document.getElementById('btn-final-win');

const valLevel = document.getElementById('val-level');
const barLevel = document.getElementById('bar-level');
const tierStatus = document.getElementById('tier-status');
const valPeak = document.getElementById('val-peak');
const valAvg = document.getElementById('val-avg');

const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnReset = document.getElementById('btn-reset');
const valOverride = document.getElementById('val-override');

const STAGE_INFO = [
    { stage: 0, label: 'GROUP 1 OF 4', word: 'JESUS' },
    { stage: 1, label: 'GROUP 2 OF 4', word: 'I AM FREE' },
    { stage: 2, label: 'GROUP 3 OF 4', word: 'HE IS RISEN' },
    { stage: 3, label: 'GROUP 4 OF 4', word: 'VICTORY' },
    { stage: 4, label: 'FINAL WORD (ALL CROWD)', word: 'NOTHING IS IMPOSSIBLE WITH GOD' }
];

// State
let pin = '';
let isListening = false;
let manualOverride = false;
let overrideLevel = 40;
let difficultyOffset = 0; // -30 (Harder) to +35 (Easier) dB adjustment
let peakDb = 0;
let dbHistory = [];
let lastDb = 0;

let currentStage = 0;
let currentTier = 0;
let finalWin = false;
let curtainOpen = false;
let achievementTimer = null;

const UNLOCK_DURATION_MS = 5000; // 5 seconds lock & unlock

const TIER_THRESHOLDS = [
    { db: 120, tier: 4, name: "TIER 4: CROWN OF GLORY (UNLOCKING)", color: "#F59E0B" }, 
    { db: 115, tier: 3, name: "TIER 3: ROYAL AMBER", color: "#D97706" }, 
    { db: 110, tier: 2, name: "TIER 2: RADIANT GOLD", color: "#D4AF37" }, 
    { db: 105, tier: 1, name: "TIER 1: MORNING DAWN", color: "#C5A059" }  
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
            if (data.state && typeof data.state.stage === 'number') {
                currentStage = data.state.stage;
                finalWin = Boolean(data.state.finalWin);
                curtainOpen = Boolean(data.state.curtainOpen);
                updateCurtainUI();
                updateStageUI();
                updateTierUI();
            }
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

function updateCurtainUI() {
    if (btnCurtainClose) btnCurtainClose.classList.toggle('active', !curtainOpen);
    if (btnCurtainOpen) btnCurtainOpen.classList.toggle('active', curtainOpen);
}

function setCurtainFromRemote(openState) {
    curtainOpen = Boolean(openState);
    updateCurtainUI();
    if (pin) {
        socket.emit('command', {
            pin: pin,
            command: 'curtain',
            open: curtainOpen
        });
    }
}

function updateStageUI() {
    const info = STAGE_INFO[currentStage] || STAGE_INFO[0];
    if (remoteStageLabel) {
        remoteStageLabel.innerText = finalWin ? '★ FINAL VICTORY ACHIEVED ★' : info.label;
    }
    if (remoteStageWord) remoteStageWord.innerText = info.word;

    stageBtns.forEach((btn, idx) => {
        btn.classList.remove('active', 'completed');
        if (idx < currentStage) {
            btn.classList.add('completed');
        } else if (idx === currentStage) {
            btn.classList.add('active');
        }
    });

    if (btnFinalWin) {
        btnFinalWin.classList.toggle('active', finalWin);
    }
}

function triggerFinalVictoryFromRemote() {
    currentStage = 4;
    currentTier = 4;
    finalWin = true;
    curtainOpen = true;
    peakDb = Math.max(peakDb, 125);
    if (achievementTimer) {
        clearTimeout(achievementTimer);
        achievementTimer = null;
    }
    updateCurtainUI();
    updateStageUI();
    updateUI(Math.max(lastDb, 125), peakDb, 120, 100);
    if (pin) {
        socket.emit('command', {
            pin: pin,
            command: 'final_win'
        });
    }
}

function advanceOrSetStage(nextStage) {
    const clamped = Math.max(0, Math.min(4, nextStage));
    currentStage = clamped;
    currentTier = 0;
    finalWin = false;
    peakDb = 0;
    dbHistory = [];
    lastSentDb = -1;

    if (achievementTimer) {
        clearTimeout(achievementTimer);
        achievementTimer = null;
    }

    // Pause mic between groups so the Emcee can introduce the next group and tap START MIC when ready
    if (isListening) {
        stopListening(true);
    }

    // If manual override was used to test unlocking Tier 4, reset override back to OFF for the newly unlocked word
    if (manualOverride) {
        manualOverride = false;
        overrideLevel = 40;
        valOverride.innerText = 'OFF';
        valOverride.style.color = '#ff453a';
        sliderOverride.value = 40;
    }

    updateStageUI();
    updateUI(0, 0, 0, 0);
    if (pin) {
        socket.emit('command', {
            pin: pin,
            command: 'set_stage',
            stage: currentStage
        });
    }
}

function scheduleTierLockOrUnlock(tierReached) {
    if (achievementTimer) clearTimeout(achievementTimer);
    achievementTimer = setTimeout(() => {
        achievementTimer = null;
        if (tierReached === 4 && currentStage < 4) {
            // Auto-unlock next group word (or Finale Word after Group 4) after 5s celebration!
            advanceOrSetStage(currentStage + 1);
        } else if (!finalWin) {
            currentTier = 0;
            updateTierUI();
        }
    }, UNLOCK_DURATION_MS);
}

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

    // If on Stage 4 ("NOTHING IS IMPOSSIBLE WITH GOD") and the whole crowd reaches Tier 4 (120 dB), trigger Final Victory!
    if (currentStage === 4 && newTier === 4 && !finalWin) {
        triggerFinalVictoryFromRemote();
        return;
    }
    
    if (manualOverride) {
        // Allow moving up and down across all tiers freely for testing; if left at Tier 4 for 5s on G1-G4, auto-unlock next group!
        if (newTier !== currentTier) {
            currentTier = newTier;
            if (currentTier === 4 && currentStage < 4) {
                scheduleTierLockOrUnlock(4);
            } else if (achievementTimer) {
                clearTimeout(achievementTimer);
                achievementTimer = null;
            }
        }
    } else if (newTier > currentTier) {
        // Live mic: lock highest reached tier for 5 seconds (and auto-unlock next group if Tier 4 reached)
        currentTier = newTier;
        scheduleTierLockOrUnlock(newTier);
    }

    // Map 40-130 dB to 0-100% for the remote progress bar (matches T1-T4 tick marks accurately)
    const barPercent = finalWin ? 100 : Math.max(0, Math.min(100, ((currentDb - 40) / 90) * 100));
    
    // If locked into a tier, send max visual level (100) to the main display while keeping true barPercent on remote
    const displayVisualLevel = (currentTier > 0 || finalWin) ? 100 : barPercent;

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
    // Always clean up any previous stream/loop so clicking START MIC after a group finishes works 100% reliably
    if (isListening || mediaStream) {
        stopListening(true);
    }

    try {
        // Request microphone synchronously inside user gesture so mobile Safari/Chrome never drop permission
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false
                },
                video: false
            });
        } catch (constraintErr) {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }

        if (!audioContext || audioContext.state === 'closed') {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(mediaStream);

        analyser.smoothingTimeConstant = 0.35; // Fast response
        analyser.fftSize = 1024;

        microphone.connect(analyser);

        isListening = true;
        micStatus.innerText = '● LISTENING';
        micStatus.classList.add('active');
        btnStart.innerText = '● MIC ON';
        btnStart.classList.add('listening');

        function processAudio() {
            if (!isListening) return;
            
            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);
            
            // Measure vocal & crowd frequencies (bins 1..120, ~43Hz to ~5.1kHz)
            const vocalBins = Math.min(120, array.length);
            let sumSquares = 0;
            let peakBin = 0;
            for (let i = 1; i < vocalBins; i++) {
                const v = array[i];
                sumSquares += v * v;
                if (v > peakBin) peakBin = v;
            }
            const rms = Math.sqrt(sumSquares / (vocalBins - 1));
            const blendedEnergy = (rms * 0.7) + (peakBin * 0.3);

            // Dynamic noise gate increases slightly when set to HARDER so ambient chatter is ignored
            const noiseGate = Math.max(2, 4 - (difficultyOffset * 0.15));
            let currentDb = 0;

            if (blendedEnergy > noiseGate) {
                const baseDb = 42 + (blendedEnergy * 0.48);
                currentDb = Math.max(40, Math.min(130, Math.round(baseDb + difficultyOffset)));
            }
            
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

function stopListening(silent = false) {
    if (window.animationFrameId) {
        cancelAnimationFrame(window.animationFrameId);
        window.animationFrameId = null;
    }
    if (analyser) {
        try { analyser.disconnect(); } catch (e) {}
        analyser = null;
    }
    if (microphone) {
        try { microphone.disconnect(); } catch (e) {}
        microphone = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    isListening = false;
    micStatus.innerText = '● MIC IDLE';
    micStatus.classList.remove('active');
    btnStart.innerText = 'START MIC';
    btnStart.classList.remove('listening');
    
    if (!silent && !manualOverride && !finalWin) {
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
        stage: currentStage,
        finalWin: finalWin,
        curtainOpen: curtainOpen,
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
function updateDifficultyUI() {
    const valDiffEl = document.getElementById('val-difficulty');
    if (!valDiffEl) return;
    if (difficultyOffset === 0) {
        valDiffEl.innerText = 'NORMAL (0 dB)';
        valDiffEl.style.color = '#D4AF37';
    } else if (difficultyOffset > 0) {
        valDiffEl.innerText = `EASIER (+${difficultyOffset} dB BOOST)`;
        valDiffEl.style.color = '#32d74b';
    } else {
        valDiffEl.innerText = `HARDER (${difficultyOffset} dB)`;
        valDiffEl.style.color = '#ff9f0a';
    }
}

function updateTierUI() {
    if (finalWin) {
        tierStatus.innerText = '★ FINAL VICTORY ACHIEVED ★';
        tierStatus.style.color = '#F59E0B';
        tierStatus.style.borderColor = '#FDE68A';
        tierStatus.style.boxShadow = '0 0 14px rgba(245, 158, 11, 0.6)';
        barLevel.style.backgroundColor = '#F59E0B';
        return;
    }

    if (currentTier === 0) {
        tierStatus.innerText = currentStage === 4 ? 'FINAL WORD · SHOUT FOR VICTORY' : 'NORMAL';
        tierStatus.style.color = currentStage === 4 ? '#D4AF37' : '#888';
        tierStatus.style.borderColor = currentStage === 4 ? '#996515' : '#333';
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
    updateCurtainUI();
    updateStageUI();
    updateTierUI();
    
    valLevel.innerText = `${currentDb} dB`;
    barLevel.style.width = `${barPercent}%`;
    valPeak.innerText = `${peak} dB`;
    valAvg.innerText = `${avg} dB`;
}

// --- CONTROLS ---
const sliderOverride = document.getElementById('slider-override');
const btnOverrideOff = document.getElementById('btn-override-off');
const btnDiffHarder = document.getElementById('btn-diff-harder');
const btnDiffReset = document.getElementById('btn-diff-reset');
const btnDiffEasier = document.getElementById('btn-diff-easier');

if (btnCurtainClose) {
    btnCurtainClose.addEventListener('click', () => {
        setCurtainFromRemote(false);
    });
}

if (btnCurtainOpen) {
    btnCurtainOpen.addEventListener('click', () => {
        setCurtainFromRemote(true);
    });
}

stageBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
        const targetStage = parseInt(btn.getAttribute('data-stage'), 10);
        advanceOrSetStage(targetStage);
    });
});

if (btnFinalWin) {
    btnFinalWin.addEventListener('click', () => {
        triggerFinalVictoryFromRemote();
    });
}

btnStart.addEventListener('click', startListening);

btnPause.addEventListener('click', () => stopListening(false));

btnReset.addEventListener('click', () => {
    peakDb = 0;
    dbHistory = [];
    currentStage = 0;
    currentTier = 0;
    finalWin = false;
    curtainOpen = false;
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

// Crowd Difficulty / Mic Sensitivity Handlers
btnDiffHarder.addEventListener('click', () => {
    difficultyOffset = Math.max(-35, difficultyOffset - 5);
    updateDifficultyUI();
});

btnDiffReset.addEventListener('click', () => {
    difficultyOffset = 0;
    updateDifficultyUI();
});

btnDiffEasier.addEventListener('click', () => {
    difficultyOffset = Math.min(40, difficultyOffset + 5);
    updateDifficultyUI();
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
    finalWin = false;
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

updateCurtainUI();
updateStageUI();
updateDifficultyUI();

