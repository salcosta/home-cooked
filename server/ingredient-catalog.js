import { randomUUID } from 'node:crypto';
import { all, write } from './store.js';

let pending = Promise.resolve();
export function ensureIngredients(names) {
  const operation = pending.catch(() => {}).then(async () => {
    const catalog = await all('ingredients');
    for (const value of names) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const name = value.trim();
      if (catalog.some(item => item.name.toLowerCase() === name.toLowerCase())) continue;
      const item = await write('ingredients', { id: randomUUID(), name, displayName: name, price: '', notes: '', purchased: false, shopping: false });
      catalog.push(item);
    }
    return catalog;
  });
  pending = operation;
  return operation;
}
