import {
  Scene,
  MeshBuilder,
  ShaderMaterial,
  Vector3,
  Effect
} from '@babylonjs/core';

export function createMenuMatrixBackground(scene: Scene, layerMask?: number): void {
  // Create a large plane in the XY plane to act as a background
  const baseMesh = MeshBuilder.CreatePlane(
    'menu_matrix_bg',
    {
      width: 80,
      height: 80,
    },
    scene
  );

  // Position it at Z = 0 (the stationary camera is at Z = -10 facing Z = 0)
  baseMesh.position = new Vector3(0, 0, 0);
  baseMesh.isPickable = false;

  if (layerMask != null) {
    baseMesh.layerMask = layerMask;
  }

  // Register the custom shader in ShadersStore if not already present
  if (!Effect.ShadersStore.menuMatrixVertexShader || !Effect.ShadersStore.menuMatrixFragmentShader) {
    Effect.ShadersStore.menuMatrixVertexShader = `
      precision highp float;
      attribute vec3 position;
      attribute vec2 uv;
      uniform mat4 worldViewProjection;
      varying vec2 vUV;
      varying vec3 vPosition;

      void main(void) {
        vUV = uv;
        vPosition = position;
        gl_Position = worldViewProjection * vec4(position, 1.0);
      }
    `;

    Effect.ShadersStore.menuMatrixFragmentShader = `
      precision highp float;

      varying vec2 vUV;
      varying vec3 vPosition;
      uniform float uTime;

      float hash12(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 31.32);
        return fract(p.x * p.y);
      }

      void main(void) {
        // vPosition.xy ranges from [-40, 40] across our 80x80 plane.
        // We use it directly so that the rain columns remain the same size
        // regardless of screen resolution or aspect ratio.
        float yCoord = vPosition.y;

        // =============================================================
        // MULTI-BAND SCREEN TEARING (glitchy horizontal offsets)
        // =============================================================
        float tearOff = 0.0;
        float tearEdge = 0.0;
        float EW = 0.12; // Width of the tear highlight line

        // Event 1 (Medium band, moderate frequency)
        float tk1 = floor(uTime * 0.55);
        float ac1 = step(0.90, fract(uTime * 0.55)); // Active ~10% of the time
        float y1  = (hash21(vec2(tk1, 14.2)) - 0.5) * 14.0; // Y center of the band
        float w1  = hash21(vec2(tk1, 25.4)) * 0.8 + 0.15;   // Band width
        float dx1 = (hash21(vec2(tk1, 38.6)) * 0.45 + 0.15) * sign(hash21(vec2(tk1, 49.8)) - 0.5); // X displacement
        float bd1 = ac1 * step(y1 - w1 * 0.5, yCoord) * step(yCoord, y1 + w1 * 0.5);
        tearOff  += bd1 * dx1;
        tearEdge += ac1 * step(y1 + w1 * 0.5 - EW, yCoord) * step(yCoord, y1 + w1 * 0.5);

        // Event 2 (Narrow band, slower frequency)
        float tk2 = floor(uTime * 0.38 + 0.35);
        float ac2 = step(0.92, fract(uTime * 0.38 + 0.35)); // Active ~8% of the time
        float y2  = (hash21(vec2(tk2, 53.1)) - 0.5) * 14.0;
        float w2  = hash21(vec2(tk2, 67.3)) * 0.5 + 0.10;
        float dx2 = (hash21(vec2(tk2, 81.5)) * 0.35 + 0.12) * sign(hash21(vec2(tk2, 94.7)) - 0.5);
        float bd2 = ac2 * step(y2 - w2 * 0.5, yCoord) * step(yCoord, y2 + w2 * 0.5);
        tearOff  += bd2 * dx2;
        tearEdge += ac2 * step(y2 + w2 * 0.5 - EW, yCoord) * step(yCoord, y2 + w2 * 0.5);

        // Event 3 (Wide band, fast flash, very brief)
        float tk3 = floor(uTime * 0.75 + 0.12);
        float ac3 = step(0.94, fract(uTime * 0.75 + 0.12)); // Active ~6% of the time
        float y3  = (hash21(vec2(tk3, 105.4)) - 0.5) * 14.0;
        float w3  = hash21(vec2(tk3, 118.6)) * 1.3 + 0.30;
        float dx3 = (hash21(vec2(tk3, 131.8)) * 0.65 + 0.20) * sign(hash21(vec2(tk3, 144.1)) - 0.5);
        float bd3 = ac3 * step(y3 - w3 * 0.5, yCoord) * step(yCoord, y3 + w3 * 0.5);
        tearOff  += bd3 * dx3;
        tearEdge += ac3 * step(y3 + w3 * 0.5 - EW, yCoord) * step(yCoord, y3 + w3 * 0.5);

        // Calculate columns with the horizontal tear displacement applied
        float colBase = (vPosition.x + tearOff) * 2.2;
        float tempCol = floor(colBase);

        // Column color decision: ~92% blue, ~8% red for a cleaner, bluer aesthetic
        float colColorSeed = hash12(vec2(tempCol, 31.45));
        float isRed = step(0.92, colColorSeed);

        float xOffset = 0.0;
        float brightnessFlicker = 1.0;

        // Apply additional column-level glitch effects for red droplets
        if (isRed > 0.5) {
          // Extra horizontal jitter
          float glitchTime = floor(uTime * 12.0);
          float glitchVal = hash12(vec2(tempCol, glitchTime));
          if (glitchVal > 0.82) {
            xOffset = (hash12(vec2(tempCol, glitchTime + 1.15)) - 0.5) * 0.75;
          }
          // Rapid brightness flicker
          brightnessFlicker = mix(0.15, 1.35, hash12(vec2(tempCol, floor(uTime * 25.0))));
        }

        // Apply final column details
        float col = floor(colBase + xOffset);
        float colSeed = hash12(vec2(col, 17.84));

        // Speed of the falling rain for this column
        float speed = mix(1.1, 2.5, colSeed);

        // Calculate the falling trail position (with looping)
        float trailPos = fract((vPosition.y * 0.085) + (uTime * speed * 0.13) + (colSeed * 15.7));

        // Exponential decay of the trail (fading upwards)
        float trail = exp(-trailPos * (4.2 + colSeed * 4.5));

        // Glyphs flickering/changing within columns
        float glyphRow = floor((vPosition.y * 1.85) + (uTime * speed * 7.5));
        float glyphNoise = hash12(vec2(col * 1.37, glyphRow));
        float glyph = step(0.38, glyphNoise);

        float rainMix = trail * glyph;

        // Base colors: vibrant blue and warning red
        vec3 blueColor = vec3(0.02, 0.32, 0.88);
        vec3 redColor = vec3(0.85, 0.05, 0.12);
        vec3 baseRainColor = mix(blueColor, redColor, isRed);

        // Brighter/whiter head at the bottom of the falling droplet for depth/contrast
        vec3 headColor = isRed > 0.5 ? vec3(1.0, 0.75, 0.8) : vec3(0.75, 0.9, 1.0);
        vec3 finalRainColor = mix(baseRainColor, headColor, pow(1.0 - trailPos, 6.0));

        // Subtle multiplier to keep the background sober, discrete and dark
        float intensityMultiplier = isRed > 0.5 ? 0.35 * brightnessFlicker : 0.26;

        vec3 baseDark = vec3(0.002, 0.004, 0.008);
        vec3 color = baseDark + finalRainColor * rainMix * intensityMultiplier;

        // Dimmer, more discrete highlights on the active tear lines to avoid visual noise
        float tearNoise = step(0.35, hash21(vec2(floor(vPosition.x * 4.0), floor(uTime * 22.0))));
        vec3 discreteTearColor = vec3(0.02, 0.22, 0.50); // Muted dark blue/cyan
        color += discreteTearColor * clamp(tearEdge, 0.0, 1.0) * (0.15 + 0.2 * tearNoise);

        // Vignette effect to fade out the rain towards the edges of the screen
        float dist = length(vPosition.xy);
        float vignette = smoothstep(12.0, 4.0, dist);

        // Smooth transition to absolute black outside the active area
        color = mix(vec3(0.0), color, vignette);

        gl_FragColor = vec4(color, 1.0);
      }
    `;
  }

  const mat = new ShaderMaterial(
    'menu_matrix_mat',
    scene,
    {
      vertex: 'menuMatrix',
      fragment: 'menuMatrix',
    },
    {
      attributes: ['position', 'uv'],
      uniforms: ['worldViewProjection', 'uTime'],
    }
  );

  mat.backFaceCulling = false;
  mat.setFloat('uTime', 0);
  baseMesh.material = mat;

  // Render loop observer to update shader time
  scene.onBeforeRenderObservable.add(() => {
    const time = ((typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now()) * 0.001;
    mat.setFloat('uTime', time);
  });
}
