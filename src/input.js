// Keyboard input. Tracks held keys AND pressed-this-tick edges, prevents page
// scrolling on gameplay keys and guarantees P1/P2 never overwrite each other.

const HELD_KEYS = new Set();
let menuSink = null;   // callback for menu navigation keys
let menuActive = null; // provider: only consume menu keys while this returns true
let actionSink = null; // callback for P / R / M / Esc / F2 helpers

const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Space']);

const P1_MAP = {
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', Space: 'fire',
};
const P2_MAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'fire',
};

function defaultInput() {
  return { up: false, down: false, left: false, right: false, fire: false };
}

export class InputSystem {
  constructor() {
    this._held = new Set();       // game actions per action string
    this._keyAction = new Map();  // last action bound to a physical key (edge detection)
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  _onKeyDown(e) {
    if (PREVENT.has(e.key) || e.code === 'Space') e.preventDefault();
    if (e.repeat) {
      HELD_KEYS.add(e.code);
      return;
    }
    HELD_KEYS.add(e.code);
    // shared actions always win first
    const shared = this.#sharedAction(e.code, e.key);
    if (shared && actionSink) {
      actionSink(shared);
      return;
    }
    // menu navigation keys are consumed ONLY while the game is actually in a menu;
    // during gameplay W/S/Up/Down/Space/Enter must register as held player actions.
    if (menuSink && menuActive && menuActive()) {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { menuSink(-1); return; }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { menuSink(1); return; }
      if (e.code === 'Space' || e.code === 'Enter') { menuSink(0); return; } // confirm
    }

    const p1 = P1_MAP[e.code];
    if (p1) { this._held.add('p1:' + p1); this._keyAction.set(e.code, 'p1:' + p1); }
    const p2 = P2_MAP[e.code];
    if (p2) { this._held.add('p2:' + p2); this._keyAction.set(e.code, 'p2:' + p2); }
  }

  _onKeyUp(e) {
    HELD_KEYS.delete(e.code);
    const a = this._keyAction.get(e.code);
    if (a) this._held.delete(a);
  }

  #sharedAction(code, key) {
    if (code === 'KeyP') return 'pause';
    if (code === 'KeyR') return 'restart';
    if (code === 'KeyM') return 'mute';
    if (code === 'Escape') return 'escape';
    if (code === 'F2') return 'debug';
    return null;
  }

  /** Snapshot input state for one player (0/1). */
  playerInput(playerIdx) {
    const state = defaultInput();
    const prefix = playerIdx === 0 ? 'p1:' : 'p2:';
    for (const a of this._held) {
      if (!a.startsWith(prefix)) continue;
      state[a.slice(3)] = true;
    }
    return state;
  }

  lossAll() {
    this._held.clear();
  }

  setMenuSink(fn) { menuSink = fn; }
  setMenuActive(fn) { menuActive = fn; }
  setActionSink(fn) { actionSink = fn; }
}
