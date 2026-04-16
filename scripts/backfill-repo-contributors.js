import { Client, Databases, ExecutionMethod, Functions, Query } from 'node-appwrite';

/**
 * One-shot backfill for contributor data on every listed repo.
 *
 * For each repo in the `repos` collection, calls the openget-api
 * `fetch-contributors` action in a chunked loop (repoId + offset + batchSize)
 * until the function reports done. The action itself upserts `contributors`
 * and `repo_contributions` rows and recomputes per-contributor scores.
 *
 * Env:
 *   APPWRITE_ENDPOINT       (default: https://sgp.cloud.appwrite.io/v1)
 *   APPWRITE_PROJECT_ID     (default: 69cd72ef00259a9a29b9)
 *   APPWRITE_API_KEY        (required)
 *   OPENGET_FUNCTION_ID     (default: openget-api)
 *   OPENGET_BATCH_SIZE      (default: 4, clamped 1..10)
 */

const endpoint = process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
const projectId = process.env.APPWRITE_PROJECT_ID || '69cd72ef00259a9a29b9';
const apiKey = process.env.APPWRITE_API_KEY;
const functionId = process.env.OPENGET_FUNCTION_ID || 'openget-api';
const batchSize = Math.max(1, Math.min(10, Number(process.env.OPENGET_BATCH_SIZE || 4)));

if (!apiKey) {
  console.error('APPWRITE_API_KEY is required.');
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
  const text = execution.responseBody || '{}';
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { status, data, text };
}

async function main() {
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Function: ${functionId}`);
  console.log(`Batch size: ${batchSize}`);

  const repos = [];
  let offset = 0;
  while (true) {
    const page = await databases.listDocuments('openget-db', 'repos', [
      Query.limit(100),
      Query.offset(offset),
      Query.select(['$id', 'full_name']),
    ]);
    if (page.documents.length === 0) break;
    repos.push(...page.documents);
    if (page.documents.length < 100) break;
    offset += page.documents.length;
  }
  console.log(`Found ${repos.length} repos to backfill.\n`);

  let failures = 0;
  let totalContributorsUpserted = 0;

  for (const repo of repos) {
    console.log(`--- ${repo.full_name} (${repo.$id}) ---`);
    let chunkOffset = 0;
    let done = false;
    let safetyCounter = 0;

    while (!done) {
      safetyCounter++;
      if (safetyCounter > 500) {
        console.error(`  [abort] ${repo.full_name}: too many chunks, giving up`);
        failures++;
        break;
      }
      console.log(`  chunk offset=${chunkOffset} batchSize=${batchSize}`);
      const { status, data, text } = await callFunction({
        action: 'fetch-contributors',
        repoId: repo.$id,
        offset: chunkOffset,
        batchSize,
      });
      if (status >= 400) {
        console.error(`  [fail] ${repo.full_name} (HTTP ${status}): ${text}`);
        failures++;
        break;
      }
      if (typeof data?.contributors_upserted === 'number') {
        totalContributorsUpserted += data.contributors_upserted;
      }
      if (data?.done) {
        console.log(
          `  [ok] ${repo.full_name} — contributors=${data?.contributor_count ?? '?'}, total=${data?.total_contributors ?? '?'}`,
        );
        done = true;
      } else if (typeof data?.next_offset === 'number' && data.next_offset > chunkOffset) {
        chunkOffset = data.next_offset;
      } else {
        console.error(`  [fail] ${repo.full_name}: invalid chunk progress response`);
        failures++;
        break;
      }
    }
    console.log('');
  }

  console.log('=== Backfill summary ===');
  console.log(`Repos attempted:         ${repos.length}`);
  console.log(`Repos failed:            ${failures}`);
  console.log(`Contributors upserted:   ${totalContributorsUpserted}`);

  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
