const socket = io();

const debugInfoEl = document.getElementById('debug-info');
const statusEl = document.getElementById('connection-status');
const textEl = document.getElementById('jesus-text');
const eyebrowEl = document.getElementById('stage-eyebrow');
const tierBadgeEl = document.getElementById('tier-badge');
const scorePeakEl = document.getElementById('score-peak');
const scoreLiveEl = document.getElementById('score-live');
const stageMeterFill = document.getElementById('stage-meter-fill');
const unlockContainer = document.getElementById('unlock-container');
const unlockLabel = document.getElementById('unlock-label');
const unlockFill = document.getElementById('unlock-fill');
const audioOverlay = document.getElementById('audio-overlay');
const meterTags = [
    document.getElementById('m-tier-1'),
    document.getElementById('m-tier-2'),
    document.getElementById('m-tier-3'),
    document.getElementById('m-tier-4')
];

const UNLOCK_DURATION_MS = 5000; // 5 seconds lock & unlock

// 4 Words + Grand Finale Configuration (Clean worship text, no "Group X Complete")
const STAGES = [
    {
        stage: 0,
        eyebrow: 'LIFT YOUR VOICE IN PRAISE',
        word: 'JESUS',
        unlockMsg: 'CROWN OF GLORY — UNLOCKING NEXT WORD'
    },
    {
        stage: 1,
        eyebrow: 'DECLARE YOUR FREEDOM',
        word: 'I AM FREE',
        unlockMsg: 'CROWN OF GLORY — UNLOCKING NEXT WORD'
    },
    {
        stage: 2,
        eyebrow: 'PROCLAIM THE LIVING HOPE',
        word: 'HE IS RISEN',
        unlockMsg: 'CROWN OF GLORY — UNLOCKING NEXT WORD'
    },
    {
        stage: 3,
        eyebrow: 'WALK IN HIS POWER',
        word: 'VICTORY',
        unlockMsg: 'CROWN OF GLORY — UNLOCKING FINAL WORD'
    },
    {
        stage: 4,
        eyebrow: '★ WALK IN HIS PROMISE ★',
        word: 'NOTHING IS IMPOSSIBLE\nWITH GOD',
        unlockMsg: '★ GOD IS FAITHFUL ★'
    }
];

const TIER_THRESHOLDS = [
    { db: 120, tier: 4, label: 'TIER 4 · CROWN OF GLORY', color: '#B45309' },
    { db: 115, tier: 3, label: 'TIER 3 · ROYAL AMBER', color: '#996515' },
    { db: 110, tier: 2, label: 'TIER 2 · RADIANT GOLD', color: '#B8860B' },
    { db: 105, tier: 1, label: 'TIER 1 · MORNING DAWN', color: '#785A28' }
];

let currentStage = 0;
let currentTier = 0;
let isFinalVictory = false;
let achievementTimer = null;
let tier4StartTime = 0;
let displayAudioCtx = null;
let audioEnabled = false;

// State
let targetLevel = 0;
let currentLevel = 0;
let currentDb = 0;
let lastUpdate = Date.now();
let isManualOverride = false;

// --- INTERACTIVE CANVAS FX (Sunbeams, Shockwaves, Golden Particles, Victory Confetti) ---
const canvas = document.getElementById('fx-canvas');
const ctx = canvas.getContext('2d');
let cw = window.innerWidth;
let ch = window.innerHeight;
let shockwaves = [];
let particles = [];
let confetti = [];
let sunbeamAngle = 0;
let lastAmbientWave = 0;

function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = window.innerWidth;
    ch = window.innerHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Initialize floating golden dust motes
for (let i = 0; i < 65; i++) {
    particles.push({
        x: Math.random() * cw,
        y: Math.random() * ch,
        r: 1.2 + Math.random() * 2.8,
        vy: -(0.3 + Math.random() * 0.9),
        vx: (Math.random() - 0.5) * 0.4,
        alpha: 0.15 + Math.random() * 0.45,
        hue: Math.random() > 0.3 ? '212, 175, 55' : '180, 83, 9'
    });
}

function spawnShockwave(intensity = 1, count = 1) {
    for (let i = 0; i < count; i++) {
        shockwaves.push({
            r: 40 + i * 28,
            maxR: Math.max(cw, ch) * (0.55 + intensity * 0.25),
            alpha: 0.42 + intensity * 0.12,
            speed: 5 + intensity * 4 + i * 1.2,
            lineWidth: 1.5 + intensity * 1.2
        });
    }
}

function spawnVictoryConfettiBurst() {
    confetti = [];
    const colors = ['#D4AF37', '#F59E0B', '#B45309', '#FDE68A', '#996515', '#FFFBEB'];
    for (let i = 0; i < 120; i++) {
        confetti.push({
            x: Math.random() * cw,
            y: -20 - Math.random() * ch * 0.8,
            w: 6 + Math.random() * 8,
            h: 10 + Math.random() * 14,
            vy: 1.8 + Math.random() * 3.2,
            vx: (Math.random() - 0.5) * 2.2,
            rot: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.14,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 0.75 + Math.random() * 0.25
        });
    }
}

function activateFinalVictory() {
    if (isFinalVictory) return;
    isFinalVictory = true;
    currentTier = 4;
    clearTierLock();
    document.body.classList.add('final-victory-mode');
    tierBadgeEl.classList.add('victory-badge');
    eyebrowEl.textContent = '★ ALL PRAISE & GLORY // VICTORY IN JESUS ★';
    spawnShockwave(2.2, 5);
    spawnVictoryConfettiBurst();
    playFinalVictorySymphony();
    updateTierBadge(4, Math.max(currentDb, 125));
}

// Enable Audio on click
audioOverlay.addEventListener('click', () => {
    displayAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (displayAudioCtx.state === 'suspended') displayAudioCtx.resume();
    audioEnabled = true;
    audioOverlay.style.display = 'none';
});

// Connection handling
socket.on('connect', () => {
    statusEl.textContent = 'CONNECTED';
    debugInfoEl.classList.add('connected');
});

socket.on('disconnect', () => {
    statusEl.textContent = 'DISCONNECTED';
    debugInfoEl.classList.remove('connected');
    targetLevel = 0;
    isManualOverride = false;
});

function applyStageUI(stageIdx, animate = true) {
    const safeIdx = Math.max(0, Math.min(STAGES.length - 1, stageIdx));
    currentStage = safeIdx;
    const s = STAGES[safeIdx];

    if (!isFinalVictory) {
        document.body.classList.remove('final-victory-mode');
        tierBadgeEl.classList.remove('victory-badge');
        confetti = [];
    }

    eyebrowEl.textContent = isFinalVictory
        ? '★ ALL PRAISE & GLORY // VICTORY IN JESUS ★'
        : s.eyebrow;
    textEl.setAttribute('data-stage', String(safeIdx));
    textEl.innerHTML = s.word.replace('\n', '<br>');

    if (animate) {
        textEl.classList.remove('word-transition');
        void textEl.offsetWidth; // Force reflow for clean animation restart
        textEl.classList.add('word-transition');
        spawnShockwave(1.5, 3);
    }

    updateTierBadge(currentTier, currentDb);
}

function updateTierBadge(tier, db) {
    meterTags.forEach((tag, idx) => {
        if (tag) tag.classList.toggle('active', isFinalVictory || tier >= idx + 1);
    });

    if (isFinalVictory) {
        tierBadgeEl.textContent = '★ GOD IS FAITHFUL · FINAL VICTORY ★';
        tierBadgeEl.classList.add('victory-badge');
        return;
    }

    tierBadgeEl.classList.remove('victory-badge');

    if (tier > 0) {
        const t = TIER_THRESHOLDS.find(x => x.tier === tier);
        tierBadgeEl.textContent = t ? t.label : '★ GOD IS FAITHFUL ★';
        tierBadgeEl.style.color = t ? t.color : '#996515';
        tierBadgeEl.style.borderColor = 'rgba(180, 83, 9, 0.45)';
    } else if (db >= 70) {
        tierBadgeEl.textContent = '★ GOD IS FAITHFUL · KEEP LIFTING YOUR VOICE ★';
        tierBadgeEl.style.color = '#575047';
        tierBadgeEl.style.borderColor = 'rgba(153, 101, 21, 0.22)';
    } else {
        tierBadgeEl.textContent = '★ GOD IS FAITHFUL ★';
        tierBadgeEl.style.color = '#8C8275';
        tierBadgeEl.style.borderColor = 'rgba(153, 101, 21, 0.16)';
    }
}

function triggerTier4LockAndUnlock() {
    tier4StartTime = Date.now();
    if (currentStage < 4) {
        unlockLabel.textContent = STAGES[currentStage].unlockMsg;
        unlockFill.style.width = '0%';
        unlockContainer.classList.remove('hidden');
    }
}

function clearTierLock() {
    if (achievementTimer) {
        clearTimeout(achievementTimer);
        achievementTimer = null;
    }
    tier4StartTime = 0;
    unlockContainer.classList.add('hidden');
    unlockFill.style.width = '0%';
}

// Receive state updates
socket.on('state_update', (state) => {
    if (state.reset) {
        clearTierLock();
        isFinalVictory = false;
        currentTier = 0;
        targetLevel = 0;
        currentLevel = 0;
        currentDb = 0;
        isManualOverride = false;
        document.body.classList.remove('final-victory-mode');
        tierBadgeEl.classList.remove('victory-badge');
        confetti = [];
        if (scorePeakEl) scorePeakEl.textContent = '0 dB';
        if (scoreLiveEl) scoreLiveEl.textContent = '0 dB';
        if (stageMeterFill) stageMeterFill.style.width = '0%';
        applyStageUI(0, true);
        lastUpdate = Date.now();
        return;
    }

    // Check if stage changed (via Remote group buttons or auto-unlock)
    if (typeof state.stage === 'number' && state.stage !== currentStage) {
        clearTierLock();
        currentTier = 0;
        isFinalVictory = Boolean(state.finalWin);
        applyStageUI(state.stage, true);
        playStageTransitionChime();
    } else if (state.stageChanged && !state.finalWin) {
        // Explicit re-selection of current stage resets finalWin so crowd can shout again
        clearTierLock();
        currentTier = 0;
        isFinalVictory = false;
        applyStageUI(currentStage, true);
    }

    // Check if Final Win was triggered directly from Remote button
    if (state.finalWin && !isFinalVictory) {
        if (currentStage !== 4) {
            applyStageUI(4, true);
        }
        activateFinalVictory();
    }

    const wasManualOverride = isManualOverride;
    isManualOverride = Boolean(state.manualOverride);
    targetLevel = typeof state.level === 'number' ? state.level : 0;
    currentDb = typeof state.db === 'number' ? state.db : 0;
    
    if (scorePeakEl) scorePeakEl.textContent = `${state.peak || 0} dB`;
    if (scoreLiveEl) scoreLiveEl.textContent = `${currentDb} dB`;

    const barPercent = isFinalVictory
        ? 100
        : Math.max(0, Math.min(100, ((currentDb - 40) / 90) * 100));
    if (stageMeterFill) stageMeterFill.style.width = `${barPercent}%`;
    
    if (isFinalVictory) {
        lastUpdate = Date.now();
        return;
    }

    // Determine Tier
    let newTier = 0;
    for (const t of TIER_THRESHOLDS) {
        if (currentDb >= t.db) {
            newTier = t.tier;
            break;
        }
    }

    // If we are on Stage 4 ("NOTHING IS IMPOSSIBLE WITH GOD") and the whole crowd hits Tier 4 (120 dB), unleash Final Victory!
    if (currentStage === 4 && newTier === 4) {
        activateFinalVictory();
        lastUpdate = Date.now();
        return;
    }

    if (isManualOverride) {
        if (newTier !== currentTier) {
            if (newTier > 0) {
                playAchievementSound(newTier);
                spawnShockwave(newTier * 0.45, newTier);
            }
            currentTier = newTier;
            if (currentTier === 4 && currentStage < 4) {
                triggerTier4LockAndUnlock();
            } else {
                clearTierLock();
            }
        }
    } else if (wasManualOverride && !isManualOverride) {
        clearTierLock();
        currentTier = newTier;
    } else if (newTier > currentTier) {
        playAchievementSound(newTier);
        spawnShockwave(newTier * 0.45, newTier);
        currentTier = newTier;

        if (achievementTimer) clearTimeout(achievementTimer);
        if (currentTier === 4 && currentStage < 4) {
            triggerTier4LockAndUnlock();
        }
        achievementTimer = setTimeout(() => {
            currentTier = 0;
            clearTierLock();
            updateTierBadge(0, currentDb);
        }, UNLOCK_DURATION_MS);
    }

    updateTierBadge(currentTier, currentDb);
    lastUpdate = Date.now();
});

// --- WARM ARCHITECTURAL WORSHIP SOUND SYNTHESIZER ---
function playAchievementSound(tier) {
    if (!audioEnabled || !displayAudioCtx) return;
    if (displayAudioCtx.state === 'suspended') displayAudioCtx.resume();

    const t = displayAudioCtx.currentTime;

    // 1. Warm Sanctuary Sub Foundation
    const subOsc = displayAudioCtx.createOscillator();
    const subGain = displayAudioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(65.41, t); // C2 warm sub
    subOsc.frequency.exponentialRampToValueAtTime(32.70, t + 1.4);

    subGain.gain.setValueAtTime(0, t);
    subGain.gain.linearRampToValueAtTime(0.45 + tier * 0.08, t + 0.06);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 2.2);

    subOsc.connect(subGain);
    subGain.connect(displayAudioCtx.destination);
    subOsc.start(t);
    subOsc.stop(t + 2.4);

    // 2. Uplifting Worship Pad & Shimmer Chimes (Major 9th / Add9 voicings)
    const voicings = {
        1: [261.63, 329.63, 392.00],                 // C Major
        2: [261.63, 329.63, 392.00, 587.33],         // C Add9
        3: [261.63, 329.63, 392.00, 493.88, 587.33], // C Maj9
        4: [261.63, 392.00, 523.25, 659.25, 783.99, 1046.50] // Grand Octave Triumph
    };

    const notes = voicings[tier] || voicings[1];
    notes.forEach((freq, idx) => {
        const osc = displayAudioCtx.createOscillator();
        const gain = displayAudioCtx.createGain();
        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.04);

        gain.gain.setValueAtTime(0, t + idx * 0.04);
        gain.gain.linearRampToValueAtTime(0.11, t + idx * 0.04 + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 2.8 + tier * 0.4);

        osc.connect(gain);
        gain.connect(displayAudioCtx.destination);
        osc.start(t + idx * 0.04);
        osc.stop(t + 3.2 + tier * 0.4);
    });
}

function playStageTransitionChime() {
    if (!audioEnabled || !displayAudioCtx) return;
    if (displayAudioCtx.state === 'suspended') displayAudioCtx.resume();
    const t = displayAudioCtx.currentTime;
    const notes = [392.00, 493.88, 587.33, 783.99];
    notes.forEach((freq, idx) => {
        const osc = displayAudioCtx.createOscillator();
        const gain = displayAudioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.08);
        gain.gain.setValueAtTime(0, t + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.12, t + idx * 0.08 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
        osc.connect(gain);
        gain.connect(displayAudioCtx.destination);
        osc.start(t + idx * 0.08);
        osc.stop(t + 2.2);
    });
}

function playFinalVictorySymphony() {
    if (!audioEnabled || !displayAudioCtx) return;
    if (displayAudioCtx.state === 'suspended') displayAudioCtx.resume();
    const t = displayAudioCtx.currentTime;

    // Deep Sanctuary Sub Drop
    const subOsc = displayAudioCtx.createOscillator();
    const subGain = displayAudioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(87.31, t); // F2 -> C1
    subOsc.frequency.exponentialRampToValueAtTime(32.70, t + 2.5);
    subGain.gain.setValueAtTime(0, t);
    subGain.gain.linearRampToValueAtTime(0.75, t + 0.08);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
    subOsc.connect(subGain);
    subGain.connect(displayAudioCtx.destination);
    subOsc.start(t);
    subOsc.stop(t + 4.8);

    // Majestic Ascending Cathedral Fanfare + Shimmering Harp Arpeggio
    const chord = [261.63, 329.63, 392.00, 493.88, 523.25, 659.25, 783.99, 1046.50, 1318.51];
    chord.forEach((freq, idx) => {
        const osc = displayAudioCtx.createOscillator();
        const gain = displayAudioCtx.createGain();
        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        const startAt = t + idx * 0.07;
        osc.frequency.setValueAtTime(freq, startAt);
        gain.gain.setValueAtTime(0, startAt);
        gain.gain.linearRampToValueAtTime(0.14, startAt + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + 6.5);
        osc.connect(gain);
        gain.connect(displayAudioCtx.destination);
        osc.start(startAt);
        osc.stop(startAt + 6.8);
    });
}

// --- 60FPS RENDER LOOP ---
function render() {
    const now = Date.now();
    if (!isManualOverride && !isFinalVictory && now - lastUpdate > 2000) {
        targetLevel = 0;
    }

    currentLevel += (targetLevel - currentLevel) * 0.35;
    const visualLevel = (currentTier > 0 || isFinalVictory) ? 100 : currentLevel;
    const nLevel = Math.max(0, Math.min(100, visualLevel)) / 100;

    // Update 5-second Tier 4 unlock progress bar if active
    if (tier4StartTime > 0 && currentTier === 4 && currentStage < 4) {
        const elapsed = now - tier4StartTime;
        const pct = Math.min(100, (elapsed / UNLOCK_DURATION_MS) * 100);
        unlockFill.style.width = `${pct}%`;
    }

    renderCanvasFX(nLevel, currentTier, isFinalVictory, now);
    applyTypographyEffect(nLevel, currentTier, isFinalVictory);

    requestAnimationFrame(render);
}

function renderCanvasFX(nLevel, tier, victoryActive, now) {
    ctx.clearRect(0, 0, cw, ch);
    const cx = cw / 2;
    const cy = ch / 2;

    // 1. Warm Volumetric Morning Sunbeams
    const beamIntensity = victoryActive ? 0.32 : (tier > 0 ? 0.08 + tier * 0.045 : nLevel * 0.08);
    if (beamIntensity > 0.01) {
        sunbeamAngle += 0.0018 + (victoryActive ? 0.0025 : tier * 0.0008);
        const rayCount = victoryActive ? 16 : 12;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(sunbeamAngle);

        const maxRadius = Math.max(cw, ch) * 0.9;
        for (let i = 0; i < rayCount; i++) {
            const angle = (i / rayCount) * Math.PI * 2;
            ctx.save();
            ctx.rotate(angle);
            const grad = ctx.createLinearGradient(0, 0, maxRadius, 0);
            grad.addColorStop(0, `rgba(212, 175, 55, ${beamIntensity})`);
            grad.addColorStop(0.6, `rgba(247, 231, 180, ${beamIntensity * 0.45})`);
            grad.addColorStop(1, 'rgba(252, 249, 244, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(maxRadius, -maxRadius * 0.085);
            ctx.lineTo(maxRadius, maxRadius * 0.085);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    // 2. Ambient & Tier Acoustic Shockwave Rings
    const waveInterval = victoryActive ? 380 : (tier >= 3 ? 450 : 900);
    if ((nLevel > 0.25 || tier > 0 || victoryActive) && now - lastAmbientWave > waveInterval) {
        spawnShockwave(victoryActive ? 1.6 : (tier > 0 ? tier * 0.35 : nLevel * 0.5), 1);
        lastAmbientWave = now;
    }

    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.r += sw.speed;
        const progress = sw.r / sw.maxR;
        const currentAlpha = sw.alpha * (1 - progress);

        if (progress >= 1 || currentAlpha <= 0.005) {
            shockwaves.splice(i, 1);
            continue;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, sw.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(180, 130, 25, ${currentAlpha})`;
        ctx.lineWidth = sw.lineWidth;
        ctx.stroke();
        ctx.restore();
    }

    // 3. Rising Golden Light Motes
    const speedMult = victoryActive ? 2.8 : (1 + nLevel * 1.8 + tier * 0.7);
    const alphaMult = victoryActive ? 1.6 : (0.4 + nLevel * 0.8 + tier * 0.25);

    for (const p of particles) {
        p.y += p.vy * speedMult;
        p.x += p.vx;

        if (p.y < -10) {
            p.y = ch + 10;
            p.x = Math.random() * cw;
        }
        if (p.x < 0) p.x = cw;
        if (p.x > cw) p.x = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.hue}, ${Math.min(0.9, p.alpha * alphaMult)})`;
        ctx.fill();
    }

    // 4. Final Victory Golden Confetti Shower
    if (victoryActive && confetti.length > 0) {
        for (const c of confetti) {
            c.y += c.vy;
            c.x += c.vx + Math.sin(c.y * 0.02) * 0.6;
            c.rot += c.vRot;

            if (c.y > ch + 20) {
                c.y = -20;
                c.x = Math.random() * cw;
            }

            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.rotate(c.rot);
            ctx.scale(Math.cos(c.rot * 1.5), 1);
            ctx.fillStyle = c.color;
            ctx.globalAlpha = c.alpha;
            ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
            ctx.restore();
        }
    }
}

function applyTypographyEffect(nLevel, tier, victoryActive) {
    const isTransitioning = textEl.classList.contains('word-transition');
    textEl.className = isTransitioning ? 'word-transition' : '';

    if (victoryActive) {
        textEl.classList.add('final-victory-glory');
        const breath = 1.08 + Math.sin(Date.now() * 0.004) * 0.035;
        textEl.style.transform = `scale(${breath})`;
        textEl.style.opacity = '1';
        return;
    }

    if (tier >= 1 && tier <= 4) {
        textEl.classList.add(`tier-${tier}`);
        const baseScale = 1 + tier * 0.04;
        const pulse = Math.sin(Date.now() * (0.006 + tier * 0.002)) * (0.012 * tier);
        textEl.style.transform = `scale(${baseScale + pulse})`;
        textEl.style.opacity = '1';
    } else {
        // Sleek Morning Build-up before Tier 1
        const scale = 1 + nLevel * 0.08;
        textEl.style.transform = `scale(${scale})`;
        textEl.style.opacity = String(0.88 + nLevel * 0.12);
    }
}

applyStageUI(0, false);
requestAnimationFrame(render);

