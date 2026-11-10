import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, getLevel } from '../src/levels.js';
import { validateAllLevels, validateLevel } from '../src/level-validator.js';
import { GameMap } from '../src/map.js';
import { ENEMY, TOTAL_LEVELS } from '../src/config.js';

test('35 levels exist', () => {
  assert.equal(LEVELS.length, TOTAL_LEVELS);
});

test('every level passes the full validator', () => {
  const res = validateAllLevels(LEVELS);
  const bad = res.results.filter(r => !r.ok);
  assert.deepEqual(bad.map(b => ({ level: b.level, errors: b.errors })), [], 'validator must be green');
});

test('level ids run 1..35 and layouts are unique', () => {
  LEVELS.forEach((l, i) => assert.equal(l.id, i + 1));
  const hashes = new Set(LEVELS.map(l => l.rows.join('|')));
  assert.equal(hashes.size, LEVELS.length, 'no identical layouts');
});

test('levels are deterministic across reloads', () => {
  const again = getLevel(7);
  assert.deepEqual(again.rows, LEVELS[6].rows, 'same level number -> same layout');
});

test('every level has exactly one base and 4 base cells', () => {
  for (const l of LEVELS) {
    const m = GameMap.fromAscii(l.rows);
    assert.equal(m.baseCells.length, 4, `level ${l.id} base cells`);
    const flat = m.terrain.filter(t => t === 6 || t === 7).length;
    assert.equal(flat, 4, `level ${l.id} base occupies exactly 4 cells`);
  }
});

test('spawn + player areas clear and queue totals 20 every level', () => {
  for (const l of LEVELS) {
    const m = GameMap.fromAscii(l.rows);
    assert.equal(m.spawnPoints.length, 3, `level ${l.id} spawn points`);
    assert.equal(m.playerSpawns.length, 2, `level ${l.id} player spawns`);
    assert.equal(l.enemies.length, ENEMY.countPerLevel, `level ${l.id} enemy count`);
    assert.ok(l.enemies.every(t => ['basic', 'fast', 'power', 'armor'].includes(typeof t === 'object' ? t.type : t)));
  }
});

test('path check: each spawn can reach the base ring', () => {
  for (const l of LEVELS) {
    const v = validateLevel(l);
    const pathErrors = v.errors.filter(e => e.includes('no route') || e.includes('sealed'));
    assert.deepEqual(pathErrors, [], `level ${l.id} must be routable`);
  }
});

test('validator rejects a broken level', () => {
  const broken = {
    id: 1,
    rows: LEVELS[0].rows.map(r => r.slice()),
    enemies: LEVELS[0].enemies,
    carriers: LEVELS[0].carriers,
  };
  // remove the base -> validator must fail
  broken.rows = broken.rows.map(row => row.replace(/X/g, '.'));
  const res = validateLevel(broken);
  assert.equal(res.ok, false);
  assert.ok(res.errors.join(' ').includes('base'), 'missing base reported');
});

test('terrain budget is sane (no impossible maps)', () => {
  for (const l of LEVELS) {
    const m = GameMap.fromAscii(l.rows);
    const hard = m.terrain.filter(t => t === 2 || t === 3).length;
    assert.ok(hard <= m.terrain.length * 0.42, `level ${l.id} too many impassable cells: ${hard}`);
  }
});
