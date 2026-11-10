import {
  CANVAS_W, CANVAS_H, MAP_PX, SIDEBAR_PX, CELL, GRID, TERRAIN, TOTAL_LEVELS,
} from './config.js';
import { Q_TL, Q_TR, Q_BL, Q_BR } from './map.js';
import { buildHudView } from './ui/hud.js';
import { MENU_ITEMS } from './ui/menu.js';

// Palette — original game look, no external assets.
const C = {
  bg: '#0a0a12',
  field: '#15151f',
  brickA: '#a33a2a', brickB: '#8a2f22', mortar: '#5d1f16',
  steelA: '#aab7c4', steelB: '#7d8b99', steelEdge: '#e6eef7',
  waterA: '#1c3f8f', waterB: '#2f63c4', waterFoam: '#9cc4ff',
  grassA: '#1f6d2a', grassB: '#2f8d3a', grassC: '#154f1e',
  iceA: '#a8d8f0', iceB: '#cff1ff', iceEdge: '#eafaff',
  baseGold: '#e8c15a', baseDark: '#8a6d2b', baseSteel: '#5b6570',
  p1: '#e0d24c', p1Dark: '#8f7f1e', p1Turret: '#f5ec86',
  p2: '#4cd7e0', p2Dark: '#1d7f8a', p2Turret: '#aef2f5',
  basic: '#9aa0a6', basicDark: '#565b60',
  fast: '#7fd66b', fastDark: '#3c7f31',
  power: '#e0634c', powerDark: '#8a2f22',
  armor: '#e0a34c', armorDark: '#8a5a1e',
  wreck: '#4a4a52',
  text: '#e8e8f0', dim: '#8b8ba0', accent: '#ffcf4c', red: '#e05143',
  enemyIcon: '#d05040',
};

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// Pick-up plaque look per type: glyph + identity colour.
const POWERUP_LOOK = {
  star:    { glyph: '★', color: C.accent },
  shield:  { glyph: '⊙', color: '#7fe3ff' },
  clock:   { glyph: '⏱', color: '#9cc4ff' },
  shovel:  { glyph: '⛏', color: '#d8a06a' },
  grenade: { glyph: '✸', color: '#ff8a5c' },
  life:    { glyph: '+', color: '#7fe38a' },
  laser:   { glyph: '⚡', color: '#ff5c8a' },
  rapid:   { glyph: '»', color: '#ffb03c' },
  scatter: { glyph: 'Y', color: '#8fe6ff' },
};

export class Renderer {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    // static terrain cache
    this._terrainCanvas = document.createElement('canvas');
    this._terrainCanvas.width = MAP_PX;
    this._terrainCanvas.height = MAP_PX;
    this._grassCanvas = document.createElement('canvas');
    this._grassCanvas.width = MAP_PX;
    this._grassCanvas.height = MAP_PX;
    this._terrainSig = -1;
    this._spriteCache = new Map();
    this.showDebug = false;
  }

  // terrain signature: cheap checksum of terrain + brick quadrant state
  _mapSig() {
    const m = this.game.map;
    if (!m) return -1;
    let sig = 0;
    for (let i = 0; i < m.terrain.length; i++) {
      sig = (sig * 31 + m.terrain[i] * 7 + m.brickQuads[i]) | 0;
    }
    return sig;
  }

  _invalidateIfChanged() {
    const sig = this._mapSig();
    if (sig !== this._terrainSig) {
      this._terrainSig = sig;
      this.#drawTerrainLayers();
    }
  }

  #drawTerrainLayers() {
    const g = this.game.map;
    const tctx = this._terrainCanvas.getContext('2d');
    const gctx = this._grassCanvas.getContext('2d');
    tctx.clearRect(0, 0, MAP_PX, MAP_PX);
    gctx.clearRect(0, 0, MAP_PX, MAP_PX);
    for (let cy = 0; cy < GRID; cy++) {
      for (let cx = 0; cx < GRID; cx++) {
        const i = cy * GRID + cx;
        const t = g.terrain[i];
        const x = cx * CELL;
        const y = cy * CELL;
        if (t === TERRAIN.BRICK) this.#brickCell(tctx, x, y, g.brickQuads[i], cx, cy);
        else if (t === TERRAIN.STEEL) this.#steelCell(tctx, x, y);
        else if (t === TERRAIN.WATER) this.#waterCell(tctx, x, y, cx, cy);
        else if (t === TERRAIN.ICE) this.#iceCell(tctx, x, y);
        else if (t === TERRAIN.GRASS) this.#grassCell(gctx, x, y, cx, cy);
      }
    }
  }

  // --- terrain primitives -----------------------------------------------------------------

  #brickCell(ctx, x, y, quads, cx, cy) {
    const draw = (qx, qy) => {
      const bx = x + qx * 8;
      const by = y + qy * 8;
      px(ctx, bx, by, 8, 8, C.brickA);
      // two courses of bricks with staggered joints
      px(ctx, bx, by + 3, 8, 1, C.mortar);
      px(ctx, bx + (qx === 0 ? 4 : 0), by + 0, 1, 3, C.mortar);
      px(ctx, bx + (qx === 0 ? 0 : 4), by + 4, 1, 4, C.mortar);
      px(ctx, bx, by, 8, 1, C.brickB);
    };
    if (quads & Q_TL) draw(0, 0);
    if (quads & Q_TR) draw(1, 0);
    if (quads & Q_BL) draw(0, 1);
    if (quads & Q_BR) draw(1, 1);
  }

  #steelCell(ctx, x, y) {
    px(ctx, x, y, 16, 16, C.steelB);
    px(ctx, x + 2, y + 2, 12, 12, C.steelA);
    px(ctx, x + 2, y + 2, 12, 2, C.steelEdge);
    px(ctx, x + 2, y + 12, 12, 2, C.steelB);
    px(ctx, x + 4, y + 4, 3, 3, C.steelEdge);
    px(ctx, x + 9, y + 9, 3, 3, C.steelEdge);
  }

  #waterCell(ctx, x, y, cx, cy) {
    px(ctx, x, y, 16, 16, C.waterA);
    const phase = (cx + cy) % 2;
    ctx.fillStyle = C.waterB;
    ctx.fillRect(x, y + (phase ? 4 : 0) + 2, 16, 2);
    ctx.fillRect(x, y + (phase ? 10 : 6), 16, 2);
    ctx.fillStyle = C.waterFoam;
    ctx.fillRect(x + (phase ? 2 : 9), y + 4, 3, 1);
    ctx.fillRect(x + (phase ? 10 : 3), y + 10, 3, 1);
  }

  #iceCell(ctx, x, y) {
    px(ctx, x, y, 16, 16, C.iceA);
    px(ctx, x, y, 16, 2, C.iceEdge);
    ctx.fillStyle = C.iceB;
    ctx.fillRect(x + 2, y + 11, 6, 1);
    ctx.fillRect(x + 8, y + 5, 6, 1);
  }

  #grassCell(ctx, x, y, cx, cy) {
    px(ctx, x, y, 16, 16, C.grassA);
    // deterministic speckle pattern per cell parity
    const odd = (cx + cy) % 2 === 1;
    for (let sy = 0; sy < 4; sy++) {
      for (let sx = 0; sx < 4; sx++) {
        const on = ((sx + (odd ? 1 : 0)) + sy * 2) % 3 !== 0;
        if (on) px(ctx, x + sx * 4, y + sy * 4, 3, 3, (sx + sy + cx + cy) % 2 ? C.grassB : C.grassC);
      }
    }
  }

  // --- sprites ---------------------------------------------------------------------------

  _tankSprite(key, buildFn) {
    let sprite = this._spriteCache.get(key);
    if (!sprite) {
      sprite = document.createElement('canvas');
      sprite.width = 32;
      sprite.height = 32;
      buildFn(sprite.getContext('2d'));
      this._spriteCache.set(key, sprite);
      if (this._spriteCache.size > 64) this._spriteCache.delete(this._spriteCache.keys().next().value);
    }
    return sprite;
  }

  #drawTankSprite(ctx, colors, trackPhase, wrecked = false) {
    const [main, dark, turret] = colors;
    // treads
    for (let i = 0; i < 4; i++) {
      const on = (i + trackPhase) % 2 === 0 ? dark : main;
      px(ctx, 1, 3 + i * 7, 5, 5, '#22222a');
      px(ctx, 2, 3 + i * 7 + (i % 2 ? 1 : 3), 3, 2, on);
      px(ctx, 26, 3 + i * 7, 5, 5, '#22222a');
      px(ctx, 27, 3 + i * 7 + (i % 2 ? 1 : 3), 3, 2, on);
    }
    // hull
    px(ctx, 6, 4, 20, 24, main);
    px(ctx, 6, 4, 20, 3, turret);
    px(ctx, 6, 25, 20, 3, dark);
    px(ctx, 6, 4, 2, 24, dark);
    px(ctx, 24, 4, 2, 24, dark);
    if (wrecked) {
      // armour tank damage stage: cracks
      px(ctx, 12, 10, 8, 2, '#1b1b22');
      px(ctx, 15, 12, 2, 10, '#1b1b22');
      px(ctx, 9, 18, 6, 2, '#1b1b22');
    }
    // turret + barrel pointing up in sprite space (rotated at blit)
    px(ctx, 11, 9, 10, 10, turret);
    px(ctx, 12, 10, 8, 8, dark);
    px(ctx, 14, 12, 4, 4, main);
    px(ctx, 14, 0, 4, 10, main);
    px(ctx, 15, 0, 2, 10, '#ffffff');
  }

  _blitTank(ctx, tank, palette, trackPhase, wrecked) {
    const sprite = this._tankSprite(`${palette[0]}-${trackPhase}-${wrecked}`, (c) => this.#drawTankSprite(c, palette, trackPhase, wrecked));
    const dir = tank.dir;
    const rot = dir === 'up' ? 0 : dir === 'right' ? Math.PI / 2 : dir === 'down' ? Math.PI : -Math.PI / 2;
    ctx.save();
    ctx.translate(tank.x + 16, tank.y + 16);
    ctx.rotate(rot);
    ctx.drawImage(sprite, -16, -16);
    ctx.restore();
  }

  playerPalette(idx) {
    return idx === 0 ? [C.p1, C.p1Dark, C.p1Turret] : [C.p2, C.p2Dark, C.p2Turret];
  }

  enemyPalette(type) {
    switch (type) {
      case 'basic': return [C.basic, C.basicDark, '#c7ccd1'];
      case 'fast': return [C.fast, C.fastDark, '#a8ec95'];
      case 'power': return [C.power, C.powerDark, '#f0937f'];
      case 'armor': return [C.armor, C.armorDark, '#f5cb8a'];
      default: return [C.basic, C.basicDark, '#c7ccd1'];
    }
  }

  // --- frame passes -----------------------------------------------------------------------

  render() {
    const { game, ctx } = this;
    this._invalidateIfChanged();
    const st = game.machine.state;
    px(ctx, 0, 0, CANVAS_W, CANVAS_H, C.bg);
    switch (st) {
      case 'MAIN_MENU': this.#drawMenu(ctx); break;
      case 'HELP': this.#drawHelp(ctx); break;
      case 'STAGE_INTRO': this.#drawStageIntro(ctx); break;
      case 'PLAYING':
      case 'PLAYER_RESPAWN':
      case 'PAUSED':
        this.#drawWorld(ctx);
        break;
      case 'STAGE_CLEAR': this.#drawWorld(ctx); this.#drawBanner(ctx, 'STAGE CLEAR!', C.accent); break;
      case 'SCORE_SUMMARY': this.#drawWorld(ctx); this.#drawScoreSummary(ctx); break;
      case 'GAME_OVER': this.#drawWorld(ctx); this.#drawBanner(ctx, 'GAME OVER', C.red); break;
      case 'VICTORY': this.#drawWorld(ctx); this.#drawVictory(ctx); break;
      default: break;
    }
    if (this.showDebug) this.#drawDebug(ctx);
  }

  #withField(ctx, fn) {
    px(ctx, 0, 0, MAP_PX, MAP_PX, C.field);
    ctx.drawImage(this._terrainCanvas, 0, 0);
    fn();
    // grass overlay above tanks
    ctx.drawImage(this._grassCanvas, 0, 0);
  }

  #drawWorld(ctx) {
    const game = this.game;
    this.#withField(ctx, () => this.#drawEntities(ctx));
    this.#drawSidebar(ctx);
    if (game.machine.is('PAUSED')) this.#drawPauseOverlay(ctx);
  }

  #drawEntities(ctx) {
    const game = this.game;
    // base emblem (under tanks but over field)
    this.#drawBase(ctx);
    for (const e of game.enemies) {
      if (!e.alive) continue;
      if (e.spawning) {
        this.#drawSpawnStar(ctx, e.x + 16, e.y + 16, game.frame);
      } else {
        const palette = this.enemyPalette(e.type);
        const stage = e.type === 'armor' ? e.hp <= 2 : false;
        const track = e.moving ? Math.floor(game.frame / 4) % 2 : 0;
        this._blitTank(ctx, e, palette, track, stage);
        if (e.blinkOn && Math.floor(game.frame / 6) % 2 === 0) {
          ctx.strokeStyle = '#ffffff';
          ctx.strokeRect(e.x + 0.5, e.y + 0.5, 31, 31);
        }
        if (e.hitFlash > 0) {
          px(ctx, e.x + 8, e.y + 8, 16, 16, '#ffffff');
        }
      }
    }
    for (const p of game.players) {
      if (!p.alive) continue;
      const track = p.engineSound ? Math.floor(game.frame / 4) % 2 : 0;
      this._blitTank(ctx, p, this.playerPalette(p.id), track, false);
      if (p.shieldTicks > 0) this.#drawShield(ctx, p, game.frame);
    }
    for (const b of game.bullets) {
      if (!b.alive) continue;
      px(ctx, b.x - 3, b.y - 3, 6, 6, '#f5f5f5');
      px(ctx, b.x - 2, b.y - 2, 4, 4, '#bfbfbf');
    }
    for (const beam of game.effects.beamList) this.#drawBeam(ctx, beam);
    if (game.powerup && game.powerup.alive) this.#drawPowerup(ctx, game.powerup, game.frame);
    // effects
    for (const ex of game.effects.explosionList) this.#drawExplosion(ctx, ex);
    for (const s of game.effects.sparkList) px(ctx, s.x - 2 + (s.t % 4) - 2, s.y - 2, 3, 3, '#ffffff');
    for (const c of game.effects.crumbList) {
      px(ctx, c.x - 3, c.y - 1, 2, 2, '#8a2f22');
      px(ctx, c.x + 1, c.y + 1, 2, 2, '#5d1f16');
      px(ctx, c.x, c.y - 4, 2, 2, '#a33a2a');
    }
    for (const f of game.effects.floatList) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(f.text, f.x, f.y - f.t * 0.5);
    }
    for (const s of game.effects.starList) this.#drawSpawnStar(ctx, s.x, s.y, game.frame - s.t);
  }

  #drawShield(ctx, p, frame) {
    const blink = p.shieldTicks < 60 && Math.floor(frame / 4) % 2 === 0;
    if (blink && p.shieldTicks < 60) return;
    ctx.strokeStyle = Math.floor(frame / 6) % 2 === 0 ? '#ffffff' : '#7fe3ff';
    ctx.beginPath();
    ctx.arc(p.x + 16, p.y + 16, 20, 0, Math.PI * 2);
    ctx.stroke();
  }

  #drawSpawnStar(ctx, x, y, frame) {
    const phase = Math.floor(frame / 3) % 4;
    const r = 6 + phase * 2;
    ctx.strokeStyle = Math.floor(frame / 3) % 2 === 0 ? '#ffffff' : '#8fd8ff';
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    ctx.stroke();
    ctx.strokeStyle = '#ffcf4c';
    ctx.strokeRect(x - 8, y - 8, 16, 16);
  }

  #drawExplosion(ctx, ex) {
    const k = ex.t / ex.dur;
    const r = ex.big ? 20 : 12;
    const phase = k < 0.33 ? 0 : k < 0.66 ? 1 : 2;
    const colors = ['#ffffff', '#ffcf4c', '#e05143'];
    const rr = (0.4 + k * 0.8) * r;
    ctx.fillStyle = colors[phase];
    this.#blob(ctx, ex.x, ex.y, rr);
    if (ex.big) {
      ctx.fillStyle = colors[(phase + 1) % 3];
      this.#blob(ctx, ex.x, ex.y, rr * 0.5);
    }
  }

  #blob(ctx, x, y, r) {
    for (let a = 0; a < 8; a++) {
      const ang = (Math.PI * 2 * a) / 8;
      const wob = ((a % 2) + 1) * 0.35;
      px(ctx, x + Math.cos(ang) * r * (0.6 + wob * 0.3) - r * 0.22, y + Math.sin(ang) * r * (0.6 + wob * 0.3) - r * 0.22, r * 0.45, r * 0.45);
    }
  }

  #drawBase(ctx) {
    const game = this.game;
    if (!game.map) return;
    const cell = game.map.baseCells[0];
    const x = cell.cx * 16;
    const y = cell.cy * 16;
    // base platform
    px(ctx, x, y, 32, 32, C.baseSteel);
    if (!game.map.baseAlive()) {
      px(ctx, x + 2, y + 2, 28, 28, C.wreck);
      px(ctx, x + 6, y + 8, 6, 6, '#2a2a31');
      px(ctx, x + 18, y + 6, 8, 8, '#2a2a31');
      px(ctx, x + 12, y + 18, 10, 8, '#6a6a74');
      return;
    }
    px(ctx, x + 4, y + 4, 24, 24, C.baseDark);
    px(ctx, x + 8, y + 8, 16, 16, C.baseGold);
    // original "shield + cannon" emblem
    px(ctx, x + 12, y + 10, 8, 3, C.baseSteel);
    px(ctx, x + 14, y + 13, 4, 6, C.baseSteel);
    px(ctx, x + 12, y + 19, 8, 3, C.baseDark);
    ctx.fillStyle = C.baseGold;
    ctx.font = 'bold 20px monospace';
  }

  #drawPowerup(ctx, powerup, frame) {
    if (powerup.blinking && Math.floor(frame / 4) % 2 === 0) return;
    const look = POWERUP_LOOK[powerup.type] || { glyph: '?', color: C.accent };
    const x = powerup.x;
    const y = powerup.y;
    px(ctx, x, y, 32, 32, '#22222c');
    px(ctx, x + 2, y + 2, 28, 28, '#3a3a48');
    // identity bar so weapon drops are distinguishable at a glance
    px(ctx, x + 2, y + 27, 28, 3, look.color);
    const t = Math.floor(frame / 8) % 2 === 0;
    ctx.fillStyle = t ? look.color : '#ffffff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(look.glyph, x + 9, y + 24);
  }

  // Laser beam: bright core inside a wide fading glow, axis-aligned.
  #drawBeam(ctx, beam) {
    const k = 1 - beam.t / beam.dur;
    if (k <= 0) return;
    const horizontal = beam.y0 === beam.y1;
    const x = Math.min(beam.x0, beam.x1);
    const y = Math.min(beam.y0, beam.y1);
    const len = horizontal ? Math.abs(beam.x1 - beam.x0) : Math.abs(beam.y1 - beam.y0);
    if (len <= 0) return;
    const glow = Math.max(2, Math.round(12 * k));
    const core = Math.max(1, Math.round(4 * k));
    const gx = horizontal ? x : beam.x0 - glow / 2;
    const gy = horizontal ? beam.y0 - glow / 2 : y;
    px(ctx, gx, gy, horizontal ? len : glow, horizontal ? glow : len,
      `rgba(255,92,138,${0.25 + 0.45 * k})`);
    const cx = horizontal ? x : beam.x0 - core / 2;
    const cy = horizontal ? beam.y0 - core / 2 : y;
    px(ctx, cx, cy, horizontal ? len : core, horizontal ? core : len, '#ffe0ea');
  }

  // --- sidebar / HUD -----------------------------------------------------------------------

  // Pause button lives in the sidebar's free band (below player stats, above status flags).
  static get pauseButtonRect() {
    return { x: MAP_PX + 14, y: 252, w: 68, h: 30 };
  }

  #drawPauseButton(ctx) {
    const game = this.game;
    const r = Renderer.pauseButtonRect;
    const paused = game.machine.is('PAUSED');
    px(ctx, r.x, r.y, r.w, r.h, paused ? '#1d2a4a' : '#171720');
    px(ctx, r.x, r.y, r.w, 2, paused ? C.accent : '#3a3a4a');
    px(ctx, r.x, r.y + r.h - 2, r.w, 2, paused ? C.accent : '#2c2c36');
    // icon: two pause bars / play triangle
    if (paused) {
      ctx.fillStyle = C.accent;
      ctx.beginPath();
      ctx.moveTo(r.x + 12, r.y + 9);
      ctx.lineTo(r.x + 12, r.y + 21);
      ctx.lineTo(r.x + 23, r.y + 15);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = C.text;
      px(ctx, r.x + 12, r.y + 9, 4, 13);
      px(ctx, r.x + 19, r.y + 9, 4, 13);
    }
    ctx.font = '10px monospace';
    ctx.fillStyle = paused ? C.accent : C.text;
    ctx.fillText(paused ? 'RESUME' : 'PAUSE', r.x + 28, r.y + 19);
  }

  #drawSidebar(ctx) {
    const game = this.game;
    const hud = buildHudView(game, game.pStorage);
    const x = MAP_PX;
    px(ctx, x, 0, SIDEBAR_PX, MAP_PX, '#101018');
    ctx.font = '11px monospace';
    ctx.fillStyle = C.text;
    ctx.fillText('STAGE', x + 14, 26);
    ctx.font = 'bold 15px monospace';
    ctx.fillText(String(hud.stage), x + 60, 26);

    // remaining enemies
    ctx.font = '11px monospace';
    ctx.fillStyle = C.dim;
    ctx.fillText('ENEMIES', x + 14, 48);
    ctx.fillStyle = C.enemyIcon;
    this.#miniTankIcon(ctx, x + 12, 54);
    ctx.fillStyle = C.text;
    ctx.font = 'bold 13px monospace';
    ctx.fillText(String(hud.enemiesLeft), x + 34, 66);

    let yy = 92;
    ctx.font = '11px monospace';
    ctx.fillStyle = C.dim;
    ctx.fillText('HI SCORE', x + 14, yy);
    ctx.fillStyle = C.accent;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(String(hud.highScore), x + 14, yy + 15);

    for (const p of hud.players) {
      yy += 42;
      ctx.fillStyle = C.dim;
      ctx.font = '11px monospace';
      ctx.fillText(p.label, x + 14, yy);
      ctx.fillStyle = this.playerPalette(p.id)[0];
      ctx.font = 'bold 12px monospace';
      ctx.fillText(String(p.score).padStart(6, '0'), x + 34, yy);
      // lives icons
      for (let i = 0; i < Math.min(p.lives, 5); i++) {
        this.#miniTankIcon(ctx, x + 14 + i * 14, yy + 6, p.id);
      }
      if (p.lives > 5) {
        ctx.fillStyle = C.text;
        ctx.font = '10px monospace';
        ctx.fillText(`+${p.lives - 5}`, x + 14 + 75, yy + 14);
      }
      // fire level stars
      ctx.fillStyle = C.accent;
      ctx.font = '10px monospace';
      ctx.fillText('★'.repeat(p.fireLevel) + '◇'.repeat(3 - p.fireLevel), x + 14, yy + 28);
    }

    // status flags
    let fy = MAP_PX - 96;
    ctx.font = '10px monospace';
    for (const flag of hud.flags) {
      ctx.fillStyle = '#6fc3e8';
      ctx.fillText(`${flag.name} ${flag.seconds}s`, x + 14, fy);
      fy += 12;
    }
    if (hud.muted) {
      ctx.fillStyle = C.red;
      ctx.fillText('MUTED', x + 14, MAP_PX - 12);
    }
    if (hud.paused) {
      ctx.fillStyle = C.accent;
      ctx.fillText('PAUSED', x + 34, MAP_PX - 26);
    }
    this.#drawPauseButton(ctx);
  }

  #miniTankIcon(ctx, x, y, player = null) {
    px(ctx, x, y, 8, 8, '#22222a');
    px(ctx, x + 1, y + 2, 6, 5, player === 0 ? C.p1 : player === 1 ? C.p2 : C.enemyIcon);
    px(ctx, x + 2, y - 2, 3, 4, player === 0 ? C.p1 : player === 1 ? C.p2 : C.enemyIcon);
  }

  // --- overlays ------------------------------------------------------------------------------

  #drawBanner(ctx, text, color) {
    const { game } = this;
    const blink = Math.floor(game.frame / 20) % 2 === 0;
    if (!blink) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, MAP_PX / 2 - 30, MAP_PX, 60);
    }
    ctx.fillStyle = color;
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, MAP_PX / 2, MAP_PX / 2 + 12);
    ctx.textAlign = 'left';
  }

  #drawPauseOverlay(ctx) {
    const { game } = this;
    if (Math.floor(game.frame / 20) % 2 === 0) return;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(MAP_PX / 2 - 70, MAP_PX / 2 - 26, 140, 52);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', MAP_PX / 2, MAP_PX / 2 + 8);
    ctx.font = '10px monospace';
    ctx.fillText('P: RESUME  ESC: MENU', MAP_PX / 2, MAP_PX / 2 + 22);
    ctx.textAlign = 'left';
  }

  #drawDebug(ctx) {
    const { game } = this;
    ctx.fillStyle = 'rgba(10,10,18,0.8)';
    ctx.fillRect(4, 4, 190, 46);
    ctx.fillStyle = '#7fe3ff';
    ctx.font = '10px monospace';
    const snap = game.getSnapshot();
    ctx.fillText(`frame ${snap.frame} state ${snap.state}`, 8, 16);
    ctx.fillText(`enemies ${snap.activeObjects.enemies} bullets ${snap.activeObjects.bullets}`, 8, 28);
    ctx.fillText(`effects ${snap.activeObjects.effects} frozen ${snap.timers.frozenTicks}`, 8, 40);
  }

  // --- menu / help / flow screens --------------------------------------------------------------

  #drawMenu(ctx) {
    const game = this.game;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center';
    // title
    const bob = Math.floor(game.frame / 24) % 2;
    ctx.fillStyle = bob ? C.accent : '#f0b21c';
    ctx.font = 'bold 52px monospace';
    ctx.fillText('STEEL VANGUARD', CANVAS_W / 2, 112);
    ctx.fillStyle = C.dim;
    ctx.font = 'bold 15px monospace';
    ctx.fillText('ORIGINAL TANK BATTLE · 35 STAGES', CANVAS_W / 2, 140);

    const items = MENU_ITEMS.map(item => {
      const [label, hint] = [item.label, item.hint];
      return [label, hint];
    });
    items.forEach(([label, hint], i) => {
      const y = 192 + i * 38;
      const sel = game.menuIndex === i;
      ctx.fillStyle = sel ? C.accent : C.dim;
      ctx.font = sel ? 'bold 20px monospace' : '17px monospace';
      ctx.fillText(label, CANVAS_W / 2, y);
      if (sel) {
        ctx.fillText('▶', CANVAS_W / 2 - 110, y);
        ctx.font = '10px monospace';
        ctx.fillText(hint, CANVAS_W / 2, y + 15);
      }
    });

    ctx.fillStyle = C.dim;
    ctx.font = '11px monospace';
    const store = game.pStorage;
    ctx.fillText(`HI SCORE ${store?.data.highScore ?? game.highScore ?? 0}   UNLOCKED STAGE ${store?.data.maxUnlockedLevel ?? 1}`, CANVAS_W / 2, 386);
    ctx.fillText('W/S SELECT · ENTER CONFIRM', CANVAS_W / 2, 404);
    ctx.textAlign = 'left';
  }

  #drawHelp(ctx) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const lines = [
      ['STEEL VANGUARD — HELP', C.accent],
      ['', C.text],
      ['P1: W/A/S/D move · SPACE fire', C.text],
      ['P2: Arrow keys move · ENTER fire', C.text],
      ['P pause · R restart stage · M mute', C.text],
      ['ESC menu · F2 debug info', C.text],
      ['', C.text],
      ['TERRAIN:', C.accent],
      ['BRICK — bullets chew it chunk by chunk', C.text],
      ['STEEL — only Level-3 shells break it', C.text],
      ['WATER — blocks tanks; shells fly over', C.text],
      ['GRASS — hides your tank from sight', C.text],
      ['ICE — keep sliding after you stop', C.text],
      ['BASE — defend it from every shell!', C.text],
      ['', C.text],
      ['POWER-UPS (shoot flashing carriers):', C.accent],
      ['★ L1 · ⊙ 10s shield · ⏱ 10s freeze', C.text],
      ['⛏ 18s steel base walls · ✸ kill all', C.text],
      ['+1 extra life', C.text],
      ['', C.text],
      ['WEAPON DROPS:', C.accent],
      ['⚡ LASER — instant beam clears a whole lane', C.text],
      ['» RAPID — 10s machine-gun, faster shells', C.text],
      ['Y SCATTER — 12s triple-shot spread', C.text],
      ['', C.text],
      ['REACH STAGE 35 CLEAR TO WIN.', C.accent],
      ['ESC: BACK TO MENU', C.dim],
    ];
    let y = 24;
    for (const [text, color] of lines) {
      ctx.fillStyle = color;
      ctx.font = text.startsWith('STEEL VANG') ? 'bold 15px monospace' : '10px monospace';
      ctx.fillText(text, 18, y);
      y += 14;
    }
  }

  #drawStageIntro(ctx) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.accent;
    ctx.font = 'bold 36px monospace';
    ctx.fillText('STAGE', CANVAS_W / 2, MAP_PX / 2 - 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 46px monospace';
    ctx.fillText(String(this.game.levelNum), CANVAS_W / 2, MAP_PX / 2 + 22);
    ctx.textAlign = 'left';
  }

  #drawScoreSummary(ctx) {
    const game = this.game;
    ctx.fillStyle = 'rgba(6,6,12,0.86)';
    ctx.fillRect(20, 60, MAP_PX - 40, MAP_PX - 120);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.accent;
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`STAGE ${game.levelNum} REPORT`, MAP_PX / 2, 96);
    ctx.textAlign = 'left';
    let y = 130;
    ctx.font = '12px monospace';
    for (const player of game.scoreSummary.players) {
      const kills = player.kills || { basic: 0, fast: 0, power: 0, armor: 0 };
      ctx.fillStyle = this.playerPalette(player.id)[0];
      ctx.fillText(`PLAYER ${player.id + 1}`, 60, y);
      y += 22;
      ctx.fillStyle = C.dim;
      const rows = [
        ['basic', 100], ['fast', 200], ['power', 300], ['armor', 400],
      ];
      for (const [type, pts] of rows) {
        const n = kills[type] || 0;
        ctx.fillText(`${type.toUpperCase().padEnd(8)} x${String(n).padStart(2)}  ${String(n * pts).padStart(6)} pts`, 78, y);
        y += 18;
      }
      ctx.fillStyle = C.text;
      ctx.fillText(`TOTAL SCORE ${String(player.score).padStart(6)}`, 78, y);
      y += 34;
    }
    ctx.textAlign = 'left';
  }

  #drawVictory(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center';
    const blink = Math.floor(this.game.frame / 16) % 2 === 0;
    ctx.fillStyle = blink ? C.accent : '#ffffff';
    ctx.font = 'bold 40px monospace';
    ctx.fillText('VICTORY!', CANVAS_W / 2, MAP_PX / 2 - 20);
    ctx.fillStyle = C.text;
    ctx.font = '13px monospace';
    ctx.fillText(`ALL 35 STAGES CLEARED — TOTAL ${this.game.players.map(p => p.score).join(' + ')} POINTS`, CANVAS_W / 2, MAP_PX / 2 + 16);
    ctx.textAlign = 'left';
  }
}
