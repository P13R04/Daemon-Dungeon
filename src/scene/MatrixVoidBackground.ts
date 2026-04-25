import {
  Scene,
  MeshBuilder,
  ShaderMaterial,
  Color3,
  Vector3,
  Effect
} from '@babylonjs/core';

export function createMatrixVoidBackground(scene: Scene, layerMask?: number): void {
  const baseMesh = MeshBuilder.CreateGround(
    'matrix_void_base_bg',
    {
      width: 1600,
      height: 1600,
      subdivisions: 1,
    },
    scene
  );

  baseMesh.position = new Vector3(0, -16.0, 0);
  baseMesh.isPickable = false;
  if (layerMask != null) {
    baseMesh.layerMask = layerMask;
  }

  if (!Effect.ShadersStore.matrixVoidVertexShader || !Effect.ShadersStore.matrixVoidFragmentShader) {
    Effect.ShadersStore.matrixVoidVertexShader = `
      precision highp float;
      attribute vec3 position;
      attribute vec2 uv;
      uniform mat4 worldViewProjection;
      varying vec3 vPosition;

      void main(void) {
        vPosition = position;
        gl_Position = worldViewProjection * vec4(position, 1.0);
      }
    `;

    Effect.ShadersStore.matrixVoidFragmentShader = `
      precision highp float;

      varying vec3 vPosition;
      uniform float uTime;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 31.32);
        return fract(p.x * p.y);
      }

      float noise21(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      void main(void) {
        vec3 voidBase  = vec3(0.002, 0.004, 0.008);
        vec3 techBlue  = vec3(0.05, 0.28, 0.65);
        vec3 threatRed = vec3(0.95, 0.02, 0.10);

        float breathe = sin(uTime * 0.4) * 0.04;
        // uv = espace UV de base (Y = monde Z, valeurs env. ±120)
        vec2 uv = vPosition.xz * (1.0 + breathe) * 0.15;
        vec3 color = voidBase;

        // =============================================================
        // FAKE TEARING — bandes étroites aléatoires
        // Chaque événement choisit un Y et une largeur via hash de son tick.
        // Le décalage X est CONSTANT à l'intérieur de chaque bande.
        // =============================================================

        // Utilitaire : masque d'une bande [y0, y0+w] et offset associé
        // Chaque événement a sa fréquence, phase et graines différentes.

        float tearOff = 0.0;   // décalage X cumulé (toutes bandes)
        float tearEdge = 0.0;  // masque de highlight des bords
        float EW = 0.07;       // épaisseur du highlight en UV base

        // --- 5 événements indépendants ---
        // Fq, phase, graines de hash uniques par événement

        // Evénement 1
        float tk1 = floor(uTime * 0.45 + 0.00);
        float ac1 = step(0.88, fract(uTime * 0.45 + 0.00)); // ~12% actif
        float y1  = hash21(vec2(tk1, 10.0)) * 18.0 - 9.0;
        float w1  = hash21(vec2(tk1, 11.0)) * 0.30 + 0.12;
        float dx1 = (hash21(vec2(tk1, 12.0)) * 0.20 + 0.12) * sign(hash21(vec2(tk1, 13.0)) - 0.5);
        float bd1  = ac1 * step(y1, uv.y) * step(uv.y, y1 + w1);
        tearOff  += bd1 * dx1;
        tearEdge += ac1 * step(y1 + w1 - EW, uv.y) * step(uv.y, y1 + w1);

        // Evénement 2
        float tk2 = floor(uTime * 0.38 + 0.20);
        float ac2 = step(0.88, fract(uTime * 0.38 + 0.20));
        float y2  = hash21(vec2(tk2, 20.0)) * 18.0 - 9.0;
        float w2  = hash21(vec2(tk2, 21.0)) * 0.25 + 0.10;
        float dx2 = (hash21(vec2(tk2, 22.0)) * 0.18 + 0.10) * sign(hash21(vec2(tk2, 23.0)) - 0.5);
        float bd2  = ac2 * step(y2, uv.y) * step(uv.y, y2 + w2);
        tearOff  += bd2 * dx2;
        tearEdge += ac2 * step(y2 + w2 - EW, uv.y) * step(uv.y, y2 + w2);

        // Evénement 3
        float tk3 = floor(uTime * 0.55 + 0.50);
        float ac3 = step(0.88, fract(uTime * 0.55 + 0.50));
        float y3  = hash21(vec2(tk3, 30.0)) * 18.0 - 9.0;
        float w3  = hash21(vec2(tk3, 31.0)) * 0.35 + 0.15;
        float dx3 = (hash21(vec2(tk3, 32.0)) * 0.22 + 0.13) * sign(hash21(vec2(tk3, 33.0)) - 0.5);
        float bd3  = ac3 * step(y3, uv.y) * step(uv.y, y3 + w3);
        tearOff  += bd3 * dx3;
        tearEdge += ac3 * step(y3 + w3 - EW, uv.y) * step(uv.y, y3 + w3);

        // Evénement 4
        float tk4 = floor(uTime * 0.30 + 0.75);
        float ac4 = step(0.88, fract(uTime * 0.30 + 0.75));
        float y4  = hash21(vec2(tk4, 40.0)) * 18.0 - 9.0;
        float w4  = hash21(vec2(tk4, 41.0)) * 0.28 + 0.10;
        float dx4 = (hash21(vec2(tk4, 42.0)) * 0.18 + 0.11) * sign(hash21(vec2(tk4, 43.0)) - 0.5);
        float bd4  = ac4 * step(y4, uv.y) * step(uv.y, y4 + w4);
        tearOff  += bd4 * dx4;
        tearEdge += ac4 * step(y4 + w4 - EW, uv.y) * step(uv.y, y4 + w4);

        // Evénement 5
        float tk5 = floor(uTime * 0.60 + 0.10);
        float ac5 = step(0.88, fract(uTime * 0.60 + 0.10));
        float y5  = hash21(vec2(tk5, 50.0)) * 18.0 - 9.0;
        float w5  = hash21(vec2(tk5, 51.0)) * 0.20 + 0.08;
        float dx5 = (hash21(vec2(tk5, 52.0)) * 0.16 + 0.10) * sign(hash21(vec2(tk5, 53.0)) - 0.5);
        float bd5  = ac5 * step(y5, uv.y) * step(uv.y, y5 + w5);
        tearOff  += bd5 * dx5;
        tearEdge += ac5 * step(y5 + w5 - EW, uv.y) * step(uv.y, y5 + w5);

        // ---- COUCHE 1 : petits fragments lointains ----
        vec2 uv1 = uv * 6.0 + vec2(uTime * 0.015 + tearOff * 0.5, uTime * 0.01);
        vec2 id1 = floor(uv1); vec2 gv1 = fract(uv1);
        float a1  = step(0.960, hash21(id1));
        float b1  = step(max(abs(gv1.x - 0.5), abs(gv1.y - 0.5)), 0.15);
        color += techBlue * a1 * b1 * 0.25;
        float bug1 = step(0.96, hash21(floor(uTime * 5.0) + id1));
        float tv1  = step(0.4, hash21(floor(gv1 * 8.0) + floor(uTime * 30.0) + id1 * 7.7));
        color = mix(color, threatRed * tv1, a1 * b1 * bug1);

        // ---- COUCHE 2 : fragments médians ----
        vec2 uv2 = uv * 3.0 + vec2(-uTime * 0.03 + tearOff * 0.75, -uTime * 0.015);
        vec2 id2 = floor(uv2); vec2 gv2 = fract(uv2);
        float a2  = step(0.960, hash21(id2 + 10.0));
        float b2  = step(max(abs(gv2.x - 0.5), abs(gv2.y - 0.5)), 0.2);
        float au2 = smoothstep(0.4, 0.1, length(gv2 - 0.5)) * 0.3;
        color += techBlue * a2 * (b2 + au2) * 0.5;
        float bug2 = step(0.96, hash21(floor(uTime * 4.5) + id2 + 3.3));
        float tv2  = step(0.4, hash21(floor(gv2 * 10.0) + floor(uTime * 30.0) + id2 * 5.3));
        color = mix(color, threatRed * tv2, a2 * b2 * bug2);
        color += threatRed * a2 * au2 * bug2 * 0.25;

        // ---- COUCHE 3 : gros fragments proches (le plus visible) ----
        vec2 uv3 = uv * 1.1 + vec2(uTime * 0.05 + tearOff, -uTime * 0.02);
        vec2 id3 = floor(uv3); vec2 gv3 = fract(uv3);
        float a3  = step(0.880, hash21(id3 + 20.0));
        float b3  = step(max(abs(gv3.x - 0.5), abs(gv3.y - 0.5)), 0.22);
        float au3 = smoothstep(0.3, 0.15, length(gv3 - 0.5)) * 0.4;
        color += techBlue * a3 * (b3 + au3) * 0.8;
        float bug3 = step(0.96, hash21(floor(uTime * 5.0) + id3));
        float tv3  = step(0.4, hash21(floor(gv3 * 12.0) + floor(uTime * 30.0) + id3 * 7.7));
        color = mix(color, threatRed * tv3, a3 * b3 * bug3);
        color += threatRed * a3 * au3 * bug3 * 0.35;

        // ---- HIGHLIGHTS NETS DES BORDS DE BANDE (step pur, aucun smoothstep) ----
        float scanNoise = step(0.40, hash21(vec2(floor(uv.x * 5.0), floor(uTime * 20.0))));
        color += vec3(0.14, 0.45, 1.00) * clamp(tearEdge, 0.0, 1.0) * (0.5 + 0.5 * scanNoise);

        // Vignette abyssale
        float dist = length(vPosition.xz) / 1000.0;
        color = mix(color, vec3(0.0), smoothstep(0.3, 1.2, dist) * 0.5);

        gl_FragColor = vec4(color, 1.0);
      }
    `;
  }

  const mat = new ShaderMaterial(
    'matrix_void_mat',
    scene,
    {
      vertex: 'matrixVoid',
      fragment: 'matrixVoid',
    },
    {
      attributes: ['position', 'uv'],
      uniforms: ['worldViewProjection', 'uTime'],
    }
  );

  mat.backFaceCulling = false;
  mat.setFloat('uTime', 0);
  baseMesh.material = mat;

  scene.onBeforeRenderObservable.add(() => {
    const time = ((typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now()) * 0.001;
    mat.setFloat('uTime', time);
  });
}
