import { Client, Functions } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { unlinkSync } from 'fs';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID || '69cd72ef00259a9a29b9')
  .setKey(process.env.APPWRITE_API_KEY);

const functions = new Functions(client);

async function main() {
  if (!process.env.APPWRITE_API_KEY) {
    console.error('APPWRITE_API_KEY required');
    process.exit(1);
  }

  try {
    await functions.create({
      functionId: 'openget-api',
      name: 'OpenGet API',
      runtime: 'node-22',
      execute: ['any'],
      timeout: 300,
      enabled: true,
      entrypoint: 'src/main.js',
    });
    console.log('[ok] Created function openget-api');
  } catch (e) {
    if (e.code === 409) {
      console.log('[skip] Function openget-api already exists');
    } else {
      console.error('[error] Create failed:', e.message);
      return;
    }
  }

  const funcDir = resolve(process.cwd(), 'functions', 'openget-api');
  const tarPath = resolve(process.cwd(), 'openget-api.tar.gz');

  console.log('Creating archive...');
  execSync(`tar -czf "${tarPath}" -C "${funcDir}" .`, { stdio: 'pipe' });

  console.log('Uploading deployment...');
  const file = InputFile.fromPath(tarPath, 'openget-api.tar.gz');
  await functions.createDeployment({
    functionId: 'openget-api',
    code: file,
    activate: true,
    entrypoint: 'src/main.js',
  });
  console.log('[ok] Deployment submitted successfully');

  try { unlinkSync(tarPath); } catch {}
}

main().catch(e => {
  console.error('Deploy failed:', e);
  process.exit(1);
});
