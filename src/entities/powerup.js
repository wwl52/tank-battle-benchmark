import { POWERUP } from '../config.js';

/**
 * Pick-ups. One may exist at a time (enforced by game.js); replaced when a new one
 * spawns. Blink animation is derived from tick parity — deterministic for tests.
 */
export class PowerUp {
  constructor(type, cell) {
    if (!POWERUP.types.includes(type)) throw new Error(`bad powerup type: ${type}`);
    this.type = type;
    this.x = cell.cx * 16;
    this.y = cell.cy * 16;
    this.w = 32;
    this.h = 32;
    this.ticks = 0;
    this.lifeTicks = POWERUP.lifeTicks;
    this.alive = true;
  }

  get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  get expired() { return this.ticks >= this.lifeTicks; }
  get blinking() { return this.lifeTicks - this.ticks <= POWERUP.blinkTicks; }
  get phase() { return Math.floor(this.ticks / 4) % 2; }

  tick() {
    this.ticks++;
    if (this.ticks >= this.lifeTicks) this.alive = false;
  }
}
