# BABYLON.JS REFERENCE & BEST PRACTICES

## Core Concepts

### Scene
- **Scene**: Container for all 3D content (meshes, cameras, lights, materials)
- Use `Scene.render()` in the render loop
- Access via `scene.meshes`, `scene.cameras`, `scene.lights`

### Engine
- **Engine**: WebGL context manager and render loop controller
- Use `engine.runRenderLoop()` for game loop
- Call `engine.resize()` on window resize events

### Meshes
- **Mesh**: 3D object in the scene
- **TransformNode**: Parent node for positioning without geometry
- Built-in primitives: `CreateBox`, `CreateSphere`, `CreateCylinder`, `CreatePlane`
- Import models: Use `SceneLoader.ImportMesh()` or `SceneLoader.Append()`

### Cameras
- **ArcRotateCamera**: Orbital camera (perfect for isometric views)
  - Alpha: horizontal rotation
  - Beta: vertical angle
  - Radius: distance from target
- **FreeCamera**: First-person camera
- **UniversalCamera**: Combines FreeCamera with touch support

### Lighting
- **HemisphericLight**: Ambient skylight (cheap, good base)
- **DirectionalLight**: Sun-like, supports shadows
- **PointLight**: Omni-directional (like a light bulb)
- **SpotLight**: Cone-shaped beam

### Materials
- **StandardMaterial**: Basic PBR-like material
  - `diffuseColor`: Base color
  - `diffuseTexture`: Base texture
  - `emissiveColor`: Self-illumination
  - `specularColor`: Shininess
- **PBRMaterial**: Physically-based rendering (more realistic)
  - `albedoColor`: Base color
  - `metallic`: Metallic reflection
  - `roughness`: Surface roughness

---

## Performance Optimization

### Object Pooling
- Reuse meshes instead of creating/destroying
- Use `mesh.setEnabled(false)` to hide
- Use `mesh.dispose()` only when truly done

### Instancing
- **InstancedMesh**: Duplicate mesh with minimal overhead
  - Use for repeated objects (enemies, projectiles, tiles)
  - Example: `mesh.createInstance('name')`

### Asset Management
- **AssetContainer**: Load and store assets without adding to scene
  - Instantiate copies as needed
  - Dispose container when done

### Scene Optimization
- `scene.autoClear = false`: Skip color buffer clear
- `scene.autoClearDepthAndStencil = false`: Skip depth clear
- `scene.blockMaterialDirtyMechanism = true`: Reduce material updates
- Use `scene.freezeActiveMeshes()` for static content

### Culling
- **Frustum Culling**: Automatic (don't render off-screen objects)
- **Occlusion Queries**: Advanced (test if objects are hidden)
- Set `mesh.isVisible = false` for hidden objects

---

## GUI (Babylon.js GUI)

### AdvancedDynamicTexture
- **Fullscreen UI**: `AdvancedDynamicTexture.CreateFullscreenUI()`
- **Texture UI**: Attach to mesh surface

### Common Controls
- **Rectangle**: Box container
- **TextBlock**: Text label
- **Button**: Clickable button
- **Image**: Display image
- **StackPanel**: Vertical/horizontal layout
- **Grid**: Grid layout
- **ScrollViewer**: Scrollable area
- **Slider**: Value slider

### Positioning
- Use `control.horizontalAlignment` / `verticalAlignment`
- Use `control.left`, `control.top` (in pixels or percentage)
- Use `control.width`, `control.height` (in pixels or percentage)

---

## Post-Processing

### DefaultRenderingPipeline
- All-in-one pipeline with common effects
- Enable/disable specific effects:
  - `pipeline.bloomEnabled`
  - `pipeline.chromaticAberrationEnabled`
  - `pipeline.grainEnabled`
  - `pipeline.sharpenEnabled`
  - `pipeline.glowLayerEnabled`

### Custom Post-Process
- **PostProcess**: Custom shader effects
- Use `.fragment.fx` files for GLSL shaders
- Example: CRT scanlines, custom pixelation

### Glow Layer
- **GlowLayer**: Selective bloom on emissive objects
- Set `material.emissiveColor` to make objects glow

---

## Physics (Optional)

### Physics Engines
- **Cannon.js**: Lightweight, good for simple physics
- **Ammo.js**: Full-featured (Bullet port)
- **Havok**: High-performance (commercial)

### Usage
- Create `PhysicsImpostor` for meshes
  - `BoxImpostor`, `SphereImpostor`, `MeshImpostor`
- Set mass (0 = static, >0 = dynamic)
- Apply forces: `impostor.applyImpulse()`

---

## Audio

### Sound
- **Sound**: Spatial or 2D audio
- Load: `new Sound(name, path, scene, callback, options)`
- Options:
  - `loop`: Loop playback
  - `autoplay`: Start immediately
  - `spatialSound`: 3D positioning

### Spatial Audio
- Use `sound.setPosition(vector3)` for 3D sound
- Automatically attenuates with distance

---

## Collisions & Raycasting

### Raycasting
- **Ray**: Cast ray from origin in direction
  - `scene.pickWithRay()`: Find first hit
  - `scene.multiPickWithRay()`: Find all hits
- Use for:
  - Attack hit detection
  - Mouse picking
  - Line-of-sight checks

### Mesh Collisions
- Enable: `mesh.checkCollisions = true`
- Camera collision: `camera.checkCollisions = true`
- Apply gravity: `camera.applyGravity = true`

---

## Animation

### Animation System
- **Animation**: Keyframe-based animation
  - Define keys: `{ frame: 0, value: ... }`
  - Animate properties: position, rotation, scaling, etc.
- **AnimationGroup**: Group multiple animations
  - Control as one: play, pause, stop

### Skeletal Animation
- Import animated models (`.glb`, `.gltf`)
- Access: `scene.animationGroups`
- Play: `animationGroup.start(loop, speed)`

---

## Loading Assets

### SceneLoader
- **ImportMesh**: Load specific meshes
  - `SceneLoader.ImportMesh('', path, filename, scene, callback)`
- **Append**: Load entire scene
  - `SceneLoader.Append(path, filename, scene, callback)`

### Supported Formats
- `.glb` / `.gltf` (preferred)
- `.babylon` (native)
- `.obj`, `.stl`, `.fbx` (via loaders)

### Texture Loading
- `new Texture(path, scene)`
- Use `texture.hasAlpha` for transparency

---

## Common Patterns for Daemon Dungeon

### Isometric Camera Setup
```typescript
const camera = new ArcRotateCamera(
  'camera',
  -Math.PI / 4,     // Alpha: 45° horizontal
  Math.PI / 3,      // Beta: ~60° vertical (isometric)
  20,               // Radius
  Vector3.Zero(),
  scene
);
camera.lowerRadiusLimit = 10;
camera.upperRadiusLimit = 30;
```

### Placeholder Mesh Creation
```typescript
// Simple colored cube as placeholder
const box = MeshBuilder.CreateBox('enemy', { size: 1 }, scene);
const mat = new StandardMaterial('mat', scene);
mat.diffuseColor = new Color3(1, 0, 0); // Red
box.material = mat;
```

### Grid-Based Positioning
```typescript
// Convert grid coordinates to world position
function gridToWorld(x: number, z: number, tileSize: number = 1): Vector3 {
  return new Vector3(x * tileSize, 0, z * tileSize);
}
```

### Projectile with Velocity
```typescript
// In update loop
const direction = target.subtract(position).normalize();
const velocity = direction.scale(speed * deltaTime);
mesh.position.addInPlace(velocity);
```

### Toggle Fullscreen
```typescript
engine.switchFullscreen(false); // Enter fullscreen
```

---

## Debugging

### Inspector
- Press `F12` in browser for DevTools
- Babylon Inspector: `scene.debugLayer.show()`
  - View scene graph
  - Inspect meshes, materials, lights
  - Performance metrics

### Stats
- Use `scene.getEngine().getFps()` for FPS
- `scene.totalVertices` for vertex count
- `scene.getActiveMeshes().length` for active mesh count

---

## Common Gotchas

1. **Dispose Properly**: Always call `.dispose()` on meshes, materials, textures when done
2. **Clone vs Instance**: `clone()` = full copy, `createInstance()` = lightweight duplicate
3. **Y-Up Coordinate System**: Y is up, not Z
4. **Radians**: Babylon uses radians, not degrees
5. **Scene vs Engine**: Scene contains content, Engine handles rendering
6. **Observable Pattern**: Use `.onEventObservable.add(callback)` for events

---

## Useful Prompts for Copilot

- "Create an isometric camera setup in Babylon.js"
- "Add a glow layer to the rendering pipeline"
- "Implement object pooling for projectiles using Babylon.js meshes"
- "Create a raycast from camera to mouse position for picking"
- "Load a .glb model and play its first animation"
- "Create a grid-based tile system with Babylon.js"
- "Implement fog of war using material opacity in Babylon.js"
- "Add chromatic aberration to the post-processing pipeline"
