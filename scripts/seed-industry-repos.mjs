/**
 * One-shot: triggers openget-api `import-industry-repos` (offset 0). The function
 * self-chains until all 20 industry repos are processed. Requires:
 *   APPWRITE_API_KEY, OPENGET_INDUSTRY_IMPORT_SECRET (and OPENGET_INDUSTRY_IMPORT_SECRET on the function)
 *   GITHUB_TOKEN on the function for reliable GitHub API access
 *
 * Run: npm run seed:industry
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { Client, ExecutionMethod, Functions } = require(
  join(__dirname, 'node_modules', 'node-appwrite'),
);

function loadEnvFile(p) {
  if (!existsSync(p)) return;
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (process.env[k]) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}

loadEnvFile(join(__dirname, '..', '.env.local'));
loadEnvFile(join(__dirname, '..', '.env'));

const endpoint = process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
const projectId = process.env.APPWRITE_PROJECT_ID || '69cd72ef00259a9a29b9';
const apiKey = process.env.APPWRITE_API_KEY;
const secret = process.env.OPENGET_INDUSTRY_IMPORT_SECRET;
const functionId = process.env.OPENGET_FUNCTION_ID || 'openget-api';

if (!apiKey) {
  console.error('APPWRITE_API_KEY is required (e.g. in .env.local).');
  process.exit(1);
}
if (!secret) {
  console.error('OPENGET_INDUSTRY_IMPORT_SECRET is required locally and must match the value set on the openget-api function.');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const functions = new Functions(client);

const POLL_MS = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const body = { action: 'import-industry-repos', secret, offset: 0 };
console.log('Triggering', functionId, 'import-industry-repos (batched, self-chaining)…\n');

let execution = await functions.createExecution(
  functionId,
  JSON.stringify(body),
  true,
  '/?action=import-industry-repos',
  ExecutionMethod.POST,
  { 'content-type': 'application/json' },
);

const deadline = Date.now() + 120000;
while (execution.status !== 'completed' && execution.status !== 'failed') {
  if (Date.now() > deadline) {
    console.error('Timeout waiting for first batch. Check Appwrite function logs for chained executions.');
    process.exit(1);
  }
  await sleep(POLL_MS);
  execution = await functions.getExecution(functionId, execution.$id);
}

const status = execution.responseStatusCode || 0;
const text = execution.responseBody || '';
console.log('HTTP', status);
if (text) {
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
} else {
  console.log('(no response body; async execution. Check function logs in Appwrite for import-industry-repos progress.)');
}

if (execution.status === 'failed' || status >= 400) {
  if (execution.errors) console.error(execution.errors);
  process.exit(1);
}
console.log('\n[done] further batches may still run in the background via self-chaining; re-run is safe (skips already listed).');
