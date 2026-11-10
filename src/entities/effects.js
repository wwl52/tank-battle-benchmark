import { TICK_HZ } from '../config.js';

/**
 * Transient visual effects kept in fixed-capacity pools so object churn stays flat:
 * small/large explosions, steel-wall sparks, brick crumbs, score floats, spawn stars.
 * Pure data + deterministic phase math; the renderer turns them into pixels.
 * NOTE: pool arrays use a `List` suffix so they never shadow the spawn methods.
 */
export class Effects {
  constructor(capacityPerKind = 48) {
    this.explosionList = [];  // {x,y,t,dur,big}
    this.sparkList = [];
    this.crumbList = [];
    this.floatList = [];      // {x,y,t,dur,text}
    this.starList = [];       // spawn animations
    this.beamList = [];       // laser beams {x0,y0,x1,y1,t,dur}
    this.baseWreckFlash = 0;
    this.capacity = capacityPerKind;
  }

  _push(list, item) {
    if (list.length >= this.capacity) list.shift(); // oldest effect recycles
    list.push(item);
  }

  explosion(x, y, big = false) {
    this._push(this.explosionList, { x, y, t: 0, big, dur: big ? 22 : 14 });
  }

  spark(x, y) {
    this._push(this.sparkList, { x, y, t: 0, dur: 8 });
  }

  crumbs(x, y) {
    this._push(this.crumbList, { x, y, t: 0, dur: 10 });
  }

  scoreFloat(x, y, text) {
    this._push(this.floatList, { x, y, t: 0, text, dur: TICK_HZ });
  }

  spawnStar(x, y) {
    this._push(this.starList, { x, y, t: 0, dur: 30 });
  }

  beam(x0, y0, x1, y1) {
    this._push(this.beamList, { x0, y0, x1, y1, t: 0, dur: 14 });
  }

  tick() {
    for (const list of [this.explosionList, this.sparkList, this.crumbList, this.floatList, this.starList, this.beamList]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        e.t++;
        if (e.t >= e.dur) list.splice(i, 1);
      }
    }
    if (this.baseWreckFlash > 0) this.baseWreckFlash--;
  }

  get count() {
    return this.explosionList.length + this.sparkList.length + this.crumbList.length +
      this.floatList.length + this.starList.length + this.beamList.length;
  }
}
