import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, run } from './helpers.mjs';
import { Game } from '../src/game.js';

const FRAMES = 3600;

// deterministic input script: wander + fire, then repeated directions
const SCRIPT = [0, 1, 2, 3, 0, 4, 5, 6].map((kind) => {
  return {
    up: kind === 0,
    down: kind === 1,
    left: kind === 2,
    right: kind === 3,
    fire: kind === 4 || kind === 5 || kind === 6,
  };
});

function simulate(seed, demo = false) {
  const g = demo
    ? new Game({ mode: 'DEMO', seed })
    : new Game({ mode: '1P', seed });
  g.startGame({});
  const events = [];
  for (let f = 0; f < FRAMES; f++) {
    g.pInputs = demo ? null : [SCRIPT[f % SCRIPT.length], SCRIPT[(f + 3) % SCRIPT.length]];
    try {
      g.update();
    } catch (err) {
      throw new Error(`crash on frame ${f}: ${err.stack || err}`);
    }
    if (g.machine.state === 'GAME_OVER') break;
  }
  return { game: g, snapshot: JSON.parse(JSON.stringify(g.getSnapshot())) };
}

function scanForAnomalies(snapshot, game) {
  const checks = { NaN: 0, Infinity: 0 };
  const visit = (v) => {
    if (typeof v === 'number') {
      if (Number.isNaN(v)) checks.NaN++;
      if (!Number.isFinite(v) && !Number.isNaN(v)) checks.Infinity++;
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(visit);
    }
  };
  visit(snapshot);
  for (const p of game.players) {
    assert.ok(p.x >= 0 && p.x <= 384 && p.y >= 0 && p.y <= 384, `tank outside the field: ${p.x},${p.y}`);
  }
  for (const b of game.bullets) {
    assert.ok(b.framesAlive < 720, `shell alive too long (${b.framesAlive} frames)`);
  }
  assert.ok(snapshot.activeObjects.enemies <= 24, 'entity count stays bounded');
  assert.ok(snapshot.activeObjects.bullets <= 8, 'shell count stays bounded');
  assert.equal(checks.NaN, 0, 'no NaNs in the snapshot');
  assert.equal(checks.Infinity, 0, 'no Infinity in the snapshot');
  return checks;
}

test('deterministic simulation: 3600 frames run clean (1P)', () => {
  const { game, snapshot } = simulate(4241, false);
  scanForAnomalies(snapshot, game);
  assert.ok(snapshot.state !== 'BOOT', 'sim reached a real game state');
});

test('deterministic simulation: no anomalies in DEMO for 3600 frames', () => {
  const { game, snapshot } = simulate(4241, true);
  scanForAnomalies(snapshot, game);
  assert.ok(['PLAYING', 'STAGE_INTRO', 'PLAYER_RESPAWN', 'PAUSED', 'SCORE_SUMMARY', 'STAGE_CLEAR', 'GAME_OVER'].includes(snapshot.state),
    `demo state sane: ${snapshot.state}`);
});

test('same seed + same inputs = same snapshot (bit-for-bit)', () => {
  const a = simulate(2029, false);
  const b = simulate(2029, false);
  assert.deepEqual(b.snapshot, a.snapshot, 'identical seeds and inputs must replay identically');
});

test('different seeds diverge', () => {
  const a = simulate(111, false);
  const b = simulate(112, false);
  const different = a.snapshot.enemies.some((e, i) => {
    const o = b.snapshot.enemies[i];
    return !o || o.x !== e.x || o.y !== e.y;
  });
  assert.ok(different || a.frame !== b.frame, 'different seeds produce different play');
});

test('destroyed objects are reclaimed and pools stay bounded', () => {
  const g = makeGame({ seed: 333 });
  run(g, 60 * 2 + 5);
  const enemySpawned = g.spawnEnemy('armor', { cx: 12, cy: 4 });
  const dead = g.enemies.find(e => e.id === enemySpawned);
  dead.alive = false;
  run(g, 3);
  assert.equal(g.enemies.find(e => e.id === enemySpawned), undefined, 'dead enemy pruned from the roster');
});
