const fs = require('fs');
const path = require('path');

const glbPath = path.join(__dirname, '..', 'public', 'models', 'bull', 'bull.glb');

try {
  const buffer = fs.readFileSync(glbPath);
  
  // Read GLB header
  const magic = buffer.readUInt32LE(0);
  const version = buffer.readUInt32LE(4);
  const length = buffer.readUInt32LE(8);
  
  if (magic !== 0x46546C67) {
    console.error("Invalid GLB file");
    process.exit(1);
  }
  
  // Read Chunk 0 (JSON)
  const chunkLength = buffer.readUInt32LE(12);
  const chunkType = buffer.readUInt32LE(16);
  
  if (chunkType !== 0x4E4F534A) {
    console.error("First chunk is not JSON");
    process.exit(1);
  }
  
  const jsonStr = buffer.toString('utf8', 20, 20 + chunkLength);
  const gltf = JSON.parse(jsonStr);
  
  console.log("--- ANIMATIONS ---");
  if (gltf.animations) {
    gltf.animations.forEach((anim, index) => {
      console.log(`[${index}] name: "${anim.name}"`);
    });
  } else {
    console.log("No animations found in GLTF");
  }
  
} catch (err) {
  console.error("Error reading GLB file:", err);
}
