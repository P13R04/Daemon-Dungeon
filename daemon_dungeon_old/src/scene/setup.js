// Scene setup and post-processing utilities
// Exports window.DungeonScene.setup
(function() {
    'use strict';
    
    if (!window.DungeonScene) window.DungeonScene = {};
    if (!window.DungeonScene.setup) window.DungeonScene.setup = {};
    
    /**
     * Create the main scene with camera, lights, and glow layer
     * @param {Game} game - The game instance
     */
    function createScene(game) {
        game.scene = new BABYLON.Scene(game.engine);
        game.scene.collisionsEnabled = true;
        game.scene.gravity = new BABYLON.Vector3(0, 0, 0);

        // Caméra isométrique façon Hades (ArcRotateCamera)
        game.camera = new BABYLON.ArcRotateCamera('camera', Math.PI/2 + Math.PI/8, 0.75, 70, new BABYLON.Vector3(0, 0, 0), game.scene);
        game.camera.attachControl(game.canvas, true);
        game.camera.lowerAlphaLimit = Math.PI/2 + Math.PI/8; 
        game.camera.upperAlphaLimit = Math.PI/2 + Math.PI/8;
        game.camera.lowerBetaLimit = 0.7; 
        game.camera.upperBetaLimit = 0.8;
        game.camera.lowerRadiusLimit = 65; 
        game.camera.upperRadiusLimit = 75;
        game.camera.panningSensibility = 0; // pas de pan libre
        game.camera.inertia = 0.6;
        game.camera.minZ = 0.1;
        game.camera.maxZ = 1000;

        // Lumières
        const lightKey = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 1), game.scene);
        lightKey.intensity = 0.9;
        lightKey.specular = new BABYLON.Color3(0.2, 0.2, 0.2);

        const lightFill = new BABYLON.PointLight('light2', new BABYLON.Vector3(10, 20, 10), game.scene);
        lightFill.intensity = 0.6;
        lightFill.range = 120;

        // Glow layer pour effet néon
        game.glow = new BABYLON.GlowLayer('glow', game.scene);
        game.glow.intensity = 0.9;

        // Post-processing effects
        setupPostProcessing(game);

        // Vaporwave animated background
        createVaporwaveBackground(game);

        // Room manager
        game.roomManager = new RoomManager(game.scene, game.glow);
    }

    /**
     * Setup post-processing effects (pixelation, chromatic aberration, scanlines)
     * @param {Game} game - The game instance
     */
    function setupPostProcessing(game) {
        // 1. Pixelation effect - render at lower resolution
        const pixelRatio = 0.5; // 320x240 style (adjust: 0.5 = half res, 0.25 = quarter res)
        const pixelatePass = new BABYLON.PassPostProcess('pixelate', pixelRatio, game.camera);

        // 2. Chromatic Aberration (CRT-style RGB shift on edges)
        const chromaticAberration = new BABYLON.PostProcess('chromatic', './shaders/chromatic', 
            ['screenSize', 'aberrationAmount'], null, 1.0, game.camera);
        
        chromaticAberration.onApply = (effect) => {
            effect.setFloat2('screenSize', game.engine.getRenderWidth(), game.engine.getRenderHeight());
            effect.setFloat('aberrationAmount', 4.0); // Increased for stronger effect
        };

        // 3. Scanlines (optional CRT lines)
        const scanlines = new BABYLON.PostProcess('scanlines', './shaders/scanlines', 
            ['screenHeight'], null, 1.0, game.camera);
        
        scanlines.onApply = (effect) => {
            effect.setFloat('screenHeight', game.engine.getRenderHeight());
        };
    }

    /**
     * Create animated vaporwave background with shader
     * @param {Game} game - The game instance
     */
    function createVaporwaveBackground(game) {
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

        const shaderMaterial = new BABYLON.ShaderMaterial("vaporwave", game.scene, {
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
        game.scene.registerBeforeRender(() => {
            shaderMaterial.setFloat("time", performance.now() / 1000);
        });

        // Create large background planes (floor + back walls)
        const bgFloor = BABYLON.MeshBuilder.CreateGround("bgFloor", { width: 400, height: 900 }, game.scene);
        bgFloor.position = new BABYLON.Vector3(0, -5, -150); // extends 1+ room ahead of room0 and far behind
        bgFloor.material = shaderMaterial;

        const bgWallLeft = BABYLON.MeshBuilder.CreatePlane("bgWallLeft", { width: 900, height: 120 }, game.scene);
        bgWallLeft.position = new BABYLON.Vector3(-200, 50, -150);
        bgWallLeft.rotation.y = Math.PI / 2;
        bgWallLeft.material = shaderMaterial;

        const bgWallRight = BABYLON.MeshBuilder.CreatePlane("bgWallRight", { width: 900, height: 120 }, game.scene);
        bgWallRight.position = new BABYLON.Vector3(200, 50, -150);
        bgWallRight.rotation.y = -Math.PI / 2;
        bgWallRight.material = shaderMaterial;
    }

    // Export public API
    window.DungeonScene.setup.createScene = createScene;
    window.DungeonScene.setup.setupPostProcessing = setupPostProcessing;
    window.DungeonScene.setup.createVaporwaveBackground = createVaporwaveBackground;
    window.DungeonScene.setup._loaded = true;
})();
