const fs = require('fs');
const configPath = 'c:/Users/bagia/Desktop/Daemon Dungeon/Daemon-Dungeon/src/data/config/enemies.json';
try {
  const content = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(content);
  for (const key in config) {
    if (config[key].baseStats) {
      if (typeof config[key].baseStats.hp === 'number') {
        config[key].baseStats.hp = Math.round(config[key].baseStats.hp / 1.2);
      }
      if (typeof config[key].baseStats.damage === 'number') {
        config[key].baseStats.damage = Math.round(config[key].baseStats.damage / 1.2);
      }
    }
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('Reverted enemies.json baseStats.');
} catch(e) {
  console.error(e);
}
