// Global Physics/Collision helpers (non-module)
(function(){
  window.DungeonPhysics = window.DungeonPhysics || {};
  window.DungeonPhysics.collision = {
    resolveEntityObstacleCollision(game, mesh, prevPos, radius, bounceAxis = false, velocityRef = null){
      if (!game.obstacles || game.obstacles.length === 0 || !mesh) return;
      const p = mesh.position;
      for (const o of game.obstacles) {
        const b = o.mesh.getBoundingInfo().boundingBox;
        const min = b.minimumWorld; const max = b.maximumWorld;
        const inside = (p.x > min.x - radius && p.x < max.x + radius && p.z > min.z - radius && p.z < max.z + radius);
        if (!inside) continue;
        const dx = Math.min((max.x + radius) - p.x, p.x - (min.x - radius));
        const dz = Math.min((max.z + radius) - p.z, p.z - (min.z - radius));
        if (dx < dz) {
          if (p.x > min.x) { p.x = max.x + radius; } else { p.x = min.x - radius; }
          if (bounceAxis && velocityRef) velocityRef.x *= -1;
        } else {
          if (p.z > min.z) { p.z = max.z + radius; } else { p.z = min.z - radius; }
          if (bounceAxis && velocityRef) velocityRef.z *= -1;
        }
      }
    },
    clampPlayerBounds(game){
      if (!game.currentRoom) return;
      const origin = game.currentRoom.origin;
      const halfW = game.CONFIG.ROOM_WIDTH / 2 - 1; const halfD = game.CONFIG.ROOM_DEPTH / 2 - 1;
      const p = game.player.mesh.position;
      p.x = Math.max(origin.x - halfW, Math.min(origin.x + halfW, p.x));
      p.z = Math.max(origin.z - halfD, Math.min(origin.z + halfD, p.z));
    },
    clampEntityBounds(game, entity){
      if (!game.currentRoom) return;
      const origin = game.currentRoom.origin;
      const halfW = game.CONFIG.ROOM_WIDTH / 2 - 1; const halfD = game.CONFIG.ROOM_DEPTH / 2 - 1;
      entity.position.x = Math.max(origin.x - halfW, Math.min(origin.x + halfW, entity.position.x));
      entity.position.z = Math.max(origin.z - halfD, Math.min(origin.z + halfD, entity.position.z));
    }
  };
})();