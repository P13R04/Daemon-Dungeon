// Daemon Dungeon - Minimal Game Class
// All method calls are delegated through window.DungeonCore.delegates
// RoomManager and essential game logic remain here

// ============= CONFIGURATION =============
const CONFIG = {
    CANVAS_ID: 'gameCanvas',
    GAME_WIDTH: window.innerWidth,
    GAME_HEIGHT: window.innerHeight,
    TARGET_FPS: 60,
    
    // Gameplay
    PLAYER_SPEED: 0.30,
    PLAYER_HP: 100,
    PLAYER_ATTACK_COOLDOWN: 1.0,
    PLAYER_SIZE: 1,
    
    ENEMY_SPEED: 0.08,
    ENEMY_HP: 20,
    ENEMY_SIZE: 1,
    ENEMY_PROJECTILE_SPEED: 0.35,
    
    PROJECTILE_SPEED: 0.8,
    PROJECTILE_SIZE: 0.3,
    PROJECTILE_LIFETIME: 10,
    
    // Game flow
    ENEMIES_PER_WAVE: 5,
    WAVES_UNTIL_BOSS: 10,
    
    // Rooms
    ROOM_WIDTH: 50,
    ROOM_DEPTH: 50,
    ROOM_SPACING: 60,
    CAMERA_HEIGHT: 25,
    CAMERA_OFFSET_Z: 25,
};

const BONUS_OPTIONS = [
    { id: 'multishot', label: 'Multishot (+1 projectile)', apply: (game) => { game.player.multishot = (game.player.multishot || 1) + 1; } },
    { id: 'attackSpeed', label: "Vitesse d'attaque (+20%)", apply: (game) => { CONFIG.PLAYER_ATTACK_COOLDOWN = Math.max(0.3, CONFIG.PLAYER_ATTACK_COOLDOWN * 0.8); } },
    { id: 'damageUp', label: 'Dégâts +25%', apply: (game) => { game.player.damageBonus = (game.player.damageBonus || 0) + 0.25; } },
    { id: 'maxHp', label: 'PV max +20', apply: (game) => { game.player.maxHp += 20; game.player.hp = Math.min(game.player.hp + 20, game.player.maxHp); } },
    { id: 'moveSpeed', label: 'Vitesse mouvement +15%', apply: (game) => { game.player.speed *= 1.15; } },
];

const ROOM_PRESETS = [
    {
        name: 'Basic Square',
        enemies: [
            { pos: [ -8, 0 ], type: 'melee' },
            { pos: [ 8, 0 ], type: 'melee' },
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
        this.rooms = [];
        this.currentIndex = 0;
    }

    roomOrigin(index) {
        return new BABYLON.Vector3(0, 0, -index * CONFIG.ROOM_SPACING);
    }

    createRoomStructure(index) {
        const origin = this.roomOrigin(index);
        const meshes = [];
        const ground = BABYLON.MeshBuilder.CreateGround(`ground_${index}`, { width: CONFIG.ROOM_WIDTH, height: CONFIG.ROOM_DEPTH }, this.scene);
        ground.position = origin.clone();
        ground.material = this._mat('#1a1a1a');
        meshes.push(ground);

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
        (preset.obstacles || []).forEach(def => this.addObstacle(index, def));
        (preset.hazards || []).forEach(def => {
            const h = this.addSpike(index, def);
            if (!activate) h.isVisible = false;
        });
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
            const enemyObj = window.DungeonCore?.delegates?.spawnEnemyAt?.(game, pos, scale, index, { active: activate, type });
            room.enemies.push(enemyObj);
        });
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
        const room = this.rooms[index];
        const halfD = CONFIG.ROOM_DEPTH / 2;
        const plane = BABYLON.MeshBuilder.CreatePlane(`fog_${index}`, { width: CONFIG.ROOM_WIDTH, height: 12 }, this.scene);
        plane.position = room.origin.clone().add(new BABYLON.Vector3(0, 6, -halfD));
        plane.rotation.x = Math.PI;
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

// ============= MAIN GAME CLASS =============
class DaemonDungeon {
    constructor() {
        this.canvas = document.getElementById(CONFIG.CANVAS_ID);
        this.engine = new BABYLON.Engine(this.canvas, true);
        this.scene = null;
        this.camera = null;
        this.roomManager = null;
        this.CONFIG = CONFIG;
        
        // Entities
        this.player = null;
        this.enemies = [];
        this.projectiles = [];
        this.obstacles = [];
        this.hazards = [];
        this.shockwaves = [];
        this.sweeps = [];
        
        // Audio (deprecated - use delegates)
        this.audioEl = null;
        this.audioCtx = null;
        this.musicSource = null;
        this.musicFilter = null;
        this.musicBaseVolume = 0.6;
        this.audioUnlocked = false;
        this.pendingMusicPlay = false;
        this.musicMuffled = true;
        this.musicCandidates = [
            'music/bgm.mp3',
            encodeURI('music/Sci Fi Cyberpunk - VHS [SynthwaveElectro].mp3')
        ];
        this.currentMusicPath = null;
        
        // Game state
        this.selectedClass = null;
        this.gameRunning = false;
        this.gameOver = false;
        this.doorOpen = false;
        this.currentRoom = null;
        this.inBonusSelection = false;
        
        this.score = 0;
        this.roomsCleared = 0;
        this.currentWave = 0;
        this.lastMoveTime = performance.now() / 1000;
        this.idleTauntDone = false;
        this.roomDamageTaken = false;
        this.noDamageTauntDone = false;
        this.lastHazardTaunt = 0;
        
        // Input
        this.inputMap = {};
        this.joystickActive = false;
        this.joystickInput = { x: 0, y: 0 };
        
        window.addEventListener('resize', () => this.onWindowResize());
        
        // UI Events
        document.querySelectorAll('.class-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.startGame(e.target.closest('.class-btn').dataset.class));
        });
        
        document.getElementById('restartBtn').addEventListener('click', () => this.resetGame());
        const skipBtn = document.getElementById('skipBonusBtn');
        if (skipBtn) skipBtn.addEventListener('click', () => this.advanceRoom());

        this.loadUIScripts();
        
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
        window.addEventListener('touchstart', (e) => this.onTouchStart(e));
        window.addEventListener('touchmove', (e) => this.onTouchMove(e));
        window.addEventListener('touchend', (e) => this.onTouchEnd(e));

        window.addEventListener('pointerdown', () => window.DungeonCore?.delegates?.unlockAudio?.(this, true), { once: true });
        window.addEventListener('click', () => window.DungeonCore?.delegates?.unlockAudio?.(this, true), { once: true });
        window.addEventListener('keydown', () => window.DungeonCore?.delegates?.unlockAudio?.(this, true), { once: true });
    }
    
    loadUIScripts() {
        const scripts = [
            'src/ui/bossIntro.js', 'src/ui/evilUi.js', 'src/ui/hud.js', 'src/ui/bonus.js', 'src/ui/gameOver.js',
            'src/ui/startScreen.js', 'src/ui/joystick.js', 'src/combat/melee.js', 'src/combat/ranged.js',
            'src/combat/boss.js', 'src/physics/collision.js', 'src/utils/visuals.js', 'src/enemies/zombieModel.js', 'src/ai/enemies.js',
            'src/logic/rooms.js', 'src/audio/music.js', 'src/audio/state.js', 'src/logic/uiFlow.js',
            // Ultimate logic & UI must be loaded for the button to show
            'src/logic/ultimate.js', 'src/ui/ultimate.js',
            'src/entities/player.js', 'src/scene/setup.js', 'src/input/handlers.js', 'src/logic/collisions.js',
            'src/logic/damage.js', 'src/player/movement.js', 'src/enemies/targeting.js', 'src/core/gameState.js',
            'src/core/delegates.js',
        ];
        let pending = scripts.length;

        scripts.forEach(src => {
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => {
                pending--;
                if (pending === 0) {
                    window.DungeonUI = window.DungeonUI || {};
                    window.DungeonUtils = window.DungeonUtils || {};
                    window.DungeonCombat = window.DungeonCombat || {};
                    window.DungeonPhysics = window.DungeonPhysics || {};
                    window.DungeonAI = window.DungeonAI || {};
                    window.DungeonAudio = window.DungeonAudio || {};
                    window.DungeonEntities = window.DungeonEntities || {};
                    window.DungeonScene = window.DungeonScene || {};
                    window.DungeonInput = window.DungeonInput || {};
                    window.DungeonPlayer = window.DungeonPlayer || {};
                    window.DungeonEnemies = window.DungeonEnemies || {};
                    window.DungeonLogic = window.DungeonLogic || {};
                    window.DungeonCore = window.DungeonCore || {};
                    [window.DungeonUI, window.DungeonUtils, window.DungeonCombat, window.DungeonPhysics,
                     window.DungeonAI, window.DungeonAudio, window.DungeonEntities, window.DungeonScene,
                     window.DungeonInput, window.DungeonPlayer, window.DungeonEnemies, window.DungeonLogic,
                     window.DungeonCore].forEach(ns => { ns._loaded = true; });
                }
            };
            document.head.appendChild(s);
        });
    }
    
    async startGame(selectedClass) {
        this.selectedClass = selectedClass;
        window.DungeonUI?.start?.hideStartScreen?.();
        if (this.isMobile()) window.DungeonUI?.joystick?.showJoystick?.();
        window.DungeonCore?.delegates?.createScene?.(this);
        await window.DungeonCore?.delegates?.createPlayer?.(this);
        // Preload zombie model so first room uses it
        try { await window.DungeonEnemies?.zombieModel?.ensureLoaded?.(this); } catch {}
        // Initialize ultimate state after player exists to avoid null access
        window.DungeonCore?.delegates?.initUltimateState?.(this);
        window.DungeonCore?.delegates?.setupMusic?.(this);
        window.DungeonCore?.delegates?.unlockAudio?.(this, true);
        window.DungeonCore?.delegates?.setMusicMuffled?.(this, false);
        window.DungeonCore?.delegates?.ensureUltimateUI?.(this);
        this.roomsCleared = 0;
        window.DungeonCore?.delegates?.loadRandomRoom?.(this, this.roomsCleared);
        this.gameRunning = true;
        this.showDaemonMessage("Programme lancé. Situation: critique.");
        window.DungeonUI?.start?.hideLevelUI?.();
        this.gameLoop();
    }

    gameLoop = () => {
        this.engine.runRenderLoop(() => {
            if (!this.scene) return;
            
            if (!this.gameRunning) {
                this.scene.render();
                this.engine.resize();
                return;
            }
            
            const deltaTime = this.engine.getDeltaTime() / 1000;
            
            window.DungeonCore?.delegates?.updatePlayer?.(this, deltaTime);
            window.DungeonCore?.delegates?.updateEnemies?.(this, deltaTime);
            window.DungeonCore?.delegates?.updateProjectiles?.(this, deltaTime);
            window.DungeonCore?.delegates?.updateMeleeEffects?.(this, deltaTime);
            window.DungeonCore?.delegates?.updateBossAbilities?.(this, deltaTime);
            window.DungeonCore?.delegates?.checkCollisions?.(this);
            window.DungeonCore?.delegates?.updatePassives?.(this, deltaTime);
            window.DungeonCore?.delegates?.updateUltimateState?.(this, deltaTime);
            this.updateWaveLogic();
            
            this.scene.render();
            window.DungeonCore?.delegates?.updateUI?.(this);
            this.engine.resize();
        });
    }

    updateWaveLogic() {}

    playerUltimate() {
        const range = 15;
        this.enemies.forEach(enemy => {
            const distance = BABYLON.Vector3.Distance(this.player.mesh.position, enemy.mesh.position);
            if (distance < range) {
                enemy.hp -= 30;
            }
        });
        this.showDaemonMessage("Anomalie détectée.");
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

    getBossInRoom(room) {
        if (!room || !room.enemies) return null;
        return room.enemies.find(e => e && e.type && e.type.startsWith('boss_')) || null;
    }

    resetGame() {
        this.gameRunning = false;
        this.gameOver = false;
        this.engine.stopRenderLoop();

        if (this.player && this.player.mesh) {
            this.player.mesh.dispose();
        }
        this.enemies.forEach(enemy => {
            if (enemy.mesh) enemy.mesh.dispose();
        });
        this.projectiles.forEach(proj => {
            if (proj.mesh) proj.mesh.dispose();
        });
        
        this.enemies = [];
        this.projectiles = [];
        this.player = null;
        
        if (this.scene) {
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
        
        this.score = 0;
        this.roomsCleared = 0;
        this.currentWave = 0;
        this.selectedClass = null;
        
        this.inputMap = {};
        this.joystickActive = false;
        this.joystickInput = { x: 0, y: 0 };
        
        window.DungeonUI?.gameOver?.hideGameOver?.();
        window.DungeonUI?.joystick?.hideJoystick?.();
        window.DungeonUI?.start?.showStartScreen?.();
        this.inBonusSelection = false;
        this.currentRoom = null;
        this.doorOpen = false;
    }
    
    // Delegates & shortcuts
    spawnEnemyAt(pos, scale, roundIndex, options) {
        return window.DungeonLogic?.rooms?.spawnEnemyAt?.(this, pos, scale, roundIndex, options);
    }

    advanceRoom() {
        window.DungeonLogic?.rooms?.advanceRoom?.(this);
    }

    showDaemonMessage(msg) {
        window.DungeonLogic?.uiFlow?.showDaemonMessage?.(this, msg);
    }

    showBossIntro(bossType) {
        window.DungeonLogic?.uiFlow?.showBossIntro?.(this, bossType);
    }

    onKeyDown(e) {
        window.DungeonInput?.handlers?.onKeyDown?.(this, e);
    }
    
    onKeyUp(e) {
        window.DungeonInput?.handlers?.onKeyUp?.(this, e);
    }
    
    onTouchStart(e) {
        window.DungeonInput?.handlers?.onTouchStart?.(this, e);
    }
    
    onTouchMove(e) {
        window.DungeonInput?.handlers?.onTouchMove?.(this, e);
    }
    
    onTouchEnd(e) {
        window.DungeonInput?.handlers?.onTouchEnd?.(this, e);
    }
    
    onWindowResize() {
        this.engine.resize();
    }
    
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new DaemonDungeon();
});
