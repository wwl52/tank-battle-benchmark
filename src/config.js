// Central configuration. All tunable gameplay constants live here.
export const CELL = 16;            // map cell size in logical pixels
export const GRID = 26;            // map is GRID x GRID cells
export const TANK = 32;            // tank hitbox size (2 cells)
export const BULLET_W = 6;
export const BULLET_H = 6;
export const MAP_PX = CELL * GRID; // 416
export const SIDEBAR_PX = 96;
export const CANVAS_W = MAP_PX + SIDEBAR_PX; // 512
export const CANVAS_H = MAP_PX;              // 416

export const TICK_HZ = 60;
export const TICK_DT = 1 / TICK_HZ;
export const MAX_FRAME_CATCHUP = 8; // max logic ticks simulated per rendered frame

export const VERSION = '1.0.0';

export const TERRAIN = {
  EMPTY: 0,
  BRICK: 1,
  STEEL: 2,
  WATER: 3,
  GRASS: 4,
  ICE: 5,
  BASE: 6,
  BASE_WRECK: 7,
};

export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const PLAYER = {
  speed: 52,            // px per second
  hitbox: TANK,
  maxBulletsBase: 1,
  maxBulletsByLevel: [1, 1, 2, 2],
  bulletSpeedByLevel: [110, 160, 160, 190],
  fireCooldownBase: 0.34,
  fireCooldownL2Plus: 0.22,
  respawnShieldTicks: TICK_HZ * 3,
  powerupShieldTicks: TICK_HZ * 10,
  stunTicks: Math.round(TICK_HZ * 0.5), // hit by friendly player bullet
  respawnDelayTicks: TICK_HZ * 1.2,
  livesStart: 3,
  extraLifeEveryScore: 20000,
  maxPowerLevel: 3,
};

export const ENEMY = {
  speed: {
    basic: 28,
    fast: 66,
    power: 26,
    armor: 22,
  },
  hp: { basic: 1, fast: 1, power: 1, armor: 4 },
  fireCooldown: { basic: 1.6, fast: 2.0, power: 0.9, armor: 1.5 },
  bulletSpeed: { basic: 90, fast: 90, power: 150, armor: 90 },
  score: { basic: 100, fast: 200, power: 300, armor: 400 },
  maxActive: 4,
  spawnInterval: 1.6,     // seconds between spawns
  spawnShieldTicks: TICK_HZ * 2.2,
  spawnLengthTicks: TICK_HZ * 1.1,
  countPerLevel: 20,
  powerupCarriers: 4,     // carriers among the 20 enemies
};

export const BULLET = {
  step: 4,               // max px per collision sub-step (prevents tunneling)
  powerPlayerL3: 2,      // destroys steel
  powerDefault: 1,
};

export const POWERUP = {
  types: ['star', 'shield', 'clock', 'shovel', 'grenade', 'life', 'laser', 'rapid', 'scatter'],
  score: 500,
  lifeTicks: TICK_HZ * 10,
  shovelTicks: TICK_HZ * 18,
  clockTicks: TICK_HZ * 10,
  blinkTicks: TICK_HZ * 3,
  // weapon-class pickups (special effect powers)
  weapon: {
    rapidTicks: TICK_HZ * 10,   // machine-gun duration
    rapidCooldown: 0.12,        // s between shots while active (≈4x faster)
    rapidSpeedMult: 1.8,        // bullet speed multiplier while active
    scatterTicks: TICK_HZ * 12, // triple-shot duration
    scatterSpread: 8,           // half-shells sit 8 px perpendicular to the centre shell
    scatterBudget: 9,           // live-bullet cap while spreading (3 shots x 3 shells)
    beamDur: 14,                // laser beam visual fade ticks
  },
};

export const ICE = {
  slideTicks: 20,        // ~0.33 s of continued sliding on ice
};

export const FLOW = {
  stageIntroTicks: TICK_HZ * 2.0,
  stageClearTicks: TICK_HZ * 2.0,
  scoreSummaryTicks: TICK_HZ * 3.0,
  gameOverTicks: TICK_HZ * 5.0,
  victoryTicks: TICK_HZ * 99999,
  respawnTicks: PLAYER.respawnDelayTicks,
  demoLengthTicks: TICK_HZ * 999999,
};

export const TOTAL_LEVELS = 35;
