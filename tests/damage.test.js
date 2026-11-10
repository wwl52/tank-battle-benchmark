import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, run, setCell, placePlayer, wipeRect, cellIndex, TERRAIN } from './helpers.mjs';
import { Bullet } from '../src/entities/bullet.js';

const IDLE = { up: false, down: false, left: false, right: false, fire: false };

const makeBullet = (game, opts) => {
  const b = new Bullet({
    x: opts.x, y: opts.y, dir: opts.dir || 'down', speed: opts.speed || 130,
    faction: opts.faction || 'player', ownerId: opts.ownerId ?? 0, power: opts.power || 1,
  });
  game.bullets.push(b);
  return b;
};

const spawnParked = (g, type, cx, cy) => {
  const id = g.spawnEnemy(type, { cx, cy });
  const enemy = g.enemies.find(x => x.id === id);
  enemy.spawning = false;
  enemy.spawnTicks = 0;
  return enemy;
};

test('player shell destroys a basic enemy', () => {
  const g = makeGame();
  wipeRect(g, 3, 4, 14, 16);
  const enemy = spawnParked(g, 'basic', 8, 10);
  enemy.x = 128; enemy.y = 160;
  const before = g.players[0].score;
  makeBullet(g, { x: 144, y: 140, dir: 'down' });
  run(g, 14);
  assert.equal(enemy.alive, false, 'basic enemy dies to one shell');
  assert.equal(g.players[0].score - before, 100, 'kill credited as 100');
  assert.equal(g.enemies.find(e => e.id === enemy.id), undefined, 'destroyed enemy pruned');
});

test('armour tank takes 4 shells (power) to go down', () => {
  const g = makeGame();
  wipeRect(g, 3, 4, 14, 18);
  const enemy = spawnParked(g, 'armor', 8, 10);
  enemy.x = 128; enemy.y = 160;
  g.frozenTicks = 1000000; // pin the AI so every shell hits the same target for this test
  for (let i = 1; i <= 4; i++) {
    makeBullet(g, { x: 144, y: enemy.y - 4, dir: 'down' });
    run(g, 4);
    assert.equal(enemy.alive, i < 4, `hit ${i}: alive=${enemy.alive} hp=${enemy.hp}`);
  }
});

test('enemy shell destroys an unprotected player', () => {
  const g = makeGame();
  wipeRect(g, 3, 12, 12, 20);
  const p = placePlayer(g, 128, 340);
  p.lives = 2;
  makeBullet(g, { x: 148, y: p.y + 44, dir: 'up', faction: 'enemy', ownerId: 5 });
  run(g, 8);
  assert.equal(p.alive, false, 'unshielded player hit');
  assert.equal(p.lives, 1, 'a life was consumed');
  assert.equal(g.machine.state, 'PLAYER_RESPAWN', 'single-player respawn state entered');
});

test('respawn shield blocks enemy shells', () => {
  const g = makeGame();
  wipeRect(g, 6, 18, 12, 24);
  const p = g.players[0];
  p.x = 128; p.y = 340;
  p.shieldTicks = 400;
  const lives0 = p.lives;
  makeBullet(g, { x: 148, y: p.y + 44, dir: 'up', faction: 'enemy', ownerId: 5 });
  run(g, 8);
  assert.equal(p.alive, true, 'shield absorbs');
  assert.equal(p.lives, lives0, 'no life lost behind a shield');
});

test('base dies to enemy shells', () => {
  const g = makeGame();
  run(g, 2);
  // strip the defence ring so the shell reaches the base directly (random walls vary by seed)
  for (const i of g.map.baseWallCells) g.map.terrain[i] = TERRAIN.EMPTY;
  const base = g.map.baseCells[0];
  const bx = base.cx * 16 + 16;
  const bullet = makeBullet(g, { x: bx, y: base.cy * 16 - 6, dir: 'down', faction: 'enemy', ownerId: 5 });
  run(g, 14);
  assert.equal(bullet.alive, false);
  assert.equal(g.map.baseAlive(), false, 'base is gone');
  assert.equal(g.machine.state, 'GAME_OVER', 'base destruction ends the game');
});

test('base dies to player shells too (own goal ends the game)', () => {
  const g = makeGame();
  run(g, 2);
  for (const i of g.map.baseWallCells) g.map.terrain[i] = TERRAIN.EMPTY;
  const base = g.map.baseCells[0];
  const bx = base.cx * 16 + 16;
  makeBullet(g, { x: bx, y: base.cy * 16 - 6, dir: 'down', faction: 'player', ownerId: 0 });
  run(g, 14);
  assert.equal(g.machine.state, 'GAME_OVER');
  assert.equal(g.map.baseAlive(), false);
});

test('destroyed entities cannot be scored twice', () => {
  const g = makeGame();
  wipeRect(g, 3, 4, 14, 16);
  const enemy = spawnParked(g, 'basic', 8, 10);
  enemy.x = 128; enemy.y = 160;
  makeBullet(g, { x: 144, y: 140, dir: 'down' });
  run(g, 14);
  const scoreAfterKill = g.players[0].score;
  makeBullet(g, { x: 144, y: 140, dir: 'down' });
  run(g, 14);
  assert.equal(g.players[0].score, scoreAfterKill, 'spawn is gone; no second scoring event');
});

test('friendly shells stun the other player but never kill', () => {
  const g = makeGame({ mode: '2P', seed: 77 });
  wipeRect(g, 2, 8, 24, 24);
  const p1 = g.players[0];
  const p2 = g.players[1];
  p1.x = 96; p1.y = 160;
  p2.x = 96; p2.y = 256;
  p1.shieldTicks = 0; p2.shieldTicks = 0;
  const lives0 = p2.lives;
  const b = makeBullet(g, { x: 112, y: 230, dir: 'down', faction: 'player', ownerId: 0 });
  run(g, 60);
  assert.equal(b.alive, false, 'shell stops on the friendly tank');
  assert.equal(p2.alive, true, 'friendly shell never kills');
  assert.equal(p2.lives, lives0, 'no life lost to friendly fire');
  assert.ok(p2.stunTicks >= 0, 'stun timer present');
});
