// Global visuals utilities (non-module)
(function(){
  window.DungeonUtils = window.DungeonUtils || {};
  window.DungeonUtils.visuals = {
    hexToRgb(hex){
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 255, g: 255, b: 255 };
    },
    createMaterial(color, scene){
      const mat = new BABYLON.StandardMaterial('mat', scene);
      const rgb = this.hexToRgb(color);
      mat.diffuse = new BABYLON.Color3(rgb.r / 255, rgb.g / 255, rgb.b / 255);
      mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
      return mat;
    },
    applyRoomClipping(material, origin, roomWidth, roomDepth){
      if (!material || !origin || !roomWidth || !roomDepth) return;
      const halfW = roomWidth / 2;
      const halfD = roomDepth / 2;
      const minX = origin.x - halfW;
      const maxX = origin.x + halfW;
      const minZ = origin.z - halfD;
      const maxZ = origin.z + halfD;
      material.clipPlane = new BABYLON.Plane(1, 0, 0, -maxX);
      material.clipPlane2 = new BABYLON.Plane(-1, 0, 0, minX);
      material.clipPlane3 = new BABYLON.Plane(0, 0, 1, -maxZ);
      material.clipPlane4 = new BABYLON.Plane(0, 0, -1, minZ);
    },
    createSweepWedge(scene, halfAngle, color){
      const baseRadius = 4;
      const steps = 24;
      const positions = [];
      const indices = [];
      const normals = [];
      positions.push(0,0,0); normals.push(0,1,0);
      const start = -halfAngle; const end = halfAngle;
      for (let i=0;i<=steps;i++){
        const t=i/steps; const a=start+(end-start)*t;
        const x=Math.sin(a)*baseRadius; const z=Math.cos(a)*baseRadius;
        positions.push(x,0,z); normals.push(0,1,0);
      }
      for (let i=0;i<steps;i++){ indices.push(0,i+1,i+2); }
      const wedge = new BABYLON.Mesh('tank_sweep_wedge', scene);
      const vertexData = new BABYLON.VertexData();
      vertexData.positions = positions; vertexData.indices = indices; vertexData.normals = normals; vertexData.applyToMesh(wedge);
      const mat = this.createMaterial(color, scene);
      mat.emissiveColor = new BABYLON.Color3(1.0, 0.6, 0.2); mat.alpha = 0.8; mat.backFaceCulling = false;
      wedge.material = mat;
      return { mesh: wedge, baseRadius };
    }
  };
})();
