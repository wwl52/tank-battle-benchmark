// Web Audio API synth engine. Every sound is generated at runtime — zero assets,
// works fully offline. The AudioContext is created lazily on the first user
// gesture and is reused forever (never more than one context per page).

const SFX = {
  'menu-confirm':    { type: 'square',  f0: 880, f1: 1320, dur: 0.09, vol: 0.5 },
  'stage-start':     { notes: [[523, 0.0, 0.1], [659, 0.09, 0.1], [784, 0.18, 0.1], [1047, 0.27, 0.22]], vol: 0.5 },
  'shoot-player':    { type: 'square',  f0: 980, f1: 240, dur: 0.08, vol: 0.35 },
  'shoot-enemy':     { type: 'square',  f0: 620, f1: 180, dur: 0.09, vol: 0.28 },
  'hit-brick':       { type: 'noise',   f0: 0, f1: 0, dur: 0.09, vol: 0.45, filterFreq: 900 },
  'bullet-wall':     { type: 'noise',   f0: 0, f1: 0, dur: 0.05, vol: 0.25, filterFreq: 2400 },
  'hit-steel':       { type: 'triangle', f0: 1800, f1: 300, dur: 0.06, vol: 0.4 },
  'tank-hit':        { type: 'square',  f0: 300, f1: 90, dur: 0.12, vol: 0.4 },
  'explosion-small': { type: 'noise',   f0: 0, f1: 0, dur: 0.28, vol: 0.55, filterFreq: 500, pitchDecay: 180 },
  'explosion-big':   { type: 'noise',   f0: 0, f1: 0, dur: 0.6, vol: 0.8, filterFreq: 300, pitchDecay: 90 },
  'powerup-pickup':  { notes: [[660, 0.0, 0.07], [880, 0.07, 0.07], [1175, 0.14, 0.12]], vol: 0.5 },
  'player-death':    { type: 'square',  f0: 520, f1: 70, dur: 0.5, vol: 0.5 },
  'stage-clear':     { notes: [[784, 0.0, 0.12], [988, 0.12, 0.12], [1175, 0.24, 0.2], [1568, 0.36, 0.28]], vol: 0.5 },
  'game-over':       { notes: [[392, 0.0, 0.2], [330, 0.2, 0.2], [262, 0.4, 0.3], [196, 0.7, 0.5]], vol: 0.55 },
  'victory':         { notes: [[523, 0.0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1047, 0.45, 0.15], [784, 0.6, 0.15], [1047, 0.75, 0.4]], vol: 0.55 },
  'pause':           { type: 'square',  f0: 440, f1: 440, dur: 0.07, vol: 0.3 },
  'shield-hit':      { type: 'triangle', f0: 2400, f1: 600, dur: 0.1, vol: 0.3 },
  'extra-life':      { notes: [[1047, 0.0, 0.09], [1319, 0.09, 0.18]], vol: 0.5 },
  'freeze':          { type: 'triangle', f0: 1200, f1: 200, dur: 0.4, vol: 0.4 },
  'shovel-start':    { notes: [[440, 0, 0.08], [554, 0.08, 0.08], [660, 0.16, 0.16]], vol: 0.4 },
  'shovel-end':      { type: 'triangle', f0: 660, f1: 220, dur: 0.2, vol: 0.3 },
  'laser-fire':      { type: 'sawtooth', f0: 2200, f1: 90, dur: 0.35, vol: 0.5 },
};

const ENGINE_FREQ = 55;

export class AudioEngine {
  constructor(storage) {
    this.storage = storage;
    this.ctx = null;
    this.master = null;
    this.muted = !(storage?.data.soundOn ?? true);
    this.volume = storage?.data.volume ?? 0.6;
    this._lastPlay = new Map();  // per-name rate limiting (avoid bursts clipping)
    this._engine = null;         // engine hum: {osc, gain}
    this._engineOn = false;
  }

  /** Must be called from a user gesture (click/keydown) once. */
  ensure() {
    if (this.ctx || this._failed) return this.ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) { this._failed = true; return null; }
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this._failed = true;
      return null;
    }
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    this.storage?.setSound(!m);
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v));
    this.storage?.setVolume(this.volume);
    if (this.master && !this.muted) this.master.gain.value = this.volume;
  }

  play(name) {
    if (this.muted) return;
    const ctx = this.ctx;
    if (!ctx || this._failed) return;
    if (ctx.state === 'suspended') ctx.resume();
    const spec = SFX[name];
    if (!spec) return;
    // rate-limit: same SFX name not more than once per 30 ms (continuous fire guard)
    const now = ctx.currentTime;
    const last = this._lastPlay.get(name) ?? -1;
    if (now - last < 0.03) return;
    this._lastPlay.set(name, now);

    if (spec.notes) {
      for (const [f, t0, dur] of spec.notes) {
        this._tone(ctx.currentTime + t0, f, f, dur, spec.vol, 'square');
      }
      return;
    }
    if (spec.type === 'noise') {
      this._noise(spec);
      return;
    }
    this._tone(now, spec.f0, spec.f1, spec.dur, spec.vol, spec.type);
  }

  _tone(t0, f0, f1, dur, vol, type) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise(spec) {
    const ctx = this.ctx;
    const dur = spec.dur;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(spec.filterFreq ?? 800, ctx.currentTime);
    if (spec.pitchDecay) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(30, spec.pitchDecay), ctx.currentTime + dur);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(spec.vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  // Continuous tank engine hum; on/off toggled by movement state (loop sound).
  setEngine(on, moving = false) {
    if (!this.ctx || this._failed || this.muted) { return; }
    if (on && !this._engine) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = ENGINE_FREQ;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(this.master);
      osc.start();
      this._engine = { osc, gain };
    }
    if (!on && this._engine) {
      try { this._engine.osc.stop(); } catch { /* already stopped */ }
      this._engine = null;
    }
    this._engineOn = on;
    if (this._engine) {
      const target = on ? (moving ? 0.05 : 0.02) : 0;
      this._engine.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  engineSilenceForPause() {
    // page hidden / paused: stop any looped sound promptly
    if (this._engine) {
      try { this._engine.osc.stop(); } catch { /* already stopped */ }
      this._engine = null;
    }
    this._engineOn = false;
  }
}
