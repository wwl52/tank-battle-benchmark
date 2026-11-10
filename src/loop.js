import { TICK_DT, MAX_FRAME_CATCHUP } from './config.js';

/**
 * Fixed-timestep game loop. Logic always advances in exact 1/60 s ticks; the
 * renderer draws at most once per animation frame. On long stalls (tab switch)
 * we clamp catch-up work so nothing teleports through walls.
 */
export function startLoop({ update, render, onHidden }) {
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let running = true;
  let hiddenHandled = false;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    let delta = (now - last) / 1000;
    last = now;
    if (delta > 1) delta = 1; // clamp absurd frame gaps (background tab, debugger)
    acc += delta;
    let steps = 0;
    while (acc >= TICK_DT && steps < MAX_FRAME_CATCHUP) {
      update(TICK_DT);
      acc -= TICK_DT;
      steps++;
    }
    if (steps === MAX_FRAME_CATCHUP) acc = 0; // discard backlog, keep the sim stable
    render();
  }

  const onVis = () => {
    if (document.hidden) {
      onHidden?.();
      hiddenHandled = true;
      running = false;
      cancelAnimationFrame(raf);
    } else if (hiddenHandled) {
      hiddenHandled = false;
      running = true;
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVis);

  raf = requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    },
    get running() { return running; },
  };
}
