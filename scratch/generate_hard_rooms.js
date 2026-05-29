const fs = require('fs');
const path = require('path');

const targetDir = 'c:/Users/bagia/Desktop/Daemon Dungeon/Daemon-Dungeon/src/data/rooms/ai_rooms/';
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Helper symbols
// # = Wall
// . = Floor
// V = Void
// ^ = Spikes (walkable floor hazard)
// P = Poison (walkable floor hazard)

const rooms = [
  {
    id: "room_ai_36_prefire_fortress",
    name: "AI Prefire Fortress",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..VVVV.VVVV..#", // 2
      "#..V.......V..#", // 3
      "#..V.......V..#", // 4
      "#..V.......V..#", // 5
      "#..VVVV.VVVV..#", // 6
      "#......#......#", // 7
      "#..P.......P..#", // 8
      "#.............#", // 9
      "#...#######...#", // 10
      "#.............#", // 11
      "#....P...P....#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 5, y: 4, enemyType: "prefire_sentinel" },
      { x: 9, y: 4, enemyType: "prefire_sentinel" },
      { x: 7, y: 5, enemyType: "healer" },
      { x: 3, y: 9, enemyType: "zombie_fast" },
      { x: 11, y: 9, enemyType: "zombie_fast" },
      { x: 7, y: 12, enemyType: "bull" }
    ]
  },
  {
    id: "room_ai_37_bullet_rain_arena",
    name: "AI Bullet Rain Arena",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..#.......#..#", // 2
      "#.............#", // 3
      "#...VVV.VVV...#", // 4
      "#...V.....V...#", // 5
      "#...VVV.VVV...#", // 6
      "#.............#", // 7
      "#..S.......S..#", // 8
      "#...P.....P...#", // 9
      "#.............#", // 10
      "#....#####....#", // 11
      "#.............#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 3, y: 3, enemyType: "bullet_hell" },
      { x: 11, y: 3, enemyType: "bullet_hell" },
      { x: 7, y: 5, enemyType: "healer" },
      { x: 4, y: 10, enemyType: "zombie_fast" },
      { x: 10, y: 10, enemyType: "zombie_fast" },
      { x: 7, y: 12, enemyType: "jumper" }
    ]
  },
  {
    id: "room_ai_38_acid_trench",
    name: "AI Acid Trench",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..PPPP.PPPP..#", // 2
      "#..P.......P..#", // 3
      "#..P..VVV..P..#", // 4
      "#..P..V.V..P..#", // 5
      "#..P..VVV..P..#", // 6
      "#..P.......P..#", // 7
      "#..PPPP.PPPP..#", // 8
      "#.............#", // 9
      "#..#.......#..#", // 10
      "#.............#", // 11
      "#.............#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 5, y: 5, enemyType: "artificer" },
      { x: 9, y: 5, enemyType: "artificer" },
      { x: 7, y: 7, enemyType: "healer" },
      { x: 2, y: 10, enemyType: "fuyard" },
      { x: 12, y: 10, enemyType: "fuyard" }
    ]
  },
  {
    id: "room_ai_39_maze_of_the_sniper",
    name: "AI Sniper Maze",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#.#######.###.#", // 2
      "#.#.......#...#", // 3
      "#.#.#####.#.#.#", // 4
      "#.#.#...#.#.#.#", // 5
      "#.#.#.#.#.#.#.#", // 6
      "#...#.#...#.#.#", // 7
      "#.###.#####.###", // 8
      "#.............#", // 9
      "#.###########.#", // 10
      "#.............#", // 11
      "#..P.......P..#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 3, y: 3, enemyType: "prefire_sentinel" },
      { x: 11, y: 3, enemyType: "prefire_sentinel" },
      { x: 7, y: 5, enemyType: "healer" },
      { x: 2, y: 11, enemyType: "zombie_fast" },
      { x: 12, y: 11, enemyType: "zombie_fast" },
      { x: 7, y: 13, enemyType: "strategist" }
    ]
  },
  {
    id: "room_ai_40_jumpers_spikes",
    name: "AI Jumpers and Spikes",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..VVVV.VVVV..#", // 2
      "#..V.......V..#", // 3
      "#..V..^^^..V..#", // 4
      "#..V..^^^..V..#", // 5
      "#..V..^^^..V..#", // 6
      "#..V.......V..#", // 7
      "#..VVVV.VVVV..#", // 8
      "#.............#", // 9
      "#..P.......P..#", // 10
      "#.............#", // 11
      "#...#######...#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 5, y: 5, enemyType: "jumper" },
      { x: 9, y: 5, enemyType: "jumper" },
      { x: 7, y: 5, enemyType: "healer" },
      { x: 3, y: 9, enemyType: "zombie_fast" },
      { x: 11, y: 9, enemyType: "zombie_fast" },
      { x: 7, y: 11, enemyType: "jumper" }
    ]
  },
  {
    id: "room_ai_41_bullet_sentry_crossroad",
    name: "AI Sentry Crossroad",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#......#......#", // 2
      "#....VV.VV....#", // 3
      "#....V...V....#", // 4
      "#..###...###..#", // 5
      "#..V.......V..#", // 6
      "#......#......#", // 7
      "#..V.......V..#", // 8
      "#..###...###..#", // 9
      "#....V...V....#", // 10
      "#....VV.VV....#", // 11
      "#......#......#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 3, y: 4, enemyType: "bullet_hell" },
      { x: 11, y: 4, enemyType: "bullet_hell" },
      { x: 7, y: 6, enemyType: "healer" },
      { x: 2, y: 6, enemyType: "fuyard" },
      { x: 12, y: 6, enemyType: "fuyard" },
      { x: 7, y: 10, enemyType: "turret" }
    ]
  },
  {
    id: "room_ai_42_stampede_fire",
    name: "AI Stampede and Fire",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..#########..#", // 2
      "#.............#", // 3
      "#..VVVV.VVVV..#", // 4
      "#..V.......V..#", // 5
      "#..V..###..V..#", // 6
      "#..V..#.#..V..#", // 7
      "#..V..###..V..#", // 8
      "#..V.......V..#", // 9
      "#..VVVV.VVVV..#", // 10
      "#.............#", // 11
      "#..P.......P..#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 7, y: 5, enemyType: "artificer" },
      { x: 2, y: 5, enemyType: "bull" },
      { x: 12, y: 5, enemyType: "bull" },
      { x: 5, y: 9, enemyType: "healer" },
      { x: 9, y: 9, enemyType: "healer" },
      { x: 7, y: 12, enemyType: "bull" }
    ]
  },
  {
    id: "room_ai_43_swarm_corridor",
    name: "AI Swarm Corridor",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..VVVVVVVVV..#", // 2
      "#..V.......V..#", // 3
      "#..V..###..V..#", // 4
      "#.....#.#.....#", // 5
      "#..V..###..V..#", // 6
      "#..V.......V..#", // 7
      "#..VVVVVVVVV..#", // 8
      "#.............#", // 9
      "#..S.......S..#", // 10
      "#.............#", // 11
      "#....#####....#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 7, y: 3, enemyType: "swarm_coordinator" },
      { x: 4, y: 3, enemyType: "zombie_fast" },
      { x: 10, y: 3, enemyType: "zombie_fast" },
      { x: 5, y: 7, enemyType: "healer" },
      { x: 9, y: 7, enemyType: "healer" },
      { x: 7, y: 11, enemyType: "zombie_fast" }
    ]
  },
  {
    id: "room_ai_44_poison_matrix",
    name: "AI Poison Matrix",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..P.P.P.P.P..#", // 2
      "#..P.P.P.P.P..#", // 3
      "#..P.P.P.P.P..#", // 4
      "#..P.P.P.P.P..#", // 5
      "#..P.P.P.P.P..#", // 6
      "#..P.P.P.P.P..#", // 7
      "#..P.P.P.P.P..#", // 8
      "#.............#", // 9
      "#..#.......#..#", // 10
      "#.............#", // 11
      "#....P...P....#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 3, y: 3, enemyType: "mage_missile" },
      { x: 11, y: 3, enemyType: "mage_missile" },
      { x: 7, y: 5, enemyType: "healer" },
      { x: 5, y: 7, enemyType: "zombie_fast" },
      { x: 9, y: 7, enemyType: "zombie_fast" }
    ]
  },
  {
    id: "room_ai_45_sniper_gateway",
    name: "AI Sniper Gateway",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..VVV...VVV..#", // 2
      "#..V.......V..#", // 3
      "#..V..###..V..#", // 4
      "#..V..#.#..V..#", // 5
      "#..V..###..V..#", // 6
      "#..V.......V..#", // 7
      "#..VVV...VVV..#", // 8
      "#......#......#", // 9
      "#..P.......P..#", // 10
      "#.............#", // 11
      "#....#####....#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 4, y: 3, enemyType: "prefire_sentinel" },
      { x: 10, y: 3, enemyType: "prefire_sentinel" },
      { x: 7, y: 7, enemyType: "healer" },
      { x: 2, y: 10, enemyType: "zombie_fast" },
      { x: 12, y: 10, enemyType: "zombie_fast" },
      { x: 7, y: 11, enemyType: "bull" }
    ]
  },
  {
    id: "room_ai_46_gauntlet_of_fire",
    name: "AI Gauntlet of Fire",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..#..#..#..#.#", // 2  -- 15 chars
      "#.............#", // 3  -- 15 chars
      "#..P..P..P..P.#", // 4  -- 15 chars
      "#..P..P..P..P.#", // 5  -- 15 chars
      "#..P..P..P..P.#", // 6  -- 15 chars
      "#..P..P..P..P.#", // 7  -- 15 chars
      "#..P..P..P..P.#", // 8  -- 15 chars
      "#..P..P..P..P.#", // 9  -- 15 chars
      "#..P..P..P..P.#", // 10 -- 15 chars
      "#.............#", // 11 -- 15 chars
      "#..#..#..#..#.#", // 12 -- 15 chars
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 3, y: 5, enemyType: "artificer" },
      { x: 6, y: 5, enemyType: "bullet_hell" },
      { x: 9, y: 5, enemyType: "artificer" },
      { x: 1, y: 11, enemyType: "zombie_fast" },
      { x: 13, y: 11, enemyType: "zombie_fast" },
      { x: 7, y: 11, enemyType: "healer" }
    ]
  },
  {
    id: "room_ai_47_bounce_chamber",
    name: "AI Bounce Chamber",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..#...#...#..#", // 2
      "#.............#", // 3
      "#..#...#...#..#", // 4
      "#.............#", // 5
      "#..#...#...#..#", // 6
      "#.............#", // 7
      "#..#...#...#..#", // 8
      "#.............#", // 9
      "#..#.......#..#", // 10
      "#.............#", // 11
      "#..P.......P..#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 3, y: 3, enemyType: "sentinel" },
      { x: 11, y: 3, enemyType: "sentinel" },
      { x: 7, y: 5, enemyType: "pong" },
      { x: 7, y: 1, enemyType: "healer" }, 
      { x: 3, y: 9, enemyType: "pong" },
      { x: 11, y: 9, enemyType: "pong" }
    ]
  },
  {
    id: "room_ai_48_skirmish_ring",
    name: "AI Skirmish Ring",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#....VVVVV....#", // 2
      "#...VV...VV...#", // 3
      "#..VV.....VV..#", // 4
      "#..V..###..V..#", // 5
      "#..VV..#..VV..#", // 6
      "#...VV...VV...#", // 7
      "#....VVVVV....#", // 8
      "#.............#", // 9
      "#...#######...#", // 10
      "#.............#", // 11
      "#....P...P....#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 7, y: 1, enemyType: "mage_missile" },
      { x: 7, y: 9, enemyType: "healer" },
      { x: 2, y: 5, enemyType: "strategist" },
      { x: 12, y: 5, enemyType: "strategist" },
      { x: 7, y: 12, enemyType: "strategist" }
    ]
  },
  {
    id: "room_ai_49_mortar_trench",
    name: "AI Mortar Trench",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..VVVVVVVVV..#", // 2
      "#..V.......V..#", // 3
      "#..V..^^^..V..#", // 4
      "#..V..^^^..V..#", // 5
      "#..V..^^^..V..#", // 6
      "#..V.......V..#", // 7
      "#..VVVVVVVVV..#", // 8
      "#.............#", // 9
      "#..P.......P..#", // 10
      "#.............#", // 11
      "#....#####....#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 5, y: 5, enemyType: "artificer" },
      { x: 9, y: 5, enemyType: "artificer" },
      { x: 7, y: 5, enemyType: "turret" },
      { x: 3, y: 10, enemyType: "healer" },
      { x: 11, y: 10, enemyType: "healer" },
      { x: 7, y: 11, enemyType: "zombie_fast" }
    ]
  },
  {
    id: "room_ai_50_split_corridor",
    name: "AI Split Corridor",
    layout: [
      "###############", // 0
      "#......#......#", // 1
      "#......#......#", // 2
      "#..VV..#..VV..#", // 3
      "#..VV..#..VV..#", // 4
      "#......#......#", // 5
      "#......#......#", // 6
      "#......#......#", // 7
      "#..PP..#..PP..#", // 8
      "#..PP..#..PP..#", // 9
      "#......#......#", // 10
      "#......#......#", // 11
      "#...#######...#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 2, y: 5, enemyType: "bullet_hell" },
      { x: 12, y: 5, enemyType: "zombie_fast" },
      { x: 11, y: 6, enemyType: "zombie_fast" },
      { x: 3, y: 8, enemyType: "healer" },
      { x: 11, y: 8, enemyType: "healer" },
      { x: 7, y: 13, enemyType: "strategist" }
    ]
  },
  {
    id: "room_ai_51_spiky_deathpit",
    name: "AI Spiky Deathpit",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..^^^^^^^^^..#", // 2
      "#..^.......^..#", // 3
      "#..^.#####.^..#", // 4
      "#..^.#...#.^..#", // 5
      "#..^.#...#.^..#", // 6
      "#..^.#####.^..#", // 7
      "#..^^^^^^^^^..#", // 8
      "#.............#", // 9
      "#..P.......P..#", // 10
      "#.............#", // 11
      "#....#####....#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 7, y: 5, enemyType: "jumper" },
      { x: 3, y: 5, enemyType: "bull" },
      { x: 11, y: 5, enemyType: "bull" },
      { x: 4, y: 3, enemyType: "healer" },
      { x: 10, y: 3, enemyType: "healer" },
      { x: 7, y: 9, enemyType: "jumper" }
    ]
  },
  {
    id: "room_ai_52_missile_command",
    name: "AI Missile Command",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..###.##.###.#", // 2  -- 15 chars
      "#..#.#..#..#..#", // 3  -- 15 chars
      "#..###.##.###.#", // 4  -- 15 chars
      "#.............#", // 5  -- 15 chars
      "#....VV.VV....#", // 6
      "#....V...V....#", // 7
      "#....VV.VV....#", // 8
      "#.............#", // 9  -- 15 chars
      "#..P.......P..#", // 10
      "#.............#", // 11 -- 15 chars
      "#...#######...#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 2, y: 3, enemyType: "mage_missile" },
      { x: 6, y: 3, enemyType: "mage_missile" },
      { x: 10, y: 3, enemyType: "mage_missile" },
      { x: 5, y: 5, enemyType: "healer" },
      { x: 9, y: 5, enemyType: "healer" },
      { x: 7, y: 11, enemyType: "zombie_fast" }
    ]
  },
  {
    id: "room_ai_53_chaos_cross",
    name: "AI Chaos Cross",
    layout: [
      "###############", // 0
      "#......#......#", // 1
      "#..VV..#..PP..#", // 2
      "#..VV..#..PP..#", // 3
      "#......#......#", // 4
      "########.######", // 5
      "#......#......#", // 6
      "#......#......#", // 7
      "#......#......#", // 8
      "########.######", // 9
      "#......#......#", // 10
      "#..PP..#..VV..#", // 11
      "#..PP..#..VV..#", // 12
      "#......#......#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 2, y: 4, enemyType: "prefire_sentinel" },
      { x: 3, y: 4, enemyType: "healer" },
      { x: 11, y: 2, enemyType: "bullet_hell" },
      { x: 12, y: 10, enemyType: "artificer" },
      { x: 3, y: 12, enemyType: "bull" },
      { x: 3, y: 10, enemyType: "zombie_fast" }
    ]
  },
  {
    id: "room_ai_54_evasive_circle",
    name: "AI Evasive Circle",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#....#####....#", // 2
      "#.............#", // 3
      "#..##.....##..#", // 4
      "#.............#", // 5
      "#..#.......#..#", // 6
      "#..#..VVV..#..#", // 7
      "#..#.......#..#", // 8
      "#.............#", // 9
      "#..##.....##..#", // 10
      "#.............#", // 11
      "#....#####....#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 3, y: 3, enemyType: "fuyard" },
      { x: 11, y: 3, enemyType: "fuyard" },
      { x: 7, y: 4, enemyType: "healer" },
      { x: 3, y: 9, enemyType: "pong" },
      { x: 11, y: 9, enemyType: "pong" },
      { x: 7, y: 11, enemyType: "strategist" }
    ]
  },
  {
    id: "room_ai_55_apocalypse_chamber",
    name: "AI Apocalypse Chamber",
    layout: [
      "###############", // 0
      "#.............#", // 1
      "#..VV.PPP.VV..#", // 2
      "#..V..P.P..V..#", // 3
      "#..V..PPP..V..#", // 4
      "#.............#", // 5
      "#....VV.VV....#", // 6
      "#....V...V....#", // 7
      "#....VV.VV....#", // 8
      "#.............#", // 9
      "#..P.......P..#", // 10
      "#.............#", // 11
      "#...#######...#", // 12
      "#.............#", // 13
      "###############"  // 14
    ],
    spawnPoints: [
      { x: 2, y: 5, enemyType: "bullet_hell" },
      { x: 12, y: 5, enemyType: "prefire_sentinel" },
      { x: 7, y: 3, enemyType: "artificer" },
      { x: 5, y: 5, enemyType: "healer" },
      { x: 9, y: 5, enemyType: "healer" },
      { x: 7, y: 11, enemyType: "bull" }
    ]
  }
];

// Strictly validate rooms to prevent spawning on walls or void
console.log('=== STARTING ROOM VALIDATION ===');
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
    console.log(` - Spawnpoint ${spIdx} (${sp.enemyType}) verified at floor tile [${sp.x}, ${sp.y}] ('${char}').`);
  });
  console.log(`Room [${room.id}] is 100% VALID!`);
});

console.log('\n=== WRITING ROOMS TO FILE ===');
rooms.forEach((room) => {
  // Format as required
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
  console.log(`Generated and saved: ${filePath}`);
});

console.log('\n=== ALL HARD AI ROOMS SUCCESSFULLY GENERATED ===');
