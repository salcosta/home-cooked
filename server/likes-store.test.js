import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createLikesStore } from './likes-store.js';

test('likes migrate to one file, preserve newer values and serialize concurrent writes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'homecooked-likes-'));
  try {
    const old = { id: 'jamie-roast', userId: 'jamie', recipeId: 'roast', liked: true };
    const folder = path.join(root, 'likes', old.id);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'record.json'), JSON.stringify(old));
    const store = createLikesStore(root);
    await store.init();
    assert.deepEqual(await store.all(), [old]);
    await assert.rejects(fs.access(path.join(root, 'likes')), { code: 'ENOENT' });
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.write({ ...old, id: `user-${i}` })));
    assert.equal((await store.all()).length, 21);
    await store.write({ ...old, liked: false });
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'record.json'), JSON.stringify(old));
    await store.init();
    assert.equal((await store.read(old.id)).liked, false);
    await store.init();
    assert.equal((await store.all()).length, 21);
    assert.equal(JSON.parse(await fs.readFile(path.join(root, 'likes.json'), 'utf8')).length, 21);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
