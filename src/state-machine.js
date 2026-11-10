export const STATES = [
  'BOOT',
  'MAIN_MENU',
  'HELP',
  'STAGE_INTRO',
  'PLAYING',
  'PAUSED',
  'PLAYER_RESPAWN',
  'STAGE_CLEAR',
  'SCORE_SUMMARY',
  'GAME_OVER',
  'VICTORY',
];

const S = Object.fromEntries(STATES.map(s => [s, s]));
export { S as STATE };

// Legal transitions; guards live in game.js so the machine stays dumb and testable.
export const TRANSITIONS = {
  BOOT: [S.MAIN_MENU],
  MAIN_MENU: [S.STAGE_INTRO, S.HELP],
  HELP: [S.MAIN_MENU],
  STAGE_INTRO: [S.PLAYING],
  PLAYING: [S.PAUSED, S.PLAYER_RESPAWN, S.STAGE_CLEAR, S.GAME_OVER, S.MAIN_MENU],
  PAUSED: [S.PLAYING, S.PLAYER_RESPAWN, S.MAIN_MENU],
  PLAYER_RESPAWN: [S.PLAYING, S.PAUSED, S.GAME_OVER, S.STAGE_CLEAR],
  STAGE_CLEAR: [S.SCORE_SUMMARY],
  SCORE_SUMMARY: [S.STAGE_INTRO, S.VICTORY],
  GAME_OVER: [S.MAIN_MENU],
  VICTORY: [S.MAIN_MENU],
};

export class StateMachine {
  constructor(initial = 'BOOT') {
    this.state = initial;
    this.previous = null;
    this._listeners = [];
  }

  is(name) { return this.state === name; }

  can(next) {
    return (TRANSITIONS[this.state] || []).includes(next);
  }

  goto(next) {
    if (next === this.state) return this.state;
    if (!this.can(next)) {
      throw new Error(`illegal state transition ${this.state} -> ${next}`);
    }
    this.previous = this.state;
    this.state = next;
    for (const fn of this._listeners) fn(this.previous, next);
    return next;
  }

  force(next) {
    // used only by game reset paths (BOOT -> arbitrary stage on restart)
    this.previous = this.state;
    this.state = next;
    for (const fn of this._listeners) fn(this.previous, next);
  }

  onTransition(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(f => f !== fn);
    };
  }
}
