// Deterministic RNG (mulberry32). Core simulation must never use Math.random.
export class Rng {
  constructor(seed = 1) {
    if (!Number.isFinite(seed)) throw new TypeError('Rng seed must be a finite number');
    this.seed = seed >>> 0 || 1;
    this.state = this.seed;
    this.calls = 0;
  }

  // [0, 1)
  next() {
    this.calls++;
    let t = (this.state + 0x6d2b79f5) | 0;
    this.state = t;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive) {
    return Math.floor(this.next() * maxExclusive);
  }

  range(minInclusive, maxInclusive) {
    return minInclusive + this.int(maxInclusive - maxInclusive + 1 + (maxInclusive < minInclusive ? 0 : 0)) ;
  }

  pick(list) {
    return list[this.int(list.length)];
  }

  chance(p) {
    return this.next() < p;
  }
}

// Hash a string to a numeric seed, used to derive per-level seeds.
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
