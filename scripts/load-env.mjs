/**
 * Load `.env.local` then `.env` from the repository root (first wins per key).
 * Does not override variables already set in the process environment.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export function loadEnvFiles(repoRoot) {
  for (const name of ['.env.local', '.env']) {
    const p = join(repoRoot, name);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

const __root = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__root, '..');

loadEnvFiles(REPO_ROOT);
