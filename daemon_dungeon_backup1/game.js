// ============= CONFIGURATION =============
const CONFIG = {
    CANVAS_ID: 'gameCanvas',
    GAME_WIDTH: window.innerWidth,
    GAME_HEIGHT: window.innerHeight,
    TARGET_FPS: 60,
    
    // Gameplay
    PLAYER_SPEED: 0.15,
    PLAYER_HP: 100,
    PLAYER_ATTACK_COOLDOWN: 1.0, // seconds
    PLAYER_SIZE: 1,
    
    ENEMY_SPEED: 0.08,
    ENEMY_HP: 20,
    ENEMY_SIZE: 1,
    ENEMY_PROJECTILE_SPEED: 0.35,
    
    PROJECTILE_SPEED: 0.8,
    PROJECTILE_SIZE: 0.3,
    PROJECTILE_LIFETIME: 10, // seconds
    
    // Game flow
    ENEMIES_PER_WAVE: 5,
    WAVES_UNTIL_BOSS: 10,
    
    // Rooms
    ROOM_WIDTH: 50,
    ROOM_DEPTH: 50,
    ROOM_SPACING: 60, // distance between consecutive room origins along -Z
    CAMERA_HEIGHT: 25,
    CAMERA_OFFSET_Z: 25,
};

// ================== BONUS OPTIONS ==================
const BONUS_OPTIONS = [
    { id: 'multishot', label: 'Multishot (+1 projectile)', apply: (game) => { game.player.multishot = (game.player.multishot || 1) + 1; } },
    { id: 'attackSpeed', label: "Vitesse d'attaque (+20%)", apply: (game) => { CONFIG.PLAYER_ATTACK_COOLDOWN = Math.max(0.3, CONFIG.PLAYER_ATTACK_COOLDOWN * 0.8); } },
    { id: 'damageUp', label: 'Dégâts +25%', apply: (game) => { game.player.damageBonus = (game.player.damageBonus || 0) + 0.25; } },
    { id: 'maxHp', label: 'PV max +20', apply: (game) => { game.player.maxHp += 20; game.player.hp = Math.min(game.player.hp + 20, game.player.maxHp); } },
    { id: 'moveSpeed', label: 'Vitesse mouvement +15%', apply: (game) => { game.player.speed *= 1.15; } },
];

// ================== ROOM PRESETS (examples) ==================
// Positions are relative to room origin (center of ground).
const ROOM_PRESETS = [
    {
        name: 'Basic Square',
        enemies: [
            { pos: [ -10, -10 ], type: 'melee' },
            { pos: [ 10, -10 ], type: 'melee' },
            { pos: [ -10, 10 ], type: 'melee' },
            { pos: [ 10, 10 ], type: 'melee' },
            { pos: [ 0, 0 ], type: 'turret' },
        ],
        obstacles: [
            { kind: 'pillar', pos: [0, 0], size: [2, 4, 2], color: '#333333' },
        ],
        hazards: [
            { kind: 'spike', pos: [0, -15], size: [6, 1, 6], damage: 10 },
        ],
    },
    {
        name: 'Corridor',
        enemies: [
            { pos: [ -15, 0 ], type: 'melee' },
            { pos: [ 15, 0 ], type: 'melee' },
            { pos: [ 0, -15 ], type: 'melee' },
            { pos: [ 0, 15 ], type: 'bouncer' },
        ],
        obstacles: [
            { kind: 'pillar', pos: [ -18, 0 ], size: [2, 5, 2] },
            { kind: 'pillar', pos: [ 18, 0 ], size: [2, 5, 2] },
        ],
        hazards: [
            { kind: 'spike', pos: [0, 0], size: [8, 1, 8], damage: 8 },
        ],
    },
    {
        name: 'Boss Room',
        enemies: [
            { pos: [0, 0], type: 'boss' },
        ],
        obstacles: [],
        hazards: [],
    },
];

// ================== ROOM MANAGER ==================
class RoomManager {
    constructor(scene, glow) {
        this.scene = scene;
        this.glow = glow;
        this.rooms = []; // meshes per room
        this.currentIndex = 0;
    }

    roomOrigin(index) {
        return new BABYLON.Vector3(0, 0, -index * CONFIG.ROOM_SPACING);
    }

    createRoomStructure(index) {
        const origin = this.roomOrigin(index);
        const meshes = [];
        // Ground
        const ground = BABYLON.MeshBuilder.CreateGround(`ground_${index}`, { width: CONFIG.ROOM_WIDTH, height: CONFIG.ROOM_DEPTH }, this.scene);
        ground.position = origin.clone();
        ground.material = this._mat('#1a1a1a');
        meshes.push(ground);

        // Walls: left, right, far (near/open side is free)
        const wallMat = this._mat('#2a2a2a');
        const halfW = CONFIG.ROOM_WIDTH / 2;
        const halfD = CONFIG.ROOM_DEPTH / 2;

        const leftWall = BABYLON.MeshBuilder.CreateBox(`wall_left_${index}`, { width: 1, height: 4, depth: CONFIG.ROOM_DEPTH }, this.scene);
        leftWall.position = origin.clone().add(new BABYLON.Vector3(-halfW, 1, 0));
        leftWall.material = wallMat; meshes.push(leftWall); this.glow.addIncludedOnlyMesh(leftWall);

        const rightWall = BABYLON.MeshBuilder.CreateBox(`wall_right_${index}`, { width: 1, height: 4, depth: CONFIG.ROOM_DEPTH }, this.scene);
        rightWall.position = origin.clone().add(new BABYLON.Vector3(halfW, 1, 0));
        rightWall.material = wallMat; meshes.push(rightWall); this.glow.addIncludedOnlyMesh(rightWall);

        const farWall = BABYLON.MeshBuilder.CreateBox(`wall_far_${index}`, { width: CONFIG.ROOM_WIDTH, height: 4, depth: 1 }, this.scene);
        farWall.position = origin.clone().add(new BABYLON.Vector3(0, 1, -halfD));
        farWall.material = wallMat; meshes.push(farWall); this.glow.addIncludedOnlyMesh(farWall);

        // Decorative entrance door (near/open side)
        const entrance = BABYLON.MeshBuilder.CreateBox(`door_entrance_${index}`, { width: 6, height: 6, depth: 1 }, this.scene);
        entrance.position = origin.clone().add(new BABYLON.Vector3(0, 3, halfD));
        entrance.material = this._mat('#00aaee');
        this.glow.addIncludedOnlyMesh(entrance);
        meshes.push(entrance);

        this.rooms[index] = { origin, meshes, obstacles: [], hazards: [], enemies: [], doorExit: null, doorEntrance: entrance, fogCurtain: null };
        return this.rooms[index];
    }

    addObstacle(index, def) {
        const room = this.rooms[index];
        const mesh = BABYLON.MeshBuilder.CreateBox(`obs_${index}_${room.obstacles.length}`, { width: def.size[0], height: def.size[1], depth: def.size[2] }, this.scene);
        mesh.position = room.origin.clone().add(new BABYLON.Vector3(def.pos[0], def.size[1]/2, def.pos[1]));
        mesh.material = this._mat(def.color || '#3a3a3a');
        room.obstacles.push({ mesh, aabb: this._aabb(mesh) });
        return mesh;
    }

    addSpike(index, def) {
        const room = this.rooms[index];
        const mesh = BABYLON.MeshBuilder.CreateBox(`spike_${index}_${room.hazards.length}`, { width: def.size[0], height: def.size[1], depth: def.size[2] }, this.scene);
        mesh.position = room.origin.clone().add(new BABYLON.Vector3(def.pos[0], def.size[1]/2, def.pos[1]));
        mesh.material = this._mat('#550000');
        this.glow.addIncludedOnlyMesh(mesh);
        room.hazards.push({ mesh, damage: def.damage || 8, cooldown: 1.0, lastHit: 0, aabb: this._aabb(mesh) });
        return mesh;
    }

    loadPreset(index, preset, scale, game, activate = true) {
        const room = this.createRoomStructure(index);
        // Obstacles
        (preset.obstacles || []).forEach(def => this.addObstacle(index, def));
        // Hazards
        (preset.hazards || []).forEach(def => {
            const h = this.addSpike(index, def);
            if (!activate) h.isVisible = false;
        });
        // Enemies
        (preset.enemies || []).forEach(def => {
            let pos = room.origin.clone().add(new BABYLON.Vector3(def.pos[0], CONFIG.ENEMY_SIZE/2, def.pos[1]));
            let type = def.type || 'melee';
            if (type === 'boss') {
                const bossTypes = ['boss_jumper', 'boss_spawner', 'boss_spikes'];
                type = bossTypes[Math.floor(Math.random() * bossTypes.length)];
            }
            if (type === 'turret') {
                pos = this.findNonCollidingSpot(pos, room.obstacles, 2.5, room.origin);
            }
            const enemyObj = game.spawnEnemyAt(pos, scale, index, { active: activate, type });
            room.enemies.push(enemyObj);
        });
        // Door (initially closed): placed on near/open side later
        room.door = null;
        return room;
    }

    openDoor(index) {
        const room = this.rooms[index];
        if (!room || room.doorExit) return;
        const halfD = CONFIG.ROOM_DEPTH / 2;
        const door = BABYLON.MeshBuilder.CreateBox(`door_exit_${index}`, { width: 6, height: 6, depth: 1 }, this.scene);
        door.position = room.origin.clone().add(new BABYLON.Vector3(0, 3, -halfD));
        door.material = this._mat('#00ff99');
        this.glow.addIncludedOnlyMesh(door);
        room.doorExit = door;
        return door;
    }

    createFogCurtain(index) {
        // Optional fog curtain at far side to hide next room mobs until arrival
        const room = this.rooms[index];
        const halfD = CONFIG.ROOM_DEPTH / 2;
        const plane = BABYLON.MeshBuilder.CreatePlane(`fog_${index}`, { width: CONFIG.ROOM_WIDTH, height: 12 }, this.scene);
        plane.position = room.origin.clone().add(new BABYLON.Vector3(0, 6, -halfD));
        plane.rotation.x = Math.PI; // face towards camera
        const mat = new BABYLON.StandardMaterial(`fog_mat_${index}`, this.scene);
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.alpha = 0.6;
        plane.material = mat;
        room.fogCurtain = plane;
        return plane;
    }

    findNonCollidingSpot(pos, obstacles, radius, origin = new BABYLON.Vector3(0,0,0)) {
        const halfW = CONFIG.ROOM_WIDTH / 2 - 2;
        const halfD = CONFIG.ROOM_DEPTH / 2 - 2;
        const gridSize = 6;
        const step = (Math.min(halfW, halfD) * 2) / gridSize;
        
        // First try grid positions
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gz = 0; gz < gridSize; gz++) {
                const candidate = new BABYLON.Vector3(
                    origin.x - halfW + gx * step + step/2,
                    pos.y,
                    origin.z - halfD + gz * step + step/2
                );
                
                let collides = false;
                for (const o of obstacles) {
                    const b = o.mesh.getBoundingInfo().boundingBox;
                    const min = b.minimumWorld;
                    const max = b.maximumWorld;
                    if (candidate.x > min.x - radius - 0.5 && candidate.x < max.x + radius + 0.5 && 
                        candidate.z > min.z - radius - 0.5 && candidate.z < max.z + radius + 0.5) {
                        collides = true;
                        break;
                    }
                }
                if (!collides) return candidate;
            }
        }
        
        // Fallback: random search
        for (let attempt = 0; attempt < 50; attempt++) {
            const candidate = new BABYLON.Vector3(
                origin.x + (Math.random() * 2 - 1) * halfW * 0.95,
                pos.y,
                origin.z + (Math.random() * 2 - 1) * halfD * 0.95
            );
            
            let collides = false;
            for (const o of obstacles) {
                const b = o.mesh.getBoundingInfo().boundingBox;
                const min = b.minimumWorld;
                const max = b.maximumWorld;
                if (candidate.x > min.x - radius - 0.5 && candidate.x < max.x + radius + 0.5 && 
                    candidate.z > min.z - radius - 0.5 && candidate.z < max.z + radius + 0.5) {
                    collides = true;
                    break;
                }
            }
            if (!collides) return candidate;
        }
        
        return pos;
    }

    _mat(color) {
        const mat = new BABYLON.StandardMaterial('mat_' + Math.random(), this.scene);
        const rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
        const c = rgb ? new BABYLON.Color3(parseInt(rgb[1],16)/255, parseInt(rgb[2],16)/255, parseInt(rgb[3],16)/255) : new BABYLON.Color3(0.2,0.2,0.2);
        mat.diffuseColor = c; mat.specularColor = new BABYLON.Color3(0.1,0.1,0.1);
        return mat;
    }

    _aabb(mesh) {
        const b = mesh.getBoundingInfo().boundingBox;
        return { min: b.minimumWorld.clone(), max: b.maximumWorld.clone() };
    }
}

// ============= CLASSE PRINCIPALE =============
class DaemonDungeon {
    constructor() {
        this.canvas = document.getElementById(CONFIG.CANVAS_ID);
        this.engine = new BABYLON.Engine(this.canvas, true);
        this.scene = null;
        this.camera = null;
        this.roomManager = null;
        
        // Entités
        this.player = null;
        this.enemies = [];
        this.projectiles = [];
        this.obstacles = [];
        this.hazards = [];
        this.shockwaves = [];
        this.sweeps = [];
        this.audioEl = null;
        this.audioCtx = null;
        this.musicSource = null;
        this.musicFilter = null;
        this.musicBaseVolume = 0.6;
        this.audioUnlocked = false;
        this.pendingMusicPlay = false;
        this.musicMuffled = true; // muffled on title by default
        this.musicCandidates = [
            'music/bgm.mp3',
            encodeURI('music/Sci Fi Cyberpunk - VHS [SynthwaveElectro].mp3')
        ];
        this.currentMusicPath = null;
        
        // UI
        this.selectedClass = null;
        this.gameRunning = false;
        this.gameOver = false;
        this.doorOpen = false;
        this.currentRoom = null;
        this.inBonusSelection = false;
        
        // Stats
        this.score = 0;
        this.roomsCleared = 0;
        this.currentWave = 0;

        // Taunt/AI chatter state
        this.lastMoveTime = performance.now() / 1000;
        this.idleTauntDone = false;
        this.roomDamageTaken = false;
        this.noDamageTauntDone = false;
        this.lastHazardTaunt = 0;
        
        // Input
        this.inputMap = {};
        this.joystickActive = false;
        this.joystickInput = { x: 0, y: 0 };
        
        // Responsive
        window.addEventListener('resize', () => this.onWindowResize());
        
        // UI Events
        document.querySelectorAll('.class-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.startGame(e.target.closest('.class-btn').dataset.class));
        });
        
        document.getElementById('restartBtn').addEventListener('click', () => this.resetGame());
        const skipBtn = document.getElementById('skipBonusBtn');
        if (skipBtn) skipBtn.addEventListener('click', () => this.advanceRoom());
        
        // Input
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
        window.addEventListener('touchstart', (e) => this.onTouchStart(e));
        window.addEventListener('touchmove', (e) => this.onTouchMove(e));
        window.addEventListener('touchend', (e) => this.onTouchEnd(e));

        // Try to unlock audio as soon as the user interacts
        window.addEventListener('pointerdown', () => this.unlockAudio(true), { once: true });
        window.addEventListener('click', () => this.unlockAudio(true), { once: true });
        window.addEventListener('keydown', () => this.unlockAudio(true), { once: true });
        // Try to start music as soon as the page is ready (may be blocked; we retry on unlock)
        window.addEventListener('DOMContentLoaded', () => {
            this.unlockAudio(false);
            this.playMusicIfReady();
        }, { once: true });

        // Prépare la musique immédiatement (écran titre inclus)
        this.setupMusic();
    }
    
    // ============= INITIALISATION =============
    async startGame(selectedClass) {
        this.selectedClass = selectedClass;
        document.getElementById('startScreen').classList.add('hidden');
        
        // Afficher joystick sur mobile
        if (this.isMobile()) {
            document.getElementById('joystickContainer').classList.remove('hidden');
        }
        
        this.createScene();
        await this.createPlayer();
        this.unlockAudio(true);
        this.setMusicMuffled(false); // gameplay: full band
        this.roomsCleared = 0;
        this.loadRandomRoom(this.roomsCleared);
        this.gameRunning = true;
        this.showDaemonMessage("Programme lancé. Situation: critique.");

        // Hide level UI, keep wave/health only
        const levelEl = document.getElementById('levelText');
        if (levelEl) {
            levelEl.textContent = '';
            levelEl.style.display = 'none';
            if (levelEl.parentElement) levelEl.parentElement.style.display = 'none';
        }
        const levelLabel = document.getElementById('levelLabel');
        if (levelLabel) levelLabel.style.display = 'none';
        
        this.gameLoop();
    }

    createScene() {
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.collisionsEnabled = true;
        this.scene.gravity = new BABYLON.Vector3(0, 0, 0);

        // Caméra isométrique façon Hades (ArcRotateCamera)
        this.camera = new BABYLON.ArcRotateCamera('camera', Math.PI/2 + Math.PI/8, 0.75, 70, new BABYLON.Vector3(0, 0, 0), this.scene);
        this.camera.attachControl(this.canvas, true);
        this.camera.lowerAlphaLimit = Math.PI/2 + Math.PI/8; this.camera.upperAlphaLimit = Math.PI/2 + Math.PI/8;
        this.camera.lowerBetaLimit = 0.7; this.camera.upperBetaLimit = 0.8;
        this.camera.lowerRadiusLimit = 65; this.camera.upperRadiusLimit = 75;
        this.camera.panningSensibility = 0; // pas de pan libre
        this.camera.inertia = 0.6;
        this.camera.minZ = 0.1;
        this.camera.maxZ = 1000;

        // Lumières
        const lightKey = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 1), this.scene);
        lightKey.intensity = 0.9;
        lightKey.specular = new BABYLON.Color3(0.2, 0.2, 0.2);

        const lightFill = new BABYLON.PointLight('light2', new BABYLON.Vector3(10, 20, 10), this.scene);
        lightFill.intensity = 0.6;
        lightFill.range = 120;

        // Glow layer pour effet néon
        this.glow = new BABYLON.GlowLayer('glow', this.scene);
        this.glow.intensity = 0.9;

        // Post-processing effects
        this.setupPostProcessing();

        // Vaporwave animated background
        this.createVaporwaveBackground();

        // Room manager
        this.roomManager = new RoomManager(this.scene, this.glow);
    }

    setupMusic() {
        if (this.music) return;
        this.loadAudioElement(0);
    }

    setMusicMuffled(enabled) {
        this.musicMuffled = enabled;
        const targetVolume = enabled ? this.musicBaseVolume * 0.55 : this.musicBaseVolume;
        if (this.audioEl) {
            this.audioEl.volume = targetVolume;
        }
        this.ensureAudioGraph();
        if (this.musicFilter && this.audioCtx) {
            const targetFreq = enabled ? 800 : 18000;
            const now = this.audioCtx.currentTime;
            try {
                this.musicFilter.frequency.cancelScheduledValues(now);
                this.musicFilter.frequency.setTargetAtTime(targetFreq, now, 0.08);
            } catch (_) {
                this.musicFilter.frequency.value = targetFreq;
            }
        }
    }

    loadAudioElement(index) {
        if (index >= this.musicCandidates.length) {
            console.error('Music: no playable source found');
            return;
        }
        const path = this.musicCandidates[index];
        this.currentMusicPath = path;
        const audio = new Audio(path);
        audio.loop = true;
        audio.volume = this.musicBaseVolume;
        audio.preload = 'auto';
        audio.addEventListener('canplaythrough', () => {
            this.audioEl = audio;
            this.ensureAudioGraph();
            this.setMusicMuffled(this.musicMuffled);
            this.playMusicIfReady();
        }, { once: true });
        audio.addEventListener('error', () => {
            console.error('Audio element load error, trying next:', path);
            this.loadAudioElement(index + 1);
        }, { once: true });
        audio.load();
    }

    ensureAudioGraph() {
        if (!this.audioEl) return;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!this.audioCtx) {
            this.audioCtx = new AudioCtx();
        }
        if (this.audioCtx.state === 'suspended' && this.audioUnlocked) {
            this.audioCtx.resume();
        }
        // Recreate source if missing or if it points to another element
        if (!this.musicSource || this.musicSource.mediaElement !== this.audioEl) {
            this.musicSource = this.audioCtx.createMediaElementSource(this.audioEl);
            this.musicFilter = null; // force rebuild
        }
        if (!this.musicFilter) {
            this.musicFilter = this.audioCtx.createBiquadFilter();
            this.musicFilter.type = 'lowpass';
            this.musicFilter.frequency.value = this.musicMuffled ? 800 : 18000;
            this.musicFilter.Q.value = 0.8;
            // Connect: source -> filter -> destination
            this.musicSource.disconnect();
            this.musicSource.connect(this.musicFilter);
            this.musicFilter.connect(this.audioCtx.destination);
        }
    }

    playMusicIfReady() {
        if (!this.audioEl) return;
        try {
            const p = this.audioEl.play();
            if (p && typeof p.then === 'function') {
                p.then(() => { this.pendingMusicPlay = false; }).catch(() => { this.pendingMusicPlay = true; });
            } else {
                this.pendingMusicPlay = false;
            }
        } catch (_) {
            this.pendingMusicPlay = true;
        }
    }

    unlockAudio(forcePlay = false) {
        if (this.audioUnlocked) {
            if (forcePlay) {
                if (BABYLON.Engine.audioEngine && BABYLON.Engine.audioEngine.audioContext && BABYLON.Engine.audioEngine.audioContext.state === 'suspended') {
                    BABYLON.Engine.audioEngine.audioContext.resume();
                }
                this.playMusicIfReady();
            }
            return;
        }
        try {
            if (BABYLON.Engine.audioEngine) {
                BABYLON.Engine.audioEngine.unlock();
                if (BABYLON.Engine.audioEngine.audioContext && BABYLON.Engine.audioEngine.audioContext.state === 'suspended') {
                    BABYLON.Engine.audioEngine.audioContext.resume();
                }
            }
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
        } catch (e) {
            console.warn('Audio unlock failed', e);
        }
        this.audioUnlocked = true;
        if (forcePlay || this.pendingMusicPlay) {
            this.playMusicIfReady();
        }
        if (this.audioEl) {
            this.pendingMusicPlay = false;
        }
    }

    createVaporwaveBackground() {
        // Shader material for animated neon grid
        BABYLON.Effect.ShadersStore["vaporwaveVertexShader"] = `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            uniform mat4 worldViewProjection;
            varying vec2 vUV;
            void main(void) {
                gl_Position = worldViewProjection * vec4(position, 1.0);
                vUV = uv;
            }
        `;

        BABYLON.Effect.ShadersStore["vaporwaveFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform float time;
            uniform vec3 color1;
            uniform vec3 color2;
            
            void main(void) {
                // Animated grid
                vec2 uv = vUV * 20.0; // Grid density
                uv.y += time * 0.5; // Vertical scroll
                
                // Grid lines
                float gridX = abs(fract(uv.x) - 0.5);
                float gridY = abs(fract(uv.y) - 0.5);
                float grid = step(0.45, gridX) + step(0.45, gridY);
                
                // Gradient colors (purple to cyan)
                vec3 color = mix(color1, color2, vUV.y);
                
                // Apply grid with glow
                color = mix(color * 0.2, color, grid);
                
                // Add perspective fade (top darker)
                color *= 0.4 + vUV.y * 0.6;
                
                gl_FragColor = vec4(color, 0.7);
            }
        `;

        const shaderMaterial = new BABYLON.ShaderMaterial("vaporwave", this.scene, {
            vertex: "vaporwave",
            fragment: "vaporwave",
        }, {
            attributes: ["position", "uv"],
            uniforms: ["worldViewProjection", "time", "color1", "color2"]
        });

        // Purple and cyan colors (Tron/Vaporwave)
        shaderMaterial.setVector3("color1", new BABYLON.Vector3(0.5, 0.0, 1.0)); // Purple
        shaderMaterial.setVector3("color2", new BABYLON.Vector3(0.0, 1.0, 1.0)); // Cyan
        shaderMaterial.backFaceCulling = false;
        shaderMaterial.alpha = 0.7;

        // Update time uniform every frame
        this.scene.registerBeforeRender(() => {
            shaderMaterial.setFloat("time", performance.now() / 1000);
        });

        // Create large background planes (floor + back walls)
        const bgFloor = BABYLON.MeshBuilder.CreateGround("bgFloor", { width: 400, height: 900 }, this.scene);
        bgFloor.position = new BABYLON.Vector3(0, -5, -150); // extends 1+ room ahead of room0 and far behind
        bgFloor.material = shaderMaterial;

        const bgWallLeft = BABYLON.MeshBuilder.CreatePlane("bgWallLeft", { width: 900, height: 120 }, this.scene);
        bgWallLeft.position = new BABYLON.Vector3(-200, 50, -150);
        bgWallLeft.rotation.y = Math.PI / 2;
        bgWallLeft.material = shaderMaterial;

        const bgWallRight = BABYLON.MeshBuilder.CreatePlane("bgWallRight", { width: 900, height: 120 }, this.scene);
        bgWallRight.position = new BABYLON.Vector3(200, 50, -150);
        bgWallRight.rotation.y = -Math.PI / 2;
        bgWallRight.material = shaderMaterial;
    }

    setupPostProcessing() {
        // 1. Pixelation effect - render at lower resolution
        const pixelRatio = 0.5; // 320x240 style (adjust: 0.5 = half res, 0.25 = quarter res)
        const pixelatePass = new BABYLON.PassPostProcess('pixelate', pixelRatio, this.camera);

        // 2. Chromatic Aberration (CRT-style RGB shift on edges)
        const chromaticAberration = new BABYLON.PostProcess('chromatic', './shaders/chromatic', 
            ['screenSize', 'aberrationAmount'], null, 1.0, this.camera);
        
        chromaticAberration.onApply = (effect) => {
            effect.setFloat2('screenSize', this.engine.getRenderWidth(), this.engine.getRenderHeight());
            effect.setFloat('aberrationAmount', 4.0); // Increased for stronger effect
        };

        // 3. Scanlines (optional CRT lines)
        const scanlines = new BABYLON.PostProcess('scanlines', './shaders/scanlines', 
            ['screenHeight'], null, 1.0, this.camera);
        
        scanlines.onApply = (effect) => {
            effect.setFloat('screenHeight', this.engine.getRenderHeight());
        };
    }
    
    createMaterial(color, scene) {
        const mat = new BABYLON.StandardMaterial('mat', scene);
        const rgb = this.hexToRgb(color);
        mat.diffuse = new BABYLON.Color3(rgb.r / 255, rgb.g / 255, rgb.b / 255);
        mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        return mat;
    }

    applyRoomClipping(material) {
        if (!material || !this.currentRoom) return;
        const origin = this.currentRoom.origin;
        const halfW = CONFIG.ROOM_WIDTH / 2;
        const halfD = CONFIG.ROOM_DEPTH / 2;
        const minX = origin.x - halfW;
        const maxX = origin.x + halfW;
        const minZ = origin.z - halfD;
        const maxZ = origin.z + halfD;
        material.clipPlane = new BABYLON.Plane(1, 0, 0, -maxX);      // x <= maxX
        material.clipPlane2 = new BABYLON.Plane(-1, 0, 0, minX);     // x >= minX
        material.clipPlane3 = new BABYLON.Plane(0, 0, 1, -maxZ);     // z <= maxZ
        material.clipPlane4 = new BABYLON.Plane(0, 0, -1, minZ);     // z >= minZ
    }

    ensureBossIntroUI() {
        if (this._bossIntroReady) return;
        this._bossIntroReady = true;

        // Styles
        if (!document.getElementById('bossIntroStyles')) {
            const style = document.createElement('style');
            style.id = 'bossIntroStyles';
            style.textContent = `
            @keyframes bossPulse {
                0% { opacity: 0.05; }
                50% { opacity: 0.22; }
                100% { opacity: 0.05; }
            }
            #bossIntroContainer {
                position: fixed;
                inset: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-start;
                padding-top: 14vh;
                pointer-events: none;
                gap: 10px;
                z-index: 9999;
                opacity: 0;
                transition: opacity 0.15s ease;
                font-family: 'Orbitron', 'Segoe UI', sans-serif;
                text-transform: uppercase;
            }
            #bossIntroContainer.active { opacity: 1; }
            #bossIntroFlash {
                position: absolute;
                inset: 0;
                background: rgba(255, 0, 0, 0.18);
                animation: bossPulse 0.6s infinite;
            }
            #bossIntroTitle {
                color: #ff3333;
                font-size: 64px;
                letter-spacing: 8px;
                text-shadow: 0 0 18px rgba(255,0,0,0.8);
            }
            #bossIntroName {
                color: #ffffff;
                font-size: 36px;
                letter-spacing: 4px;
                text-shadow: 0 0 12px rgba(255,255,255,0.65);
            }
            `;
            document.head.appendChild(style);
        }

        // Container
        if (!document.getElementById('bossIntroContainer')) {
            const container = document.createElement('div');
            container.id = 'bossIntroContainer';
            const flash = document.createElement('div');
            flash.id = 'bossIntroFlash';
            const title = document.createElement('div');
            title.id = 'bossIntroTitle';
            title.textContent = 'BOSS ROOM';
            const name = document.createElement('div');
            name.id = 'bossIntroName';
            name.textContent = '';
            container.appendChild(flash);
            container.appendChild(title);
            container.appendChild(name);
            document.body.appendChild(container);
        }
    }

    getBossInRoom(room) {
        if (!room || !room.enemies) return null;
        return room.enemies.find(e => e.type && e.type.startsWith('boss_')) || null;
    }

    // Create a filled wedge (sector) mesh to visualize a cone attack angle
    createSweepWedge(halfAngle, color = '#ffaa00') {
        const baseRadius = 4; // scaling reference; visual radius = currentDistance
        const steps = 24; // arc tessellation for smooth edge
        
        // Build wedge using custom vertices (no earcut dependency)
        const positions = [];
        const indices = [];
        const normals = [];
        
        // Center vertex at origin
        positions.push(0, 0, 0);
        normals.push(0, 1, 0);
        
        // Arc vertices
        const start = -halfAngle;
        const end = halfAngle;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const a = start + (end - start) * t;
            const x = Math.sin(a) * baseRadius;
            const z = Math.cos(a) * baseRadius;
            positions.push(x, 0, z);
            normals.push(0, 1, 0);
        }
        
        // Create triangles from center to each edge segment
        for (let i = 0; i < steps; i++) {
            indices.push(0, i + 1, i + 2);
        }
        
        const wedge = new BABYLON.Mesh('tank_sweep_wedge', this.scene);
        const vertexData = new BABYLON.VertexData();
        vertexData.positions = positions;
        vertexData.indices = indices;
        vertexData.normals = normals;
        vertexData.applyToMesh(wedge);
        
        const mat = this.createMaterial(color, this.scene);
        mat.emissiveColor = new BABYLON.Color3(1.0, 0.6, 0.2);
        mat.alpha = 0.8;
        mat.backFaceCulling = false; // visible from both sides
        wedge.material = mat;
        this.applyRoomClipping(wedge.material);
        return { mesh: wedge, baseRadius };
    }

    ensureEvilUI() {
        if (this._evilUiReady) return;
        this._evilUiReady = true;

        if (!document.getElementById('evilStyles')) {
            const style = document.createElement('style');
            style.id = 'evilStyles';
            style.textContent = `
            @keyframes evilFade {
                from { opacity: 0; transform: translateY(-8px); }
                to { opacity: 1; transform: translateY(0); }
            }
            #evilContainer {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                margin: 0 auto;
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 12px 18px;
                background: rgba(10, 10, 14, 0.88);
                border: 1px solid rgba(255, 0, 60, 0.45);
                box-shadow: 0 0 18px rgba(255,0,60,0.35);
                border-radius: 12px;
                width: 560px;
                color: #e2e2e2;
                font-family: 'IBM Plex Mono', 'Consolas', monospace;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.12s ease;
                z-index: 9998;
            }
            #evilContainer.active { opacity: 1; animation: evilFade 0.15s ease forwards; }
            #evilAvatar {
                width: 88px;
                height: 88px;
                flex-shrink: 0;
                background: url('images/evil_ai.png') center/cover no-repeat, url('images/ai.png') center/cover no-repeat, linear-gradient(135deg, #2a0b1e 0%, #0b0f2a 100%);
                border: 1px solid rgba(255,0,60,0.6);
                border-radius: 8px;
                box-shadow: 0 0 12px rgba(255,0,60,0.4);
            }
            #evilText {
                flex: 1;
                white-space: pre-wrap;
                line-height: 1.35;
                min-height: 54px;
                max-width: 400px;
            }
            `;
            document.head.appendChild(style);
        }

        if (!document.getElementById('evilContainer')) {
            const c = document.createElement('div');
            c.id = 'evilContainer';
            const avatar = document.createElement('div');
            avatar.id = 'evilAvatar';
            const text = document.createElement('div');
            text.id = 'evilText';
            c.appendChild(avatar);
            c.appendChild(text);
            document.body.appendChild(c);
        }
    }

    showEvilTaunt(kind = 'idle') {
        this.ensureEvilUI();
        const container = document.getElementById('evilContainer');
        const textEl = document.getElementById('evilText');
        if (!container || !textEl) return;

        const lines = {
            idle: [
                "Tu freezes déjà ? J'ai tout mon temps...",
                "Pause café ? Je peux attendre éternellement.",
                "L'immobilité, c'est ta nouvelle strat ?"
            ],
            no_damage: [
                "Zéro dégâts ? Chance ou compétence... j'observe.",
                "Intouchable ? On verra à la prochaine room.",
                "Joli, aucune égratignure. Ne t'habitue pas."
            ],
            hazard: [
                "Les pièges piquent, surprenant n'est-ce pas ?",
                "Tu adores marcher là où ça fait mal.",
                "Encore un pas et je facture la casse."
            ]
        };

        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const message = pick(lines[kind] || lines.idle);

        // Typewriter effect
        if (this._evilHideTimer) clearTimeout(this._evilHideTimer);
        if (this._evilTypeTimer) clearInterval(this._evilTypeTimer);
        container.classList.add('active');
        textEl.textContent = '';
        let idx = 0;
        const chars = message.split('');
        this._evilTypeTimer = setInterval(() => {
            if (idx >= chars.length) {
                clearInterval(this._evilTypeTimer);
                this._evilTypeTimer = null;
                this._evilHideTimer = setTimeout(() => {
                    container.classList.remove('active');
                }, 2200);
                return;
            }
            textEl.textContent += chars[idx];
            idx++;
        }, 35);
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }
    
    createPlayer() {
        return new Promise((resolve) => {
            // Clear any existing sweeps when creating new player
            if (this.sweeps) {
                this.sweeps.forEach(s => { if (s.mesh) { try { s.mesh.dispose(); } catch {} } });
                this.sweeps = [];
            }
            
            // Simple placeholder cylinder with subtle neon rim
            const placeholder = BABYLON.MeshBuilder.CreateCylinder('player', { diameter: CONFIG.PLAYER_SIZE * 1.4, height: CONFIG.PLAYER_SIZE * 2.4, tessellation: 12 }, this.scene);
            placeholder.position = new BABYLON.Vector3(0, CONFIG.PLAYER_SIZE * 1.2, 0);
            const baseScale = 1.6; // smaller size
            placeholder.scaling = new BABYLON.Vector3(baseScale, baseScale, baseScale);
            const playerMat = this.createMaterial('#3fffdc', this.scene);
            playerMat.emissiveColor = new BABYLON.Color3(0.2, 0.5, 0.8);
            placeholder.material = playerMat;
            placeholder.renderOutline = true;
            placeholder.outlineColor = new BABYLON.Color3(0.15, 0.45, 1.0);
            placeholder.outlineWidth = 0.04;
            placeholder.renderOverlay = true;
            placeholder.overlayColor = new BABYLON.Color3(0.1, 0.3, 0.8);
            placeholder.overlayAlpha = 0.08;
            this.glow.addIncludedOnlyMesh(placeholder);

            // Trail particles for movement velocity
            const trail = new BABYLON.ParticleSystem('playerTrail', 200, this.scene);
            // Minimal 1x1 white pixel using a raw texture to avoid image decode issues
            const trailData = new Uint8Array([255, 255, 255, 255]);
            const trailTex = BABYLON.RawTexture.CreateRGBATexture(
                trailData,
                1,
                1,
                this.scene,
                false,
                false,
                BABYLON.Texture.NEAREST_SAMPLINGMODE
            );
            trail.particleTexture = trailTex;
            trail.emitter = placeholder;
            trail.minEmitBox = new BABYLON.Vector3(-0.2, -0.2, -0.2);
            trail.maxEmitBox = new BABYLON.Vector3(0.2, 0.2, 0.2);
            trail.minSize = 0.05; trail.maxSize = 0.12;
            trail.minLifeTime = 0.25; trail.maxLifeTime = 0.5;
            trail.emitRate = 120;
            trail.color1 = new BABYLON.Color4(0.2, 0.6, 1.0, 0.3);
            trail.color2 = new BABYLON.Color4(0.6, 0.2, 1.0, 0.25);
            trail.colorDead = new BABYLON.Color4(0.1, 0.1, 0.3, 0);
            trail.direction1 = new BABYLON.Vector3(-0.5, 0.2, -0.5);
            trail.direction2 = new BABYLON.Vector3(0.5, 0.1, 0.5);
            trail.minEmitPower = 0.2; trail.maxEmitPower = 0.5;
            trail.updateSpeed = 0.01;
            trail.isEmitting = false;
            trail.start();

            this.player = {
                mesh: placeholder,
                hp: CONFIG.PLAYER_HP,
                maxHp: CONFIG.PLAYER_HP,
                speed: CONFIG.PLAYER_SPEED,
                velocity: new BABYLON.Vector3(0, 0, 0),
                attackCooldown: 0,
                class: this.selectedClass,
                ultimateCooldown: 0,
                lastDamageTime: 0,
                multishot: 1,
                damageBonus: 0,
                rotationOffset: Math.PI,
                animations: {},
                currentAnimation: null,
                isAttacking: false,
                idleBobbingPhase: 0,
                initialY: placeholder.position.y,
                baseScale,
                attackPulse: 0,
                trail,
            };

            // Programmatic animations
            this.setupProgrammaticAnimations();
            resolve();
        });
    }

    setupProgrammaticAnimations() {
        // Create simple programmatic animations since FBX doesn't load
        this.player.animations = {
            'idle': { type: 'bobbing', intensity: 0.05, speed: 2 },
            'run': { type: 'bounce', intensity: 0.2, speed: 4 },
            'attack': { type: 'pop', intensity: 0.3, speed: 3 }
        };
        
        // Save initial Y position for bobbing reference
        this.player.initialY = this.player.mesh.position.y;
        
        console.log("Programmatic animations setup, initial Y:", this.player.initialY);
        
        // Start with idle
        setTimeout(() => {
            this.playMageAnimation('idle', true);
        }, 300);
    }

    playMageAnimation(animationName, loop = true) {
        if (!this.player) {
            return;
        }
        
        const animData = this.player.animations[animationName];
        if (!animData) {
            console.log(`Animation "${animationName}" not available`);
            return;
        }
        this.player.currentAnimation = animationName;
        console.log(`Playing animation: ${animationName}`);
    }

    loadRandomRoom(index) {
        // For testing: boss every room
        const isBossRoom = true;
        const preset = isBossRoom ? ROOM_PRESETS[ROOM_PRESETS.length - 1] : ROOM_PRESETS[Math.floor(Math.random() * (ROOM_PRESETS.length - 1))];
        const scale = 1 + index * 0.15; // Difficulty scaling
        this.currentRoom = this.roomManager.loadPreset(index, preset, scale, this, true);
        this.obstacles = this.currentRoom.obstacles;
        this.hazards = this.currentRoom.hazards;
        const origin = this.currentRoom.origin;
        this.player.mesh.position = origin.clone().add(new BABYLON.Vector3(0, CONFIG.PLAYER_SIZE, CONFIG.ROOM_DEPTH/2 - 5));
        this.doorOpen = false;

        // Boss intro overlay if a boss is present
        const bossEnemy = this.getBossInRoom(this.currentRoom);
        if (bossEnemy) {
            this.showBossIntro(bossEnemy.type);
        }

        // Reset taunt state for new room
        const now = performance.now() / 1000;
        this.lastMoveTime = now;
        this.idleTauntDone = false;
        this.roomDamageTaken = false;
        this.noDamageTauntDone = false;

        // Preload next 2 rooms (fog-of-war: enemies inactive/hidden)
        for (let i = 1; i <= 2; i++) {
            const futureIndex = index + i;
            if (!this.roomManager.rooms[futureIndex]) {
                const futurePreset = ROOM_PRESETS[Math.floor(Math.random() * ROOM_PRESETS.length)];
                const futureScale = 1 + futureIndex * 0.15;
                this.roomManager.loadPreset(futureIndex, futurePreset, futureScale, this, false);
            }
        }
        // Add optional fog curtain on current room far side
        this.roomManager.createFogCurtain(index);
    }

    updateCameraToRoom(index) {
        const origin = this.roomManager.roomOrigin(index);
        this.camera.setTarget(origin.clone());
    }
    
    spawnEnemies(count) {
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const distance = 15;
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            this.spawnEnemyAt(new BABYLON.Vector3(x, CONFIG.ENEMY_SIZE / 2, z), 1, this.roomsCleared, { type: 'melee' });
        }
    }
    
    spawnEnemyAt(position, scale, roundIndex, options = {}) {
        const type = options.type || 'melee';
        let mesh;
        let damage = Math.floor(12 * scale);
        let speed = CONFIG.ENEMY_SPEED;
        let hp = Math.floor(CONFIG.ENEMY_HP * scale);
        let shootCooldown = 1.5;
        let shootTimer = 0.5;
        let range = 30;
        let velocity = new BABYLON.Vector3(0, 0, 0);
        let bossData = null;

        if (type === 'boss_jumper') {
            mesh = BABYLON.MeshBuilder.CreateSphere('boss_jumper', { diameter: 4.5 }, this.scene);
            damage = Math.floor(25 * scale);
            speed = CONFIG.ENEMY_SPEED * 0.5;
            hp = Math.floor(CONFIG.ENEMY_HP * 8 * scale);
            const mat = this.createMaterial('#ff0000', this.scene);
            mat.emissiveColor = new BABYLON.Color3(1, 0.1, 0.1);
            mesh.material = mat;
            bossData = { jumpTimer: 3, jumpCooldown: 4, isJumping: false, jumpPhase: 0, jumpDuration: 1.0, startPos: null, targetPos: null };
        } else if (type === 'boss_spawner') {
            mesh = BABYLON.MeshBuilder.CreateCylinder('boss_spawner', { diameter: 4, height: 5, tessellation: 8 }, this.scene);
            damage = Math.floor(20 * scale);
            speed = CONFIG.ENEMY_SPEED * 0.4;
            hp = Math.floor(CONFIG.ENEMY_HP * 7 * scale);
            const mat = this.createMaterial('#880088', this.scene);
            mat.emissiveColor = new BABYLON.Color3(0.5, 0, 0.5);
            mesh.material = mat;
            bossData = { spawnTimer: 4, spawnCooldown: 4 };
        } else if (type === 'boss_spikes') {
            mesh = BABYLON.MeshBuilder.CreateBox('boss_spikes', { width: 4, height: 3.5, depth: 4 }, this.scene);
            damage = Math.floor(22 * scale);
            speed = CONFIG.ENEMY_SPEED * 0.6;
            hp = Math.floor(CONFIG.ENEMY_HP * 6 * scale);
            const mat = this.createMaterial('#cc2222', this.scene);
            mat.emissiveColor = new BABYLON.Color3(0.8, 0.1, 0.1);
            mesh.material = mat;
            bossData = { spikeTimer: 6, spikeCooldown: 6, activeSpikes: [] };
        } else if (type === 'turret') {
            mesh = BABYLON.MeshBuilder.CreateCylinder('enemy_turret', { diameterTop: 0, diameterBottom: 2.2, height: 2.4, tessellation: 4 }, this.scene);
            mesh.rotation.y = Math.PI / 4;
            damage = Math.floor(15 * scale);
            speed = 0;
            hp = Math.floor(CONFIG.ENEMY_HP * 1.3 * scale);
            shootCooldown = 1.0;
            range = 35;
            const mat = this.createMaterial('#ff66ff', this.scene);
            mat.emissiveColor = new BABYLON.Color3(1, 0.4, 1);
            mesh.material = mat;
        } else if (type === 'bouncer') {
            mesh = BABYLON.MeshBuilder.CreateSphere('enemy_bouncer', { diameter: 2.4 }, this.scene);
            damage = Math.floor(12 * scale);
            speed = CONFIG.ENEMY_SPEED * 1.4;
            hp = Math.floor(CONFIG.ENEMY_HP * 1.0 * scale);
            const mat = this.createMaterial('#66ccff', this.scene);
            mat.emissiveColor = new BABYLON.Color3(0.3, 0.6, 1.0);
            mesh.material = mat;
            const dir = new BABYLON.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5);
            dir.normalize();
            velocity = dir.scale(speed);
        } else { // melee default
            mesh = BABYLON.MeshBuilder.CreateBox('enemy', { size: CONFIG.ENEMY_SIZE * 1.6 }, this.scene);
            const mat = this.createMaterial('#ff0000', this.scene);
            mat.emissiveColor = new BABYLON.Color3(1, 0, 0);
            mesh.material = mat;
        }

        mesh.position = position.clone();
        this.glow.addIncludedOnlyMesh(mesh);

        const obj = {
            mesh,
            type,
            hp,
            maxHp: hp,
            speed,
            damage,
            velocity,
            active: options.active !== false,
            roomIndex: roundIndex,
            shootCooldown,
            shootTimer,
            range,
            stuckCounter: 0,
            unstuckVector: null,
            bossData,
            healthBar: null,
        };
        if (options.active === false) {
            mesh.isVisible = false;
        }
        this.enemies.push(obj);
        return obj;
    }
    
    // ============= GAME LOOP =============
    gameLoop = () => {
        this.engine.runRenderLoop(() => {
            // Sécurité: si pas de scène, ne rien faire
            if (!this.scene) return;
            
            if (!this.gameRunning) {
                this.scene.render();
                this.engine.resize();
                return;
            }
            
            const deltaTime = this.engine.getDeltaTime() / 1000;
            
            // Update player
            this.updatePlayer(deltaTime);
            
            // Update enemies
            this.updateEnemies(deltaTime);
            
            // Update projectiles
            this.updateProjectiles(deltaTime);
            
            // Update melee sweep effects
            this.updateMeleeEffects(deltaTime);

            // Update boss abilities
            this.updateBossAbilities(deltaTime);
            
            // Collisions
            this.checkCollisions();
            
            // Wave management
            this.updateWaveLogic();
            
            // Render
            this.scene.render();
            
            // UI Update
            this.updateUI();
            
            this.engine.resize();
        });
    }

    updateMeleeEffects(deltaTime) {
        if (!this.sweeps) return;
        for (let i = this.sweeps.length - 1; i >= 0; i--) {
            const swp = this.sweeps[i];
            swp.lifetime -= deltaTime;
            swp.prevDistance = swp.currentDistance || 0;
            swp.currentDistance = Math.min(swp.maxDistance, (swp.currentDistance || 0) + swp.speed * deltaTime);

            // Visual: center at origin, wedge radius grows with advancing front
            if (swp.mesh) {
                swp.mesh.position = swp.origin;
                const baseR = swp.baseRadius || 4;
                const scale = Math.max(0.001, swp.currentDistance / baseR);
                swp.mesh.scaling = new BABYLON.Vector3(scale, scale, scale);
                if (swp.mesh.material) {
                    swp.mesh.material.alpha = Math.max(0, swp.lifetime / swp.lifetimeTotal);
                }
            }

            // Damage ring front: enemies at distances crossed this frame within cone
            const cosHalf = Math.cos(swp.halfAngle);
            this.enemies.forEach(enemy => {
                if (!enemy.mesh || !enemy.active) return;
                if (swp.hitSet && swp.hitSet.has(enemy)) return;
                const d = enemy.mesh.position.subtract(swp.origin); d.y = 0;
                const dist = d.length(); if (dist === 0) return;
                const dirN = d.scale(1 / dist);
                const dot = swp.dir.x * dirN.x + swp.dir.z * dirN.z;
                if (dot < cosHalf) return;
                // front thickness
                const thickness = 1.0;
                if (dist >= swp.prevDistance && dist <= swp.currentDistance + thickness) {
                    enemy.hp -= swp.damage;
                    if (swp.hitSet) swp.hitSet.add(enemy);
                }
            });

            if (swp.lifetime <= 0) {
                if (swp.mesh) { try { swp.mesh.dispose(); } catch {} }
                this.sweeps.splice(i, 1);
            }
        }
    }
    
    updatePlayer(deltaTime) {
        if (!this.player) return;
        
        // Reset velocity
        this.player.velocity = new BABYLON.Vector3(0, 0, 0);
        
        // Input handling (inversé pour correspondre à la vue caméra)
        if (this.inputMap['z'] || this.inputMap['ArrowUp']) this.player.velocity.z -= this.player.speed;
        if (this.inputMap['s'] || this.inputMap['ArrowDown']) this.player.velocity.z += this.player.speed;
        if (this.inputMap['q'] || this.inputMap['ArrowLeft']) this.player.velocity.x += this.player.speed;
        if (this.inputMap['d'] || this.inputMap['ArrowRight']) this.player.velocity.x -= this.player.speed;
        
        // Joystick input (mobile) - inversé pour correspondre à la vue
        if (this.joystickActive) {
            this.player.velocity.x -= this.joystickInput.x * this.player.speed;
            this.player.velocity.z += this.joystickInput.y * this.player.speed;
        }
        
        // Apply movement with obstacle collision resolution
        const prev = this.player.mesh.position.clone();
        this.player.mesh.position.addInPlace(this.player.velocity);
        this.resolveObstacleCollision(prev, this.player.mesh.position);
        this.clampPlayerBounds();

        // Idle taunt when room is clear and player stands still too long
        const now = performance.now() / 1000;
        if (this.player.velocity.lengthSquared() > 0.0001) {
            this.lastMoveTime = now;
        }
        if (this.doorOpen && !this.idleTauntDone && now - this.lastMoveTime >= 10) {
            this.showEvilTaunt('idle');
            this.idleTauntDone = true;
        }

        // Stretch & trail based on speed; pulse on attack
        const speedMag = this.player.velocity.length();
            const baseScale = this.player.baseScale || 1.6;
        const speedFactor = Math.min(1, speedMag / 0.25);
        const stretch = 1 + 0.25 * speedFactor;
        this.player.attackPulse = Math.max(0, this.player.attackPulse - deltaTime);
        const pulseFactor = 1 + 0.35 * (this.player.attackPulse / 0.25);
        this.player.mesh.scaling = new BABYLON.Vector3(
            baseScale * pulseFactor,
            baseScale * stretch * pulseFactor,
            baseScale * pulseFactor
        );
        if (this.player.trail) {
            this.player.trail.isEmitting = speedMag > 0.02;
        }
        
        // Handle animations programmatically
        if (this.player.velocity.length() > 0) {
            // Running animation
            const angle = Math.atan2(this.player.velocity.x, this.player.velocity.z);
            // Snap to 8 directions (45° intervals)
            const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
            this.player.mesh.rotation.y = snappedAngle + (this.player.rotationOffset || 0);
            this.playMageAnimation('run', true);
            
            // Bounce animation for running
            const bounceData = this.player.animations['run'];
            if (bounceData) {
                this.player.idleBobbingPhase += deltaTime * bounceData.speed;
                const bobbingAmount = Math.sin(this.player.idleBobbingPhase) * bounceData.intensity;
                this.player.mesh.position.y = this.player.initialY + bobbingAmount;
            }
        } else {
            // Idle animation (no movement)
            this.playMageAnimation('idle', true);
            
            // Idle bobbing animation
            const idleData = this.player.animations['idle'];
            if (idleData && this.player.currentAnimation === 'idle') {
                this.player.idleBobbingPhase += deltaTime * idleData.speed;
                const bobbingAmount = Math.sin(this.player.idleBobbingPhase) * idleData.intensity;
                this.player.mesh.position.y = this.player.initialY + bobbingAmount;
            }
        }
        
        // Attack cooldown
        this.player.attackCooldown = Math.max(0, this.player.attackCooldown - deltaTime);
        this.player.ultimateCooldown = Math.max(0, this.player.ultimateCooldown - deltaTime);
        
        // Auto-attack logic per class
        const closestEnemy = this.getClosestEnemy();
        if (this.player.class === 'mage') {
            // Mage fires only when stationary
            if (this.player.attackCooldown <= 0 && this.player.velocity.length() === 0 && closestEnemy) {
                this.playerAttack(closestEnemy);
                this.player.attackCooldown = CONFIG.PLAYER_ATTACK_COOLDOWN;
            }
        } else if (this.player.class === 'knight') {
            // Tank: cone sweep in front, medium melee range, multi-hit via projectiles
            if (this.player.attackCooldown <= 0 && closestEnemy) {
                const ppos = this.player.mesh.position;
                const ediff = closestEnemy.mesh.position.subtract(ppos); ediff.y = 0;
                const dist = ediff.length();
                // Attack only if enemy is within true reach of the sweep front
                const maxReach = 6; // matches playerTankAttack maxDistance
                if (dist <= maxReach) {
                    this.playerTankAttack(closestEnemy);
                    this.player.attackCooldown = Math.max(0.5, CONFIG.PLAYER_ATTACK_COOLDOWN * 0.9);
                }
            }
        } else if (this.player.class === 'rogue') {
            // Rogue: auto-aim melee. Attempt an attack when off cooldown; set cooldown only if it actually hits.
            if (this.player.attackCooldown <= 0) {
                const attacked = this.playerRogueAttack();
                if (attacked) {
                    this.player.attackCooldown = Math.max(0.3, CONFIG.PLAYER_ATTACK_COOLDOWN * 0.6);
                }
            }
        }
        
        // Ultimate
        if (this.inputMap[' '] && this.player.ultimateCooldown <= 0) {
            this.playerUltimate();
            this.player.ultimateCooldown = 8;
            this.inputMap[' '] = false;
        }
    }

    // Sphere-vs-AABB push out for player
    resolveObstacleCollision(prevPos, newPos) {
        this.resolveEntityObstacleCollision(this.player.mesh, prevPos, 1.0, false);
    }

    // Generic sphere-vs-AABB resolution; if bounce true, flip velocity axis
    resolveEntityObstacleCollision(mesh, prevPos, radius, bounceAxis = false, velocityRef = null) {
        if (!this.obstacles || this.obstacles.length === 0 || !mesh) return;
        const p = mesh.position;
        for (const o of this.obstacles) {
            const b = o.mesh.getBoundingInfo().boundingBox;
            const min = b.minimumWorld;
            const max = b.maximumWorld;
            const inside = (p.x > min.x - radius && p.x < max.x + radius && p.z > min.z - radius && p.z < max.z + radius);
            if (!inside) continue;

            // Compute overlap on X and Z
            const dx = Math.min((max.x + radius) - p.x, p.x - (min.x - radius));
            const dz = Math.min((max.z + radius) - p.z, p.z - (min.z - radius));

            if (dx < dz) {
                // Resolve X
                if (p.x > min.x) {
                    p.x = max.x + radius;
                } else {
                    p.x = min.x - radius;
                }
                if (bounceAxis && velocityRef) velocityRef.x *= -1;
            } else {
                // Resolve Z
                if (p.z > min.z) {
                    p.z = max.z + radius;
                } else {
                    p.z = min.z - radius;
                }
                if (bounceAxis && velocityRef) velocityRef.z *= -1;
            }
        }
    }
    
    updateEnemies(deltaTime) {
        this.enemies.forEach((enemy, idx) => {
            if (!enemy.mesh) return;
            if (!enemy.active) return;
            
            const toPlayer = this.player.mesh.position.subtract(enemy.mesh.position);
            toPlayer.y = 0;
            const dist = toPlayer.length();
            const dir = dist > 0 ? toPlayer.normalize() : new BABYLON.Vector3(0, 0, 0);

            // Separation to avoid clustering
            let sep = new BABYLON.Vector3(0, 0, 0);
            const minSep = 2.0;
            this.enemies.forEach(other => {
                if (other === enemy || !other.mesh) return;
                const d = enemy.mesh.position.subtract(other.mesh.position);
                d.y = 0;
                const l = d.length();
                if (l > 0 && l < minSep) {
                    const push = d.normalize().scale((minSep - l) * 0.4);
                    sep.addInPlace(push);
                }
            });

            // Boss AI
            if (enemy.type === 'boss_jumper' && enemy.bossData) {
                const bd = enemy.bossData;
                bd.jumpTimer -= deltaTime;
                
                // Idle (no movement) until jump starts
                enemy.velocity = new BABYLON.Vector3(0, 0, 0);

                if (bd.jumpTimer <= 0 && !bd.isJumping) {
                    bd.isJumping = true;
                    bd.jumpPhase = 0;
                    bd.startPos = enemy.mesh.position.clone();
                    bd.targetPos = this.player.mesh.position.clone();
                    bd.jumpTimer = bd.jumpCooldown;
                    // Warning preview at target: flat shaded circle matching shockwave radius (static size)
                    if (bd.warningMesh) { bd.warningMesh.dispose(); bd.warningMesh = null; }
                    const warn = BABYLON.MeshBuilder.CreateDisc('jump_warn', { radius: 4, tessellation: 48 }, this.scene);
                    warn.position = bd.targetPos.clone();
                    warn.position.y = 0.05;
                    warn.rotation.x = Math.PI / 2; // lay flat on ground (XZ plane)
                    const mat = this.createMaterial('#ff5555', this.scene);
                    mat.emissiveColor = new BABYLON.Color3(1, 0.3, 0.3);
                    mat.alpha = 0.3;
                    warn.material = mat;
                    this.applyRoomClipping(warn.material);
                    this.glow.addIncludedOnlyMesh(warn);
                    bd.warningMesh = warn;
                }

                if (bd.isJumping) {
                    bd.jumpPhase += deltaTime / bd.jumpDuration;
                    const t = Math.min(1, bd.jumpPhase);
                    const horiz = BABYLON.Vector3.Lerp(bd.startPos, bd.targetPos, t);
                    const height = Math.sin(t * Math.PI) * 6;
                    enemy.mesh.position = horiz.add(new BABYLON.Vector3(0, height, 0));
                    // Pulse alpha only; size stays constant
                    if (bd.warningMesh) {
                        const blink = 0.25 + 0.35 * Math.sin(t * Math.PI * 6);
                        bd.warningMesh.material.alpha = blink;
                    }
                    if (t >= 1) {
                        bd.isJumping = false;
                        enemy.mesh.position.y = CONFIG.ENEMY_SIZE / 2;
                        if (bd.warningMesh) { bd.warningMesh.dispose(); bd.warningMesh = null; }
                        this.spawnShockwave(enemy.mesh.position.clone(), enemy.damage);
                    }
                }
            } else if (enemy.type === 'boss_spawner' && enemy.bossData) {
                const bd = enemy.bossData;
                bd.spawnTimer -= deltaTime;
                if (bd.spawnTimer <= 0) {
                    this.spawnEnemyAt(enemy.mesh.position.clone().add(new BABYLON.Vector3(Math.random()*4-2, 0, Math.random()*4-2)), 1, enemy.roomIndex, { type: 'melee', active: true });
                    bd.spawnTimer = bd.spawnCooldown;
                }
                enemy.velocity = dir.scale(enemy.speed).add(sep);
                if (enemy.velocity.length() > enemy.speed) enemy.velocity = enemy.velocity.normalize().scale(enemy.speed);
                enemy.mesh.position.addInPlace(enemy.velocity);
                this.resolveEntityObstacleCollision(enemy.mesh, enemy.mesh.position, 1.1, false, enemy.velocity);
            } else if (enemy.type === 'boss_spikes' && enemy.bossData) {
                const bd = enemy.bossData;
                bd.spikeTimer -= deltaTime;
                if (bd.spikeTimer <= 0) {
                    this.spawnTemporarySpikes(enemy, bd);
                    bd.spikeTimer = bd.spikeCooldown;
                }
                enemy.velocity = dir.scale(enemy.speed).add(sep);
                if (enemy.velocity.length() > enemy.speed) enemy.velocity = enemy.velocity.normalize().scale(enemy.speed);
                enemy.mesh.position.addInPlace(enemy.velocity);
                this.resolveEntityObstacleCollision(enemy.mesh, enemy.mesh.position, 1.1, false, enemy.velocity);
            } else if (enemy.type === 'turret') {
                enemy.velocity = new BABYLON.Vector3(0, 0, 0);
                enemy.mesh.rotation.y += deltaTime * 0.6;
                enemy.shootTimer = (enemy.shootTimer || 0) - deltaTime;
                if (dist < (enemy.range || 30) && enemy.shootTimer <= 0) {
                    this.spawnEnemyProjectile(enemy, dir);
                    enemy.shootTimer = enemy.shootCooldown || 1.0;
                }
            } else if (enemy.type === 'bouncer') {
                enemy.velocity.addInPlace(sep);
                if (enemy.velocity.length() > enemy.speed) enemy.velocity = enemy.velocity.normalize().scale(enemy.speed);
                enemy.mesh.position.addInPlace(enemy.velocity);
                // Bounce on room bounds
                const room = this.roomManager && this.roomManager.rooms ? this.roomManager.rooms[enemy.roomIndex] : null;
                const origin = room ? room.origin : (this.currentRoom ? this.currentRoom.origin : new BABYLON.Vector3(0,0,0));
                const halfW = CONFIG.ROOM_WIDTH / 2 - 1;
                const halfD = CONFIG.ROOM_DEPTH / 2 - 1;
                let bounced = false;
                if (enemy.mesh.position.x > origin.x + halfW) { enemy.mesh.position.x = origin.x + halfW; enemy.velocity.x *= -1; bounced = true; }
                if (enemy.mesh.position.x < origin.x - halfW) { enemy.mesh.position.x = origin.x - halfW; enemy.velocity.x *= -1; bounced = true; }
                if (enemy.mesh.position.z > origin.z + halfD) { enemy.mesh.position.z = origin.z + halfD; enemy.velocity.z *= -1; bounced = true; }
                if (enemy.mesh.position.z < origin.z - halfD) { enemy.mesh.position.z = origin.z - halfD; enemy.velocity.z *= -1; bounced = true; }
                // Bounce on obstacles
                this.resolveEntityObstacleCollision(enemy.mesh, enemy.mesh.position, 1.0, true, enemy.velocity);
                if (bounced) {
                    const speedLen = enemy.velocity.length();
                    if (speedLen === 0) {
                        const dirBounce = new BABYLON.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                        enemy.velocity = dirBounce.scale(enemy.speed);
                    }
                }
            } else {
                // melee default
                const prevPos = enemy.mesh.position.clone();
                
                // If recently unstuck, keep using unstuck vector for a few frames
                if (enemy.unstuckVector && enemy.stuckCounter > 0) {
                    enemy.velocity = enemy.unstuckVector.clone();
                    enemy.stuckCounter--;
                } else {
                    // Normal movement toward player
                    enemy.unstuckVector = null;
                    enemy.stuckCounter = 0;
                    enemy.velocity = dir.scale(enemy.speed).add(sep);
                    if (enemy.velocity.length() > enemy.speed) enemy.velocity = enemy.velocity.normalize().scale(enemy.speed);
                }
                
                enemy.mesh.position.addInPlace(enemy.velocity);
                // Slide along obstacles
                this.resolveEntityObstacleCollision(enemy.mesh, enemy.mesh.position, 0.9, false, enemy.velocity);
                
                // Check if stuck: position didn't change much despite velocity
                const moveAmount = enemy.mesh.position.subtract(prevPos).length();
                if (moveAmount < 0.05 && dist > 1.5 && dir.length() > 0 && !enemy.unstuckVector) {
                    // Try perpendicular directions
                    const perp1 = new BABYLON.Vector3(-dir.z, 0, dir.x).normalize().scale(enemy.speed);
                    const perp2 = new BABYLON.Vector3(dir.z, 0, -dir.x).normalize().scale(enemy.speed);
                    const testPos1 = enemy.mesh.position.add(perp1);
                    const testPos2 = enemy.mesh.position.add(perp2);
                    const save = enemy.mesh.position.clone();
                    
                    enemy.mesh.position = testPos1;
                    const savedVel = enemy.velocity.clone();
                    this.resolveEntityObstacleCollision(enemy.mesh, enemy.mesh.position, 0.9, false, enemy.velocity);
                    const move1 = enemy.mesh.position.subtract(save).length();
                    
                    enemy.mesh.position = testPos2;
                    enemy.velocity = savedVel.clone();
                    this.resolveEntityObstacleCollision(enemy.mesh, enemy.mesh.position, 0.9, false, enemy.velocity);
                    const move2 = enemy.mesh.position.subtract(save).length();
                    
                    if (move1 > 0.05 && move1 > move2) {
                        enemy.mesh.position = testPos1;
                        enemy.unstuckVector = perp1;
                        enemy.stuckCounter = 5;
                    } else if (move2 > 0.05) {
                        enemy.mesh.position = testPos2;
                        enemy.unstuckVector = perp2;
                        enemy.stuckCounter = 5;
                    } else {
                        enemy.mesh.position = save;
                    }
                }
            }
            
            // Clamp bounds
            this.clampEntityBounds(enemy.mesh);
            
            // Update health bar
            this.updateEnemyHealthBar(enemy);
            
            // Remove if dead
            if (enemy.hp <= 0) {
                if (enemy.healthBar) enemy.healthBar.dispose();
                if (enemy.bossData) {
                    if (enemy.bossData.warningMesh) enemy.bossData.warningMesh.dispose();
                    if (enemy.bossData.activeSpikes) {
                        enemy.bossData.activeSpikes.forEach(sp => { if (sp.warningMesh) sp.warningMesh.dispose(); });
                        enemy.bossData.activeSpikes = [];
                    }
                }
                enemy.mesh.dispose();
                this.enemies.splice(idx, 1);
                this.score += 10;
                this.showDaemonMessage("Processus terminé.");
                // Also remove from its room list
                const ri = enemy.roomIndex;
                if (this.roomManager && this.roomManager.rooms && this.roomManager.rooms[ri]) {
                    const roomList = this.roomManager.rooms[ri].enemies;
                    const i = roomList.indexOf(enemy);
                    if (i >= 0) roomList.splice(i, 1);
                }
            }
        });
        // If current room enemies cleared and door not open, open exit door
        if (!this.doorOpen && this.currentRoom) {
            const alive = (this.currentRoom.enemies || []).filter(e => e.active && e.hp > 0).length;
            if (alive === 0) {
                this.roomManager.openDoor(this.roomsCleared);
                this.doorOpen = true;
                this.showDaemonMessage("Salle terminée. Avancez vers la porte.");
                if (!this.roomDamageTaken && !this.noDamageTauntDone) {
                    this.showEvilTaunt('no_damage');
                    this.noDamageTauntDone = true;
                }
            }
        }
    }
    
    updateProjectiles(deltaTime) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            if (!proj.mesh) {
                this.projectiles.splice(i, 1);
                continue;
            }

            proj.lifetime -= deltaTime;
            proj.mesh.position.addInPlace(proj.velocity);

            if (proj.lifetime <= 0) {
                proj.mesh.dispose();
                this.projectiles.splice(i, 1);
            }
        }
    }

    spawnEnemyProjectile(enemy, dir) {
        const proj = BABYLON.MeshBuilder.CreateSphere('enemy_projectile', { diameter: 0.6 }, this.scene);
        proj.position = enemy.mesh.position.clone();
        const color = enemy.type === 'turret' ? '#ff66ff' : '#aa66ff';
        const mat = this.createMaterial(color, this.scene);
        mat.emissiveColor = enemy.type === 'turret' ? new BABYLON.Color3(1, 0.4, 1) : new BABYLON.Color3(0.6, 0.2, 1);
        proj.material = mat;
        this.glow.addIncludedOnlyMesh(proj);

        this.projectiles.push({
            mesh: proj,
            velocity: dir.normalize().scale(CONFIG.ENEMY_PROJECTILE_SPEED),
            lifetime: 6,
            damage: enemy.damage || 10,
            friendly: false,
        });
    }

    spawnShockwave(origin, damage) {
        const wave = BABYLON.MeshBuilder.CreateDisc('shockwave', { radius: 4, tessellation: 48 }, this.scene);
        wave.position = origin.clone();
        wave.position.y = 0.05;
        wave.rotation.x = Math.PI / 2; // lay flat on ground
        const mat = this.createMaterial('#ff3333', this.scene);
        mat.emissiveColor = new BABYLON.Color3(1.0, 0.35, 0.35);
        mat.alpha = 0.95;
        wave.material = mat;
        this.applyRoomClipping(wave.material);
        this.glow.addIncludedOnlyMesh(wave);
        
        // Start tiny and grow to full radius over lifetime
        const shockwave = {
            mesh: wave,
            lifetime: 1.2,
            lifetimeTotal: 1.2,
            damage,
            radius: 0.1,
            prevRadius: 0.0,
            maxRadius: 20,
            hasHit: false,
        };
        // Scale = actual radius / disc radius (4). Starts tiny at 0.025, grows to 5.0
        const initialScale = shockwave.radius / 4;
        wave.scaling = new BABYLON.Vector3(initialScale, initialScale, initialScale);
        
        if (!this.shockwaves) this.shockwaves = [];
        this.shockwaves.push(shockwave);
    }

    spawnTemporarySpikes(boss, bossData) {
        const room = this.currentRoom;
        if (!room) return;
        const origin = room.origin;
        const isHorizontal = Math.random() > 0.5;
        const third = isHorizontal ? CONFIG.ROOM_DEPTH / 3 : CONFIG.ROOM_WIDTH / 3;
        const offset = (Math.floor(Math.random() * 3) - 1) * third;
        
        const warning = BABYLON.MeshBuilder.CreateGround('spike_warning', 
            { width: isHorizontal ? CONFIG.ROOM_WIDTH : third, height: isHorizontal ? third : CONFIG.ROOM_DEPTH }, this.scene);
        warning.position = origin.clone().add(new BABYLON.Vector3(isHorizontal ? 0 : offset, 0.1, isHorizontal ? offset : 0));
        const warnMat = this.createMaterial('#ff0000', this.scene);
        warnMat.emissiveColor = new BABYLON.Color3(1, 0, 0);
        warnMat.alpha = 0.4;
        warning.material = warnMat;
        this.glow.addIncludedOnlyMesh(warning);
        
        const tempSpike = {
            warningMesh: warning,
            lifetime: 1.5,
            damageLifetime: 3.5,
            damage: Math.floor(boss.damage * 0.8),
            position: warning.position.clone(),
            size: { x: isHorizontal ? CONFIG.ROOM_WIDTH : third, z: isHorizontal ? third : CONFIG.ROOM_DEPTH },
            active: false,
            blinkPhase: 0,
        };
        
        bossData.activeSpikes.push(tempSpike);
    }

    updateEnemyHealthBar(enemy) {
        if (!enemy.healthBar) {
            const bar = BABYLON.MeshBuilder.CreatePlane('healthbar', { width: 2, height: 0.2 }, this.scene);
            const mat = new BABYLON.StandardMaterial('hpmat', this.scene);
            mat.emissiveColor = new BABYLON.Color3(0, 1, 0);
            mat.disableLighting = true;
            bar.material = mat;
            bar.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            enemy.healthBar = bar;
        }
        
        const bar = enemy.healthBar;
        const isBoss = enemy.type && enemy.type.startsWith('boss_');
        const yOffset = isBoss ? 4 : 2;
        bar.position = enemy.mesh.position.clone().add(new BABYLON.Vector3(0, yOffset, 0));
        const ratio = Math.max(0, enemy.hp / enemy.maxHp);
        bar.scaling.x = ratio;
        bar.material.emissiveColor = ratio > 0.5 ? new BABYLON.Color3(0, 1, 0) : (ratio > 0.25 ? new BABYLON.Color3(1, 1, 0) : new BABYLON.Color3(1, 0, 0));
    }

    updateBossAbilities(deltaTime) {
        // Update shockwaves
        if (this.shockwaves) {
            for (let i = this.shockwaves.length - 1; i >= 0; i--) {
                const sw = this.shockwaves[i];
                sw.lifetime -= deltaTime;
                const growRate = sw.maxRadius / sw.lifetimeTotal;
                sw.prevRadius = sw.radius;
                sw.radius = Math.min(sw.maxRadius, sw.radius + deltaTime * growRate);
                // Scale = actual radius / disc radius (4), grows from 0.025 to 5.0
                const scale = sw.radius / 4;
                sw.mesh.scaling = new BABYLON.Vector3(scale, scale, scale);
                sw.mesh.material.alpha = Math.max(0, sw.lifetime / sw.lifetimeTotal);
                
                // Damage when the expanding ring reaches the player (edge-based)
                if (!sw.hasHit) {
                    const dist = sw.mesh.position.subtract(this.player.mesh.position).length();
                    if (dist >= sw.prevRadius && dist <= sw.radius) {
                        const now = performance.now() / 1000;
                        if (now - this.player.lastDamageTime >= 0.5) {
                            this.player.hp -= sw.damage;
                            this.player.lastDamageTime = now;
                        }
                        sw.hasHit = true;
                    }
                }
                
                if (sw.lifetime <= 0) {
                    sw.mesh.dispose();
                    this.shockwaves.splice(i, 1);
                }
            }
        }
        
        // Update temporary spikes
        this.enemies.forEach(enemy => {
            if (enemy.type === 'boss_spikes' && enemy.bossData) {
                const spikes = enemy.bossData.activeSpikes;
                for (let i = spikes.length - 1; i >= 0; i--) {
                    const sp = spikes[i];
                    sp.blinkPhase += deltaTime * 8;
                    
                    if (!sp.active) {
                        sp.lifetime -= deltaTime;
                        sp.warningMesh.material.alpha = 0.3 + Math.sin(sp.blinkPhase) * 0.3;
                        if (sp.lifetime <= 0) {
                            sp.active = true;
                            sp.warningMesh.material.alpha = 0.8;
                        }
                    } else {
                        sp.damageLifetime -= deltaTime;
                        const p = this.player.mesh.position;
                        const inX = Math.abs(p.x - sp.position.x) < sp.size.x / 2;
                        const inZ = Math.abs(p.z - sp.position.z) < sp.size.z / 2;
                        if (inX && inZ) {
                            const now = performance.now() / 1000;
                            if (now - this.player.lastDamageTime >= 0.5) {
                                this.player.hp -= sp.damage;
                                this.player.lastDamageTime = now;
                            }
                        }
                        
                        if (sp.damageLifetime <= 0) {
                            sp.warningMesh.dispose();
                            spikes.splice(i, 1);
                        }
                    }
                }
            }
        });
    }
    
    playerAttack(targetEnemy) {
        // Play attack animation
        this.player.isAttacking = true;
        this.playMageAnimation('attack', false);
        this.player.attackPulse = 0.25;

        // Face the target before firing
        if (targetEnemy && targetEnemy.mesh) {
            const dir = targetEnemy.mesh.position.subtract(this.player.mesh.position);
            dir.y = 0;
            if (dir.lengthSquared() > 0.0001) {
                const angle = Math.atan2(dir.x, dir.z);
                this.player.mesh.rotation.y = angle + (this.player.rotationOffset || 0);
            }
        }
        
        const projectile = BABYLON.MeshBuilder.CreateSphere('projectile', { segments: 8 }, this.scene);
        projectile.position = this.player.mesh.position.clone();
        projectile.scaling = new BABYLON.Vector3(CONFIG.PROJECTILE_SIZE, CONFIG.PROJECTILE_SIZE, CONFIG.PROJECTILE_SIZE);
        
        const projMat = this.createMaterial('#ffff00', this.scene);
        projMat.emissiveColor = new BABYLON.Color3(1, 1, 0);
        projectile.material = projMat;
        
        this.glow.addIncludedOnlyMesh(projectile);
        
        const shots = this.player.multishot || 1;
        const baseDir = targetEnemy.mesh.position.subtract(projectile.position).normalize();
        for (let i = 0; i < shots; i++) {
            const angle = (i - (shots-1)/2) * 0.08;
            const dir = new BABYLON.Vector3(
                baseDir.x * Math.cos(angle) - baseDir.z * Math.sin(angle),
                0,
                baseDir.x * Math.sin(angle) + baseDir.z * Math.cos(angle)
            );
            const p = i === 0 ? projectile : projectile.clone('projectile_clone');
            this.projectiles.push({
                mesh: p,
                velocity: dir.scale(CONFIG.PROJECTILE_SPEED),
                lifetime: CONFIG.PROJECTILE_LIFETIME,
                damage: Math.floor(10 * (1 + (this.player.damageBonus || 0))),
                friendly: true,
            });
        }
    }

    playerTankAttack(targetEnemy) {
        // Determine forward direction
        const playerPos = this.player.mesh.position.clone();
        let baseDir = new BABYLON.Vector3(0, 0, -1);
        if (targetEnemy && targetEnemy.mesh) {
            baseDir = targetEnemy.mesh.position.subtract(playerPos);
            baseDir.y = 0;
            if (baseDir.lengthSquared() > 0.0001) baseDir.normalize();
        } else if (this.player.velocity.length() > 0) {
            baseDir = this.player.velocity.clone().normalize();
        }

        // Create visual forward-only filled wedge matching the cone
        const halfAngle = Math.PI / 3; // 60° cone
        const range = 8; // increased sweep radius
        const aimAngle = Math.atan2(baseDir.x, baseDir.z);
        const wedgeBuild = this.createSweepWedge(halfAngle, '#ffaa00');
        const wedge = wedgeBuild.mesh;
        wedge.position = playerPos.clone();
        wedge.position.y = 0.08;
        // Rotate so that the wedge faces the aim direction (centered on it)
        wedge.rotation.y = aimAngle;
        this.glow.addIncludedOnlyMesh(wedge);

        const sweep = {
            mesh: wedge,
            origin: playerPos,
            dir: baseDir,
            range,
            halfAngle,
            speed: 12,
            maxDistance: 6,
            currentDistance: 0,
            prevDistance: 0,
            lifetime: 0.35,
            lifetimeTotal: 0.35,
            hitSet: new Set(),
            damage: Math.floor(12 * (1 + (this.player.damageBonus || 0))),
            baseRadius: wedgeBuild.baseRadius
        };
        this.sweeps.push(sweep);

        // Minor attack pulse feedback
        this.player.attackPulse = 0.2;
    }

    playerRogueAttack() {
        const playerPos = this.player.mesh.position.clone();
        // Auto-aim towards closest enemy if any within range
        const target = this.getClosestEnemy();
        let fwd = new BABYLON.Vector3(0, 0, -1);
        if (target && target.mesh) {
            const toTarget = target.mesh.position.subtract(playerPos); toTarget.y = 0;
            if (toTarget.lengthSquared() > 0.0001) {
                toTarget.normalize();
                fwd = toTarget;
                // Turn player towards target before attack
                const aim = Math.atan2(fwd.x, fwd.z);
                this.player.mesh.rotation.y = aim;
            }
        }

        const range = 4.5; // increased close range per feedback
        const halfAngle = Math.PI / 3; // 60° cone
        const dmg = Math.floor(8 * (1 + (this.player.damageBonus || 0)));

        // Collect targets in front within range
        const targets = [];
        this.enemies.forEach(enemy => {
            if (!enemy.mesh || !enemy.active) return;
            const d = enemy.mesh.position.subtract(playerPos); d.y = 0;
            const dist = d.length(); if (dist === 0 || dist > range) return;
            const dirN = dist > 0 ? d.scale(1 / dist) : new BABYLON.Vector3(0, 0, 0);
            const dot = fwd.x * dirN.x + fwd.z * dirN.z; // cos(theta)
            if (dot >= Math.cos(halfAngle)) targets.push(enemy);
        });

        // If no cone targets, try closest enemy within range as fallback (auto-aim)
        if (targets.length === 0 && target && target.mesh) {
            const dd = target.mesh.position.subtract(playerPos); dd.y = 0;
            if (dd.length() <= range + 0.2) targets.push(target);
        }
        if (targets.length === 0) return false;
        targets.forEach(enemy => { enemy.hp -= dmg; });

        // Quick visual pulse
        this.player.attackPulse = 0.15;

        // Add a tiny slash visual at the front
        const slash = BABYLON.MeshBuilder.CreateDisc('rogue_slash', { radius: 0.9, tessellation: 32 }, this.scene);
        const slashDir = targets[0] && targets[0].mesh ? targets[0].mesh.position.subtract(playerPos) : fwd;
        slashDir.y = 0; if (slashDir.lengthSquared() > 0.0001) slashDir.normalize();
        slash.position = playerPos.add(slashDir.scale(1.2));
        slash.position.y = 0.08;
        slash.rotation.x = Math.PI / 2;
        const smat = this.createMaterial('#ff66aa', this.scene);
        smat.emissiveColor = new BABYLON.Color3(1.0, 0.4, 0.8);
        smat.alpha = 0.7;
        slash.material = smat;
        this.applyRoomClipping(slash.material);
        this.glow.addIncludedOnlyMesh(slash);
        setTimeout(() => { try { slash.dispose(); } catch {} }, 120);
        return true;
    }
    
    playerUltimate() {
        // Simple area damage
        const range = 15;
        this.enemies.forEach(enemy => {
            const distance = BABYLON.Vector3.Distance(this.player.mesh.position, enemy.mesh.position);
            if (distance < range) {
                enemy.hp -= 30;
            }
        });
        this.showDaemonMessage("Anomalie détectée.");
    }
    
    checkCollisions() {
        // Projectiles
        for (let pIdx = this.projectiles.length - 1; pIdx >= 0; pIdx--) {
            const proj = this.projectiles[pIdx];
            if (!proj.mesh) {
                this.projectiles.splice(pIdx, 1);
                continue;
            }

            if (proj.friendly) {
                for (const enemy of this.enemies) {
                    if (!enemy.mesh) continue;
                    const diff = proj.mesh.position.subtract(enemy.mesh.position);
                    if (diff.length() < 1.5) {
                        enemy.hp -= proj.damage;
                        proj.mesh.dispose();
                        this.projectiles.splice(pIdx, 1);
                        break;
                    }
                }
            } else {
                const diff = proj.mesh.position.subtract(this.player.mesh.position);
                if (diff.length() < 1.5) {
                    const now = performance.now() / 1000;
                    if (now - this.player.lastDamageTime >= 0.5) {
                        this.player.hp -= proj.damage;
                        this.roomDamageTaken = true;
                        this.player.lastDamageTime = now;
                    }
                    proj.mesh.dispose();
                    this.projectiles.splice(pIdx, 1);
                }
            }
        }

        // Enemies vs Player (avec cooldown de dégâts)
        const currentTime = performance.now() / 1000;
        const damageCooldown = 1.0; // 1 secondes entre chaque hit

        this.enemies.forEach(enemy => {
            const diff = enemy.mesh.position.subtract(this.player.mesh.position);
            if (diff.length() < 2) {
                if (currentTime - this.player.lastDamageTime >= damageCooldown) {
                    this.player.hp -= (enemy.damage || 12);
                    this.roomDamageTaken = true;
                    this.player.lastDamageTime = currentTime;
                }
            }
        });

        // Hazards vs Player
        this.hazards.forEach(h => {
            if (!h.mesh) return;
            const b = h.mesh.getBoundingInfo().boundingBox;
            h.aabb = { min: b.minimumWorld.clone(), max: b.maximumWorld.clone() };
            const p = this.player.mesh.position;
            const inside = (p.x > h.aabb.min.x && p.x < h.aabb.max.x && p.z > h.aabb.min.z && p.z < h.aabb.max.z);
            const now = performance.now() / 1000;
            if (inside && now - h.lastHit >= h.cooldown) {
                this.player.hp -= h.damage;
                this.roomDamageTaken = true;
                if (now - this.lastHazardTaunt >= 5) {
                    this.showEvilTaunt('hazard');
                    this.lastHazardTaunt = now;
                }
                h.lastHit = now;
            }
        });

        // If player reaches EXIT door, show bonus screen
        if (!this.inBonusSelection && this.doorOpen && this.currentRoom && this.currentRoom.doorExit) {
            const distDoor = this.player.mesh.position.subtract(this.currentRoom.doorExit.position).length();
            if (distDoor < 3) {
                this.showBonusSelection();
            }
        }
    }
    
    updateWaveLogic() {
        // Géré par le système de salles
    }
    
    // ============= UTILITAIRES =============
    getClosestEnemy() {
        let closest = null;
        let minDist = Infinity;
        
        this.enemies.forEach(enemy => {
            if (!enemy.active) return;
            const diff = enemy.mesh.position.subtract(this.player.mesh.position);
            const dist = diff.length();
            if (dist < minDist) {
                minDist = dist;
                closest = enemy;
            }
        });
        
        return closest;
    }
    
    clampPlayerBounds() {
        if (!this.currentRoom) return;
        const origin = this.currentRoom.origin;
        const halfW = CONFIG.ROOM_WIDTH / 2 - 1;
        const halfD = CONFIG.ROOM_DEPTH / 2 - 1;
        const p = this.player.mesh.position;
        p.x = Math.max(origin.x - halfW, Math.min(origin.x + halfW, p.x));
        p.z = Math.max(origin.z - halfD, Math.min(origin.z + halfD, p.z));
    }
    
    clampEntityBounds(entity) {
        if (!this.currentRoom) return;
        const origin = this.currentRoom.origin;
        const halfW = CONFIG.ROOM_WIDTH / 2 - 1;
        const halfD = CONFIG.ROOM_DEPTH / 2 - 1;
        entity.position.x = Math.max(origin.x - halfW, Math.min(origin.x + halfW, entity.position.x));
        entity.position.z = Math.max(origin.z - halfD, Math.min(origin.z + halfD, entity.position.z));
    }
    
    updateUI() {
        document.getElementById('healthBar').style.width = (this.player.hp / this.player.maxHp * 100) + '%';
        document.getElementById('healthText').textContent = Math.ceil(this.player.hp) + '/' + this.player.maxHp;
        // Remove level display; keep wave and health only
        const waveEl = document.getElementById('waveText');
        if (waveEl) waveEl.textContent = this.currentWave;
        
        // Check death
        if (this.player.hp <= 0 && !this.gameOver) {
            this.gameOver = true;
            this.onGameOver();
        }
    }
    
    onGameOver() {
        this.gameRunning = false;
        document.getElementById('gameOverScreen').classList.remove('hidden');
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('finalRooms').textContent = this.roomsCleared;
        this.showDaemonMessage("Suppression des données. Suivant...");
    }

    showBonusSelection() {
        if (!this.gameRunning || this.inBonusSelection) return;
        this.inBonusSelection = true;
        this.gameRunning = false;
        this.setMusicMuffled(true);
        const list = document.getElementById('bonusList');
        list.innerHTML = '';
        const options = [...BONUS_OPTIONS].sort(() => Math.random() - 0.5).slice(0,3);
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'class-btn bonus-btn';
            btn.textContent = opt.label;
            btn.addEventListener('click', () => {
                opt.apply(this);
                document.getElementById('bonusScreen').classList.add('hidden');
                this.advanceRoom();
            });
            list.appendChild(btn);
        });
        document.getElementById('bonusScreen').classList.remove('hidden');
    }

    advanceRoom() {
        document.getElementById('bonusScreen').classList.add('hidden');
        this.setMusicMuffled(false);
        this.roomsCleared++;
        this.doorOpen = false;
        // Activate next room enemies/hazards, remove fog on current
        const prevIndex = this.roomsCleared - 1;
        const nextIndex = this.roomsCleared;
        const nextRoom = this.roomManager.rooms[nextIndex];
        if (nextRoom) {
            nextRoom.enemies.forEach(e => { if (e.mesh) { e.mesh.isVisible = true; e.active = true; } });
            nextRoom.hazards.forEach(h => { if (h.mesh) h.mesh.isVisible = true; });
        }
        const prevRoom = this.roomManager.rooms[prevIndex];
        if (prevRoom && prevRoom.fogCurtain) prevRoom.fogCurtain.dispose();

        // Preload room N+2 (2 rooms ahead)
        const futureIndex = nextIndex + 2;
        if (!this.roomManager.rooms[futureIndex]) {
            const futurePreset = ROOM_PRESETS[Math.floor(Math.random() * ROOM_PRESETS.length)];
            const futureScale = 1 + futureIndex * 0.15;
            this.roomManager.loadPreset(futureIndex, futurePreset, futureScale, this, false);
        }

        // Dispose room N-2 (2 rooms behind) to save memory
        const oldIndex = nextIndex - 2;
        if (oldIndex >= 0 && this.roomManager.rooms[oldIndex]) {
            const oldRoom = this.roomManager.rooms[oldIndex];
            if (oldRoom.fogCurtain) oldRoom.fogCurtain.dispose();
            if (oldRoom.doorExit) oldRoom.doorExit.dispose();
            if (oldRoom.doorEntrance) oldRoom.doorEntrance.dispose();
            (oldRoom.meshes || []).forEach(m => { try { m.dispose(); } catch {} });
            (oldRoom.obstacles || []).forEach(o => { if (o.mesh) o.mesh.dispose(); });
            (oldRoom.hazards || []).forEach(h => { if (h.mesh) h.mesh.dispose(); });
            (oldRoom.enemies || []).forEach(e => {
                if (e.mesh) e.mesh.dispose();
                const idx = this.enemies.indexOf(e);
                if (idx >= 0) this.enemies.splice(idx, 1);
            });
            delete this.roomManager.rooms[oldIndex];
        }

        // Move player to the entrance of the next room
        if (nextRoom) {
            this.player.mesh.position = nextRoom.origin.clone().add(new BABYLON.Vector3(0, CONFIG.PLAYER_SIZE, CONFIG.ROOM_DEPTH/2 - 5));
        }

        // Smooth camera transition to next room target
        const target = this.roomManager.roomOrigin(nextIndex).clone();
        const start = this.camera.target.clone();
        let t = 0;
        const duration = 0.6; // seconds
        const step = () => {
            if (t >= duration) {
                this.camera.setTarget(target);
                this.currentRoom = nextRoom;
                // Update obstacles and hazards references for collision detection
                this.obstacles = nextRoom ? nextRoom.obstacles : [];
                this.hazards = nextRoom ? nextRoom.hazards : [];
                this.inBonusSelection = false;
                this.gameRunning = true;
                const bossEnemy = this.getBossInRoom(this.currentRoom);
                if (bossEnemy) {
                    this.showBossIntro(bossEnemy.type);
                }
                const now = performance.now() / 1000;
                this.lastMoveTime = now;
                this.idleTauntDone = false;
                this.roomDamageTaken = false;
                this.noDamageTauntDone = false;
                return;
            }
            const k = t / duration;
            const z = start.z + (target.z - start.z) * k;
            const x = start.x + (target.x - start.x) * k;
            const y = start.y + (target.y - start.y) * k;
            this.camera.setTarget(new BABYLON.Vector3(x, y, z));
            t += this.engine.getDeltaTime() / 1000;
            requestAnimationFrame(step);
        };
        step();
    }
    
    resetGame() {
        // Arrêter le jeu ET le render loop
        this.gameRunning = false;
        this.gameOver = false;
        
        // IMPORTANT: Arrêter le render loop avant de tout disposer
        this.engine.stopRenderLoop();

        if (this.music) {
            this.music.stop();
            this.music.dispose();
            this.music = null;
            this.musicFilter = null;
        }
        this.audioUnlocked = false;
        this.pendingMusicPlay = false;
        
        // Nettoyer les entités
        if (this.player && this.player.mesh) {
            this.player.mesh.dispose();
        }
        this.enemies.forEach(enemy => {
            if (enemy.mesh) enemy.mesh.dispose();
        });
        this.projectiles.forEach(proj => {
            if (proj.mesh) proj.mesh.dispose();
        });
        
        // Réinitialiser les tableaux
        this.enemies = [];
        this.projectiles = [];
        this.player = null;
        
        // Disposer la scène et rooms
        if (this.scene) {
            // dispose fog/doors
            if (this.roomManager && this.roomManager.rooms) {
                this.roomManager.rooms.forEach(r => {
                    if (!r) return;
                    if (r.fogCurtain) r.fogCurtain.dispose();
                    if (r.doorExit) r.doorExit.dispose();
                    if (r.doorEntrance) r.doorEntrance.dispose();
                    (r.meshes || []).forEach(m => { try { m.dispose(); } catch {} });
                });
                this.roomManager.rooms = [];
            }
            this.scene.dispose();
            this.scene = null;
        }
        
        // Réinitialiser les stats
        this.score = 0;
        this.roomsCleared = 0;
        this.currentWave = 0;
        this.selectedClass = null;
        
        // Réinitialiser l'input
        this.inputMap = {};
        this.joystickActive = false;
        this.joystickInput = { x: 0, y: 0 };
        
        // Cacher les UI
        document.getElementById('gameOverScreen').classList.add('hidden');
        document.getElementById('joystickContainer').classList.add('hidden');
        
        // Afficher le menu de départ
        document.getElementById('startScreen').classList.remove('hidden');
        this.inBonusSelection = false;
        this.currentRoom = null;
        this.doorOpen = false;
    }
    
    showDaemonMessage(msg) {
        const container = document.getElementById('daemonMessage');
        document.getElementById('daemonText').textContent = msg;
        container.classList.remove('hidden');
        
        setTimeout(() => {
            container.classList.add('hidden');
        }, 3000);
    }

    showBossIntro(bossType) {
        this.ensureBossIntroUI();
        const container = document.getElementById('bossIntroContainer');
        const title = document.getElementById('bossIntroTitle');
        const nameEl = document.getElementById('bossIntroName');
        if (!container || !title || !nameEl) return;

        const names = {
            boss_jumper: 'BIT CRUSHER',
            boss_spawner: 'MACRO_MANCER',
            boss_spikes: 'STACK_OVERLORD'
        };
        const displayName = names[bossType] || 'UNKNOWN THREAT';
        title.textContent = 'BOSS ROOM';
        nameEl.textContent = displayName;

        container.classList.add('active');
        if (this._bossIntroTimer) clearTimeout(this._bossIntroTimer);
        this._bossIntroTimer = setTimeout(() => {
            container.classList.remove('active');
        }, 2200);
    }
    
    // ============= INPUT HANDLING =============
    onKeyDown(e) {
        this.inputMap[e.key.toLowerCase()] = true;
    }
    
    onKeyUp(e) {
        this.inputMap[e.key.toLowerCase()] = false;
    }
    
    onTouchStart(e) {
        const joystick = document.getElementById('joystickContainer');
        if (joystick.classList.contains('hidden')) return;
        
        const touch = e.touches[0];
        const base = document.getElementById('joystickBase');
        const rect = base.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        this.joystickActive = true;
        this.updateJoystick(touch.clientX - centerX, touch.clientY - centerY);
    }
    
    onTouchMove(e) {
        if (!this.joystickActive) return;
        e.preventDefault();
        
        const joystick = document.getElementById('joystickContainer');
        if (joystick.classList.contains('hidden')) return;
        
        const touch = e.touches[0];
        const base = document.getElementById('joystickBase');
        const rect = base.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        this.updateJoystick(touch.clientX - centerX, touch.clientY - centerY);
    }
    
    onTouchEnd(e) {
        this.joystickActive = false;
        this.joystickInput = { x: 0, y: 0 };
        document.getElementById('joystickStick').style.transform = 'translate(-50%, -50%)';
    }
    
    updateJoystick(x, y) {
        const radius = 75; // Base radius / 2
        const distance = Math.sqrt(x * x + y * y);
        const maxDistance = radius;
        
        let finalX = x;
        let finalY = y;
        
        if (distance > maxDistance) {
            finalX = (x / distance) * maxDistance;
            finalY = (y / distance) * maxDistance;
        }
        
        this.joystickInput.x = finalX / maxDistance;
        this.joystickInput.y = finalY / maxDistance;
        
        const offsetX = finalX + 75;
        const offsetY = finalY + 75;
        document.getElementById('joystickStick').style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }
    
    onWindowResize() {
        this.engine.resize();
    }
    
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
}

// ============= INITIALISATION =============
window.addEventListener('DOMContentLoaded', () => {
    const game = new DaemonDungeon();
});
