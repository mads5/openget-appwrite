import { Client, ExecutionMethod, Functions, Databases, Query } from 'node-appwrite';

const endpoint = process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
const projectId = process.env.APPWRITE_PROJECT_ID || '69cd72ef00259a9a29b9';
const apiKey = process.env.APPWRITE_API_KEY;
const functionId = process.env.OPENGET_FUNCTION_ID || 'openget-api';
const action = process.env.OPENGET_ACTION;
const mode = process.env.OPENGET_MODE;
const force = process.env.OPENGET_FORCE === 'true';

if (!apiKey) {
  console.error('APPWRITE_API_KEY is required.');
  process.exit(1);
}

if (!action) {
  console.error('OPENGET_ACTION is required.');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const functions = new Functions(client);
const databases = new Databases(client);

async function callFunction(body) {
  const execution = await functions.createExecution(
    functionId,
    JSON.stringify(body),
    false,
    undefined,
    ExecutionMethod.POST,
    { 'content-type': 'application/json' },
  );

  const status = execution.responseStatusCode || 0;
  const responseText = execution.responseBody || '{}';
  console.log(`HTTP status: ${status}`);
  console.log(responseText);
  return status;
}

// fetch-contributors: process one repo per function execution to avoid Appwrite
// function timeouts. Large repos with many contributors used to exceed the timeout
// when all repos were processed in a single call.
if (action === 'fetch-contributors') {
  console.log(`Function: ${functionId}`);
  console.log('Action: fetch-contributors (per-repo mode)');

  let repos;
  try {
    const result = await databases.listDocuments('openget-db', 'repos', [
      Query.limit(500),
      Query.select(['$id', 'full_name']),
    ]);
    repos = result.documents;
    console.log(`Found ${repos.length} repos to sync.\n`);
  } catch (err) {
    console.error('Failed to list repos:', err.message);
    process.exit(1);
  }

  let failures = 0;
  for (const repo of repos) {
    console.log(`--- ${repo.full_name} (${repo.$id}) ---`);
    const status = await callFunction({ action: 'fetch-contributors', repoId: repo.$id });
    if (status >= 400) {
      console.error(`  [fail] ${repo.full_name}`);
      failures++;
    } else {
      console.log(`  [ok] ${repo.full_name}`);
    }
    console.log('');
  }

  if (failures > 0) {
    console.error(`${failures} repo(s) failed.`);
    process.exit(1);
  }
  console.log('[done] fetch-contributors complete.');
  process.exit(0);
}

// Default: single action call (used by distribute-pool and other one-shot actions)
const body = { action };
if (mode) body.mode = mode;
if (force) body.force = true;

console.log(`Function: ${functionId}`);
console.log(`Action: ${action}`);

const status = await callFunction(body);
if (status >= 400) {
  process.exit(1);
}
