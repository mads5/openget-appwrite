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

// Appwrite caps synchronous function executions at ~30s on the gateway, which
// is less than our function's 300s timeout. Create the execution asynchronously
// and poll the execution record so slow chunks (e.g. GitHub stats cache warm-up)
// don't get cut off mid-run.
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = Number(process.env.OPENGET_EXECUTION_TIMEOUT_MS || 360000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callFunction(body) {
  let execution = await functions.createExecution(
    functionId,
    JSON.stringify(body),
    true,
    undefined,
    ExecutionMethod.POST,
    { 'content-type': 'application/json' },
  );

  const deadline = Date.now() + MAX_POLL_MS;
  while (execution.status !== 'completed' && execution.status !== 'failed') {
    if (Date.now() > deadline) {
      console.error(`  [timeout] execution ${execution.$id} still ${execution.status} after ${MAX_POLL_MS}ms`);
      return { status: 504, data: { error: 'execution polling timeout', execution_id: execution.$id } };
    }
    await sleep(POLL_INTERVAL_MS);
    try {
      execution = await functions.getExecution(functionId, execution.$id);
    } catch (err) {
      console.error(`  [poll error] ${err.message}`);
      return { status: 502, data: { error: err.message, execution_id: execution.$id } };
    }
  }

  const status = execution.responseStatusCode || (execution.status === 'completed' ? 200 : 0);
  const responseText = execution.responseBody || '';
  console.log(`HTTP status: ${status}`);

  // Appwrite async executions don't persist response bodies, so the function
  // also emits its summary to stdout with a sentinel. Prefer the response body
  // (sync path) and fall back to parsing the sentinel out of execution.logs.
  let data = null;
  if (responseText) {
    console.log(responseText);
    try { data = JSON.parse(responseText); } catch { data = null; }
  }
  if (!data && typeof execution.logs === 'string') {
    const match = execution.logs.match(/__OPENGET_SUMMARY__(\{.*\})/);
    if (match) {
      try {
        data = JSON.parse(match[1]);
        console.log(JSON.stringify(data));
      } catch {
        /* keep data null, fall through */
      }
    }
  }

  if (execution.status === 'failed') {
    const errDetail = execution.errors || execution.logs || '';
    if (errDetail) console.error(`  [execution failed] ${String(errDetail).slice(0, 500)}`);
  }

  return { status, data };
}

// fetch-contributors: process one repo per function execution to avoid Appwrite
// function timeouts. Large repos with many contributors used to exceed the timeout
// when all repos were processed in a single call.
if (action === 'fetch-contributors') {
  console.log(`Function: ${functionId}`);
  console.log('Action: fetch-contributors (per-repo mode)');
  const batchSize = Math.max(1, Math.min(10, Number(process.env.OPENGET_BATCH_SIZE || 4)));

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
    let offset = 0;
    let done = false;

    while (!done) {
      console.log(`  chunk offset=${offset} batchSize=${batchSize}`);
      const { status, data } = await callFunction({
        action: 'fetch-contributors',
        repoId: repo.$id,
        offset,
        batchSize,
      });
      const firstError = Array.isArray(data?.errors) && data.errors.length
        ? data.errors[0].error || 'unknown error'
        : null;

      if (status >= 400) {
        console.error(`  [fail] ${repo.full_name}${firstError ? ` (${firstError})` : ''}`);
        failures++;
        break;
      }

      done = Boolean(data?.done);
      if (data?.failed) {
        console.error(`  [fail] ${repo.full_name}${firstError ? ` (${firstError})` : ''}`);
        failures++;
        break;
      }
      if (done) {
        console.log(`  [ok] ${repo.full_name}`);
      } else if (typeof data?.next_offset === 'number' && data.next_offset > offset) {
        offset = data.next_offset;
      } else {
        const reason = firstError || 'invalid chunk progress';
        console.error(`  [fail] ${repo.full_name} (${reason})`);
        failures++;
        break;
      }
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

const { status } = await callFunction(body);
if (status >= 400) {
  process.exit(1);
}
