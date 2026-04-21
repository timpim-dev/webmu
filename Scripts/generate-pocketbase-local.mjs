import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const envPath = path.join(root, '.env');
const outPath = path.join(root, 'Scripts', 'pocketbase.local.js');

function parseEnv(src) {
  const out = {};
  for (const line of src.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

if (!fs.existsSync(envPath)) {
  console.error('Missing .env file at project root.');
  process.exit(1);
}

const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
const url = env.PB_URL || 'https://pocketbase.felixx.dev';
const authCollection = env.PB_AUTH_COLLECTION || 'webmuser';
const gamesCollection = env.PB_GAMES_COLLECTION || 'games';

const contents = `window.__WEBMU_POCKETBASE__ = {
  url: ${JSON.stringify(url)},
  authCollection: ${JSON.stringify(authCollection)},
  gamesCollection: ${JSON.stringify(gamesCollection)},
};
`;

fs.writeFileSync(outPath, contents, 'utf8');
console.log(`Wrote ${path.relative(root, outPath)}`);
