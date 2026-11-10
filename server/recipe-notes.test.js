import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendRecipeNote } from './recipe-notes.js';

test('notes create or reuse a bottom section and preserve other sections', () => {
  const first = appendRecipeNote('# Soup\n\n## Method\n1. Cook.\n', 'Less salt next time.');
  assert.ok(first.endsWith('## Notes\n\n- Less salt next time.\n'));
  const second = appendRecipeNote(first, 'Try herbs.');
  assert.equal(second.match(/^## Notes$/gm).length, 1);
  assert.ok(second.includes('- Less salt next time.\n\n- Try herbs.'));
  const middle = appendRecipeNote('# Soup\n## Notes\nOld note\n## Serving\nServe warm.', 'New note');
  assert.ok(middle.indexOf('Serve warm.') < middle.indexOf('## Notes'));
  assert.ok(middle.includes('Old note'));
  assert.throws(() => appendRecipeNote(first, '  '));
  const fenced = appendRecipeNote('# Soup\n```\n## Notes\n```', 'Actual note');
  assert.ok(fenced.endsWith('## Notes\n\n- Actual note\n'));
});
