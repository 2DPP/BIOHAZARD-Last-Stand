"use strict";

/* ============================================================
   PART 1: DOM REFERENCES
   Locate and store the HTML elements used by menus, controls,
   the canvas, audio settings, and gameplay HUD.
   ============================================================ */
const screens = document.querySelectorAll(".screen");
const navigationButtons = document.querySelectorAll("[data-screen]");
const canvasFrame = document.querySelector("#canvas-frame");
const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
const canvasMessage = document.querySelector("#canvas-message");

const pauseButton = document.querySelector("#pause-button");
const resumeButton = document.querySelector("#resume-button");
const pauseOverlay = document.querySelector("#pause-overlay");

const joystickBase = document.querySelector("#joystick-base");
const joystickStick = document.querySelector("#joystick-stick");
const usernameForm = document.querySelector("#username-form");
const usernameInput = document.querySelector("#username-input");
const usernameError = document.querySelector("#username-error");
const leaderboardList = document.querySelector("#leaderboard-list");
const audioToggle = document.querySelector("#audio-toggle");
const volumeSlider = document.querySelector("#volume-slider");

/* ============================================================
   PART 2: AUDIO SYSTEM
   Loads the background track and .wav sound effects, creates
   smooth crossfades, and plays buffered SFX via Web Audio API.
   ============================================================ */
const audioManager = (() => {
    const musicUrl = "assets/sfx/background/bgmBH.mp3";
    const sfxPaths = {
        shoot: "assets/sfx/gun/gunShot.wav",
        pickup: "assets/sfx/items/exp.wav",
        "game-over": "assets/sfx/ui/dead.wav",
        "ui-click": "assets/sfx/ui/menuButtons.wav",
        "ui-error": "assets/sfx/ui/invalidSelect.wav",
        "player-hit": "assets/sfx/player/playerHurt1.WAV",
        "enemy-dead-tyrant": "assets/sfx/enemy/tyrantDead.WAV",
        "enemy-dead-hound": "assets/sfx/enemy/houndDead.WAV",
        "enemy-dead-mutant": "assets/sfx/enemy/deadMutant.WAV",
        "enemy-dead-zombie": "assets/sfx/enemy/zombieDead.WAV"
    };
    const sfxVolumes = {
        shoot: 0.2,
        pickup: 0.5,
        "game-over": 1.0,
        "ui-click": 0.8,
        "ui-error": 0.9,
        "player-hit": 0.6,
        "enemy-dead-tyrant": 1.0,
        "enemy-dead-hound": 0.6,
        "enemy-dead-mutant": 0.7,
        "enemy-dead-zombie": 0.5
    };

    const musicCrossfadeDuration = 2;
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    let audioContext = null;
    let masterGain = null;
    let musicGain = null;
    let musicBuffer = null;
    let musicLoadPromise = null;
    const sfxBuffers = new Map();
    const sfxLoading = new Map();

    const activeMusicSources = new Set();
    let activeMusicSource = null;
    let activeMusicGain = null;
    let musicPosition = 0;
    let musicStartedAt = 0;
    let musicPlaying = false;
    let musicRequested = false;
    let musicCrossfadeTimer = null;
    let muted = false;
    let volume = 0.35;

    try {
        muted = localStorage.getItem("biohazardAudioMuted") === "true";
        const savedVolume = localStorage.getItem("biohazardAudioVolume");
        if (savedVolume !== null) {
            const parsedVolume = Number(savedVolume);
            if (Number.isFinite(parsedVolume)) {
                volume = Math.min(1, Math.max(0, parsedVolume));
            }
        }
    } catch (error) {
        console.warn("Audio preferences could not be loaded.", error);
    }

    // Updates the music and sound-effect volume levels.
    function updateMusicVolume() {
        if (musicGain && audioContext) {
            musicGain.gain.setTargetAtTime(muted ? 0 : volume, audioContext.currentTime, 0.02);
        }
        if (masterGain && audioContext) {
            masterGain.gain.setTargetAtTime(muted ? 0 : volume, audioContext.currentTime, 0.02);
        }
    }

    // Creates and resumes the browser audio context.
    function ensureAudioContext() {
        if (!AudioContextConstructor) {
            return null;
        }
        if (!audioContext) {
            audioContext = new AudioContextConstructor();
            masterGain = audioContext.createGain();
            masterGain.connect(audioContext.destination);
            musicGain = audioContext.createGain();
            musicGain.connect(audioContext.destination);
            updateMusicVolume();
        }
        if (audioContext.state === "suspended") {
            audioContext.resume();
        }
        return audioContext;
    }

    // Loads one custom sound-effect file into an audio buffer.
    async function loadSfxBuffer(effectName) {
        if (sfxBuffers.has(effectName)) {
            return sfxBuffers.get(effectName);
        }
        if (sfxLoading.has(effectName)) {
            return sfxLoading.get(effectName);
        }

        const url = sfxPaths[effectName];
        const ctx = ensureAudioContext();
        if (!url || !ctx) {
            return null;
        }

        // Reuse this promise when the same effect is requested repeatedly.
        const loadPromise = fetch(url)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`SFX request failed (${effectName}): ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
            .then((decodedBuffer) => {
                sfxBuffers.set(effectName, decodedBuffer);
                sfxLoading.delete(effectName);
                return decodedBuffer;
            })
            .catch((error) => {
                console.warn(`Could not load SFX "${effectName}" from ${url}:`, error);
                sfxLoading.delete(effectName);
                return null;
            });

        sfxLoading.set(effectName, loadPromise);
        return loadPromise;
    }

    // Starts loading all available custom sound effects.
    function preloadAllSfx() {
        Object.keys(sfxPaths).forEach((effectName) => {
            loadSfxBuffer(effectName);
        });
    }

    // Plays a loaded sound-effect buffer once.
    function playBuffer(buffer, playbackGain = 1.0) {
        const ctx = ensureAudioContext();
        if (!ctx || !buffer || muted) {
            return false;
        }
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        gain.gain.setValueAtTime(playbackGain, ctx.currentTime);
        source.connect(gain);
        gain.connect(masterGain);
        source.start(ctx.currentTime);
        return true;
    }

    // Downloads and decodes the background music.
    async function loadMusic() {
        if (musicBuffer) {
            return musicBuffer;
        }
        if (musicLoadPromise) {
            return musicLoadPromise;
        }
        const ctx = ensureAudioContext();
        if (!ctx) {
            return null;
        }
        // Cache the promise so the track is decoded only once.
        musicLoadPromise = fetch(musicUrl)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Music request failed: ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then((encodedBuffer) => ctx.decodeAudioData(encodedBuffer))
            .then((decodedBuffer) => {
                musicBuffer = decodedBuffer;
                musicLoadPromise = null;
                return decodedBuffer;
            })
            .catch((error) => {
                console.error("Background music could not be loaded.", error);
                musicLoadPromise = null;
                return null;
            });

        return musicLoadPromise;
    }

    // Cancels the pending music crossfade timer.
    function clearCrossfadeTimer() {
        if (musicCrossfadeTimer !== null) {
            clearTimeout(musicCrossfadeTimer);
            musicCrossfadeTimer = null;
        }
    }

    // Schedules the next smooth music loop.
    function scheduleCrossfade() {
        if (!musicPlaying || !musicBuffer) {
            return;
        }
        clearCrossfadeTimer();
        // Begin the overlap early enough for both track copies to be heard.
        const crossfade = Math.min(musicCrossfadeDuration, musicBuffer.duration / 4);
        const position = getCurrentMusicPosition();
        const delay = Math.max(0.1, musicBuffer.duration - position - crossfade);
        musicCrossfadeTimer = setTimeout(crossfadeMusic, delay * 1000);
    }

    // Calculates the current position in the music track.
    function getCurrentMusicPosition() {
        if (!musicPlaying || !audioContext) {
            return musicPosition;
        }
        return Math.min(
            musicBuffer ? musicBuffer.duration : 0,
            musicPosition + (audioContext.currentTime - musicStartedAt)
        );
    }

    // Starts music playback from a selected position.
    function startMusicSource(offset = 0) {
        if (!musicBuffer || !musicRequested) {
            return;
        }
        const ctx = ensureAudioContext();
        if (!ctx) {
            return;
        }
        clearCrossfadeTimer();
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        // Keep the starting position safely inside the decoded track.
        const safeOffset = Math.min(Math.max(0, offset), Math.max(0, musicBuffer.duration - 0.05));
        source.buffer = musicBuffer;
        gain.gain.setValueAtTime(1, ctx.currentTime);
        source.connect(gain);
        gain.connect(musicGain);

        activeMusicSources.add(source);
        source.onended = () => {
            activeMusicSources.delete(source);
        };

        source.start(ctx.currentTime, safeOffset);
        activeMusicSource = source;
        activeMusicGain = gain;
        musicPosition = safeOffset;
        musicStartedAt = ctx.currentTime;
        musicPlaying = true;
        scheduleCrossfade();
    }

    // Crossfades from the ending track into a new track.
    function crossfadeMusic() {
        if (!musicPlaying || !musicBuffer || muted || !musicRequested) {
            return;
        }
        const ctx = ensureAudioContext();
        if (!ctx) {
            return;
        }
        const crossfade = Math.min(musicCrossfadeDuration, musicBuffer.duration / 4);
        // Start a new copy at zero while fading out the old copy.
        const oldSource = activeMusicSource;
        const oldGain = activeMusicGain;
        const nextSource = ctx.createBufferSource();
        const nextGain = ctx.createGain();
        const now = ctx.currentTime;

        nextSource.buffer = musicBuffer;
        nextGain.gain.setValueAtTime(0, now);
        nextGain.gain.linearRampToValueAtTime(1, now + crossfade);
        nextSource.connect(nextGain);
        nextGain.connect(musicGain);

        activeMusicSources.add(nextSource);
        nextSource.onended = () => {
            activeMusicSources.delete(nextSource);
        };

        nextSource.start(now, 0);

        if (oldGain && oldSource) {
            oldGain.gain.cancelScheduledValues(now);
            oldGain.gain.setValueAtTime(1, now);
            oldGain.gain.linearRampToValueAtTime(0, now + crossfade);
            oldSource.stop(now + crossfade);
        }

        activeMusicSource = nextSource;
        activeMusicGain = nextGain;
        musicPosition = 0;
        musicStartedAt = now;
        scheduleCrossfade();
    }

    // Creates a short synthesized tone effect.
    function playTone(startFrequency, endFrequency, duration, type = "square", level = 0.08) {
        if (muted) {
            return;
        }
        const ctx = ensureAudioContext();
        if (!ctx) {
            return;
        }
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const now = ctx.currentTime;

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(startFrequency, now);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(level, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        oscillator.connect(gain);
        gain.connect(masterGain);
        oscillator.start(now);
        oscillator.stop(now + duration);
    }

    // Creates a short synthesized noise effect.
    function playNoise(duration = 0.08, level = 0.06) {
        if (muted) {
            return;
        }
        const ctx = ensureAudioContext();
        if (!ctx) {
            return;
        }
        const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < data.length; index += 1) {
            data[index] = Math.random() * 2 - 1;
        }

        const source = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        const now = ctx.currentTime;
        filter.type = "bandpass";
        filter.frequency.value = 1200;
        gain.gain.setValueAtTime(level, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        source.buffer = buffer;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        source.start(now);
    }

    // Plays the sound assigned to a gameplay event.
    function play(effect) {
        if (muted) {
            return;
        }

        // Prefer a loaded custom sound file when one is available.
        if (Object.prototype.hasOwnProperty.call(sfxPaths, effect)) {
            const effectGain = sfxVolumes[effect] ?? 1.0;
            const cachedBuffer = sfxBuffers.get(effect);
            if (cachedBuffer) {
                playBuffer(cachedBuffer, effectGain);
                return;
            }
            // Load on demand if the first interaction beats preloading.
            loadSfxBuffer(effect).then((buffer) => {
                if (buffer) {
                    playBuffer(buffer, effectGain);
                }
            });
            return;
        }

        // Use generated tones when no custom sound file exists.
        switch (effect) {
            case "hit":
                playTone(150, 70, 0.06, "square", 0.04);
                break;
            case "player-hit":
                playTone(110, 45, 0.18, "sawtooth", 0.09);
                break;
            case "level-up":
                playTone(330, 660, 0.18, "triangle", 0.08);
                setTimeout(() => playTone(660, 990, 0.2, "triangle", 0.07), 90);
                break;
            case "boss":
                playTone(90, 35, 0.5, "sawtooth", 0.1);
                break;
            case "pause":
                playTone(300, 180, 0.14, "square", 0.06);
                break;
            case "resume":
                playTone(180, 360, 0.14, "square", 0.06);
                break;
            default:
                break;
        }
    }

    // Starts background music after user interaction.
    function startMusic() {
        musicRequested = true;
        if (muted) {
            return;
        }
        updateMusicVolume();
        ensureAudioContext();
        preloadAllSfx();
        if (musicPlaying) {
            return;
        }
        loadMusic().then((buffer) => {
            if (buffer && !muted && musicRequested && !musicPlaying && !document.querySelector("#gameplay").hidden) {
                startMusicSource(musicPosition);
            }
        });
    }

    // Stops and resets the background music.
    function stopMusic() {
        musicRequested = false;
        clearCrossfadeTimer();
        if (audioContext && audioContext.state === "suspended") {
            audioContext.resume();
        }
        activeMusicSources.forEach((source) => {
            try {
                source.stop(0);
                source.disconnect();
            } catch (error) {
                // Source already stopped
            }
        });
        activeMusicSources.clear();
        activeMusicSource = null;
        activeMusicGain = null;
        musicPlaying = false;
        musicPosition = 0;
    }

    // Pauses audio while preserving the current music position.
    function pauseMusic() {
        if (!musicPlaying) {
            return;
        }
        musicPosition = getCurrentMusicPosition();
        clearCrossfadeTimer();
        if (audioContext && audioContext.state === "running") {
            audioContext.suspend();
        }
    }

    // Resumes music after gameplay is unpaused.
    function resumeMusic() {
        if (!muted) {
            ensureAudioContext();
            if (musicPlaying && audioContext) {
                audioContext.resume().then(() => {
                    musicStartedAt = audioContext.currentTime;
                    scheduleCrossfade();
                });
            } else {
                startMusic();
            }
        }
    }

    // Turns all audio on or off and saves the preference.
    function setMuted(nextMuted) {
        muted = nextMuted;
        updateMusicVolume();
        if (muted) {
            pauseMusic();
        } else {
            ensureAudioContext();
            preloadAllSfx();
            if (!document.querySelector("#gameplay").hidden) {
                startMusic();
            }
        }
        try {
            localStorage.setItem("biohazardAudioMuted", String(muted));
        } catch (error) {
            console.warn("Audio mute preference could not be saved.", error);
        }
    }

    // Changes and saves the master volume.
    function setVolume(nextVolume) {
        volume = Math.min(1, Math.max(0, nextVolume));
        updateMusicVolume();
        try {
            localStorage.setItem("biohazardAudioVolume", String(volume));
        } catch (error) {
            console.warn("Audio volume preference could not be saved.", error);
        }
    }

    return {
        play,
        preloadAllSfx,
        startMusic,
        stopMusic,
        pauseMusic,
        resumeMusic,
        setMuted,
        setVolume,
        isMuted: () => muted,
        getVolume: () => volume
    };
})();

/* ============================================================
   PART 3: SPRITE AND ASSET LOADING
   Loads player, enemy, effect, pickup, and environment assets.
   ============================================================ */
// Creates an image from a sprite asset path.
function loadSprite(src) {
    const img = new Image();
    img.src = src;
    return img;
}

// Checks whether an image finished loading successfully.
function isSpriteReady(img) {
    return Boolean(img && img.complete && img.naturalWidth !== 0);
}

// Selects the current frame from an animation list.
function getFrameFromList(frameList, fps = 8, offset = 0) {
    const ready = frameList.filter(isSpriteReady);
    if (ready.length === 0) return null;
    const idx = Math.floor(visualTime * fps + offset) % ready.length;
    return ready[idx];
}

/* --- 8-direction player sprites --- */
const playerGif8 = {
    east: loadSprite("assets/sprite/player/east.gif"),
    northeast: loadSprite("assets/sprite/player/northeast.gif"),
    north: loadSprite("assets/sprite/player/north.gif"),
    northwest: loadSprite("assets/sprite/player/northwest.gif"),
    west: loadSprite("assets/sprite/player/west.gif"),
    southwest: loadSprite("assets/sprite/player/southwest.gif"),
    south: loadSprite("assets/sprite/player/south.gif"),
    southeast: loadSprite("assets/sprite/player/southeast.gif")
};

/* --- Enemy, effect, pickup, and environment sprites --- */
const sprites = {
    zombieWalk: [
        loadSprite("assets/sprite/enemy/zombie-walk-1.png"),
        loadSprite("assets/sprite/enemy/zombie-walk-2.png"),
        loadSprite("assets/sprite/enemy/zombie-walk-3.png")
    ],
    houndRun: [
        loadSprite("assets/sprite/enemy/hound-run-1.png"),
        loadSprite("assets/sprite/enemy/hound-run-2.png"),
        loadSprite("assets/sprite/enemy/hound-run-3.png")
    ],
    mutantWalk: [
        loadSprite("assets/sprite/enemy/mutant-walk-1.png"),
        loadSprite("assets/sprite/enemy/mutant-walk-2.png"),
        loadSprite("assets/sprite/enemy/mutant-walk-3.png")
    ],
    tyrantIdle: loadSprite("assets/sprite/enemy/tyrant-idle.png"),
    tyrantWalk: [
        loadSprite("assets/sprite/enemy/tyrant-walk-1.png"),
        loadSprite("assets/sprite/enemy/tyrant-walk-2.png"),
        loadSprite("assets/sprite/enemy/tyrant-walk-3.png")
    ],
    fxExplosion: [
        loadSprite("assets/sprite/effects/fx-explosion-1.png"),
        loadSprite("assets/sprite/effects/fx-explosion-2.png"),
        loadSprite("assets/sprite/effects/fx-explosion-3.png")
    ],
    fxFlash: [
        loadSprite("assets/sprite/effects/fx-flash-1.png"),
        loadSprite("assets/sprite/effects/fx-flash-2.png")
    ],
    fxBlood: [
        loadSprite("assets/sprite/effects/fx-blood-1.png"),
        loadSprite("assets/sprite/effects/fx-blood-2.png")
    ],
    itemHerbGreen: loadSprite("assets/sprite/items/item-herb-green.png"),
    tileFloor: loadSprite("assets/sprite/background/tile-floor.png"),
    
    
};

/* ============================================================
   PART 4: WORLD, PLAYER, AND GAMEPLAY DATA
   Defines the map size, player attributes, camera, joystick,
   enemies, handgun, upgrades, and runtime game variables.
   ============================================================ */
const keys = new Set();
const world = {
    width: 3200,
    height: 2200
};
const player = {
    x: world.width / 2,
    y: world.height / 2,
    width: 18,
    height: 24,
    speed: 220,
    maxHealth: 100,
    health: 100,
    damageCooldown: 0,
    level: 1,
    experience: 0,
    experienceToNextLevel: 40,
    pickupRange: 90,
    isMoving: false,
    facing8: "east",
    isFiring: false,
    fireTimer: 0
};
const camera = {
    x: 0,
    y: 0,
    viewWidth: 960,
    viewHeight: 540
};
const joystick = {
    active: false,
    touchId: null,
    originX: 0,
    originY: 0,
    dx: 0,
    dy: 0,
    maxRadius: 42
};

const enemies = [];
const projectiles = [];
const experienceOrbs = [];
const impactEffects = [];
const enemyTypes = {
    zombie: { health: 30, speed: 54, damage: 8, score: 10, experience: 15, radius: 13 },
    hound: { health: 22, speed: 100, damage: 12, score: 25, experience: 20, radius: 11 },
    mutant: { health: 90, speed: 34, damage: 18, score: 50, experience: 40, radius: 19 },
    tyrant: { health: 350, speed: 25, damage: 25, score: 500, experience: 100, radius: 30 }
};
const handgun = {
    damage: 20,
    cooldown: 0.55,
    range: 560,
    projectileSpeed: 520,
    projectileCount: 1
};
const upgrades = [
    {
        name: "Reinforced Rounds",
        description: "Increase handgun damage by 8.",
        apply: () => { handgun.damage += 8; }
    },
    {
        name: "Quick Trigger",
        description: "Fire the handgun 15% faster.",
        apply: () => { handgun.cooldown = Math.max(0.18, handgun.cooldown * 0.85); }
    },
    {
        name: "Field Medic",
        description: "Recover 25 health immediately.",
        apply: () => { player.health = Math.min(player.maxHealth, player.health + 25); }
    },
    {
        name: "Combat Training",
        description: "Increase movement speed by 25.",
        apply: () => { player.speed += 25; }
    },
    {
        name: "Expanded Magazine",
        description: "Fire one additional handgun projectile.",
        apply: () => { handgun.projectileCount += 1; }
    },
    {
        name: "Scavenger",
        description: "Increase experience pickup range by 35.",
        apply: () => { player.pickupRange += 35; }
    }
];

let animationFrameId = null;
let previousTime = 0;
let gameIsRunning = false;
let isPaused = false;
let enemySpawnTimer = 0;
let nextEnemyId = 1;
let handgunCooldown = 0;
let levelUpPending = false;
let survivalTime = 0;
let score = 0;
let kills = 0;
let bossesDefeated = 0;
let lastScoredMinute = 0;
let nextBossTime = 60;
let visualTime = 0;
let currentUsername = "";
let runSubmitted = false;

const allowedMovementKeys = new Set([
    "w",
    "a",
    "s",
    "d",
    "arrowup",
    "arrowleft",
    "arrowdown",
    "arrowright"
]);

/* ============================================================
   PART 5: SHARED INPUT AND AIMING HELPERS
   Converts movement vectors into 8-direction facing values and
   keeps the player aimed toward the nearest enemy.
   ============================================================ */
// Converts movement values into one of eight directions.
function getDirection8FromVector(dx, dy) {
    if (Math.hypot(dx, dy) <= 0.05) {
        return null;
    }
    const angle = Math.atan2(dy, dx);
    const octant = Math.round(angle / (Math.PI / 4));
    const dirs = [
        "east",
        "southeast",
        "south",
        "southwest",
        "west",
        "northwest",
        "north",
        "northeast"
    ];
    const index = ((octant % 8) + 8) % 8;
    return dirs[index];
}

// Points the player toward the nearest enemy.
function updateAimFacing() {
    const target = findNearestEnemy();
    if (target) {
        const aimDir8 = getDirection8FromVector(target.x - player.x, target.y - player.y);
        if (aimDir8) {
            player.facing8 = aimDir8;
        }
    }
}

/* ============================================================
   PART 6: SCREEN NAVIGATION AND CANVAS RESIZING
   Switches menu screens, validates gameplay access, updates the
   camera viewport, and resizes the canvas without distortion.
   ============================================================ */
// Fits the Canvas and camera to the available screen space.
function resizeCanvas() {
    if (!canvasFrame) {
        return;
    }
    const rect = canvasFrame.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        return;
    }

    const minDimension = Math.min(rect.width, rect.height);
    const targetMinWorldView = 420;
    const scale = minDimension < targetMinWorldView ? targetMinWorldView / minDimension : 1;

    camera.viewWidth = Math.round(rect.width * scale);
    camera.viewHeight = Math.round(rect.height * scale);

    canvas.width = camera.viewWidth;
    canvas.height = camera.viewHeight;
    context.imageSmoothingEnabled = false;

    updateCamera();
    if (!gameIsRunning) {
        drawGame();
    }
}

// Shows one application screen and hides the others.
function showScreen(screenId) {
    screens.forEach((screen) => {
        const isSelected = screen.id === screenId;
        screen.hidden = !isSelected;
        screen.classList.toggle("screen--active", isSelected);
    });

    if (screenId === "high-scores") {
        renderLeaderboard();
    }

    if (screenId === "username") {
        const savedUsername = getSavedUsername();
        usernameInput.value = savedUsername;
        usernameError.textContent = "";
        if (savedUsername) {
            usernameInput.select();
        }
    }

    if (screenId === "gameplay") {
        if (!currentUsername) {
            currentUsername = getSavedUsername();
        }
        if (!currentUsername) {
            screenId = "username";
            screens.forEach((screen) => {
                screen.hidden = screen.id !== "username";
                screen.classList.toggle("screen--active", screen.id === "username");
            });
            usernameInput.value = "";
            usernameError.textContent = "";
            return;
        }
        requestAnimationFrame(() => {
            resizeCanvas();
            startGame();
            audioManager.startMusic();
        });
    } else {
        stopGame();
        audioManager.stopMusic();
    }
}

/* ============================================================
   PART 7: USERNAME AND LOCAL LEADERBOARD
   Saves usernames and completed runs using browser localStorage,
   validates stored data, merges duplicate names, and renders ranks.
   ============================================================ */
// Finds the current player's best saved score.
function getPersonalBestForUsername() {
    const entry = getLeaderboard().find(
        (record) => record.username.toLowerCase() === currentUsername.toLowerCase()
    );
    return entry ? entry.score : score;
}

// Formats a score as a six-digit display value.
function formatScore(value) {
    return String(value).padStart(6, "0");
}

// Retrieves the saved username from local storage.
function getSavedUsername() {
    try {
        return (localStorage.getItem("biohazardUsername") || "").slice(0, 16);
    } catch (error) {
        return "";
    }
}

// Loads, validates, and merges leaderboard records.
function getLeaderboard() {
    try {
        // Convert saved text back into an array of records.
        const parsed = JSON.parse(localStorage.getItem("biohazardLeaderboard") || "[]");
        if (!Array.isArray(parsed)) {
            return [];
        }

        // Keep only records with the fields needed by the leaderboard.
        const records = parsed
            .filter((entry) =>
                entry &&
                typeof entry.username === "string" &&
                Number.isFinite(Number(entry.score)) &&
                typeof entry.time === "string"
            )
            .map((entry) => ({
                username: entry.username.trim().slice(0, 16),
                score: Math.max(0, Math.floor(Number(entry.score))),
                time: entry.time.slice(0, 8),
                kills: Number.isFinite(Number(entry.kills)) ? Math.max(0, Math.floor(Number(entry.kills))) : 0
            }))
            .filter((entry) => entry.username);

        // Merge names such as "Alex" and "alex" into one best record.
        const uniqueRecords = new Map();
        records.forEach((entry) => {
            const key = entry.username.toLowerCase();
            const existing = uniqueRecords.get(key);
            if (!existing || entry.score > existing.score) {
                uniqueRecords.set(key, entry);
            }
        });

        return [...uniqueRecords.values()];
    } catch (error) {
        return [];
    }
}

// Saves the completed run and checks for a personal best.
function saveLeaderboardEntry() {
    if (runSubmitted) {
        return { personalBest: false, record: null };
    }
    runSubmitted = true;

    // Load the existing records before adding this completed run.
    const leaderboard = getLeaderboard();
    const normalizedName = currentUsername.toLowerCase();
    const existingIndex = leaderboard.findIndex(
        (entry) => entry.username.toLowerCase() === normalizedName
    );
    const previousBest = existingIndex >= 0 ? leaderboard[existingIndex].score : 0;
    const isPersonalBest = score > previousBest;
    const record = {
        username: currentUsername,
        score,
        time: formatSurvivalTime(),
        kills
    };

    if (existingIndex >= 0) {
        if (score > leaderboard[existingIndex].score) {
            leaderboard[existingIndex] = record;
        }
    } else {
        leaderboard.push(record);
    }

    // Sort highest score first, then use kills as a tiebreaker.
    leaderboard.sort((a, b) => b.score - a.score || b.kills - a.kills);

    try {
        localStorage.setItem("biohazardLeaderboard", JSON.stringify(leaderboard.slice(0, 10)));
    } catch (error) {
        console.warn("Leaderboard could not be saved in this browser context.", error);
    }

    return { personalBest: isPersonalBest, record };
}

// Renders the top ten leaderboard records.
function renderLeaderboard() {
    if (!leaderboardList) {
        return;
    }

    const leaderboard = getLeaderboard()
        .sort((a, b) => b.score - a.score || b.kills - a.kills)
        .slice(0, 10);

    leaderboardList.replaceChildren();

    if (leaderboard.length === 0) {
        const emptyRow = document.createElement("p");
        emptyRow.className = "leaderboard-empty";
        emptyRow.textContent = "NO COMPLETED RUNS RECORDED";
        leaderboardList.appendChild(emptyRow);
        return;
    }

    leaderboard.forEach((entry, index) => {
        const row = document.createElement("div");
        row.className = "leaderboard-row";

        const rank = document.createElement("strong");
        rank.textContent = String(index + 1).padStart(2, "0");

        const username = document.createElement("span");
        username.className = "leaderboard-name";
        username.textContent = entry.username;

        const details = document.createElement("span");
        details.className = "leaderboard-details";
        details.innerHTML =
            `<b>${formatScore(entry.score)}</b>` +
            `<small>${entry.time} // ${entry.kills} KILLS</small>`;

        row.append(rank, username, details);
        leaderboardList.appendChild(row);
    });
}

/* ============================================================
   PART 8: RUN LIFECYCLE AND PAUSE CONTROL
   Starts, resets, stops, restarts, pauses, and resumes a run.
   ============================================================ */
// Resets all run data and starts gameplay.
function startGame() {
    player.x = world.width / 2;
    player.y = world.height / 2;
    player.health = player.maxHealth;
    player.damageCooldown = 0;
    player.level = 1;
    player.experience = 0;
    player.experienceToNextLevel = 40;
    player.pickupRange = 90;
    player.speed = 220;
    player.facing8 = "east";
    player.isFiring = false;
    player.fireTimer = 0;
    handgun.damage = 20;
    handgun.cooldown = 0.55;
    handgun.projectileCount = 1;
    enemies.length = 0;
    projectiles.length = 0;
    experienceOrbs.length = 0;
    impactEffects.length = 0;
    enemySpawnTimer = 0;
    nextEnemyId = 1;
    handgunCooldown = 0;
    levelUpPending = false;
    isPaused = false;
    survivalTime = 0;
    score = 0;
    kills = 0;
    bossesDefeated = 0;
    lastScoredMinute = 0;
    nextBossTime = 60;
    visualTime = 0;
    runSubmitted = false;

    resetJoystick();
    keys.clear();
    closeLevelUpOverlay();
    pauseOverlay.hidden = true;
    pauseButton.textContent = "Pause";
    canvasMessage.classList.remove("is-hidden");

    resizeCanvas();
    updateCamera();
    updateHealthBar();
    updateExperienceBar();
    updateScoreboard();
    gameIsRunning = true;
    previousTime = 0;

    if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

// Stops the game loop and resets active controls.
function stopGame() {
    gameIsRunning = false;
    isPaused = false;
    resetJoystick();
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

// Toggles or sets the gameplay pause state.
function togglePause(forcePause) {
    if (levelUpPending || document.querySelector("#gameplay").hidden) {
        return;
    }

    const nextPauseState = typeof forcePause === "boolean" ? forcePause : !isPaused;
    if (nextPauseState === isPaused) {
        return;
    }

    isPaused = nextPauseState;
    pauseOverlay.hidden = !isPaused;
    pauseButton.textContent = isPaused ? "Resume" : "Pause";
    audioManager.play(isPaused ? "pause" : "resume");
    if (isPaused) {
        audioManager.pauseMusic();
    } else {
        audioManager.resumeMusic();
    }

    if (isPaused) {
        gameIsRunning = false;
        resetJoystick();
        keys.clear();
    } else {
        gameIsRunning = true;
        previousTime = 0;
        if (animationFrameId === null) {
            animationFrameId = requestAnimationFrame(gameLoop);
        }
    }
}

/* ============================================================
   PART 9: MAIN GAME LOOP
   Runs the frame-by-frame update cycle for movement, survival,
   enemies, combat, experience, and rendering.
   ============================================================ */
// Updates and draws the game once per animation frame.
function gameLoop(currentTime) {
    if (!gameIsRunning) {
        animationFrameId = null;
        return;
    }

    // Convert milliseconds between frames into seconds for time-based movement.
    const deltaTime = previousTime === 0 ? 0 : Math.min((currentTime - previousTime) / 1000, 0.1);
    previousTime = currentTime;
    visualTime += deltaTime;
    // Update each system, then render the new state.
    updatePlayer(deltaTime);
    updateSurvival(deltaTime);
    updateEnemies(deltaTime);
    if (!gameIsRunning) {
        animationFrameId = null;
        return;
    }
    updateCombat(deltaTime);
    updateExperience(deltaTime);
    drawGame();

    if (!gameIsRunning) {
        animationFrameId = null;
        return;
    }

    animationFrameId = requestAnimationFrame(gameLoop);
}

/* ============================================================
   PART 10: PLAYER MOVEMENT AND CAMERA
   Handles keyboard/touch movement, world boundaries, aiming,
   and camera-follow behavior.
   ============================================================ */
// Reads movement input and moves the player.
function updatePlayer(deltaTime) {
    let horizontalDirection = 0;
    let verticalDirection = 0;

    if (keys.has("a") || keys.has("arrowleft")) {
        horizontalDirection -= 1;
    }
    if (keys.has("d") || keys.has("arrowright")) {
        horizontalDirection += 1;
    }
    if (keys.has("w") || keys.has("arrowup")) {
        verticalDirection -= 1;
    }
    if (keys.has("s") || keys.has("arrowdown")) {
        verticalDirection += 1;
    }

    // Normalize diagonals so moving two ways is not twice as fast.
    if (horizontalDirection !== 0 && verticalDirection !== 0) {
        const diagonalLength = Math.sqrt(2);
        horizontalDirection /= diagonalLength;
        verticalDirection /= diagonalLength;
    }

    // Use touch input only when no keyboard direction is being held.
    if (joystick.active && horizontalDirection === 0 && verticalDirection === 0) {
        horizontalDirection = joystick.dx;
        verticalDirection = joystick.dy;
    }

    player.isMoving = Math.abs(horizontalDirection) > 0.05 || Math.abs(verticalDirection) > 0.05;
    if (player.isMoving) {
        const moveDir8 = getDirection8FromVector(horizontalDirection, verticalDirection);
        if (moveDir8) {
            player.facing8 = moveDir8;
        }
        if (!canvasMessage.classList.contains("is-hidden")) {
            canvasMessage.classList.add("is-hidden");
        }
    }

    // Apply time-based movement to the player's world position.
    player.x += horizontalDirection * player.speed * deltaTime;
    player.y += verticalDirection * player.speed * deltaTime;

    const halfWidth = player.width / 2;
    const halfHeight = player.height / 2;
    // Clamp the player so they cannot leave the world.
    player.x = Math.max(halfWidth, Math.min(world.width - halfWidth, player.x));
    player.y = Math.max(halfHeight, Math.min(world.height - halfHeight, player.y));

    updateAimFacing();
    updateCamera();
}

// Keeps the camera centered on the player inside the map.
function updateCamera() {
    camera.x = Math.max(0, Math.min(world.width - camera.viewWidth, player.x - camera.viewWidth / 2));
    camera.y = Math.max(0, Math.min(world.height - camera.viewHeight, player.y - camera.viewHeight / 2));
}

/* ============================================================
   PART 11: SURVIVAL, SCORING, AND TIME EVENTS
   Tracks the survival timer, minute bonuses, and boss schedule.
   ============================================================ */
// Updates survival time, score bonuses, and boss timing.
function updateSurvival(deltaTime) {
    survivalTime += deltaTime;
    const completedMinutes = Math.floor(survivalTime / 60);

    if (completedMinutes > lastScoredMinute) {
        score += (completedMinutes - lastScoredMinute) * 100;
        lastScoredMinute = completedMinutes;
    }

    if (survivalTime >= nextBossTime) {
        spawnEnemy("tyrant");
        audioManager.play("boss");
        nextBossTime += 60;
    }

    updateScoreboard();
}

/* ============================================================
   PART 12: ENEMY SPAWNING AND ENEMY BEHAVIOR
   Creates enemy waves, moves enemies toward the player, applies
   contact damage, and removes defeated enemies.
   ============================================================ */
// Moves enemies and applies contact damage.
function updateEnemies(deltaTime) {
    // Count down until the next regular enemy spawn.
    enemySpawnTimer -= deltaTime;
    if (enemySpawnTimer <= 0) {
        spawnEnemy();
        enemySpawnTimer = Math.max(0.45, 1.8 - survivalTime * 0.01);
    }

    player.damageCooldown = Math.max(0, player.damageCooldown - deltaTime);

    // Move every enemy toward the player's current position.
    enemies.forEach((enemy) => {
        const distanceX = player.x - enemy.x;
        const distanceY = player.y - enemy.y;
        const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

        if (distance > 0) {
            // Divide by distance to turn the offset into a unit direction.
            enemy.x += (distanceX / distance) * enemy.speed * deltaTime;
            enemy.y += (distanceY / distance) * enemy.speed * deltaTime;
        }

        // Treat the player and enemy as circles for simple collision detection.
        if (distance < enemy.radius + player.width / 2 && player.damageCooldown === 0) {
            player.health = Math.max(0, player.health - enemy.damage);
            player.damageCooldown = 0.75;
            audioManager.play("player-hit");
            updateHealthBar();

            if (player.health === 0) {
                finishGame();
                return;
            }
        }
    });

    removeDefeatedEnemies();
}

// Creates an enemy outside the visible camera area.
function spawnEnemy(type = chooseEnemyType()) {
    // Pick one of the four edges around the visible camera area.
    const side = Math.floor(Math.random() * 4);
    const padding = 36;
    let x = player.x;
    let y = player.y;

    if (side === 0) {
        x = camera.x - padding;
        y = camera.y + Math.random() * camera.viewHeight;
    } else if (side === 1) {
        x = camera.x + camera.viewWidth + padding;
        y = camera.y + Math.random() * camera.viewHeight;
    } else if (side === 2) {
        x = camera.x + Math.random() * camera.viewWidth;
        y = camera.y - padding;
    } else {
        x = camera.x + Math.random() * camera.viewWidth;
        y = camera.y + camera.viewHeight + padding;
    }

    const enemyType = enemyTypes[type];
    // Increase enemy strength as the player survives longer.
    const difficultyMultiplier = 1 + survivalTime / 120;
    enemies.push({
        id: nextEnemyId,
        type,
        x: Math.max(16, Math.min(world.width - 16, x)),
        y: Math.max(16, Math.min(world.height - 16, y)),
        radius: enemyType.radius,
        speed: enemyType.speed * Math.min(difficultyMultiplier, 1.8),
        health: Math.round(enemyType.health * difficultyMultiplier),
        maxHealth: Math.round(enemyType.health * difficultyMultiplier),
        damage: enemyType.damage,
        score: enemyType.score,
        experience: enemyType.experience
    });
    nextEnemyId += 1;
}

// Chooses an enemy type based on time and randomness.
function chooseEnemyType() {
    const roll = Math.random();

    if (survivalTime >= 40 && roll < 0.15) {
        return "mutant";
    }
    if (survivalTime >= 20 && roll < 0.35) {
        return "hound";
    }
    return "zombie";
}

// Removes defeated enemies and awards score and experience.
function removeDefeatedEnemies() {
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
        if (enemies[index].health <= 0) {
            const defeated = enemies[index];
            if (defeated.type === "tyrant") {
                audioManager.play("enemy-dead-tyrant");
            } else if (defeated.type === "hound") {
                audioManager.play("enemy-dead-hound");
            } else if (defeated.type === "mutant") {
                audioManager.play("enemy-dead-mutant");
            } else {
                audioManager.play("enemy-dead-zombie");
            }

            impactEffects.push({
                x: defeated.x,
                y: defeated.y,
                life: 0.25,
                kind: defeated.type === "tyrant" ? "explosion" : "blood"
            });
            experienceOrbs.push({
                x: defeated.x,
                y: defeated.y,
                value: defeated.experience
            });
            score += defeated.score;
            kills += 1;
            if (defeated.type === "tyrant") {
                bossesDefeated += 1;
            }
            enemies.splice(index, 1);
            updateScoreboard();
        }
    }
}

/* ============================================================
   PART 13: WEAPON AND PROJECTILE COMBAT
   Finds the nearest enemy, fires projectiles, applies damage,
   removes projectiles, and cleans up visual effects.
   ============================================================ */
// Updates automatic firing, projectiles, and hit effects.
function updateCombat(deltaTime) {
    handgunCooldown = Math.max(0, handgunCooldown - deltaTime);

    if (player.fireTimer > 0) {
        player.fireTimer = Math.max(0, player.fireTimer - deltaTime);
        if (player.fireTimer === 0) {
            player.isFiring = false;
        }
    }

    // Fire automatically whenever the weapon cooldown reaches zero.
    if (handgunCooldown === 0) {
        const target = findNearestEnemy();
        if (target !== null) {
            fireHandgun(target);
            handgunCooldown = handgun.cooldown;
        }
    }

    // Move bullets and check each one against every enemy.
    projectiles.forEach((projectile) => {
        projectile.x += projectile.velocityX * deltaTime;
        projectile.y += projectile.velocityY * deltaTime;
        projectile.life -= deltaTime;

        enemies.forEach((enemy) => {
            const distanceX = projectile.x - enemy.x;
            const distanceY = projectile.y - enemy.y;
            const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

            // A hit is registered when the two circular bounds overlap.
            if (!projectile.hit && distance < projectile.radius + enemy.radius) {
                enemy.health -= projectile.damage;
                projectile.hit = true;
                audioManager.play("hit");
                impactEffects.push({ x: enemy.x, y: enemy.y, life: 0.16, kind: "blood" });
            }
        });
    });

    // Remove expired or already-hit bullets from the array.
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
        if (projectiles[index].life <= 0 || projectiles[index].hit) {
            projectiles.splice(index, 1);
        }
    }

    impactEffects.forEach((effect) => {
        effect.life -= deltaTime;
    });
    for (let index = impactEffects.length - 1; index >= 0; index -= 1) {
        if (impactEffects[index].life <= 0) {
            impactEffects.splice(index, 1);
        }
    }

    removeDefeatedEnemies();
}

// Finds the closest enemy within weapon range.
function findNearestEnemy() {
    let nearestEnemy = null;
    let nearestDistance = handgun.range;

    // Keep the closest target found within the handgun's range.
    enemies.forEach((enemy) => {
        const distanceX = player.x - enemy.x;
        const distanceY = player.y - enemy.y;
        const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

        if (distance < nearestDistance) {
            nearestEnemy = enemy;
            nearestDistance = distance;
        }
    });

    return nearestEnemy;
}

// Fires projectiles toward the selected enemy.
function fireHandgun(target) {
    const distanceX = target.x - player.x;
    const distanceY = target.y - player.y;
    // atan2 gives the angle from the player to the target.
    const angle = Math.atan2(distanceY, distanceX);

    const aimDir8 = getDirection8FromVector(distanceX, distanceY);
    if (aimDir8) {
        player.facing8 = aimDir8;
    }

    player.isFiring = true;
    player.fireTimer = 0.14;
    audioManager.play("shoot");

    // Spread multiple projectiles slightly around the target angle.
    for (let index = 0; index < handgun.projectileCount; index += 1) {
        const spread = (index - (handgun.projectileCount - 1) / 2) * 0.12;
        const shotAngle = angle + spread;
        projectiles.push({
            x: player.x,
            y: player.y,
            radius: 4,
            damage: handgun.damage,
            velocityX: Math.cos(shotAngle) * handgun.projectileSpeed,
            velocityY: Math.sin(shotAngle) * handgun.projectileSpeed,
            life: handgun.range / handgun.projectileSpeed,
            hit: false
        });
    }
}

/* ============================================================
   PART 14: EXPERIENCE, LEVEL-UP, AND UPGRADES
   Collects XP, opens upgrade choices, applies selected upgrades,
   and updates the HUD progress indicators.
   ============================================================ */
// Collects experience and triggers level-ups.
function updateExperience() {
    // Collect every orb close enough to the player.
    for (let index = experienceOrbs.length - 1; index >= 0; index -= 1) {
        const orb = experienceOrbs[index];
        const distanceX = player.x - orb.x;
        const distanceY = player.y - orb.y;
        const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

        if (distance <= player.pickupRange) {
            player.experience += orb.value;
            experienceOrbs.splice(index, 1);
            audioManager.play("pickup");
        }
    }

    // Convert enough collected XP into the next player level.
    if (player.experience >= player.experienceToNextLevel) {
        player.experience -= player.experienceToNextLevel;
        player.level += 1;
        player.experienceToNextLevel = Math.floor(player.experienceToNextLevel * 1.35);
        openLevelUpOverlay();
    }

    updateExperienceBar();
}

// Updates the experience and level HUD.
function updateExperienceBar() {
    const experienceBar = document.querySelector("#experience-bar");
    const levelValue = document.querySelector("#level-value");
    const experienceValue = document.querySelector("#experience-value");
    const experiencePercent = (player.experience / player.experienceToNextLevel) * 100;
    experienceBar.style.width = `${experiencePercent}%`;
    levelValue.textContent = String(player.level).padStart(2, "0");
    experienceValue.textContent = `${player.experience}/${player.experienceToNextLevel}`;
}

// Pauses gameplay and displays upgrade choices.
function openLevelUpOverlay() {
    if (levelUpPending) {
        return;
    }

    levelUpPending = true;
    gameIsRunning = false;
    resetJoystick();
    audioManager.play("level-up");
    renderUpgradeChoices();
    document.querySelector("#level-up-overlay").hidden = false;
}

// Hides the level-up upgrade overlay.
function closeLevelUpOverlay() {
    levelUpPending = false;
    document.querySelector("#level-up-overlay").hidden = true;
}

// Displays random upgrades and handles the selection.
function renderUpgradeChoices() {
    const upgradeOptions = document.querySelector("#upgrade-options");
    upgradeOptions.replaceChildren();

    // Present three different choices for the player to select.
    getRandomUpgrades(3).forEach((upgrade) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "upgrade-option";
        option.innerHTML = `<strong>${upgrade.name}</strong><span>${upgrade.description}</span>`;
        option.addEventListener("click", () => {
            audioManager.play("ui-click");
            upgrade.apply();
            updateHealthBar();
            closeLevelUpOverlay();
            gameIsRunning = true;
            previousTime = 0;
            animationFrameId = requestAnimationFrame(gameLoop);
        });
        upgradeOptions.appendChild(option);
    });
}

// Returns a random number of available upgrades.
function getRandomUpgrades(amount) {
    return [...upgrades].sort(() => Math.random() - 0.5).slice(0, amount);
}

/* --- HUD and health updates --- */
// Updates the player health bar and text.
function updateHealthBar() {
    const healthBar = document.querySelector("#health-bar");
    const healthValue = document.querySelector("#health-value");
    const healthPercent = (player.health / player.maxHealth) * 100;
    healthBar.style.width = `${healthPercent}%`;
    healthValue.textContent = `${player.health}/${player.maxHealth}`;
}

/* --- Game over statistics and leaderboard submission --- */
// Saves the run and displays final statistics.
function finishGame() {
    gameIsRunning = false;
    resetJoystick();
    audioManager.play("game-over");
    const result = saveLeaderboardEntry();
    const personalBest = getPersonalBestForUsername();
    document.querySelector("#final-score").textContent = formatScore(score);
    document.querySelector("#final-time").textContent = formatSurvivalTime();
    document.querySelector("#final-kills").textContent = String(kills).padStart(3, "0");
    document.querySelector("#final-level").textContent = String(player.level).padStart(2, "0");
    document.querySelector("#final-bosses").textContent = String(bossesDefeated).padStart(2, "0");
    document.querySelector("#personal-best-value").textContent = formatScore(personalBest);
    document.querySelector("#game-over-username").textContent = `SURVIVOR // ${currentUsername}`;
    document.querySelector("#personal-best-notice").hidden = !result.personalBest;
    showScreen("game-over");
}

// Formats survival seconds as minutes and seconds.
function formatSurvivalTime() {
    const minutes = Math.floor(survivalTime / 60);
    const seconds = Math.floor(survivalTime % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Updates the live gameplay statistics.
function updateScoreboard() {
    document.querySelector("#survival-time").textContent = formatSurvivalTime();
    document.querySelector("#score-value").textContent = String(score).padStart(6, "0");
    document.querySelector("#kills-value").textContent = String(kills).padStart(3, "0");
    document.querySelector("#bosses-value").textContent = String(bossesDefeated).padStart(2, "0");
}

/* ============================================================
   PART 15: CANVAS RENDERING
   Draws the urban map, camera viewport, pickups, enemies,
   projectiles, impact effects, and the animated player.
   ============================================================ */
// Draws the complete visible game scene.
function drawGame() {
    // Shift world coordinates so the camera stays centered on the player.
    context.save();
    context.translate(-camera.x, -camera.y);
    drawUrbanEnvironment();
    experienceOrbs.forEach(drawExperienceOrb);
    enemies.forEach(drawEnemy);
    projectiles.forEach(drawProjectile);
    impactEffects.forEach(drawImpactEffect);
    drawPlayer();
    context.restore();
}

// Draws one animated experience pickup.
function drawExperienceOrb(orb) {
    const pulse = Math.sin(visualTime * 8 + orb.x) * 1.5;
    if (isSpriteReady(sprites.itemHerbGreen)) {
        const size = 16 + pulse;
        context.drawImage(sprites.itemHerbGreen, orb.x - size / 2, orb.y - size / 2, size, size);
        return;
    }
    context.fillStyle = "#7ec2a0";
    context.fillRect(orb.x - 4 - pulse / 2, orb.y - 4 - pulse / 2, 8 + pulse, 8 + pulse);
    context.fillStyle = "#c4e6ad";
    context.fillRect(orb.x - 2, orb.y - 2, 4, 4);
}

// Draws a blood or explosion impact effect.
function drawImpactEffect(effect) {
    if (effect.kind === "explosion") {
        const expSprite = getFrameFromList(sprites.fxExplosion, 12);
        if (expSprite) {
            context.drawImage(expSprite, effect.x - 24, effect.y - 24, 48, 48);
            return;
        }
    }

    const bloodSprite = getFrameFromList(sprites.fxBlood, 10);
    if (bloodSprite) {
        context.drawImage(bloodSprite, effect.x - 14, effect.y - 14, 28, 28);
        return;
    }

    const radius = (1 - effect.life / 0.16) * 12;
    context.strokeStyle = `rgba(239, 92, 76, ${effect.life / 0.16})`;
    context.lineWidth = 2;
    context.strokeRect(effect.x - radius, effect.y - radius, radius * 2, radius * 2);
}

// Draws the visible map, floor, roads, and scenery.
function drawUrbanEnvironment() {
    const { width, height } = world;
    const minX = camera.x;
    const maxX = camera.x + camera.viewWidth;
    const minY = camera.y;
    const maxY = camera.y + camera.viewHeight;

    context.fillStyle = "#111814";
    context.fillRect(minX, minY, camera.viewWidth, camera.viewHeight);

    context.fillStyle = "#1b2520";
    if (minY < 78) context.fillRect(minX, 0, camera.viewWidth, 78);
    if (maxY > height - 78) context.fillRect(minX, height - 78, camera.viewWidth, 78);
    if (minX < 74) context.fillRect(0, minY, 74, camera.viewHeight);
    if (maxX > width - 74) context.fillRect(width - 74, minY, 74, camera.viewHeight);

    const innerMinX = Math.max(74, Math.floor(minX));
    const innerMaxX = Math.min(width - 74, Math.ceil(maxX));
    const innerMinY = Math.max(78, Math.floor(minY));
    const innerMaxY = Math.min(height - 78, Math.ceil(maxY));

    // Draw only the portion of the map currently visible to the camera.
    if (innerMaxX > innerMinX && innerMaxY > innerMinY) {
        if (isSpriteReady(sprites.tileFloor)) {
            const tileSize = 224;
            const startX = Math.floor(innerMinX / tileSize) * tileSize;
            const startY = Math.floor(innerMinY / tileSize) * tileSize;

            context.save();
            context.beginPath();
            context.rect(innerMinX, innerMinY, innerMaxX - innerMinX, innerMaxY - innerMinY);
            context.clip();

            // Repeat the floor texture across the visible map area.
            for (let tx = startX; tx < innerMaxX; tx += tileSize) {
                for (let ty = startY; ty < innerMaxY; ty += tileSize) {
                    context.drawImage(sprites.tileFloor, tx, ty, tileSize, tileSize);
                }
            }

            // Soften contrast & darken floor so player, zombies stand out clearly
            context.fillStyle = "rgba(16, 23, 21, 0.58)";
            context.fillRect(innerMinX, innerMinY, innerMaxX - innerMinX, innerMaxY - innerMinY);
            context.restore();
        } else {
            context.fillStyle = "#28322a";
            context.fillRect(74, 78, width - 148, height - 156);

            context.strokeStyle = "rgba(151, 164, 120, 0.15)";
            context.lineWidth = 2;
            const startGridX = Math.max(100, Math.floor((minX - 100) / 48) * 48 + 100);
            const endGridX = Math.min(width - 74, maxX);
            context.beginPath();
            for (let x = startGridX; x < endGridX; x += 48) {
                context.moveTo(x, Math.max(78, minY));
                context.lineTo(x, Math.min(height - 78, maxY));
            }
            const startGridY = Math.max(100, Math.floor((minY - 100) / 48) * 48 + 100);
            const endGridY = Math.min(height - 78, maxY);
            for (let y = startGridY; y < endGridY; y += 48) {
                context.moveTo(Math.max(74, minX), y);
                context.lineTo(Math.min(width - 74, maxX), y);
            }
            context.stroke();
        }
    }

    drawRoadMarkings(minX, maxX, minY, maxY);

    for (let x = 16; x < width; x += 280) {
        if (x + 42 >= minX && x <= maxX) {
            if (minY <= 60) drawBuilding(x, 16, 42, 42);
            if (maxY >= height - 60) drawBuilding(x, height - 58, 42, 42);
        }
    }
    for (let y = 16; y < height; y += 280) {
        if (y + 42 >= minY && y <= maxY) {
            if (minX <= 60) drawBuilding(16, y, 42, 42);
            if (maxX >= width - 60) drawBuilding(width - 58, y, 42, 42);
        }
    }
    for (let x = 108; x < width; x += 420) {
        if (x + 16 >= minX && x - 16 <= maxX) {
            if (minY <= 85) drawStreetLight(x, 48);
            if (maxY >= height - 85) drawStreetLight(x, height - 76);
        }
    }
    for (let y = 208; y < height - 150; y += 360) {
        if (y + 20 >= minY && y - 20 <= maxY) {
            if (minX <= 260 && maxX >= 220) drawDebris(230, y);
            if (minX <= width - 230 && maxX >= width - 270) drawDebris(width - 250, y + 120);
        }
    }
}

// Draws road markings inside the camera viewport.
function drawRoadMarkings(minX, maxX, minY, maxY) {
    context.fillStyle = "#687254";
    if (minY <= world.height / 2 + 4 && maxY >= world.height / 2 - 4) {
        for (let x = 124; x < world.width - 124; x += 70) {
            if (x + 34 >= minX && x <= maxX) {
                context.fillRect(x, world.height / 2 - 2, 34, 4);
            }
        }
    }
    if (minX <= world.width / 2 + 4 && maxX >= world.width / 2 - 4) {
        for (let y = 116; y < world.height - 116; y += 70) {
            if (y + 34 >= minY && y <= maxY) {
                context.fillRect(world.width / 2 - 2, y, 4, 34);
            }
        }
    }
}

// Draws a building sprite or fallback shape.
function drawBuilding(x, y, width, height) {
    if (isSpriteReady(sprites.propBuilding)) {
        context.drawImage(sprites.propBuilding, x, y, width, height);
        return;
    }
    context.fillStyle = "#0a0e0c";
    context.fillRect(x, y, width, height);
    context.strokeStyle = "#53614b";
    context.strokeRect(x + 2, y + 2, width - 4, height - 4);
    context.fillStyle = "#9b563f";
    context.fillRect(x + 10, y + 12, 6, 6);
    context.fillRect(x + 26, y + 24, 6, 6);
}

// Draws a streetlight sprite or fallback shape.
function drawStreetLight(x, y) {
    if (isSpriteReady(sprites.propStreetLight)) {
        context.drawImage(sprites.propStreetLight, x - 14, y - 10, 28, 38);
        return;
    }
    context.fillStyle = "#69765b";
    context.fillRect(x - 2, y, 4, 28);
    context.fillRect(x - 8, y - 2, 16, 4);
    context.fillStyle = "rgba(214, 193, 108, 0.5)";
    context.fillRect(x - 4, y - 6, 8, 5);
}

// Draws debris sprites or fallback shapes.
function drawDebris(x, y) {
    if (isSpriteReady(sprites.propDebris)) {
        context.drawImage(sprites.propDebris, x - 12, y - 10, 28, 22);
        return;
    }
    context.fillStyle = "#72745a";
    context.fillRect(x, y, 14, 5);
    context.fillRect(x + 8, y - 5, 5, 10);
}

// Draws the player sprite and visual feedback.
function drawPlayer() {
    const { x, y, width, height, facing8 } = player;
    const bob = player.isMoving ? Math.sin(visualTime * 12) * 2 : 0;
    const recoil = player.isFiring ? Math.sin(visualTime * 55) * 1.5 : 0;
    const flash = player.damageCooldown > 0.55;
    const spriteW = 50;
    const spriteH = 54;

    context.fillStyle = "rgba(0, 0, 0, 0.35)";
    context.fillRect(x - width / 2 - 3, y + height / 2 - 1, width + 6, 5);

    const gifSprite = playerGif8[facing8] || playerGif8.east;

    context.save();
    context.translate(x, y + bob + recoil);

    if (flash) {
        context.filter = "sepia(1) saturate(6) hue-rotate(-50deg)";
    }

    if (isSpriteReady(gifSprite)) {
        context.drawImage(gifSprite, -spriteW / 2, -spriteH / 2, spriteW, spriteH);
    } else {
        context.fillStyle = "#c8c59d";
        context.fillRect(-6, -13, 12, 9);
        context.fillStyle = "#63745c";
        context.fillRect(-9, -4, 18, 19);
        context.fillStyle = "#9b3b32";
        context.fillRect(-9, 8, 18, 5);
        context.fillStyle = "#1b211a";
        context.fillRect(-8, 15, 6, 7);
        context.fillRect(2, 15, 6, 7);
    }

    context.restore();
}

// Draws an enemy when it is inside the camera viewport.
function drawEnemy(enemy) {
    const { x, y, radius } = enemy;
    // Skip enemies outside the viewport to reduce drawing work.
    if (
        x + radius * 2.5 < camera.x ||
        x - radius * 2.5 > camera.x + camera.viewWidth ||
        y + radius * 2.5 < camera.y ||
        y - radius * 2.5 > camera.y + camera.viewHeight
    ) {
        return;
    }

    context.fillStyle = "rgba(0, 0, 0, 0.35)";
    context.fillRect(x - radius, y + radius - 1, radius * 2, 5);

    let enemySprite = null;
    // Select animation frames based on the enemy type.
    if (enemy.type === "hound") {
        enemySprite = getFrameFromList(sprites.houndRun, 9, enemy.id);
    } else if (enemy.type === "mutant") {
        enemySprite = getFrameFromList(sprites.mutantWalk, 6, enemy.id);
    } else if (enemy.type === "tyrant") {
        enemySprite = getFrameFromList(sprites.tyrantWalk, 5, enemy.id) || sprites.tyrantIdle;
    } else {
        enemySprite = getFrameFromList(sprites.zombieWalk, 5, enemy.id);
    }

    const drawSize = enemy.type === "tyrant" ? radius * 2.8 : radius * 2.6;

    context.save();
    context.translate(x, y);

    if (player.x < x) {
        context.scale(-1, 1);
    }

    if (isSpriteReady(enemySprite)) {
        context.drawImage(enemySprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    } else if (enemy.type === "hound") {
        context.fillStyle = "#66745d";
        context.fillRect(-13, -7, 26, 12);
        context.fillStyle = "#a8a27a";
        context.fillRect(10, -5, 5, 4);
    } else if (enemy.type === "mutant" || enemy.type === "tyrant") {
        context.fillStyle = enemy.type === "tyrant" ? "#713b45" : "#596b56";
        context.fillRect(-radius, -radius, radius * 2, radius * 2);
        context.fillStyle = "#b64c3c";
        context.fillRect(-5, -5, 10, 7);
    } else {
        context.fillStyle = "#74816a";
        context.fillRect(-8, -12, 16, 11);
        context.fillStyle = "#4b5c4a";
        context.fillRect(-10, -1, 20, 19);
        context.fillStyle = "#7b302d";
        context.fillRect(-7, 8, 14, 4);
    }

    context.restore();
}

// Draws one projectile or muzzle-flash sprite.
function drawProjectile(projectile) {
    const flashSprite = getFrameFromList(sprites.fxFlash, 16);
    if (isSpriteReady(flashSprite)) {
        context.drawImage(flashSprite, projectile.x - 8, projectile.y - 8, 16, 16);
        return;
    }
    context.fillStyle = "#e0c779";
    context.fillRect(
        projectile.x - projectile.radius,
        projectile.y - projectile.radius,
        projectile.radius * 2,
        projectile.radius * 2
    );
}

/* ============================================================
   PART 16: MOBILE TOUCH JOYSTICK
   Tracks touch input, clamps joystick movement, and resets
   the virtual stick on touch end or cancellation.
   ============================================================ */
// Resets the virtual joystick and its movement values.
function resetJoystick() {
    joystick.active = false;
    joystick.touchId = null;
    joystick.dx = 0;
    joystick.dy = 0;
    joystickBase.classList.remove("is-active");
    joystickBase.style.left = "";
    joystickBase.style.top = "";
    joystickBase.style.bottom = "";
    joystickBase.style.transform = "";
    joystickStick.style.transform = "translate(0px, 0px)";
}

// Converts finger movement into joystick direction.
function updateJoystickPosition(clientX, clientY) {
    const deltaX = clientX - joystick.originX;
    const deltaY = clientY - joystick.originY;
    const distance = Math.hypot(deltaX, deltaY);
    // Limit the stick to its circular movement area.
    const clampedDistance = Math.min(distance, joystick.maxRadius);
    const angle = Math.atan2(deltaY, deltaX);

    const stickX = Math.cos(angle) * clampedDistance;
    const stickY = Math.sin(angle) * clampedDistance;

    // Convert the distance into a direction strength from 0 to 1.
    const normalizedMagnitude = clampedDistance / joystick.maxRadius;
    if (normalizedMagnitude < 0.12) {
        joystick.dx = 0;
        joystick.dy = 0;
    } else {
        joystick.dx = Math.cos(angle) * normalizedMagnitude;
        joystick.dy = Math.sin(angle) * normalizedMagnitude;
    }

    joystickStick.style.transform = `translate(${stickX}px, ${stickY}px)`;
}

canvasFrame.addEventListener("touchstart", (event) => {
    if (event.target.closest("button")) {
        return;
    }
    event.preventDefault();

    if (!gameIsRunning || isPaused || levelUpPending || joystick.active) {
        return;
    }

    // Use the first touch as the active movement finger.
    const touch = event.changedTouches[0];
    const frameRect = canvasFrame.getBoundingClientRect();

    joystick.active = true;
    joystick.touchId = touch.identifier;
    joystick.originX = touch.clientX;
    joystick.originY = touch.clientY;

    const localX = touch.clientX - frameRect.left;
    const localY = touch.clientY - frameRect.top;

    joystickBase.style.left = `${localX}px`;
    joystickBase.style.top = `${localY}px`;
    joystickBase.style.bottom = "auto";
    joystickBase.style.transform = "translate(-50%, -50%)";
    joystickBase.classList.add("is-active");

    updateJoystickPosition(touch.clientX, touch.clientY);
}, { passive: false });

canvasFrame.addEventListener("touchmove", (event) => {
    if (!joystick.active) {
        return;
    }
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i += 1) {
        const touch = event.changedTouches[i];
        if (touch.identifier === joystick.touchId) {
            updateJoystickPosition(touch.clientX, touch.clientY);
            break;
        }
    }
}, { passive: false });

// Releases the joystick when the tracked touch ends.
function handleTouchEnd(event) {
    if (!joystick.active) {
        return;
    }
    for (let i = 0; i < event.changedTouches.length; i += 1) {
        if (event.changedTouches[i].identifier === joystick.touchId) {
            resetJoystick();
            break;
        }
    }
}

canvasFrame.addEventListener("touchend", handleTouchEnd, { passive: false });
canvasFrame.addEventListener("touchcancel", handleTouchEnd, { passive: false });

/* ============================================================
   PART 17: KEYBOARD, BUTTON, AND WINDOW EVENTS
   Connects player input, audio controls, navigation, pause,
   browser resize, and automatic pause events.
   ============================================================ */
window.addEventListener("pointerdown", () => {
    audioManager.preloadAllSfx();
}, { once: true });

window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const target = event.target;
    if (
        target &&
        (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
    ) {
        return;
    }
    if (allowedMovementKeys.has(key)) {
        event.preventDefault();
        keys.add(key);
    } else if (key === "escape" || key === "p") {
        togglePause();
    }
});

window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
});

window.addEventListener("blur", () => {
    keys.clear();
    resetJoystick();
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameIsRunning && !isPaused) {
        togglePause(true);
    }
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => {
    setTimeout(resizeCanvas, 100);
});

pauseButton.addEventListener("click", () => {
    audioManager.play("ui-click");
    togglePause();
});

resumeButton.addEventListener("click", () => {
    audioManager.play("ui-click");
    togglePause(false);
});

audioToggle.addEventListener("click", () => {
    const muted = !audioManager.isMuted();
    audioManager.setMuted(muted);
    audioToggle.textContent = muted ? "Sound: Off" : "Sound: On";
    audioToggle.setAttribute("aria-pressed", String(muted));
    if (!muted) {
        audioManager.play("ui-click");
    }
});

volumeSlider.addEventListener("input", () => {
    audioManager.setVolume(Number(volumeSlider.value));
});

navigationButtons.forEach((button) => {
    button.addEventListener("click", () => {
        audioManager.play("ui-click");
        const targetScreen = button.getAttribute("data-screen");
        if (targetScreen) {
            showScreen(targetScreen);
        }
    });
});

usernameForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = usernameInput.value.trim().replace(/\s+/g, " ").slice(0, 16);

    if (!username) {
        audioManager.play("ui-error");
        usernameError.textContent = "Enter a username before starting.";
        usernameInput.focus();
        return;
    }
    if (!/^[A-Za-z0-9 _-]+$/.test(username)) {
        audioManager.play("ui-error");
        usernameError.textContent = "Use letters, numbers, spaces, hyphens, or underscores.";
        usernameInput.focus();
        return;
    }

    audioManager.play("ui-click");
    currentUsername = username;
    usernameInput.value = username;
    usernameError.textContent = "";

    try {
        localStorage.setItem("biohazardUsername", username);
    } catch (error) {
        console.warn("Username could not be saved in this browser context.", error);
    }

    showScreen("gameplay");
});

/* ============================================================
   PART 18: APPLICATION INITIALIZATION
   Loads saved audio settings, renders the leaderboard, and
   prepares the initial canvas size on page startup.
   ============================================================ */
volumeSlider.value = String(audioManager.getVolume());
audioToggle.textContent = audioManager.isMuted() ? "Sound: Off" : "Sound: On";
audioToggle.setAttribute("aria-pressed", String(audioManager.isMuted()));
renderLeaderboard();
resizeCanvas();