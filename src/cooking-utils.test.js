import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cookingSteps, timerState } from './cooking-utils.js';

test('timers use elapsed wall time, change colors, stop and finish at zero', () => {
  const timer = { duration: 100000, endsAt: 100000 };
  assert.equal(timerState(timer, 0).color, 'blue');
  assert.equal(timerState(timer, 40000).color, 'green');
  assert.equal(timerState(timer, 75000).color, 'yellow');
  assert.equal(timerState(timer, 90000).color, 'red');
  assert.equal(timerState(timer, 150000).text, '0:00');
  assert.equal(timerState(timer, 150000).progress, 1);
  assert.equal(timerState({ ...timer, stoppedRemaining: 25000 }, 150000).text, '0:25');
});
test('instruction steps are checkable without turning ingredient bullets into steps', () => {
  const ingredients = { type: 'list', children: [{ type: 'listItem' }] };
  const method = { type: 'list', children: [{ type: 'listItem' }, { type: 'listItem' }] };
  const tree = { children: [ingredients, { type: 'heading', children: [{ value: 'Method' }] }, method] };
  cookingSteps()(tree);
  assert.equal(ingredients.children[0].data, undefined);
  assert.equal(method.children[1].data.hProperties['data-cook-step'], '1');
});
