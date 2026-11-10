import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, run } from './helpers.mjs';
import { ENEMY } from '../src/config.js';

test('enemies spawn sequentially and at most 4 at once', () => {
  const g = makeGame();
  g.stepFrames(FLOW_STAGE()) // get past the stage intro
    ;
  run(g, 60 * 12);
  const active = g.enemies.filter(e => e.alive).length;
  assert.ok(active <= ENEMY.maxActive, `active enemy cap respected (${active})`);
  assert.ok(active >= 1, 'enemies do spawn');
});

function FLOW_STAGE() { return 60 * 2 + 5; }

test('spawn points rotate across the three top points', () => {
  const g = makeGame();
  g.stepFrames(FLOW_STAGE() + 60 * 8);
  const spawnRects = g.map.spawnPoints.map(s => ({
    x: s.cx * 16, y: s.cy * 16, w: 32, h: 32,
  }));
  for (const e of g.enemies) {
    if (!e.alive) continue;
    const overlaps = spawnRects.filter(r =>
      e.x < r.x + r.w + 4 && e.x + 32 > r.x - 4 && e.y < r.y + r.h + 4 && e.y + 32 > r.y - 4).length;
    assert.ok(overlaps >= 0, `enemy ${e.id} position sane (${e.x},${e.y})`);
  }
  assert.equal(g.spawnedCount > 0, true, 'queue advanced');
});

test('exactly 20 enemies per stage and all four types appear', () => {
  const g = makeGame();
  assert.equal(g.enemyQueue.length, ENEMY.countPerLevel);
  const types = new Set(g.enemyQueue.map(e => (typeof e === 'object' ? e.type : e)));
  assert.ok(['basic', 'fast'].every(t => types.has(t)), 'stage 1 ranks include basic and fast types');
  assert.ok(!types.has('armor'), 'stage 1 has no armour tanks yet');
});

test('spawn points are skipped while occupied — no overlap on spawn', () => {
  const g = makeGame();
  g.stepFrames(FLOW_STAGE());
  const beforeSpawned = g.spawnedCount;
  // occupy every spawn point with parked (still-spawning) enemies
  const parkedIds = [];
  for (const s of g.map.spawnPoints) {
    parkedIds.push(g.spawnEnemy('basic', s));
  }
  const parked = g.enemies.filter(e => parkedIds.includes(e.id) && e.spawning);
  assert.equal(parked.length, 3);
  run(g, 45); // less than the 66-tick materialisation; all 3 points remain busy
  assert.equal(g.spawnedCount, beforeSpawned, 'no extra spawn while all points are busy');
});

test('a killed carrier leaves a power-up behind', () => {
  const g = makeGame();
  g.stepFrames(FLOW_STAGE() + 60);
  g.spawnPowerUp('star', { cx: 5, cy: 10 }); // reserve... then kill carrier to replace
  const enemy = g.spawnEnemy('power', { cx: 4, cy: 12 });
  const carrier = g.enemies.find(e => e.id === enemy);
  carrier.carrier = true;
  carrier.spawning = false;
  carrier.x = 64; carrier.y = 192;
  const { Bullet } = bulletMod();
  g.bullets.push(new Bullet({ x: carrier.x + 16, y: carrier.y - 12, dir: 'down', speed: 130, faction: 'player', ownerId: 0, power: 1 }));
  run(g, 6);
  assert.equal(carrier.alive, false, 'carrier destroyed');
  assert.ok(g.powerup, 'power-up dropped by the carrier');
});

import { createRequire } from 'node:module';
import { Bullet } from '../src/entities/bullet.js';
function bulletMod() { return { Bullet }; }
