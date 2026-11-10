import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, run, placePlayer, wipeRect, setCell, cellIndex, TERRAIN } from './helpers.mjs';
import { POWERUP, PLAYER, TICK_HZ } from '../src/config.js';

/** Spawn the power-up directly under the player so the pickup resolves immediately. */
const pick = (g, type) => {
  const p = g.players[0];
  p.x = 80; p.y = 160; // free-ish square; wipeRect'ed by each test
  p.shieldTicks = 0;
  p.cooldown = 0;
  g.spawnPowerUp(type, { cx: 5, cy: 10 });
  return g.powerup;
};

test('star raises fire level up to the cap', () => {
  const g = makeGame();
  wipeRect(g, 3, 8, 8, 13);
  const p = placePlayer(g, 80, 160);
  for (let i = 1; i <= 5; i++) {
    pick(g, 'star');
    run(g, 1);
    assert.equal(p.powerLevel, Math.min(PLAYER.maxPowerLevel, i), `level after star #${i}`);
  }
});

test('shield power-up expires after ~10 s', () => {
  const g = makeGame();
  wipeRect(g, 3, 8, 8, 13);
  placePlayer(g, 80, 160);
  pick(g, 'shield');
  run(g, 1);
  const p = g.players[0];
  assert.ok(Math.abs(p.shieldTicks - PLAYER.powerupShieldTicks) <= 1, `shield set (${p.shieldTicks})`);
  run(g, PLAYER.powerupShieldTicks + 30);
  assert.equal(p.shieldTicks, 0, 'shield expires');
});

test('clock freezes enemies and unfreezes on time', () => {
  const g = makeGame();
  g.stepFrames(60 * 4); // some enemies are out and about
  assert.ok(g.enemies.length >= 1, 'precondition: enemies present');
  const p = g.players[0];
  const px = p.x, py = p.y;
  p.x = 80; p.y = 160;
  pick(g, 'clock');
  run(g, 1);
  assert.ok(g.frozenTicks === POWERUP.clockTicks, `clock applied (${g.frozenTicks})`);
  p.x = px; p.y = py; // park far away so the pickup doesn't re-trigger
  const frozenList = g.enemies.filter(e => e.alive).map(e => ({ x: e.x, y: e.y }));
  const frozenCount = frozenList.length;
  run(g, 120);
  const still = g.enemies.filter(e => e.alive).map(e => ({ x: e.x, y: e.y }));
  assert.deepEqual(still.slice(0, frozenCount), frozenList, 'frozen enemies do not move during the clock');
  // spawnQueue may enqueue during a freeze (spec) but nothing acts
  run(g, g.frozenTicks + 10);
  const after = g.enemies.filter(e => e.alive && !e.spawning).map(e => ({ x: e.x, y: e.y }));
  assert.notDeepEqual(after.slice(0, Math.min(frozenCount, after.length)), frozenList, 'enemies resume after freeze');
});

test('shovel turns base walls to steel then restores them', () => {
  const g = makeGame();
  const m = g.map;
  const wallCell = m.baseWallCells[0];
  const origTerrain = m.terrain[wallCell];
  const p = placePlayer(g, 80, 160);
  pick(g, 'shovel');
  run(g, 1);
  assert.equal(m.terrain[wallCell], 2, 'base wall fortified to steel');
  assert.equal(m.fortifyActive, true);
  p.lives = Math.max(1, p.lives); // make sure the game keeps running
  run(g, g.shovelTicks + 10);
  assert.equal(m.fortifyActive, false, 'effect ended');
  assert.equal(m.terrain[wallCell], origTerrain, 'walls restored');
});

test('grenade kills only active, materialised enemies', () => {
  const g = makeGame();
  g.stepFrames(60 * 5);
  const activeBefore = g.enemies.filter(e => e.alive && !e.spawning);
  assert.ok(activeBefore.length >= 1, 'precondition: active enemies');
  const p = placePlayer(g, 80, 160);
  const score0 = p.score;
  pick(g, 'grenade');
  run(g, 1);
  assert.equal(g.enemies.filter(e => e.alive && !e.spawning).length, 0, 'active enemies wiped');
  assert.ok(p.score > score0, 'grenade kills scored');
  assert.equal(g.machine.state !== 'GAME_OVER', true, 'grenade never ends the game');
});

test('extra life power-up adds a life', () => {
  const g = makeGame();
  placePlayer(g, 80, 160);
  const lives0 = g.players[0].lives;
  pick(g, 'life');
  run(g, 1);
  assert.equal(g.players[0].lives, lives0 + 1, '+1 life');
});

test('laser burns a whole lane through brick and steel and kills tanks in it', () => {
  const g = makeGame();
  wipeRect(g, 3, 0, 7, 13);
  const p = placePlayer(g, 80, 160); // cell (5, 10), facing up
  p.dir = 'up';
  setCell(g.map, 5, 8, TERRAIN.BRICK);
  setCell(g.map, 5, 4, TERRAIN.STEEL);
  // materialised enemy parked in the beam lane
  const id = g.spawnEnemy('basic', { cx: 5, cy: 5 });
  const target = g.enemies.find(e => e.id === id);
  target.spawning = false;
  target.spawnTicks = 0;
  const baseBefore = g.map.baseAlive();

  pick(g, 'laser');
  run(g, 1);

  assert.equal(g.map.terrain[cellIndex(5, 8)], TERRAIN.EMPTY, 'brick burned away');
  assert.equal(g.map.terrain[cellIndex(5, 4)], TERRAIN.EMPTY, 'steel burned away');
  assert.equal(target.alive, false, 'enemy caught in the beam');
  assert.equal(g.map.baseAlive(), baseBefore, 'base area untouched');
  assert.ok(g.effects.beamList.length > 0, 'beam visual spawned');
});

test('rapid weapon shortens the cooldown and speeds up shells for its window', () => {
  const g = makeGame();
  wipeRect(g, 3, 8, 10, 13);
  const p = placePlayer(g, 80, 160);
  p.shieldTicks = 100000; // survive the duration test

  pick(g, 'rapid');
  run(g, 1);

  assert.equal(p.rapidTicks, POWERUP.weapon.rapidTicks, 'rapid armed');
  assert.equal(p.fireCooldownSeconds(), POWERUP.weapon.rapidCooldown, 'faster cadence');
  assert.ok(
    Math.abs(p.maxBulletSpeed() - PLAYER.bulletSpeedByLevel[p.powerLevel] * POWERUP.weapon.rapidSpeedMult) < 1e-9,
    'shells speed up',
  );
  run(g, POWERUP.weapon.rapidTicks);
  assert.equal(p.rapidTicks, 0, 'rapid expires');
  assert.equal(p.fireCooldownSeconds() !== POWERUP.weapon.rapidCooldown, true, 'normal cadence restored');
});

test('scatter weapon fans one trigger pull into three shells', () => {
  const g = makeGame();
  wipeRect(g, 3, 0, 10, 13);
  const p = placePlayer(g, 80, 160);
  p.shieldTicks = 100000;

  pick(g, 'scatter');
  run(g, 1);

  assert.equal(p.scatterTicks, POWERUP.weapon.scatterTicks, 'scatter armed');
  assert.equal(p.maxBullets, POWERUP.weapon.scatterBudget, 'triple-shot shell budget');

  p.cooldown = 0;
  g.setPlayerInput(0, { up: true, fire: true });
  run(g, 1);

  const shells = g.bullets.filter(b => b.faction === 'player');
  assert.equal(shells.length, 3, 'one trigger pull -> three shells');
  assert.equal(new Set(shells.map(b => Math.round(b.x))).size, 3, 'shells fan out sideways');
});
