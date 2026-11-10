import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function createLikesStore(root) {
  const filename = path.join(root, 'likes.json');
  let pending = Promise.resolve();
  const serialize = operation => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
  async function all() {
    const records = JSON.parse(await fs.readFile(filename, 'utf8'));
    if (!Array.isArray(records)) throw Error('likes.json must contain an array');
    return records;
  }
  async function save(records) {
    const temporary = path.join(root, `likes-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, JSON.stringify(records, null, 2));
      await fs.rename(temporary, filename);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  return {
    all,
    async read(id) {
      const record = (await all()).find(item => item.id === id);
      if (!record) throw Object.assign(Error('Like not found'), { code: 'ENOENT' });
      return record;
    },
    write(record) {
      return serialize(async () => {
        const records = await all();
        const index = records.findIndex(item => item.id === record.id);
        if (index < 0) records.push(record); else records[index] = record;
        await save(records);
        return record;
      });
    },
    init() {
      return serialize(async () => {
        let records;
        try { records = await all(); }
        catch (error) { if (error.code !== 'ENOENT') throw error; records = []; }
        const legacy = path.join(root, 'likes');
        let entries;
        try { entries = await fs.readdir(legacy, { withFileTypes: true }); }
        catch (error) { if (error.code !== 'ENOENT') throw error; entries = []; }
        const migrated = [];
        for (const entry of entries) {
          if (!entry.isDirectory() || !/^[a-zA-Z0-9-]+$/.test(entry.name)) continue;
          const folder = path.join(legacy, entry.name);
          const recordPath = path.join(folder, 'record.json');
          let record;
          try { record = JSON.parse(await fs.readFile(recordPath, 'utf8')); }
          catch (error) { if (error.code === 'ENOENT') continue; throw error; }
          if (record.id !== entry.name) throw Error(`Invalid legacy like: ${entry.name}`);
          // A newer flat-file value wins if a previous migration was interrupted.
          if (!records.some(item => item.id === record.id)) records.push(record);
          migrated.push({ folder, recordPath });
        }
        await save(records);
        for (const { folder, recordPath } of migrated) {
          await fs.unlink(recordPath);
          try { await fs.rmdir(folder); }
          catch (error) { if (error.code !== 'ENOTEMPTY') throw error; }
        }
        try { await fs.rmdir(legacy); }
        catch (error) { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error; }
      });
    },
  };
}
