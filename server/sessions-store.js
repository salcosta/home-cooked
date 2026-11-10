import { promises as fs } from 'node:fs';
import path from 'node:path';

export function createSessionsStore(dataDir) {
  const sessionsFile = path.join(dataDir, 'sessions.json');

  async function load() {
    try {
      const data = await fs.readFile(sessionsFile, 'utf8');
      const sessions = JSON.parse(data);
      // Clean up expired sessions
      const now = Date.now();
      const active = {};
      for (const [token, session] of Object.entries(sessions)) {
        if (session.expires > now) {
          active[token] = session;
        }
      }
      return active;
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }

  async function save(sessions) {
    const tmp = sessionsFile + '.tmp';
    try {
      await fs.writeFile(tmp, JSON.stringify(sessions, null, 2));
      await fs.rename(tmp, sessionsFile);
    } finally {
      await fs.rm(tmp, { force: true });
    }
  }

  return { load, save };
}
