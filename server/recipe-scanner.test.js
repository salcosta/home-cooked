import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRecipeScanner } from './recipe-scanner.js';

test('scanner imports stable Markdown, suffixes collisions and leaves other files alone', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'homecooked-scanner-'));
  const errors = [];
  const scanner = createRecipeScanner(directory, { onError: error => errors.push(error) });
  try {
    await fs.mkdir(path.join(directory, 'chicken-soup'));
    await fs.mkdir(path.join(directory, 'chicken-soup-2'));
    await fs.writeFile(path.join(directory, 'Chicken Soup.md'), '# Family soup\n\nOriginal contents.');
    await fs.writeFile(path.join(directory, 'notes.txt'), 'Leave this alone');
    await fs.writeFile(path.join(directory, 'chicken-soup', 'nested.md'), '# Do not import');
    assert.deepEqual(await scanner.scan(), []);
    await fs.appendFile(path.join(directory, 'Chicken Soup.md'), '\nMore instructions.');
    assert.deepEqual(await scanner.scan(), []);
    const [record] = await scanner.scan();
    assert.equal(record.id, 'chicken-soup-3');
    assert.equal(record.name, 'Family soup');
    assert.equal(record.markdown, 'recipe.md');
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, record.id, 'record.json'), 'utf8')), record);
    assert.equal(await fs.readFile(path.join(directory, record.id, 'recipe.md'), 'utf8'), '# Family soup\n\nOriginal contents.\nMore instructions.');
    await assert.rejects(fs.access(path.join(directory, 'Chicken Soup.md')));
    await fs.access(path.join(directory, 'notes.txt'));
    await fs.access(path.join(directory, 'chicken-soup', 'nested.md'));
    assert.deepEqual(await scanner.scan(), []);
    await fs.writeFile(path.join(directory, 'Chicken Soup.md'), '# Another soup');
    await scanner.scan();
    assert.equal((await scanner.scan())[0].id, 'chicken-soup-4');
    await fs.writeFile(path.join(directory, 'Fresh_Pasta.MARKDOWN'), 'No heading');
    await scanner.scan();
    assert.equal((await scanner.scan())[0].name, 'Fresh Pasta');
    assert.deepEqual(errors, []);
  } finally { scanner.stop(); await fs.rm(directory, { recursive: true, force: true }); }
});
