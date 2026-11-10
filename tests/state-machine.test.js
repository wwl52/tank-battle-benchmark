import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, run } from './helpers.mjs';
import { Game } from '../src/game.js';
import { FLOW, TOTAL_LEVELS } from '../src/config.js';

function clearStage(g) {
  // skip the whole queue and wipe active enemies -> triggers stage-clear logic
  g.spawnedCount = g.enemyQueue.length;
  g.clearActiveEnemies();
  run(g, 2);
}

test('stage pivot: all enemies gone -> STAGE_CLEAR -> SCORE_SUMMARY -> next stage', () => {
  const g = makeGame();
  run(g, 60 * 2 + 10);
  const lvl = g.levelNum;
  clearStage(g);
  assert.equal(g.machine.state, 'STAGE_CLEAR', 'stage clear entered');
  run(g, FLOW.stageClearTicks + 10);
  assert.equal(g.machine.state, 'SCORE_SUMMARY');
  run(g, FLOW.scoreSummaryTicks + 10);
  assert.equal(g.machine.state, 'STAGE_INTRO');
  assert.equal(g.levelNum, lvl + 1, 'advances to the next stage');
});

test('base destroyed -> GAME_OVER (and only then)', () => {
  const g = makeGame({ start: false });
  // fortify nothing, destroy the base during intro state: illegal from STAGE_INTRO
  g.startGame({});
  run(g, 60 * 2 + 10);
  assert.equal(g.machine.state, 'PLAYING');
  g.destroyBase();
  assert.equal(g.machine.state, 'GAME_OVER');
  run(g, FLOW.gameOverTicks + 30);
  assert.equal(g.machine.state, 'MAIN_MENU', 'auto-return to the menu after game over');
});

test('2P: one player can die and the game keeps going', () => {
  const g = new Game({ mode: '2P', seed: 555 });
  g.startGame({});
  run(g, 60 * 2 + 10);
  const p1 = g.players[0];
  p1.shieldTicks = 0;
  g.damageTank(0, 99);
  assert.equal(p1.alive, false);
  assert.equal(g.machine.state, 'PLAYING', '2P game continues after a single loss');
  run(g, 200);
  const p1respawned = g.players[0];
  assert.equal(p1respawned.alive || p1respawned.lives > 1, true, 'P1 respawns with remaining lives');
  assert.equal(g.machine.state, 'PLAYING');
});

test('2P: both players out of lives -> GAME_OVER', () => {
  const g = new Game({ mode: '2P', seed: 555 });
  g.startGame({});
  run(g, 60 * 2 + 10);
  let p1 = g.players[0];
  let p2 = g.players[1];
  for (let life = 0; life < 4; life++) {
    p1 = g.players[0]; p2 = g.players[1];
    if (g.machine.state !== 'PLAYING' && g.machine.state !== 'PLAYER_RESPAWN') break;
    if (p1.alive) { p1.shieldTicks = 0; g.damageTank(0, 99); }
    run(g, 130);
  }
  // P2 still has lives -> game must continue
  assert.notEqual(g.machine.state, 'GAME_OVER', 'P2 keeps the game alive');
  while (g.machine.state === 'PLAYING' || g.machine.state === 'PLAYER_RESPAWN') {
    p2 = g.players[1];
    if (p2.alive) { p2.shieldTicks = 0; g.damageTank(1, 99); }
    const before = g.machine.state;
    run(g, 1);
    run(g, 139);
    if (g.machine.state === before && before === 'PLAYING' && !g.players.some(p => p.alive || p.lives > 0)) {
      break;
    }
    if (g.machine.state === 'GAME_OVER') break;
  }
  assert.equal(g.machine.state, 'GAME_OVER', 'exhausting both squads ends the game');
});

test('stage 35 clear -> VICTORY', () => {
  const g = new Game({ mode: '1P', seed: 9 });
  g.startGame({ level: TOTAL_LEVELS });
  run(g, 60 * 2 + 10);
  clearStage(g);
  assert.equal(g.machine.state, 'STAGE_CLEAR');
  run(g, FLOW.stageClearTicks + 10);
  assert.equal(g.machine.state, 'SCORE_SUMMARY');
  run(g, FLOW.scoreSummaryTicks + 10);
  assert.equal(g.machine.state, 'VICTORY', 'final clear crowns the player');
});

test('pause halts timers, enemies and shells', () => {
  const g = makeGame();
  run(g, 60 * 4);
  assert.ok(g.pause(), 'pause allowed from PLAYING');
  const snap = g.getSnapshot();
  run(g, 240);
  const snap2 = g.getSnapshot();
  assert.equal(snap2.state, 'PAUSED');
  assert.equal(snap2.enemies.length, snap.enemies.length, 'enemy roster frozen');
  for (let i = 0; i < snap.enemies.length; i++) {
    assert.equal(snap2.enemies[i].x, snap.enemies[i].x, 'enemy positions frozen');
  }
  assert.equal(snap2.bullets.length, snap.bullets.length, 'shell set frozen');
  assert.equal(snap2.timers.frozenTicks, snap.timers.frozenTicks, 'power-up timers frozen');
});

test('illegal state transitions are rejected', () => {
  const g = makeGame();
  assert.throws(() => g.machine.goto('VICTORY'), /illegal state transition/, 'MAIN_MENU cannot jump to VICTORY');
});
