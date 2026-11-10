import {
  TICK_DT, TICK_HZ, FLOW, PLAYER, ENEMY, POWERUP, TERRAIN, DIRS, TOTAL_LEVELS, MAP_PX, CELL, GRID,
} from './config.js';
import { Rng, hashSeed } from './rng.js';
import { GameMap, cellIndex } from './map.js';
import { getLevel } from './levels.js';
import { rectsOverlap, sweepBullet, moveTankRect } from './collision.js';
import { StateMachine } from './state-machine.js';
import { menuChoice } from './ui/menu.js';
import { Player, EMPTY_INPUT } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { tankRect, dirVec, bulletSpawnPoint } from './entities/tank.js';
import { Bullet } from './entities/bullet.js';
import { PowerUp } from './entities/powerup.js';
import { Effects } from './entities/effects.js';
import { decideDirection, enemyFireDecision, demoInput } from './ai.js';

const MENU_ITEMS = ['1 PLAYER', '2 PLAYERS', 'DEMO', 'HELP', 'CLEAR DATA'];

/**
 * Core game simulation. Pure logic + deterministic RNG: instantiable inside Node
 * for tests; rendering/input/audio/stage flow chrome are provided by main.js.
 */
export class Game {
  constructor(options = {}) {
    this.mode = options.mode || '1P';          // '1P' | '2P' | 'DEMO'
    this.seed = options.seed ?? 4241;
    this.levelNum = Math.min(TOTAL_LEVELS, Math.max(1, options.level || 1));
    this.rng = new Rng(this.seed);
    this.machine = new StateMachine('MAIN_MENU');
    this.machine.onTransition((from, to) => {
      this.events.push(`state:${to}`);
      this.stateTimer = 0;
    });
    this.menuIndex = 0;
    this.frame = 0;
    this.events = [];
    this.effects = new Effects();
    this.bullets = [];
    this.enemies = [];
    this.players = [];
    this.powerup = null;
    this.pInputs = [EMPTY_INPUT, EMPTY_INPUT];
    this.respawnTimers = [-1, -1];
    this.spawnTimer = 0;
    this.spawnPointOrder = 0;
    this.frozenTicks = 0;
    this.shovelTicks = 0;
    this.nextEnemyId = 1;
    this.map = null;
    this.levelData = null;
    this.enemyQueue = [];
    this.spawnedCount = 0;
    this.scoreSummary = { players: [] };
    this.demoRng = new Rng(hashSeed(`demo-${this.seed}`));
    this.pausedFrom = null;
    this.highScore = options.highScore || 0;
  }

  // -------------------- stage / flow -------------------------------------------------

  #loadStage(n) {
    this.levelNum = n;
    const level = getLevel(n);
    this.map = GameMap.fromAscii(level.rows);
    this.levelData = level;
    this.enemyQueue = level.enemies.slice();
    const carriers = new Set(level.carriers);
    level.enemies.forEach((t, i) => { if (carriers.has(i)) this.enemyQueue[i] = { type: t, carrier: true }; });
    this.spawnedCount = 0;
    this.enemies = [];
    this.bullets = [];
    this.powerup = null;
    this.effects = new Effects();
    this.frozenTicks = 0;
    this.shovelTicks = 0;
    this.respawnTimers = [-1, -1];
    this.spawnTimer = 0;
    this.spawnPointOrder = 0;
    const nPlayers = this.mode === '2P' ? 2 : 1;
    this.players = [];
    for (let i = 0; i < nPlayers; i++) {
      const p = new Player(i, this.map.playerSpawns[i]);
      p.respawn();
      this.players.push(p);
    }
    this.hudEnemiesLeft = () => this.#remainingEnemies();
    this.machine.force('STAGE_INTRO');
    this.events.push('stage-start');
  }

  startGame(options = {}) {
    if (options.mode) this.mode = options.mode;
    if (options.seed !== undefined) {
      this.seed = options.seed;
      this.rng = new Rng(this.seed);
      this.demoRng = new Rng(hashSeed(`demo-${this.seed}`));
    }
    const lvl = options.level || this.levelNum;
    this.#loadStage(lvl);
    if (options.players && options.players.length) this.players = options.players;
    return this.machine.state;
  }

  resetGame() {
    this.rng = new Rng(this.seed);
    this.demoRng = new Rng(hashSeed(`demo-${this.seed}`));
    this.machine.force('MAIN_MENU');
    this.menuIndex = 0;
    this.players = [];
    this.enemies = [];
    this.bullets = [];
    this.powerup = null;
    this.effects = new Effects();
    this.frozenTicks = 0;
    this.shovelTicks = 0;
    this.map = null;
    this.levelData = null;
    this.enemyQueue = [];
    this.levelNum = 1;
  }

  pause() {
    if (this.machine.is('PLAYING') || this.machine.is('PLAYER_RESPAWN')) {
      this.pausedFrom = this.machine.state;
      this.machine.goto('PAUSED');
      this.events.push('pause');
      return true;
    }
    return false;
  }

  resume() {
    if (this.machine.is('PAUSED')) {
      this.machine.goto(this.pausedFrom || 'PLAYING');
      this.pausedFrom = null;
      return true;
    }
    return false;
  }

  restartStage() {
    // fresh stage with fresh lives, same level number
    this.#loadStage(this.levelNum);
  }

  menuMove(delta) {
    if (!this.machine.is('MAIN_MENU')) return;
    this.menuIndex = (this.menuIndex + delta + MENU_ITEMS.length) % MENU_ITEMS.length;
  }

  menuConfirm() {
    if (!this.machine.is('MAIN_MENU')) return;
    const choice = menuChoice(this.menuIndex);
    this.events.push('menu-confirm');
    if (choice === '1P') this.startGame({ mode: '1P' });
    else if (choice === '2P') this.startGame({ mode: '2P' });
    else if (choice === 'DEMO') this.startGame({ mode: 'DEMO' });
    else if (choice === 'HELP') this.machine.goto('HELP');
    else if (choice === 'CLEAR') this.events.push('clear-data'); // main.js wipes storage
  }

  openHelp() {
    if (this.machine.is('MAIN_MENU')) this.machine.goto('HELP');
  }

  closeHelp() {
    if (this.machine.is('HELP')) this.machine.goto('MAIN_MENU');
  }

  toMenu() {
    if (STATES_EXIT_TO_MENU.includes(this.machine.state)) {
      this.machine.force('MAIN_MENU');
    }
  }

  // -------------------- update ----------------------------------------------------

  update(dt = TICK_DT) {
    this.frame++;
    const st = this.machine.state;
    switch (st) {
      case 'MAIN_MENU':
        this.stateTimer += dt;
        break;
      case 'HELP':
        this.stateTimer += dt;
        break;
      case 'STAGE_INTRO':
        this.stateTimer += dt;
        if (this.stateTimer >= FLOW.stageIntroTicks / TICK_HZ) this.machine.goto('PLAYING');
        break;
      case 'PLAYING':
      case 'PLAYER_RESPAWN':
        this.#worldTick(dt);
        break;
      case 'PAUSED':
        // everything frozen: no timers, no animations, no audio cues pushed
        break;
      case 'STAGE_CLEAR':
        this.stateTimer += dt;
        if (this.stateTimer >= FLOW.stageClearTicks / TICK_HZ) {
          this.machine.goto('SCORE_SUMMARY');
          this.events.push('score-summary');
        }
        break;
      case 'SCORE_SUMMARY':
        this.stateTimer += dt;
        if (this.stateTimer >= FLOW.scoreSummaryTicks / TICK_HZ) this.#afterSummary();
        break;
      case 'GAME_OVER':
        this.stateTimer += dt;
        if (this.stateTimer >= FLOW.gameOverTicks / TICK_HZ) this.toMenu();
        break;
      case 'VICTORY':
        this.stateTimer += dt;
        break;
      default:
        break;
    }
  }

  #afterSummary() {
    if (this.levelNum >= TOTAL_LEVELS) {
      this.events.push('victory');
      this.machine.force('VICTORY');
    } else {
      this.#loadStage(this.levelNum + 1);
    }
  }

  stepFrames(n) {
    for (let i = 0; i < n; i++) this.update(TICK_DT);
  }

  setPlayerInput(playerId, inputState) {
    if (playerId < 0 || playerId > 1) return;
    this.pInputs[playerId] = { ...EMPTY_INPUT, ...inputState };
  }

  /** Test/automation hook: drives all players from `inputs` for one update call. */
  updateWithInputs(dt, inputs) {
    this.pInputs = inputs;
    this.update(dt);
  }

  #remainingEnemies() {
    return this.enemyQueue.length - this.spawnedCount + this.enemies.filter(e => e.alive).length;
  }

  // -------------------- world simulation ---------------------------------------------

  #worldTick(dt) {
    // timers (metallic clock + shovel) tick even while enemies are frozen
    if (this.frozenTicks > 0) {
      this.frozenTicks--;
      if (this.frozenTicks === 0) this.events.push('unfreeze');
    }
    if (this.shovelTicks > 0) {
      this.shovelTicks--;
      if (this.shovelTicks === 0 && this.map.fortifyActive) {
        this.map.restoreBaseWalls();
        this.events.push('shovel-end');
      }
    }

    // player inputs (DEMO derives them from the AI)
    const inputs = [];
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      if (this.mode === 'DEMO' && i === 0) {
        inputs.push(player.alive && player.stunTicks === 0
          ? demoInput(player, { enemies: this.enemies, baseRect: () => this.#baseRect(), rng: this.demoRng })
          : EMPTY_INPUT);
      } else {
        inputs.push(player.alive ? this.pInputs[i] : EMPTY_INPUT);
      }
    }

    this.#tickPlayers(dt, inputs);
    if (this.frozenTicks <= 0) this.#tickEnemies(dt);
    else {
      // frozen: enemy cadence timers hold, spawn loop holds, enemy bullets hold
      for (const e of this.enemies) if (e.spawning) e.tick(0, this.#enemyWorld(), () => false);
    }
    this.#spawnLoop(dt);
    this.#updateBullets(dt);
    this.#cancelBullets();
    this.#tickPowerup();
    this.effects.tick();
    this.#checkRespawns(dt);
    this.#checkStageClear();
    // cleanup: destroyed enemies drop out of the active list at end-of-frame
    this.enemies = this.enemies.filter(e => e.alive);
  }

  #baseRect() {
    const c = this.map.baseCells[0];
    return { x: c.cx * 16, y: c.cy * 16, w: 32, h: 32 };
  }

  #enemyWorld() {
    const self = this;
    return {
      map: this.map,
      rng: this.rng,
      players: this.players.filter(p => p.alive),
      baseRect: () => self.#baseRect(),
      move: (tank, dir, dist) => this.#moveTank(tank, dir, dist, this.enemies.filter(e => e !== tank && !e.spawning), this.players.filter(p => p.alive)),
      mayFire: (e) => e.liveBullets < 1,
    };
  }

  #tickPlayers(dt, inputs) {
    const w = {
      map: this.map,
      move: (tank, dir, dist) => this.#moveTank(tank, dir, dist, this.players.filter(p => p !== tank && p.alive), this.enemies.filter(e => !e.spawning && e.alive)),
      mayFire: (p) => {
        const count = this.bullets.filter(b => b.alive && b.faction === 'player' && b.ownerId === p.id).length;
        return count < p.maxBullets;
      },
    };
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p.alive) continue;
      const { fired, moving } = p.tick(inputs[i], dt, this.map, w.move, w.mayFire);
      if (fired) {
        this.bullets.push(fired);
        // SCATTER weapon: two extra shells fan out sideways from the centre shot
        if (p.scatterTicks > 0 && fired.alive) {
          const off = POWERUP.weapon.scatterSpread;
          const v = dirVec(p.dir);
          const perp = v.y === 0 ? { x: 0, y: 1 } : { x: 1, y: 0 };
          for (const sign of [-1, 1]) {
            this.bullets.push(new Bullet({
              x: fired.x + perp.x * off * sign, y: fired.y + perp.y * off * sign,
              dir: p.dir, speed: fired.speed,
              faction: 'player', ownerId: p.id, power: fired.power,
            }));
          }
        }
        this.events.push('shoot-player');
      }
      p.engineSound = moving;
    }
    // player vs power-up pickup + player invulnerable shield ticking
    for (const p of this.players) {
      if (p.alive && this.powerup && rectsOverlap(p.rect, this.powerup.rect)) {
        this.#applyPowerup(p, this.powerup);
      }
    }
  }

  #tickEnemies(dt) {
    const w = this.#enemyWorld();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      // per-tank live shell budget (each enemy fires at most one shell at a time)
      e.liveBullets = this.bullets.filter(b => b.alive && b.faction === 'enemy' && b.ownerId === e.id).length;
      const { fired } = e.tick(dt, w, w.mayFire);
      if (fired) {
        fired.ownerId = e.id;
        this.bullets.push(fired);
        this.events.push('shoot-enemy');
      }
    }
  }

  // Movement with wall + tank collision + perpendicular lane snapping (8px lanes).
  #moveTank(tank, dir, dist, ...otherGroups) {
    const others = [];
    for (const g of otherGroups) for (const t of g) others.push(tankRect(t));

    // entering a new axis: snap the perpendicular coordinate to the 8px lane grid
    const v = DIRS[dir];
    const r0 = tankRect(tank);
    if (v.x !== 0) {
      const q = Math.round(tank.y / 8) * 8;
      if (q !== tank.y && q >= 0 && q <= MAP_PX - 32) this.#trySnapY(tank, q, others);
    } else if (v.y !== 0) {
      const q = Math.round(tank.x / 8) * 8;
      if (q !== tank.x && q >= 0 && q <= MAP_PX - 32) this.#trySnapX(tank, q, others);
    }

    const res = moveTankRect(this.map, tankRect(tank), v.x * dist, v.y * dist);
    let { x, y } = res;
    let blocked = false;
    // tank-vs-tank: may not interpenetrate; clamp flush against the obstacle
    for (const o of others) {
      if (v.x !== 0) {
        const perpOverlap = (y + 32 - 0.5 > o.y) && (y < o.y + 32 - 0.5);
        if (!perpOverlap) continue;
        if (v.x > 0 && x + 32 > o.x && tank.x + 32 <= o.x + 0.5) { const lim = Math.max(tank.x, o.x - 32); if (x > lim) { x = lim; blocked = true; } }
        if (v.x < 0 && x < o.x + 32 && tank.x >= o.x + 32 - 0.5) { const lim = Math.min(tank.x, o.x + 32); if (x < lim) { x = lim; blocked = true; } }
      }
      if (v.y !== 0) {
        const perpOverlap = (x + 32 - 0.5 > o.x) && (x < o.x + 32 - 0.5);
        if (!perpOverlap) continue;
        if (v.y > 0 && y + 32 > o.y && tank.y + 32 <= o.y + 0.5) { const lim = Math.max(tank.y, o.y - 32); if (y > lim) { y = lim; blocked = true; } }
        if (v.y < 0 && y < o.y + 32 && tank.y >= o.y + 32 - 0.5) { const lim = Math.min(tank.y, o.y + 32); if (y < lim) { y = lim; blocked = true; } }
      }
    }
    const moved = Math.abs(x - tank.x) > 0.001 || Math.abs(y - tank.y) > 0.001;
    tank.x = x;
    tank.y = y;
    return moved && !blocked;
  }

  #trySnapX(tank, q, others) {
    const probe = { x: q, y: tank.y, w: 32, h: 32 };
    if (this.#probeFree(probe, others)) tank.x = q;
  }

  #trySnapY(tank, q, others) {
    const probe = { x: tank.x, y: q, w: 32, h: 32 };
    if (this.#probeFree(probe, others)) tank.y = q;
  }

  #probeFree(probe, others) {
    const cells = [];
    for (let cy = Math.floor(probe.y / 16); cy <= Math.floor((probe.y + 31) / 16); cy++) {
      for (let cx = Math.floor(probe.x / 16); cx <= Math.floor((probe.x + 31) / 16); cx++) {
        if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return false;
        cells.push(cellIndex(cx, cy));
      }
    }
    if (cells.some(c => this.map.blockedForTank(c))) return false;
    return !others.some(o => rectsOverlap(probe, o));
  }

  // -------------------- bullets & damage ---------------------------------------------

  #updateBullets(dt) {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.framesAlive++;
      const hit = sweepBullet(this.map, b, b.speed * dt, (rect) => {
        // tanks encountered mid-sweep (fixed order: enemies then players)
        for (const e of this.enemies) {
          if (e.alive && !e.spawning && rectsOverlap(rect, e.rect)) {
            if (b.faction === 'enemy') continue; // enemy shells pass through allies
            return this.#bulletHitsTank(b, e);
          }
        }
        for (const p of this.players) {
          if (p.alive && rectsOverlap(rect, p.rect) && !(b.ownerId === p.id && b.faction === 'player')) {
            return this.#bulletHitsTank(b, p);
          }
        }
        return null;
      });
      if (!hit) continue;
      b.alive = false;
      switch (hit.hit) {
        case 'wall': this.effects.spark(hit.x, hit.y); this.events.push('bullet-wall'); break;
        case 'steel': this.effects.spark(hit.x, hit.y); this.events.push('hit-steel'); break;
        case 'steel-broken': this.effects.spark(hit.x, hit.y); this.events.push('hit-steel'); this.events.push('explosion-small'); break;
        case 'brick':
          this.effects.crumbs(hit.x, hit.y);
          this.events.push('hit-brick');
          break;
        case 'base': this.#baseDestroyed(b); break;
        case 'tank': /* handled inside #bulletHitsTank */ break;
        default: break;
      }
    }
    this.bullets = this.bullets.filter(b => b.alive);
  }

  #bulletHitsTank(bullet, tank) {
    const pos = bullet.rect();
    if (tank instanceof Enemy) {
      const result = tank.hit(bullet.power);
      if (result === 'immune' || result === 'shield') {
        this.effects.spark(pos.x, pos.y);
        return { hit: 'absorbed' };
      }
      if (result === 'destroyed') this.#enemyKilled(tank, bullet);
      else {
        this.events.push('tank-hit');
        this.effects.spark(pos.x, pos.y);
      }
      return { hit: 'tank' };
    }
    // player hit
    if (bullet.faction === 'player') {
      // friendly shell: short stun, never lethal
      tank.stun();
      this.effects.spark(pos.x, pos.y);
      this.events.push('friendly-stun');
      return { hit: 'tank' };
    }
    if (tank.shieldTicks > 0) {
      this.effects.spark(pos.x, pos.y);
      this.events.push('shield-hit');
      return { hit: 'tank' };
    }
    this.#playerKilled(tank, pos);
    return { hit: 'tank' };
  }

  #enemyKilled(enemy, bullet) {
    this.effects.explosion(enemy.x + 16, enemy.y + 16, false);
    const credit = bullet.faction === 'player' ? this.players[bullet.ownerId] : null;
    if (credit) {
      const pts = ENEMY.score[enemy.type];
      credit.addScore(pts);
      credit.levelKills[enemy.type] = (credit.levelKills[enemy.type] || 0) + 1;
      this.effects.scoreFloat(enemy.x, enemy.y, String(pts));
      if (credit.addScore(0)) this.events.push('extra-life');
      if (enemy.carrier) this.#spawnPowerup();
    }
    this.events.push('explosion-small');
  }

  #playerKilled(player, pos) {
    this.effects.explosion(pos.x, pos.y, true);
    this.events.push('explosion-big');
    this.events.push('player-death');
    player.onDeath();
    player.lives = Math.max(0, player.lives - 1);
    if (player.lives > 0) {
      this.respawnTimers[player.id] = PLAYER.respawnDelayTicks;
      if (this.players.length === 1) this.machine.goto('PLAYER_RESPAWN');
    } else {
      this.#checkGameOver();
    }
  }

  #checkGameOver() {
    const anyLeft = this.players.some(p => p.alive || p.lives > 0);
    if (!anyLeft) {
      this.events.push('game-over');
      this.highScore = Math.max(this.highScore, ...this.players.map(p => p.score));
      this.machine.goto('GAME_OVER');
      return true;
    }
    return false;
  }

  #checkRespawns(dt) {
    for (let i = 0; i < this.players.length; i++) {
      const t = this.respawnTimers[i];
      if (t > 0) {
        this.respawnTimers[i] = t - dt * TICK_HZ;
        if (this.respawnTimers[i] <= 0) {
          this.respawnTimers[i] = -1;
          this.players[i].respawn();
        }
      } else if (t === 0) {
        this.respawnTimers[i] = -1;
        this.players[i].respawn();
      }
    }
    if (this.machine.is('PLAYER_RESPAWN')) {
      const waiting = this.respawnTimers.some(t => t > 0);
      if (!waiting) this.machine.goto('PLAYING');
    }
  }

  #baseDestroyed(bullet) {
    if (!this.map.baseAlive()) return;
    this.map.destroyBase();
    this.effects.baseWreckFlash = 30;
    this.effects.explosion(this.#baseRect().x + 16, this.#baseRect().y + 16, true);
    this.events.push('explosion-big');
    this.events.push('base-destroyed');
    this.events.push('game-over');
    this.highScore = Math.max(this.highScore, ...this.players.map(p => p.score));
    this.machine.goto('GAME_OVER');
  }

  #cancelBullets() {
    // opposing shells annihilate one another
    for (let i = 0; i < this.bullets.length; i++) {
      const a = this.bullets[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.bullets.length; j++) {
        const b = this.bullets[j];
        if (!b.alive || a.faction === b.faction) continue;
        if (rectsOverlap(a.rect(), b.rect())) {
          a.alive = false;
          b.alive = false;
          this.effects.spark(a.x, a.y);
          this.events.push('bullet-cancel');
          break;
        }
      }
    }
  }

  // -------------------- enemy spawning ------------------------------------------------

  #spawnLoop(dt) {
    if (this.spawnedCount >= this.enemyQueue.length) return;
    if (this.enemies.filter(e => e.alive).length >= ENEMY.maxActive) return;
    this.spawnTimer -= dt * TICK_HZ;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = ENEMY.spawnInterval * TICK_HZ;
    // rotate between the three spawn points; occupied points are skipped this tick
    for (let k = 0; k < 3; k++) {
      const idx = (this.spawnPointOrder + k) % 3;
      const cell = this.map.spawnPoints[idx];
      const rect = { x: cell.cx * 16, y: cell.cy * 16, w: 32, h: 32 };
      const occupied = this.enemies.some(e => e.alive && rectsOverlap(rect, e.rect)) ||
        this.players.some(p => p.alive && rectsOverlap(rect, p.rect));
      if (occupied) continue;
      this.spawnPointOrder = (idx + 1) % 3;
      const next = this.enemyQueue[this.spawnedCount];
      const type = typeof next === 'object' ? next.type : next;
      const carrier = typeof next === 'object' ? next.carrier : false;
      const e = new Enemy(type, cell, { carrier, rng: this.rng });
      e.id = this.nextEnemyId++;
      e.startedOrder = this.spawnedCount;
      this.enemies.push(e);
      this.spawnedCount++;
      this.effects.spawnStar(rect.x + 16, rect.y + 16);
      return;
    }
    // all three points busy: retry soon instead of dropping the enemy
    this.spawnTimer = 0.3 * TICK_HZ;
  }

  // -------------------- power-ups ------------------------------------------------------

  #spawnPowerup() {
    const type = this.rng.pick(POWERUP.types);
    const cellCell = this.#findPowerupSpot();
    if (!cellCell) return; // no legal spot this tick; skip (carrier credit already given)
    this.powerup = new PowerUp(type, cellCell);
    this.events.push('powerup-spawn');
  }

  #findPowerupSpot() {
    for (let attempt = 0; attempt < 64; attempt++) {
      const cx = 1 + this.rng.int(GRID - 2);
      const cy = 2 + this.rng.int(GRID - 9);
      const rect = { x: cx * 16, y: cy * 16, w: 32, h: 32 };
      if (this.#probeFree(rect, [...this.enemies.filter(e => e.alive), ...this.players.filter(p => p.alive)].map(t => tankRect(t)))) {
        return { cx, cy };
      }
    }
    return null;
  }

  #applyPowerup(player, powerup) {
    powerup.alive = false;
    this.powerup = null;
    this.events.push('powerup-pickup');
    player.addScore(POWERUP.score);
    this.effects.scoreFloat(powerup.x, powerup.y, String(POWERUP.score));
    switch (powerup.type) {
      case 'star':
        player.powerLevel = Math.min(PLAYER.maxPowerLevel, player.powerLevel + 1);
        break;
      case 'shield':
        player.shieldTicks = PLAYER.powerupShieldTicks;
        break;
      case 'clock':
        this.frozenTicks = POWERUP.clockTicks;
        this.events.push('freeze');
        break;
      case 'shovel':
        this.map.fortifyBaseWalls();
        this.shovelTicks = POWERUP.shovelTicks;
        this.events.push('shovel-start');
        break;
      case 'grenade':
        for (const e of this.enemies) {
          if (!e.alive || e.spawning) continue;
          e.alive = false;
          this.effects.explosion(e.x + 16, e.y + 16, false);
          if (player.levelKills[e.type] !== undefined) {
            player.levelKills[e.type] += 1;
            player.addScore(ENEMY.score[e.type]);
          }
        }
        this.events.push('explosion-small');
        break;
      case 'life':
        player.lives += 1;
        this.events.push('extra-life');
        break;
      case 'rapid':
        player.rapidTicks = POWERUP.weapon.rapidTicks;
        break;
      case 'scatter':
        player.scatterTicks = POWERUP.weapon.scatterTicks;
        break;
      case 'laser':
        this.#fireLaser(player);
        break;
      default: break;
    }
  }

  /**
   * LAZER weapon: an instant beam fired in the tank's facing direction.
   * The lane is 2 cells wide (the tank's footprint) and burns through brick AND
   * steel, destroying every enemy tank inside it. Water/grass/ice are untouched,
   * and the base area is never harmed by the beam.
   */
  #fireLaser(player) {
    this.events.push('laser-fire');
    const v = dirVec(player.dir);
    // lane rect: everything strictly ahead of the tank, 32 px wide
    let lx = player.x, ly = player.y, lw = 32, lh = 32;
    if (player.dir === 'up')    { ly = 0;           lh = player.y; }
    if (player.dir === 'down')  { ly = player.y + 32; lh = MAP_PX - ly; }
    if (player.dir === 'left')  { lx = 0;           lw = player.x; }
    if (player.dir === 'right') { lx = player.x + 32; lw = MAP_PX - lx; }
    const lane = { x: lx, y: ly, w: lw, h: lh };
    if (lane.w <= 0 || lane.h <= 0) return;

    for (const e of this.enemies) {
      if (!e.alive || e.spawning) continue;
      if (rectsOverlap(e.rect, lane)) {
        e.alive = false;
        this.effects.explosion(e.x + 16, e.y + 16, true);
        if (player.levelKills[e.type] !== undefined) {
          player.levelKills[e.type] += 1;
          player.addScore(ENEMY.score[e.type]);
        }
      }
    }

    // burn every wall cell in the lane (brick quads and steel alike)
    const c0x = Math.floor(lane.x / CELL), c1x = Math.ceil((lane.x + lane.w) / CELL);
    const c0y = Math.floor(lane.y / CELL), c1y = Math.ceil((lane.y + lane.h) / CELL);
    for (let cy = c0y; cy < c1y; cy++) {
      for (let cx = c0x; cx < c1x; cx++) {
        if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) continue;
        const ci = cellIndex(cx, cy);
        const t = this.map.terrain[ci];
        if (t !== TERRAIN.BRICK && t !== TERRAIN.STEEL) continue;
        if (this.map.baseWallCells.includes(ci)) continue; // protect the fortress ring
        this.map.terrain[ci] = TERRAIN.EMPTY;
        this.map.brickQuads[ci] = 0;
        this.effects.crumbs(cx * CELL + 8, cy * CELL + 8);
      }
    }

    // beam visual: from the muzzle to the map edge along the facing
    const muzzle = { x: player.x + 16, y: player.y + 16 };
    this.effects.beam(muzzle.x, muzzle.y,
      dirVec(player.dir).x ? (player.dir === 'right' ? MAP_PX : 0) : muzzle.x,
      dirVec(player.dir).y ? (player.dir === 'down' ? MAP_PX : 0) : muzzle.y);
  }

  #tickPowerup() {    if (!this.powerup) return;
    this.powerup.tick();
    if (!this.powerup.alive) {
      this.powerup = null;
      this.events.push('powerup-expire');
    }
  }

  // -------------------- stage flow checks ----------------------------------------------

  #checkStageClear() {
    if (!this.machine.is('PLAYING') && !this.machine.is('PLAYER_RESPAWN')) return;
    const allSpawned = this.spawnedCount >= this.enemyQueue.length;
    const noneAlive = this.enemies.every(e => !e.alive);
    if (allSpawned && noneAlive) {
      this.scoreSummary = {
        players: this.players.map(p => ({
          id: p.id,
          score: p.score,
          kills: { ...p.levelKills },
        })),
      };
      this.events.push('stage-clear');
      this.highScore = Math.max(this.highScore, ...this.players.map(p => p.score));
      this.machine.goto('STAGE_CLEAR');
    }
  }

  // -------------------- debug & snapshot --------------------------------------------

  spawnEnemy(type, position) {
    const cell = position || this.map?.spawnPoints[0];
    if (!cell) return null;
    if (!['basic', 'fast', 'power', 'armor'].includes(type)) return null;
    const e = new Enemy(type, cell, { carrier: false, rng: this.rng });
    e.id = this.nextEnemyId++;
    this.enemies.push(e);
    return e.id;
  }

  spawnPowerUp(type, position) {
    const cell = position || { cx: 5, cy: 5 };
    this.powerup = new PowerUp(type, cell);
    return this.powerup;
  }

  damageTank(entityId, amount) {
    const e = this.enemies.find(x => x.id === entityId);
    if (e) return e.hit(amount);
    const p = this.players[entityId];
    if (p) {
      p.shieldTicks = 0;
      this.#playerKilled(p, { x: p.x + 16, y: p.y + 16 });
      return 'destroyed';
    }
    return 'not-found';
  }

  destroyBase() {
    if (this.map) this.#baseDestroyed(null);
  }

  clearActiveEnemies() {
    for (const e of this.enemies) {
      if (e.alive) {
        e.alive = false;
        this.effects.explosion(e.x + 16, e.y + 16, false);
      }
    }
  }

  getSnapshot() {
    return {
      version: '1.0.0',
      state: this.machine.state,
      mode: this.mode,
      level: this.levelNum,
      frame: this.frame,
      seed: this.seed,
      menuIndex: this.menuIndex,
      players: this.players.map(p => ({
        id: p.id, alive: p.alive, lives: p.lives, score: p.score,
        powerLevel: p.powerLevel, shieldTicks: p.shieldTicks, stunTicks: p.stunTicks,
        rapidTicks: p.rapidTicks, scatterTicks: p.scatterTicks,
        x: Math.round(p.x), y: Math.round(p.y), dir: p.dir,
        kills: { ...p.levelKills },
      })),
      enemies: this.enemies.map(e => ({
        id: e.id, type: e.type, alive: e.alive, hp: e.hp, carrier: e.carrier,
        spawning: e.spawning, x: Math.round(e.x), y: Math.round(e.y), dir: e.dir,
      })),
      bullets: this.bullets.map(b => ({ alive: b.alive, faction: b.faction, dir: b.dir, x: Math.round(b.x), y: Math.round(b.y) })),
      powerup: this.powerup ? { type: this.powerup.type, x: this.powerup.x, y: this.powerup.y, ticks: this.powerup.ticks } : null,
      base: { destroyed: this.map ? !this.map.baseAlive() : false },
      timers: {
        frozenTicks: this.frozenTicks,
        shovelTicks: this.shovelTicks,
        respawnTimers: [...this.respawnTimers],
        stateTimer: Math.round(this.stateTimer * 1000) / 1000,
        spawnTimer: Math.round(this.spawnTimer),
      },
      remainingEnemies: this.#remainingEnemies(),
      spawnedCount: this.spawnedCount,
      activeObjects: {
        enemies: this.enemies.length,
        bullets: this.bullets.length,
        effects: this.effects.count,
      },
    };
  }

  get stageEnemiesLeft() {
    return this.#remainingEnemies();
  }
}

const STATES_EXIT_TO_MENU = ['GAME_OVER', 'VICTORY', 'PAUSED', 'PLAYING', 'PLAYER_RESPAWN', 'HELP'];
