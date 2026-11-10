import { promises as fs, constants } from 'node:fs';
import path from 'node:path';

// Polling also works on network drives where filesystem watch events can be unreliable.
export function createRecipeScanner(directory, { intervalMs = 2000, onError = console.error } = {}) {
  const observed = new Map();
  let running = false;
  let timer;

  async function importFile(filename) {
    const source = path.join(directory, filename);
    const stem = path.basename(filename, path.extname(filename));
    const base = stem.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'recipe';
    let id = base;
    let folder;
    for (let suffix = 2; ; suffix++) {
      folder = path.join(directory, id);
      try { await fs.mkdir(folder); break; }
      catch (error) { if (error.code !== 'EEXIST') throw error; id = `${base}-${suffix}`; }
    }

    const destination = path.join(folder, 'recipe.md');
    const temporaryRecord = path.join(folder, 'record.json.tmp');
    let moved = false;
    try {
      const body = await fs.readFile(source, 'utf8');
      const heading = body.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1];
      const record = {
        id, name: heading || stem.replace(/[-_]+/g, ' '),
        restaurantId: 'comfort', ingredients: [], minutes: 0,
        description: '', hidden: false, markdown: 'recipe.md',
        importedFrom: filename, createdAt: new Date().toISOString(),
      };
      await fs.writeFile(temporaryRecord, JSON.stringify(record, null, 2));
      await fs.rename(source, destination);
      moved = true;
      // Publish the record only after its Markdown exists.
      await fs.rename(temporaryRecord, path.join(folder, 'record.json'));
      return record;
    } catch (error) {
      if (moved) {
        // Never overwrite another file dropped under the same name during recovery.
        await fs.copyFile(destination, source, constants.COPYFILE_EXCL);
        await fs.unlink(destination);
      }
      await fs.rm(temporaryRecord, { force: true });
      await fs.rmdir(folder);
      throw error;
    }
  }

  async function scan() {
    if (running) return [];
    running = true;
    const imported = [];
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const candidates = entries.filter(entry => entry.isFile() && /\.(md|markdown)$/i.test(entry.name));
      const present = new Set(candidates.map(entry => entry.name));
      for (const name of observed.keys()) if (!present.has(name)) observed.delete(name);
      for (const { name } of candidates) {
        try {
          const stat = await fs.stat(path.join(directory, name));
          const signature = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
          if (observed.get(name) !== signature) { observed.set(name, signature); continue; }
          imported.push(await importFile(name));
          observed.delete(name);
        } catch (error) { onError(`Recipe import failed for ${name}: ${error.message}`); }
      }
    } finally { running = false; }
    return imported;
  }

  return {
    scan,
    start() {
      if (timer) return;
      const tick = () => scan().catch(error => onError(`Recipe scanner: ${error.message}`));
      tick();
      timer = setInterval(tick, intervalMs);
      timer.unref();
    },
    stop() { clearInterval(timer); timer = undefined; },
  };
}
