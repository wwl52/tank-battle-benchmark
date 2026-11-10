import { TOTAL_LEVELS } from '../config.js';

/**
 * HUD view builder — pure data, unit-testable in Node. The renderer maps this
 * to pixels so HUD text never depends on canvas details.
 */
export function buildHudView(game, storage) {
  const hud = {
    stage: Math.min(TOTAL_LEVELS, game.levelNum),
    enemiesLeft: Math.max(0, game.stageEnemiesLeft),
    highScore: storage?.data.highScore ?? game.highScore ?? 0,
    paused: game.machine.is('PAUSED'),
    muted: game.pAudioMuted === true,
    players: game.players.map((p, i) => ({
      id: p.id,
      label: `P${i + 1}`,
      score: p.score,
      lives: Math.max(0, p.lives),
      fireLevel: p.powerLevel,
      alive: p.alive,
      shieldTicks: p.shieldTicks,
      stunTicks: p.stunTicks,
    })),
    flags: [],
  };
  if (game.frozenTicks > 0) hud.flags.push({ name: 'CLOCK', seconds: Math.ceil(game.frozenTicks / 60) });
  if (game.shovelTicks > 0) hud.flags.push({ name: 'SHOVEL', seconds: Math.ceil(game.shovelTicks / 60) });
  for (const p of game.players) {
    if (p.alive && p.rapidTicks > 0) hud.flags.push({ name: `RAPID${p.id + 1}`, seconds: Math.ceil(p.rapidTicks / 60) });
    if (p.alive && p.scatterTicks > 0) hud.flags.push({ name: `SCATTER${p.id + 1}`, seconds: Math.ceil(p.scatterTicks / 60) });
  }
  return hud;
}
