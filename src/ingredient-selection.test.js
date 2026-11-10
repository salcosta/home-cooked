import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectedIngredient } from './ingredient-selection.js';

test('ingredient selection supports subsections and excludes method or cross-section selections', () => {
  const body = '# Soup\n## Ingredients\n- 2 cups broth\n### Garnish\n- Parsley\n## Method\nStir well.';
  const start = body.indexOf('- 2 cups');
  assert.equal(selectedIngredient(body, start, start + '- 2 cups broth'.length), '2 cups broth');
  const garnish = body.indexOf('Parsley');
  assert.equal(selectedIngredient(body, garnish, garnish + 7), 'Parsley');
  assert.equal(selectedIngredient(body, start, body.length), '');
  assert.equal(selectedIngredient(body, body.indexOf('Stir'), body.length), '');
  assert.equal(selectedIngredient(body, start, start), '');
  const fenced = '```\n## Ingredients\nFake\n```';
  assert.equal(selectedIngredient(fenced, fenced.indexOf('Fake'), fenced.indexOf('Fake') + 4), '');
});
