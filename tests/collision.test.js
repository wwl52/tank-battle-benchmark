import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, run, setCell, placePlayer, wipeRect, cellIndex, TERRAIN } from './helpers.mjs';
import { Bullet } from '../src/entities/bullet.js';

const DOWN = { up: false, down: true, left: false, right: false, fire: false };
const IDLE = { up: false, down: false, left: false, right: false, fire: false };

const makeBullet = (game, { x, y, dir, speed = 120, power = 1, faction = 'player', ownerId = 0 }) => {
  const b = new Bullet({ x, y, dir, speed, faction, ownerId, power });
  game.bullets.push(b);
  return b;
};

test('tank cannot move into bricks', () => {
  const g = makeGame();
  wipeRect(g, 6, 6, 12, 12);
  setCell(g.map, 8, 8, TERRAIN.BRICK);
  setCell(g.map, 9, 8, TERRAIN.BRICK);
  const p = placePlayer(g, 128, 64);
  g.pInputs = [DOWN, IDLE];
  run(g, 90);
  assert.ok(p.y <= 96.001, `tank drove into bricks: y=${p.y}`);
});

test('tank cannot move into steel', () => {
  const g = makeGame();
  wipeRect(g, 6, 6, 12, 14);
  setCell(g.map, 8, 8, TERRAIN.STEEL);
  setCell(g.map, 9, 8, TERRAIN.STEEL);
  const p = placePlayer(g, 128, 64);
  g.pInputs = [DOWN, IDLE];
  run(g, 90);
  assert.ok(p.y <= 96.001, `tank entered steel: y=${p.y}`);
});

test('tank cannot enter water', () => {
  const g = makeGame();
  wipeRect(g, 6, 6, 12, 14);
  setCell(g.map, 8, 8, TERRAIN.WATER);
  setCell(g.map, 9, 8, TERRAIN.WATER);
  const p = placePlayer(g, 128, 64);
  g.pInputs = [DOWN, IDLE];
  run(g, 90);
  assert.ok(p.y <= 96.001, `tank entered water: y=${p.y}`);
});

test('tank can enter grass', () => {
  const g = makeGame();
  wipeRect(g, 6, 5, 12, 14);
  setCell(g.map, 8, 6, TERRAIN.GRASS);
  setCell(g.map, 9, 6, TERRAIN.GRASS);
  const p = placePlayer(g, 128, 64);
  g.pInputs = [DOWN, IDLE];
  run(g, 20);
  assert.ok(p.y >= 62, `grass must be passable, stopped at y=${p.y}`);
});

test('tank can enter ice and slides after releasing input', () => {
  const g = makeGame();
  wipeRect(g, 4, 6, 22, 16);
  for (let cy = 8; cy <= 12; cy++) {
    for (let cx = 6; cx <= 20; cx++) setCell(g.map, cx, cy, TERRAIN.ICE);
  }
  const p = placePlayer(g, 128, 128);
  g.pInputs = [DOWN, IDLE];
  run(g, 30); // drive well into the ice field (rect crosses the ice cells)
  const yOnIce = p.y;
  g.pInputs = [IDLE, IDLE];
  run(g, 20);
  assert.ok(p.y > yOnIce + 2, `tank should glide after release: ${yOnIce} -> ${p.y}`);
});

test('bullets fly over water', () => {
  const g = makeGame();
  wipeRect(g, 4, 6, 24, 14);
  setCell(g.map, 8, 8, TERRAIN.WATER);
  setCell(g.map, 9, 8, TERRAIN.WATER);
  placePlayer(g, 128, 48);
  const b = makeBullet(g, { x: 136, y: 64, dir: 'down' });
  run(g, 400);
  assert.equal(b.alive, false, 'bullet terminated at the field edge');
  assert.equal(cellIndex !== null && g.map.terrain[cellIndex(8, 8)], TERRAIN.WATER, 'water untouched');
});

test('normal shells chew brick chunks — partial destruction', () => {
  const g = makeGame();
  wipeRect(g, 3, 6, 6, 10);
  setCell(g.map, 4, 8, TERRAIN.BRICK);
  const i = cellIndex(4, 8);
  const before = g.map.brickQuads[i]; // 15
  g.bullets.push(new Bullet({ x: 68, y: 120, dir: 'down', speed: 120, faction: 'player', ownerId: 0, power: 1 }));
  run(g, 4);
  const quadsAfter = g.map.brickQuads[i];
  assert.ok(quadsAfter !== 0 && quadsAfter !== before, `partial damage: ${before} -> ${quadsAfter}`);
  assert.equal(g.map.terrain[i], TERRAIN.BRICK, 'cell still brick while quads survive');
  assert.equal(g.map.terrain[cellIndex(5, 8)], TERRAIN.EMPTY, 'adjacent empty cell untouched');
});

test('ordinary shells cannot destroy steel', () => {
  const g = makeGame();
  wipeRect(g, 6, 6, 12, 10);
  setCell(g.map, 8, 8, TERRAIN.STEEL);
  const b = makeBullet(g, { x: 136, y: 120, dir: 'down' });
  run(g, 6);
  assert.equal(b.alive, false, 'shell stops on steel');
  assert.equal(g.map.terrain[cellIndex(8, 8)], TERRAIN.STEEL, 'steel survives');
});

test('L3 piercing shells (power=2) destroy steel', () => {
  const g = makeGame();
  wipeRect(g, 6, 6, 12, 12);
  setCell(g.map, 8, 8, TERRAIN.STEEL);
  const b = makeBullet(g, { x: 136, y: 120, dir: 'down', power: 2 });
  run(g, 6);
  assert.equal(b.alive, false, 'shell spent breaking steel');
  assert.equal(g.map.terrain[cellIndex(8, 8)], TERRAIN.EMPTY, 'steel destroyed');
});

test('opposing shells cancel each other out', () => {
  const g = makeGame();
  wipeRect(g, 2, 8, 24, 18);
  const a = makeBullet(g, { x: 100, y: 200, dir: 'down', faction: 'player', power: 1 });
  const b = makeBullet(g, { x: 100, y: 240, dir: 'up', faction: 'enemy' });
  run(g, 20);
  assert.equal(a.alive, false, 'player shell annihilated');
  assert.equal(b.alive, false, 'enemy shell annihilated');
});

test('fast shells do not tunnel through a 1-cell brick wall', () => {
  const g = makeGame();
  wipeRect(g, 6, 6, 12, 12);
  setCell(g.map, 8, 8, TERRAIN.BRICK);
  setCell(g.map, 9, 8, TERRAIN.BRICK);
  setCell(g.map, 10, 8, TERRAIN.BRICK);
  const b = makeBullet(g, { x: 136, y: 4 * 16, dir: 'down', speed: 400, power: 1 });
  run(g, 5);
  const tunnelled = b.y > 9 * 16 && b.alive;
  assert.equal(tunnelled, false, 'swept collision prevents tunneling');
});

test('tank cannot drive through another tank', () => {
  const g = makeGame();
  wipeRect(g, 4, 4, 12, 14);
  const p = placePlayer(g, 100, 100);
  const id = g.spawnEnemy('basic', { cx: 8, cy: 10 });
  const enemy = g.enemies.find(e => e.id === id);
  enemy.spawning = false;
  for (let i = 0; i < 120; i++) {
    enemy.x = 104;
    enemy.y = 170;
    g.pInputs = [DOWN, IDLE];
    g.update();
  }
  const overlap =
    p.x < enemy.x + 32 && p.x + 32 > enemy.x && p.y < enemy.y + 32 && p.y + 32 > enemy.y;
  assert.equal(overlap, false, 'player must not overlap the enemy tank');
  assert.ok(p.y <= enemy.y - 32 + 0.5, `blocked short of the enemy (y=${p.y})`);
});
