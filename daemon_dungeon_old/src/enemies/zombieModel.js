// Zombie model loader and instancer
(function(){
  'use strict';
  if (!window.DungeonEnemies) window.DungeonEnemies = {};
  if (!window.DungeonEnemies.zombieModel) window.DungeonEnemies.zombieModel = {};

  let loaded = false;
  let loading = false;
  let loadingPromise = null;
  let baseRoot = null;
  let baseMeshes = [];
  let baseAnimGroups = [];
  let tintMaterial = null;

  function getTintMaterial(game){
    if (tintMaterial) return tintMaterial;
    const mat = new BABYLON.StandardMaterial('zombie_tint_mat', game.scene);
    // Matrix-like green tint with slight translucency
    mat.emissiveColor = new BABYLON.Color3(0.2, 0.9, 0.4);
    mat.disableLighting = true;
    mat.alpha = 0.7;
    tintMaterial = mat;
    return tintMaterial;
  }

  function createGlitchParticles(root, game){
    const ps = new BABYLON.ParticleSystem('zombie_glitch', 200, game.scene);
    ps.particleTexture = new BABYLON.Texture('https://assets.babylonjs.com/textures/flare.png', game.scene);
    ps.emitter = root;
    ps.minEmitBox = new BABYLON.Vector3(-0.2, -0.1, -0.2);
    ps.maxEmitBox = new BABYLON.Vector3(0.2, 0.3, 0.2);
    ps.color1 = new BABYLON.Color4(0.3, 1.0, 0.5, 0.35);
    ps.color2 = new BABYLON.Color4(0.1, 0.8, 0.3, 0.25);
    ps.colorDead = new BABYLON.Color4(0.0, 0.4, 0.2, 0.0);
    ps.minSize = 0.06;
    ps.maxSize = 0.18;
    ps.minLifeTime = 0.2;
    ps.maxLifeTime = 0.8;
    ps.emitRate = 150;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
    ps.direction1 = new BABYLON.Vector3(-0.5, 1.2, -0.5);
    ps.direction2 = new BABYLON.Vector3(0.5, -0.2, 0.5);
    ps.minAngularSpeed = -2;
    ps.maxAngularSpeed = 2;
    ps.minEmitPower = 0.2;
    ps.maxEmitPower = 0.5;
    ps.updateSpeed = 0.02;
    ps.gravity = new BABYLON.Vector3(0, 0, 0);
    ps.start();
    root.onDisposeObservable.add(() => { try { ps.dispose(); } catch {} });
  }

  function ensureLoaded(game){
    if (loaded) return Promise.resolve(true);
    if (loadingPromise) return loadingPromise;
    loading = true;
    loadingPromise = new Promise((resolve, reject) => {
      BABYLON.SceneLoader.ImportMesh('', 'enemies/', 'Daemon_Zombie_animations.glb', game.scene, (meshes, ps, skeletons, animGroups) => {
        baseRoot = new BABYLON.TransformNode('zombie_src_root', game.scene);
        baseMeshes = meshes.filter(m => m.name !== '__root__');
        baseMeshes.forEach(m => { m.setParent(baseRoot); m.isVisible = false; });
        baseAnimGroups = animGroups || [];
        loaded = true;
        loading = false;
        resolve(true);
      }, null, (scene, message, exception) => {
        loading = false;
        loaded = false;
        reject(exception || new Error(message));
      });
    });
    return loadingPromise;
  }

  function cloneAnimations(targetMap){
    const anims = { idle: null, attacks: [] };
    baseAnimGroups.forEach(g => {
      const cloned = g.clone(g.name + '_inst', (old) => targetMap.get(old) || old);
      if (g.name.toLowerCase().includes('idle')) anims.idle = cloned;
      if (g.name.toLowerCase().includes('attack')) anims.attacks.push(cloned);
    });
    return anims;
  }

  function createInstance(game){
    if (!loaded){ return null; }
    const root = new BABYLON.TransformNode('zombie_instance', game.scene);
    const map = new Map();
    baseMeshes.forEach(src => {
      const c = src.clone(src.name + '_inst', root);
      c.isVisible = true;
      c.material = getTintMaterial(game);
      map.set(src, c);
    });
    const anims = cloneAnimations(map);
    if (anims.idle) { anims.idle.start(true); }
    createGlitchParticles(root, game);
    return { mesh: root, anims };
  }

  function applyAnimationsToEnemy(enemy){
    if (!enemy.mesh || !enemy.mesh.getChildMeshes) return;
    const map = new Map();
    // Build map between base and child clones by name
    baseMeshes.forEach(src => {
      const child = enemy.mesh.getChildMeshes().find(c => c.name.startsWith(src.name));
      if (child) map.set(src, child);
    });
    const anims = cloneAnimations(map);
    enemy.animIdle = anims.idle;
    enemy.animAttacks = anims.attacks || [];
    if (enemy.animIdle) enemy.animIdle.start(true);
  }

  window.DungeonEnemies.zombieModel.ensureLoaded = ensureLoaded;
  window.DungeonEnemies.zombieModel.createInstance = createInstance;
  window.DungeonEnemies.zombieModel.applyAnimationsToEnemy = applyAnimationsToEnemy;
  window.DungeonEnemies.zombieModel.getTintMaterial = getTintMaterial;
})();
