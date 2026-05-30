const fs = require('fs');
const path = require('path');

const targetDir = 'c:/Users/bagia/Desktop/Daemon Dungeon/Daemon-Dungeon/src/data/rooms/Extreme/';
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const rooms = [
  {
    id: "room_extreme_04_toxic_deathrun",
    name: "Toxic Deathrun",
    layout: [
      "###############", // 0
      "#.......#.....#", // 1
      "#.#####.#.###.#", // 2
      "#.#...#.#.#...#", // 3
      "#.#.P.#.#.#.P.#", // 4
      "#.#.P.#...#.P.#", // 5
      "#.#.PPPPPPP.P.#", // 6
      "#.#.........#.#", // 7
      "#.###########.#", // 8
      "#......^......#", // 9
      "#....^^^^^....#", // 10
      "#...^^^^^^^...#", // 11
      "#....^^^^^....#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 7, y: 3, enemyType: "prefire_sentinel" },
      { x: 3, y: 4, enemyType: "healer" },
      { x: 11, y: 4, enemyType: "fuyard" },
      { x: 1, y: 4, enemyType: "zombie_fast" },
      { x: 13, y: 4, enemyType: "zombie_fast" },
      { x: 7, y: 5, enemyType: "bullet_hell" }
    ]
  },
  {
    id: "room_extreme_05_bullet_spree",
    name: "Bullet Spree Pit",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..VVVV.VVVV..#", // 2
      "#..V.......V..#", // 3
      "#..V..^^^..V..#", // 4
      "#..V..^.^..V..#", // 5
      "#..V..^^^..V..#", // 6
      "#..V.......V..#", // 7
      "#..VVVV.VVVV..#", // 8
      "#......P......#", // 9
      "#..#########..#", // 10
      "#.............#", // 11
      "#....^^^^^....#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 7, y: 5, enemyType: "bullet_hell" },
      { x: 7, y: 3, enemyType: "healer" },
      { x: 4, y: 3, enemyType: "prefire_sentinel" },
      { x: 10, y: 3, enemyType: "prefire_sentinel" },
      { x: 2, y: 11, enemyType: "zombie_fast" },
      { x: 12, y: 11, enemyType: "zombie_fast" },
      { x: 7, y: 1, enemyType: "bull" }
    ]
  },
  {
    id: "room_extreme_06_lava_bridge",
    name: "Lava Bridge",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..VVVV.VVVV..#", // 2
      "#..V.......V..#", // 3
      "#..V.^^^^^.V..#", // 4
      "#..V.^...^.V..#", // 5
      "#..V.^.#.^.V..#", // 6
      "#..V.^...^.V..#", // 7
      "#..V.^^^^^.V..#", // 8
      "#..V.......V..#", // 9
      "#..VVVV.VVVV..#", // 10
      "#.............#", // 11
      "#....PPPPP....#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 7, y: 5, enemyType: "prefire_sentinel" },
      { x: 5, y: 5, enemyType: "artificer" },
      { x: 9, y: 5, enemyType: "artificer" },
      { x: 7, y: 3, enemyType: "healer" },
      { x: 4, y: 9, enemyType: "zombie_fast" },
      { x: 10, y: 9, enemyType: "zombie_fast" },
      { x: 7, y: 11, enemyType: "bull" }
    ]
  },
  {
    id: "room_extreme_07_laser_gauntlet",
    name: "Laser Gauntlet",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..###...###..#", // 2
      "#..#P#...#P#..#", // 3
      "#..###...###..#", // 4
      "#.............#", // 5
      "#....#####....#", // 6
      "#....#...#....#", // 7
      "#....##.##....#", // 8
      "#.............#", // 9
      "#..###...###..#", // 10
      "#..#P#...#P#..#", // 11
      "#..###...###..#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 2, y: 5, enemyType: "bullet_hell" },
      { x: 12, y: 5, enemyType: "bullet_hell" },
      { x: 7, y: 7, enemyType: "artificer" },
      { x: 7, y: 2, enemyType: "healer" },
      { x: 3, y: 9, enemyType: "zombie_fast" },
      { x: 11, y: 9, enemyType: "zombie_fast" },
      { x: 7, y: 11, enemyType: "prefire_sentinel" }
    ]
  },
  {
    id: "room_extreme_08_swarm_panic",
    name: "Swarm Hazard Panic",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..P...^...P..#", // 2
      "#..P...^...P..#", // 3
      "#..PP.^^^.PP..#", // 4
      "#.............#", // 5
      "#..VVV...VVV..#", // 6
      "#..V.......V..#", // 7
      "#..VVV...VVV..#", // 8
      "#.............#", // 9
      "#..PP.^^^.PP..#", // 10
      "#..P...^...P..#", // 11
      "#..P...^...P..#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 7, y: 5, enemyType: "swarm_coordinator" },
      { x: 5, y: 5, enemyType: "healer" },
      { x: 9, y: 5, enemyType: "healer" },
      { x: 3, y: 3, enemyType: "zombie_fast" },
      { x: 11, y: 3, enemyType: "zombie_fast" },
      { x: 3, y: 11, enemyType: "zombie_fast" },
      { x: 11, y: 11, enemyType: "zombie_fast" },
      { x: 7, y: 1, enemyType: "bull" }
    ]
  },
  {
    id: "room_extreme_09_deadly_cross",
    name: "Deadly Void Cross",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..VVV...VVV..#", // 2
      "#..VVV...VVV..#", // 3
      "#..VVV...VVV..#", // 4
      "#.............#", // 5
      "#..###...###..#", // 6
      "#......P......#", // 7
      "#..###...###..#", // 8
      "#.............#", // 9
      "#..VVV...VVV..#", // 10
      "#..VVV...VVV..#", // 11
      "#..VVV...VVV..#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 2, y: 2, enemyType: "prefire_sentinel" },
      { x: 12, y: 2, enemyType: "prefire_sentinel" },
      { x: 2, y: 12, enemyType: "mage_missile" },
      { x: 12, y: 12, enemyType: "mage_missile" },
      { x: 7, y: 5, enemyType: "healer" },
      { x: 7, y: 1, enemyType: "jumper" },
      { x: 2, y: 5, enemyType: "zombie_fast" },
      { x: 12, y: 5, enemyType: "zombie_fast" }
    ]
  },
  {
    id: "room_extreme_10_jumper_hell",
    name: "Jumper Spike Bed",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..^^^^^^^^^..#", // 2
      "#..^.......^..#", // 3
      "#..^..###..^..#", // 4
      "#..^..#.#..^..#", // 5
      "#..^..#.#..^..#", // 6  -- broken bottom wall (replaced ### with #.#)
      "#..^.......^..#", // 7
      "#..^^^^^^^^^..#", // 8
      "#.............#", // 9
      "#....PPPPP....#", // 10
      "#.............#", // 11
      "#...#######...#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 5, y: 5, enemyType: "jumper" },
      { x: 9, y: 5, enemyType: "jumper" },
      { x: 7, y: 5, enemyType: "healer" },
      { x: 3, y: 3, enemyType: "zombie_fast" },
      { x: 11, y: 3, enemyType: "zombie_fast" },
      { x: 7, y: 1, enemyType: "bull" },
      { x: 7, y: 9, enemyType: "artificer" }
    ]
  },
  {
    id: "room_extreme_11_strategist_fortress",
    name: "Strategist Fortress",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..PP.###.PP..#", // 2
      "#..P.......P..#", // 3
      "#..P.VV.VV.P..#", // 4
      "#..P.......P..#", // 5
      "#..PP.###.PP..#", // 6
      "#.............#", // 7
      "#....VVVVV....#", // 8
      "#.............#", // 9
      "#..#########..#", // 10
      "#.............#", // 11
      "#....^^^^^....#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 4, y: 5, enemyType: "strategist" },
      { x: 10, y: 5, enemyType: "strategist" },
      { x: 7, y: 3, enemyType: "bullet_hell" },
      { x: 7, y: 5, enemyType: "healer" },
      { x: 2, y: 9, enemyType: "zombie_fast" },
      { x: 12, y: 9, enemyType: "zombie_fast" },
      { x: 7, y: 11, enemyType: "bull" }
    ]
  },
  {
    id: "room_extreme_12_artificer_minefield",
    name: "Artificer Minefield",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..P.^.P.^.P..#", // 2
      "#..^.P.^.P.^..#", // 3
      "#..P.^.P.^.P..#", // 4
      "#.............#", // 5
      "#..VVV...VVV..#", // 6
      "#..V.......V..#", // 7
      "#..VVV...VVV..#", // 8
      "#.............#", // 9
      "#..P.^.P.^.P..#", // 10
      "#..^.P.^.P.^..#", // 11
      "#..P.^.P.^.P..#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 4, y: 3, enemyType: "artificer" },
      { x: 10, y: 3, enemyType: "artificer" },
      { x: 7, y: 3, enemyType: "bullet_hell" },
      { x: 7, y: 7, enemyType: "healer" },
      { x: 2, y: 11, enemyType: "zombie_fast" },
      { x: 12, y: 11, enemyType: "zombie_fast" },
      { x: 7, y: 13, enemyType: "bull" }
    ]
  },
  {
    id: "room_extreme_13_apocalyptic_void",
    name: "Apocalyptic Void Bridge",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..VVV.P.VVV..#", // 2
      "#..V.......V..#", // 3
      "#..V.^^^^^.V..#", // 4
      "#..V.^...^.V..#", // 5
      "#..V.^.V.^.V..#", // 6
      "#..V.^...^.V..#", // 7
      "#..V.^^^^^.V..#", // 8
      "#..V.......V..#", // 9
      "#..VVV.P.VVV..#", // 10
      "#.............#", // 11
      "#...#######...#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 7, y: 5, enemyType: "prefire_sentinel" },
      { x: 7, y: 3, enemyType: "bullet_hell" },
      { x: 5, y: 5, enemyType: "artificer" },
      { x: 9, y: 5, enemyType: "artificer" },
      { x: 7, y: 7, enemyType: "healer" },
      { x: 2, y: 11, enemyType: "zombie_fast" },
      { x: 12, y: 11, enemyType: "zombie_fast" },
      { x: 7, y: 1, enemyType: "bull" }
    ]
  }
];

// Helper to verify reachability from player spawn point [7, 13]
function checkReachability(layout, spawnPoints, roomId) {
  const height = layout.length;
  const width = layout[0].length;
  const playerX = 7;
  const playerY = 13;

  // BFS Queue
  const queue = [[playerX, playerY]];
  const visited = new Set([`${playerX},${playerY}`]);

  while (queue.length > 0) {
    const [cx, cy] = queue.shift();

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const char = layout[ny][nx];
        // Walkable if floor '.', spikes '^', poison 'P', player/enemy start points 'M','R','S','E'
        const isWalkable = ['.', '^', 'P', 'M', 'R', 'S', 'E'].includes(char);
        const key = `${nx},${ny}`;
        if (isWalkable && !visited.has(key)) {
          visited.add(key);
          queue.push([nx, ny]);
        }
      }
    }
  }

  // Verify all spawn points are visited
  spawnPoints.forEach((sp, idx) => {
    if (!visited.has(`${sp.x},${sp.y}`)) {
      throw new Error(`CRITICAL ACCESSIBILITY ERROR: Room ${roomId} enemy spawn point ${idx} (${sp.enemyType}) at [${sp.x}, ${sp.y}] is unreachable from player spawn point [7, 13]!`);
    }
  });
}

console.log('=== STARTING EXTREME ROOM VALIDATION ===');

rooms.forEach((room, roomIdx) => {
  console.log(`Validating room [${room.id}]...`);
  
  // Layout size checks
  if (room.layout.length !== 15) {
    throw new Error(`Room ${room.id} layout must have exactly 15 rows. Got ${room.layout.length}`);
  }
  room.layout.forEach((row, rowIdx) => {
    if (row.length !== 15) {
      throw new Error(`Room ${room.id} layout row ${rowIdx} must have exactly 15 columns. Got ${row.length}`);
    }
    // Border wall checks
    if (rowIdx === 0 || rowIdx === 14) {
      if (row !== '###############') {
        throw new Error(`Room ${room.id} layout row ${rowIdx} must be entirely walls (#). Got "${row}"`);
      }
    } else {
      if (row[0] !== '#' || row[14] !== '#') {
        throw new Error(`Room ${room.id} layout row ${rowIdx} must have wall borders (#) at start and end. Got "${row}"`);
      }
    }
  });

  // SpawnPoint checks
  if (!room.spawnPoints || room.spawnPoints.length === 0) {
    throw new Error(`Room ${room.id} has no spawnPoints!`);
  }
  
  room.spawnPoints.forEach((sp, spIdx) => {
    // Int check
    if (!Number.isInteger(sp.x) || !Number.isInteger(sp.y)) {
      throw new Error(`Room ${room.id} spawnPoint ${spIdx} (${sp.enemyType}) must have integer x and y. Got x=${sp.x}, y=${sp.y}`);
    }
    // Border boundary check
    if (sp.x <= 0 || sp.x >= 14 || sp.y <= 0 || sp.y >= 14) {
      throw new Error(`Room ${room.id} spawnPoint ${spIdx} (${sp.enemyType}) is out of inner boundaries (1-13). Got x=${sp.x}, y=${sp.y}`);
    }
    // Walkability check
    const char = room.layout[sp.y][sp.x];
    if (char === '#' || char === 'V') {
      throw new Error(`CRITICAL DESIGN ERROR: Room ${room.id} places enemy "${sp.enemyType}" at x=${sp.x}, y=${sp.y} which corresponds to "${char}" (wall or void)!`);
    }
  });

  // Reachability check
  checkReachability(room.layout, room.spawnPoints, room.id);
  console.log(`Room [${room.id}] is 100% VALID and ACCESSIBLE!`);
});

console.log('\n=== WRITING EXTREME ROOMS TO FILES ===');
rooms.forEach((room) => {
  const formattedRoom = {
    id: room.id,
    name: room.name,
    layout: room.layout,
    spawnPoints: room.spawnPoints,
    friendlySpawnPoints: [],
    obstacles: []
  };
  const filePath = path.join(targetDir, `${room.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(formattedRoom, null, 2), 'utf-8');
  console.log(`Saved: ${filePath}`);
});

console.log('\n=== 10 EXTREME ROOMS SUCCESSFULLY GENERATED AND SAVED ===');
