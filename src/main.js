import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { InputSystem } from './input.js';
import { AudioEngine } from './audio.js';
import { createStorage } from './storage.js';
import { startLoop } from './loop.js';
import { VERSION, TOTAL_LEVELS } from './config.js';

const canvas = document.querySelector('#game');

const storage = createStorage();
const audio = new AudioEngine(storage);
const input = new InputSystem();
const game = new Game({
  mode: storage.data.lastMode,
  seed: 4241,
  highScore: storage.data.highScore,
});
game.pStorage = storage;
game.pAudioMuted = audio.muted;
const renderer = new Renderer(game, canvas);

const STAGE_STATES = new Set(['STAGE_INTRO', 'PLAYING', 'PAUSED', 'PLAYER_RESPAWN', 'STAGE_CLEAR', 'SCORE_SUMMARY', 'GAME_OVER', 'VICTORY']);
const SFX_MAP = {
  'menu-confirm': 'menu-confirm',
  'stage-start': 'stage-start',
  'shoot-player': 'shoot-player',
  'shoot-enemy': 'shoot-enemy',
  'hit-brick': 'hit-brick',
  'hit-steel': 'hit-steel',
  'bullet-wall': 'bullet-wall',
  'tank-hit': 'tank-hit',
  'explosion-small': 'explosion-small',
  'explosion-big': 'explosion-big',
  'powerup-pickup': 'powerup-pickup',
  'player-death': 'player-death',
  'stage-clear': 'stage-clear',
  'score-summary': null,
  'game-over': 'game-over',
  'victory': 'victory',
  'pause': 'pause',
  'extra-life': 'extra-life',
  'shield-hit': 'shield-hit',
  'powerup-spawn': null,
  'powerup-expire': null,
  'freeze': 'freeze',
  'unfreeze': null,
  'shovel-start': 'shovel-start',
  'shovel-end': 'shovel-end',
  'laser-fire': 'laser-fire',
  'bullet-cancel': 'hit-steel',
  'friendly-stun': null,
  'state:': null, // handled below (state-change toasts are not sounds)
};

let audioReady = false;
function ensureAudio() {
  if (audioReady) return;
  audioReady = true;
  audio.ensure();
}

function ingestEvents() {
  let evs = game.events.splice(0, game.events.length);
  if (!evs.length) return;
  for (const ev of evs) {
    if (ev.startsWith('state:')) {
      if (game.machine.is('PAUSED')) audio.engineSilenceForPause();
      continue;
    }
    const sfx = SFX_MAP[ev] ?? null;
    if (sfx) audio.play(sfx);
    if (ev === 'stage-clear') storage.unlockLevel(Math.min(TOTAL_LEVELS, game.levelNum + 1));
    if (ev === 'stage-start') storage.setLastMode(game.mode);
    if (ev === 'clear-data') {
      storage.clear();
      game.highScore = 0;
    }
  }
  evs = null;
}

function syncHighScore() {
  for (const p of game.players) {
    if (p.score > storage.data.highScore) storage.setHighScore(p.score);
  }
}

// -- keyboard wiring ----------------------------------------------------------------

input.setActionSink((action) => {
  ensureAudio();
  if (action === 'pause') {
    if (game.machine.is('MAIN_MENU') || game.machine.is('HELP')) return;
    if (!game.pause()) game.resume();
    return;
  }
  if (action === 'restart') {
    if (STAGE_STATES.has(game.machine.state) && game.mode !== 'DEMO') game.restartStage();
    return;
  }
  if (action === 'mute') {
    audio.ensure();
    audio.toggleMute();
    game.pAudioMuted = audio.muted;
    return;
  }
  if (action === 'escape') {
    if (game.machine.is('HELP')) { game.closeHelp(); return; }
    if (game.mode === 'DEMO' || game.machine.is('PLAYING') || game.machine.is('PAUSED') ||
        game.machine.is('GAME_OVER') || game.machine.is('VICTORY') || game.machine.is('PLAYER_RESPAWN')) {
      game.toMenu();
    }
    return;
  }
  if (action === 'debug') {
    renderer.showDebug = !renderer.showDebug;
  }
});

input.setMenuSink((delta) => {
  ensureAudio();
  if (delta === 0) {
    game.menuConfirm();
  } else {
    game.menuMove(delta);
  }
});

// menu keys (W/S/ArrowUp/ArrowDown/Space/Enter) are only routed to the menu sink
// while the machine is really in the menu — otherwise they stay live for gameplay.
input.setMenuActive(() => game.machine.is('MAIN_MENU') || game.machine.is('HELP'));

// -- pause button (canvas-drawn, sidebar) ---------------------------------------------------
// The button rect is in canvas logical coordinates; the canvas gets CSS-scaled,
// so map screen coords -> canvas coords before hit-testing.
const stageState = () => !game.machine.is('MAIN_MENU') && !game.machine.is('HELP');

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height),
  };
}

function overPauseButton(e) {
  if (game.mode === 'DEMO' || !stageState()) return false;
  const p = canvasPoint(e);
  const b = Renderer.pauseButtonRect;
  return p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;
}

canvas.addEventListener('pointerdown', (e) => {
  ensureAudio();
  if (!overPauseButton(e)) return;
  if (!game.pause()) game.resume();
});

canvas.addEventListener('pointermove', (e) => {
  canvas.style.cursor = overPauseButton(e) ? 'pointer' : '';
});

// DEMO: any primary operation key throws the player back into the menu
input.attach();
window.addEventListener('keydown', (e) => {
  ensureAudio();
  if (game.mode === 'DEMO' && STAGE_STATES.has(game.machine.state) &&
      !['F5', 'F12', 'F2'].includes(e.code) && !(e.ctrlKey && e.key === 'r')) {
    game.toMenu();
  }
});
window.addEventListener('pointerdown', () => ensureAudio());
window.addEventListener('blur', () => {
  input.lossAll();                 // no stuck keys
  game.pause();                    // auto pause; user must resume manually
  audio.engineSilenceForPause();
});

// -- main loop -----------------------------------------------------------------------

let engineMoving = false;
const loop = startLoop({
  update(dt) {
    // feed live keyboard state for both players, merged with debug-injected input
    game.setPlayerInput(0, input.playerInput(0));
    game.setPlayerInput(1, input.playerInput(1));
    game.update(dt);
    ingestEvents();
    syncHighScore();
    if (STAGE_STATES.has(game.machine.state) && game.mode !== 'DEMO') {
      engineMoving = game.players.some(p => p.alive && p.engineSound);
      audio.setEngine(true, engineMoving);
    } else {
      audio.setEngine(false);
    }
  },
  render() {
    renderer.render();
  },
  onHidden() {
    game.pause(); // tab switch pauses; focus loss rule kept consistent
  },
});

// -- debug / automated-evaluation interface ---------------------------------------------

const debugParam = new URLSearchParams(window.location.search).get('debug');
if (debugParam === '1') {
  const api = {
    version: VERSION,
    game,
    startGame(options = {}) {
      game.resetGame();
      return game.startGame(options);
    },
    resetGame() { game.resetGame(); },
    pauseGame() { return game.pause(); },
    resumeGame() { return game.resume(); },
    stepFrames(frameCount) { game.stepFrames(frameCount); },
    setPlayerInput(playerId, inputState) { game.setPlayerInput(playerId, inputState); },
    getSnapshot() { return game.getSnapshot(); },
    spawnEnemy(type, position) { return game.spawnEnemy(type, position); },
    spawnPowerUp(type, position) { return !!game.spawnPowerUp(type, position); },
    damageTank(entityId, amount = 1) { return game.damageTank(entityId, amount); },
    destroyBase() { game.destroyBase(); },
    clearActiveEnemies() { game.clearActiveEnemies(); },
  };
  api.startGame = api.startGame.bind(api);
  window.__TANK_BATTLE_TEST__ = api;
}
