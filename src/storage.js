// Versioned safe persistence wrapper around localStorage.
// In Node (tests) there is no localStorage, so a memory backend is used.

const SAVE_VERSION = 2;
const KEY = 'tank-battle-benchmark.save.v' + SAVE_VERSION;

const DEFAULTS = Object.freeze({
  version: SAVE_VERSION,
  highScore: 0,
  maxUnlockedLevel: 1,
  soundOn: true,
  volume: 0.6,
  lastMode: '1P',
});

function safeGet(backend) {
  try {
    return backend.getItem(KEY);
  } catch {
    return null; // localStorage can throw in some privacy modes
  }
}

function safeSet(backend, value) {
  try {
    backend.setItem(KEY, value);
  } catch {
    // quota exceeded / disabled storage: save silently becomes session-only
  }
}

export class Storage {
  /** @param backend object with getItem/setItem/removeItem, or null for memory */
  constructor(backend) {
    this.backend = backend;
    this.memory = { ...DEFAULTS };
    this.load();
  }

  load() {
    let data = null;
    const current = this.backend;
    const raw = safeGet(current);
    if (raw != null) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = null; // corrupted JSON -> start from defaults
      }
    }
    const merged = { ...DEFAULTS, ...(typeof data === 'object' && data ? data : {}) };
    // migration / clamping for older saves missing fields or with bad values
    merged.version = SAVE_VERSION;
    merged.highScore = Number.isFinite(merged.highScore) ? merged.highScore | 0 : 0;
    merged.maxUnlockedLevel = Math.min(35, Math.max(1, merged.maxUnlockedLevel | 0 || 1));
    merged.soundOn = !!merged.soundOn;
    merged.volume = Math.min(1, Math.max(0, Number(merged.volume) || DEFAULTS.volume));
    merged.lastMode = ['1P', '2P', 'DEMO'].includes(merged.lastMode) ? merged.lastMode : '1P';
    this.memory = merged;
  }

  save() {
    safeSet(this.backend, JSON.stringify(this.memory));
  }

  get data() {
    return this.memory;
  }

  setHighScore(score) {
    if (score > this.memory.highScore) {
      this.memory.highScore = score;
      this.save();
      return true;
    }
    return false;
  }

  unlockLevel(level) {
    if (level > this.memory.maxUnlockedLevel && level <= 35) {
      this.memory.maxUnlockedLevel = level;
      this.save();
    }
  }

  setSound(on) {
    this.memory.soundOn = !!on;
    this.save();
  }

  setLastMode(mode) {
    if (['1P', '2P', 'DEMO'].includes(mode)) {
      this.memory.lastMode = mode;
      this.save();
    }
  }

  clear() {
    this.memory = { ...DEFAULTS };
    this.save();
    try {
      this.backend?.removeItem?.(KEY);
    } catch {
      // ignore
    }
  }
}

export function createStorage() {
  let backend = null;
  try {
    const t = '__tank_test__';
    globalThis.localStorage?.setItem(t, '1');
    globalThis.localStorage?.removeItem(t);
    backend = globalThis.localStorage;
  } catch {
    backend = null;
  }
  return new Storage(backend);
}
