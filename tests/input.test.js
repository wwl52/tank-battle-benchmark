// Browser keyboard routing: in-game W/S/Up/Down/Space/Enter must register as held
// player actions instead of being swallowed by menu navigation (regression for the
// "left/right works but up/down doesn't" bug).
import test from 'node:test';
import assert from 'node:assert/strict';
import { InputSystem } from '../src/input.js';

function press(input, code, key = code) {
  input._onKeyDown({ code, key, repeat: false, ctrlKey: false, preventDefault() {} });
}
function release(input, code) {
  input._onKeyUp({ code });
}

test('menu keys stay live for gameplay when the game is NOT in a menu', () => {
  const input = new InputSystem();
  let menuCalls = 0;
  input.setMenuSink(() => { menuCalls++; });
  input.setMenuActive(() => false); // playing state, e.g. PLAYING

  press(input, 'KeyW');
  press(input, 'KeyS');
  press(input, 'Space');
  press(input, 'ArrowUp');
  press(input, 'ArrowDown');
  press(input, 'Enter');

  assert.equal(menuCalls, 0, 'menu sink must not be invoked during play');

  const p1 = input.playerInput(0);
  assert.equal(p1.up, true);
  assert.equal(p1.down, true);
  assert.equal(p1.fire, true);

  const p2 = input.playerInput(1);
  assert.equal(p2.up, true);
  assert.equal(p2.down, true);
  assert.equal(p2.fire, true);

  release(input, 'KeyW');
  release(input, 'ArrowDown');
  release(input, 'Space');
  assert.equal(input.playerInput(0).up, false);
  assert.equal(input.playerInput(1).down, false);
  assert.equal(input.playerInput(0).fire, false);

  // A/D and Left/Right still work alongside
  press(input, 'KeyA');
  press(input, 'ArrowRight');
  assert.equal(input.playerInput(0).left, true);
  assert.equal(input.playerInput(1).right, true);
});

test('menu navigation consumes W/S/Up/Down/Space/Enter ONLY while in a menu', () => {
  const input = new InputSystem();
  const deltas = [];
  input.setMenuSink((d) => deltas.push(d));
  let inMenu = true;
  input.setMenuActive(() => inMenu);

  press(input, 'ArrowUp');   // -1
  press(input, 'KeyW');      // -1
  press(input, 'ArrowDown'); // +1
  press(input, 'Space');     // confirm 0
  press(input, 'Enter');     // confirm 0
  assert.deepEqual(deltas, [-1, -1, 1, 0, 0]);
  assert.equal(input.playerInput(0).up, false, 'W consumed by menu -> p1 up stays false');
  assert.equal(input.playerInput(1).up, false, 'ArrowUp consumed by menu');

  // the moment the game starts, the same keys register as player actions
  inMenu = false;
  press(input, 'ArrowUp');
  press(input, 'KeyW');
  assert.equal(input.playerInput(1).up, true);
  assert.equal(input.playerInput(0).up, true);
});

test('left/right were never eaten by menukeyup in play nor in menu', () => {
  const input = new InputSystem();
  input.setMenuSink(() => {});
  input.setMenuActive(() => true); // even inside a menu, A/D/Left/Right must not crash routing
  press(input, 'KeyD');
  assert.equal(input.playerInput(0).right, true);
  release(input, 'KeyD');
  assert.equal(input.playerInput(0).right, false);
});
