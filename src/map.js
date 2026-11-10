import { CELL, GRID, TERRAIN } from './config.js';

// Brick sub-cell quadrant flags (8x8 px each, TL/TR/BL/BR order).
export const Q_TL = 1, Q_TR = 2, Q_BL = 4, Q_BR = 8;
export const ALL_QUADS = Q_TL | Q_TR | Q_BL | Q_BR;

export function cellIndex(cx, cy) { return cy * GRID + cx; }
export function inBounds(cx, cy) { return cx >= 0 && cy >= 0 && cx < GRID && cy < GRID; }

export class GameMap {
  constructor() {
    this.terrain = new Uint8Array(GRID * GRID);
    // per-cell brick quadrant bitmask; only meaningful where terrain === BRICK
    this.brickQuads = new Uint8Array(GRID * GRID);
    this.spawnPoints = [];        // enemy spawn cells [{cx, cy}] (top-left of 2x2)
    this.playerSpawns = [];       // [{cx, cy}] one per player slot, even in 1P mode
    this._spawnMarker = [[], []];
    this.baseCells = [];          // the 2x2 base cells
    this.baseWallCells = [];      // cells forming the base defense walls (shovel target)
    this.resetBaseWallSnapshot();
  }

  resetBaseWallSnapshot() {
    this._baseWallOriginal = null;
  }

  static fromAscii(rows) {
    if (!Array.isArray(rows) || rows.length !== GRID) {
      throw new Error(`map must have ${GRID} rows, got ${rows?.length}`);
    }
    const map = new GameMap();
    for (let y = 0; y < GRID; y++) {
      const row = rows[y];
      if (typeof row !== 'string' || row.length !== GRID) {
        throw new Error(`map row ${y} must be a string of ${GRID} chars`);
      }
      for (let x = 0; x < GRID; x++) {
        const ch = row[x];
        const i = cellIndex(x, y);
        switch (ch) {
          case '.': map.terrain[i] = TERRAIN.EMPTY; break;
          case '#': map.terrain[i] = TERRAIN.BRICK; map.brickQuads[i] = ALL_QUADS; break;
          case 'S': case '@': map.terrain[i] = TERRAIN.STEEL; break;
          case '~': map.terrain[i] = TERRAIN.WATER; break;
          case 'G': case '"': map.terrain[i] = TERRAIN.GRASS; break;
          case 'I': map.terrain[i] = TERRAIN.ICE; break;
          case 'X': {
            map.terrain[i] = TERRAIN.BASE;
            map.baseCells.push({ cx: x, cy: y });
            break;
          }
          case '1': case '2': {
            map.terrain[i] = TERRAIN.EMPTY;
            const slot = ch === '1' ? 0 : 1;
            (map._spawnMarker[slot] ||= []).push({ cx: x, cy: y });
            break;
          }
          case '3': {
            map.terrain[i] = TERRAIN.EMPTY;
            map.spawnPoints.push({ cx: x, cy: y });
            break;
          }
          default: throw new Error(`invalid map char '${ch}' at ${x},${y}`);
        }
      }
    }
    if (map.spawnPoints.length !== 3) throw new Error('map needs exactly 3 enemy spawn points');
    if (map.baseCells.length !== 4) throw new Error('map needs exactly 4 base cells');
    // player spawn anchor = top-left of its marker cluster
    for (let s = 0; s < 2; s++) {
      const cells = map._spawnMarker[s];
      if (!cells.length) throw new Error(`player spawn ${s + 1} marker missing`);
      map.playerSpawns[s] = { cx: Math.min(...cells.map(c => c.cx)), cy: Math.min(...cells.map(c => c.cy)) };
    }
    map._spawnMarker = undefined;

    // Compute the base defense wall cells: brick/steel ring around (and touching) the base.
    map.baseWallCells = [];
    const bx0 = Math.min(...map.baseCells.map(c => c.cx));
    const by0 = Math.min(...map.baseCells.map(c => c.cy));
    for (let y = by0 - 1; y <= by0 + 2; y++) {
      for (let x = bx0 - 1; x <= bx0 + 2; x++) {
        if (x === bx0 || x === bx0 + 1) {
          // base body columns: fortify the wall row directly above the base
          if (y === by0 - 1 || y === by0 + 2) {
            if (y === by0 + 2 || y === by0 - 1) map._pushBaseWall(x, y);
          }
          continue;
        }
        if (y === by0 || y === by0 + 1) map._pushBaseWall(x, y); // left & right columns
      }
    }
    return map;
  }

  _pushBaseWall(cx, cy) {
    if (inBounds(cx, cy)) {
      const i = cellIndex(cx, cy);
      this.baseWallCells.push(i);
    }
  }

  snapshotBaseWalls() {
    this._baseWallOriginal = {
      terrain: this.baseWallCells.map(i => this.terrain[i]),
      quads: this.baseWallCells.map(i => this.brickQuads[i]),
    };
  }

  // Turn all base defense walls into steel (shovel active).
  fortifyBaseWalls() {
    this.snapshotBaseWalls();
    for (const i of this.baseWallCells) this.terrain[i] = TERRAIN.STEEL;
  }

  // Restore walls to the state present when the shovel was picked up.
  restoreBaseWalls() {
    if (!this._baseWallOriginal) return;
    this.baseWallCells.forEach((i, n) => {
      this.terrain[i] = this._baseWallOriginal.terrain[n];
      this.brickQuads[i] = this._baseWallOriginal.quads[n];
    });
    this._baseWallOriginal = null;
  }

  get fortifyActive() {
    return this._baseWallOriginal !== null;
  }

  isBaseCell(i) { return this.terrain[i] === TERRAIN.BASE || this.terrain[i] === TERRAIN.BASE_WRECK; }

  destroyBase() {
    for (const c of this.baseCells) {
      const i = cellIndex(c.cx, c.cy);
      this.terrain[i] = TERRAIN.BASE_WRECK;
      this.brickQuads[i] = 0;
    }
  }

  baseAlive() {
    return this.baseCells.length > 0 && this.terrain[cellIndex(this.baseCells[0].cx, this.baseCells[0].cy)] === TERRAIN.BASE;
  }

  blockedForTank(i) {
    const t = this.terrain[i];
    if (t === TERRAIN.BRICK) return this.brickQuads[i] !== 0; // fully destroyed brick is passable
    return t === TERRAIN.STEEL || t === TERRAIN.WATER || t === TERRAIN.BASE || t === TERRAIN.BASE_WRECK;
  }

  blockedForBulletCell(i) {
    const t = this.terrain[i];
    if (t === TERRAIN.BRICK) return this.brickQuads[i] !== 0;
    return t === TERRAIN.STEEL || t === TERRAIN.BASE || t === TERRAIN.BASE_WRECK;
  }

  // Terrain lookup in pixel coordinates.
  terrainAtPx(px, py) {
    const cx = Math.floor(px / CELL);
    const cy = Math.floor(py / CELL);
    if (!inBounds(cx, cy)) return -1;
    return this.terrain[cellIndex(cx, cy)];
  }

  onIce(rect) {
    // Tank counts as on ice when its centre cell is ice.
    const cx = Math.floor((rect.x + rect.w / 2) / CELL);
    const cy = Math.floor((rect.y + rect.h / 2) / CELL);
    if (!inBounds(cx, cy)) return false;
    return this.terrain[cellIndex(cx, cy)] === TERRAIN.ICE;
  }
}
