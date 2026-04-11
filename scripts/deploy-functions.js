import { Client, Functions } from 'node-appwrite';
import { readdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { unlinkSync, existsSync } from 'fs';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID || '69cd72ef00259a9a29b9')
  .setKey(process.env.APPWRITE_API_KEY);

const functions = new Functions(client);

/** Repo-root `functions/` (works when `node deploy-functions.js` is run from `scripts/`). */
const FUNCTIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'functions');

const FUNCTION_CONFIG = {
  /** Central HTTP router used by the Next.js app (`FUNCTION_ID` in `src/lib/api.ts`). Must be deployed for API changes to take effect. */
  'openget-api': { name: 'OpenGet API', execute: ['any', 'users'], events: [], timeout: 120 },
  'list-repo': { name: 'List Repo', execute: ['users'], events: [], timeout: 30 },
  'get-my-repos': { name: 'Get My Repos', execute: ['users'], events: [], timeout: 30 },
  'get-repo-contributors': { name: 'Get Repo Contributors', execute: ['any'], events: [], timeout: 30 },
  'fetch-contributors': { name: 'Fetch Contributors', execute: [], events: [], timeout: 300, schedule: '0 2 * * *' },
  'register-contributor': { name: 'Register Contributor', execute: ['users'], events: [], timeout: 30 },
  'create-checkout': { name: 'Create Checkout', execute: ['users'], events: [], timeout: 30 },
  'stripe-webhook': { name: 'Stripe Webhook', execute: ['any'], events: [], timeout: 30 },
  'stripe-connect': { name: 'Stripe Connect', execute: ['users'], events: [], timeout: 30 },
  'upi-payment': { name: 'UPI Payment', execute: ['users'], events: [], timeout: 30 },
  'get-earnings': { name: 'Get Earnings', execute: ['users'], events: [], timeout: 30 },
  'distribute-pool': { name: 'Distribute Pool', execute: [], events: [], timeout: 300, schedule: '0 0 * * 1' },
};

async function createTarGz(functionDir) {
  const tarPath = functionDir + '.tar.gz';
  try {
    execSync(`tar -czf "${tarPath}" -C "${functionDir}" .`, { stdio: 'pipe' });
    return tarPath;
  } catch (err) {
    console.error(`  Failed to create tar.gz for ${functionDir}:`, err.message);
    return null;
  }
}

async function deployFunction(functionId) {
  const config = FUNCTION_CONFIG[functionId];
  if (!config) {
    console.log(`  [skip] No config for ${functionId}`);
    return;
  }

  const functionDir = join(FUNCTIONS_DIR, functionId);
  if (!existsSync(functionDir)) {
    console.log(`  [skip] Directory not found: ${functionDir}`);
    return;
  }

  // Install deps if node_modules doesn't exist
  const nodeModulesDir = join(functionDir, 'node_modules');
  if (!existsSync(nodeModulesDir)) {
    console.log(`  Installing dependencies for ${functionId}...`);
    try {
      execSync('npm install --production', { cwd: functionDir, stdio: 'pipe' });
    } catch (err) {
      console.error(`  Failed to install deps for ${functionId}:`, err.message);
    }
  }

  // Create function
  try {
    await functions.create({
      functionId,
      name: config.name,
      runtime: 'node-22',
      execute: config.execute,
      events: config.events || [],
      schedule: config.schedule || undefined,
      timeout: config.timeout,
      enabled: true,
      entrypoint: 'src/main.js',
    });
    console.log(`  [ok] Created function: ${functionId}`);
  } catch (err) {
    if (err.code === 409) {
      console.log(`  [skip] Function already exists: ${functionId}`);
    } else {
      console.error(`  [error] Failed to create ${functionId}:`, err.message);
      return;
    }
  }

  // Create tar.gz for deployment
  const tarPath = await createTarGz(functionDir);
  if (!tarPath) return;

  // Deploy
  try {
    const { InputFile } = await import('node-appwrite/file');
    const file = InputFile.fromPath(tarPath, `${functionId}.tar.gz`);
    await functions.createDeployment({
      functionId,
      code: file,
      activate: true,
      entrypoint: 'src/main.js',
    });
    console.log(`  [ok] Deployed: ${functionId}`);
  } catch (err) {
    console.error(`  [error] Deploy failed for ${functionId}:`, err.message);
  } finally {
    try { unlinkSync(tarPath); } catch {}
  }
}

async function main() {
  if (!process.env.APPWRITE_API_KEY) {
    console.error('Error: APPWRITE_API_KEY is required.');
    process.exit(1);
  }

  console.log('Deploying Appwrite Functions...');
  console.log('Endpoint:', process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1');

  const functionDirs = readdirSync(FUNCTIONS_DIR).filter(d => {
    const full = join(FUNCTIONS_DIR, d);
    return statSync(full).isDirectory() && FUNCTION_CONFIG[d];
  });

  console.log(`Found ${functionDirs.length} functions to deploy.\n`);

  for (const funcId of functionDirs) {
    console.log(`--- ${funcId} ---`);
    await deployFunction(funcId);
    console.log('');
  }

  console.log('[done] Function deployment complete.');
}

main().catch(err => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
