import './load-env.mjs';
import {
  AppwriteException,
  Client,
  Databases,
  ID,
  Permission,
  Role,
} from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID || '69cd72ef00259a9a29b9')
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = 'openget-db';

/** @param {unknown} err */
function isConflict(err) {
  return err instanceof AppwriteException && err.code === 409;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {string} collectionId
 * @param {string} key
 */
async function waitForAttribute(collectionId, key) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const attr = await databases.getAttribute(DATABASE_ID, collectionId, key);
    const status = /** @type {{ status?: string; error?: string }} */ (attr).status;
    if (status === 'available') return;
    if (status === 'failed') {
      const err = /** @type {{ error?: string }} */ (attr).error;
      throw new Error(`Attribute "${key}" failed: ${err || 'unknown'}`);
    }
    await sleep(500);
  }
  throw new Error(`Timeout waiting for attribute "${key}" to become available`);
}

async function ensureDatabase() {
  try {
    await databases.get(DATABASE_ID);
    console.log('[skip] Database already exists:', DATABASE_ID);
    return;
  } catch {
    // Database doesn't exist, create it
  }
  try {
    await databases.create(DATABASE_ID, 'OpenGet', true);
    console.log('[ok] Created database', DATABASE_ID);
  } catch (err) {
    if (isConflict(err)) {
      console.log('[skip] Database already exists:', DATABASE_ID);
    } else {
      throw err;
    }
  }
}

const COLLECTION_PERMISSIONS = [
  Permission.read(Role.any()),
  Permission.create(Role.users()),
  Permission.update(Role.users()),
];

/**
 * @param {string} collectionId
 * @param {string} displayName
 */
async function ensureCollection(collectionId, displayName) {
  try {
    await databases.createCollection(
      DATABASE_ID,
      collectionId,
      displayName,
      COLLECTION_PERMISSIONS,
      false,
      true,
    );
    console.log('[ok] Created collection', collectionId);
  } catch (err) {
    if (isConflict(err)) {
      console.log('[skip] Collection already exists:', collectionId);
    } else {
      throw err;
    }
  }
}

/**
 * @param {string} collectionId
 * @param {string} key
 * @param {number} size
 * @param {boolean} required
 * @param {string} [defaultValue]
 */
async function addStringAttribute(collectionId, key, size, required, defaultValue) {
  try {
    await databases.createStringAttribute(
      DATABASE_ID,
      collectionId,
      key,
      size,
      required,
      defaultValue,
    );
    await waitForAttribute(collectionId, key);
    console.log('    + string', key, required ? '(required)' : '(optional)');
  } catch (err) {
    if (isConflict(err)) {
      console.log('    ~ string', key, '(already exists)');
    } else {
      throw err;
    }
  }
}

/**
 * @param {string} collectionId
 * @param {string} key
 * @param {boolean} required
 * @param {number} [defaultValue]
 */
async function addIntegerAttribute(collectionId, key, required, defaultValue) {
  try {
    await databases.createIntegerAttribute(
      DATABASE_ID,
      collectionId,
      key,
      required,
      undefined,
      undefined,
      defaultValue,
    );
    await waitForAttribute(collectionId, key);
    console.log('    + integer', key, required ? '(required)' : '(optional)');
  } catch (err) {
    if (isConflict(err)) {
      console.log('    ~ integer', key, '(already exists)');
    } else {
      throw err;
    }
  }
}

/**
 * @param {string} collectionId
 * @param {string} key
 * @param {boolean} required
 * @param {number} [defaultValue]
 */
async function addFloatAttribute(collectionId, key, required, defaultValue) {
  try {
    await databases.createFloatAttribute(
      DATABASE_ID,
      collectionId,
      key,
      required,
      undefined,
      undefined,
      defaultValue,
    );
    await waitForAttribute(collectionId, key);
    console.log('    + float', key, required ? '(required)' : '(optional)');
  } catch (err) {
    if (isConflict(err)) {
      console.log('    ~ float', key, '(already exists)');
    } else {
      throw err;
    }
  }
}

/**
 * @param {string} collectionId
 * @param {string} key
 * @param {boolean} required
 * @param {boolean} [defaultValue]
 */
async function addBooleanAttribute(collectionId, key, required, defaultValue) {
  try {
    await databases.createBooleanAttribute(
      DATABASE_ID,
      collectionId,
      key,
      required,
      defaultValue,
    );
    await waitForAttribute(collectionId, key);
    console.log('    + boolean', key, required ? '(required)' : '(optional)');
  } catch (err) {
    if (isConflict(err)) {
      console.log('    ~ boolean', key, '(already exists)');
    } else {
      throw err;
    }
  }
}

async function setupRepos() {
  const id = 'repos';
  await ensureCollection(id, 'Repos');
  await addStringAttribute(id, 'github_url', 500, true);
  await addStringAttribute(id, 'owner', 100, true);
  await addStringAttribute(id, 'repo_name', 200, true);
  await addStringAttribute(id, 'full_name', 300, true);
  await addStringAttribute(id, 'description', 1000, false);
  await addStringAttribute(id, 'language', 50, false);
  await addIntegerAttribute(id, 'stars', false, 0);
  await addIntegerAttribute(id, 'forks', false, 0);
  await addIntegerAttribute(id, 'repo_score', false, 0);
  await addFloatAttribute(id, 'criticality_score', false, 0);
  await addFloatAttribute(id, 'bus_factor', false, 0);
  await addStringAttribute(id, 'listed_by', 100, true);
  await addIntegerAttribute(id, 'contributor_count', false, 0);
  await addStringAttribute(id, 'contributors_fetched_at', 50, false);
  await addStringAttribute(id, 'eligible_pool_types', 2000, false);
  await addBooleanAttribute(id, 'has_security_md', false, false);
  await addStringAttribute(id, 'ai_summary', 4000, false);
  await addStringAttribute(id, 'license', 100, false);
}

async function setupContributors() {
  const id = 'contributors';
  await ensureCollection(id, 'Contributors');
  await addStringAttribute(id, 'github_username', 100, true);
  await addStringAttribute(id, 'github_id', 50, false);
  await addStringAttribute(id, 'avatar_url', 500, false);
  await addStringAttribute(id, 'user_id', 100, false);
  await addFloatAttribute(id, 'total_score', false, 0);
  await addIntegerAttribute(id, 'repo_count', false, 0);
  await addIntegerAttribute(id, 'total_contributions', false, 0);
}

async function setupRepoContributions() {
  const id = 'repo_contributions';
  await ensureCollection(id, 'Repo contributions');
  await addStringAttribute(id, 'contributor_id', 100, true);
  await addStringAttribute(id, 'repo_id', 100, true);
  await addStringAttribute(id, 'repo_full_name', 300, true);
  await addIntegerAttribute(id, 'commits', false, 0);
  await addIntegerAttribute(id, 'prs_merged', false, 0);
  await addIntegerAttribute(id, 'lines_added', false, 0);
  await addIntegerAttribute(id, 'lines_removed', false, 0);
  await addIntegerAttribute(id, 'reviews', false, 0);
  await addIntegerAttribute(id, 'issues_closed', false, 0);
  await addIntegerAttribute(id, 'review_comments', false, 0);
  await addIntegerAttribute(id, 'releases_count', false, 0);
  await addFloatAttribute(id, 'score', false, 0);
  await addStringAttribute(id, 'last_contribution_at', 50, false);
}

async function setupPools() {
  const id = 'pools';
  await ensureCollection(id, 'Pools');
  await addStringAttribute(id, 'name', 200, true);
  await addStringAttribute(id, 'description', 1000, false);
  await addIntegerAttribute(id, 'total_amount_cents', false, 0);
  await addIntegerAttribute(id, 'platform_fee_cents', false, 0);
  await addIntegerAttribute(id, 'distributable_amount_cents', false, 0);
  await addIntegerAttribute(id, 'daily_budget_cents', false, 0);
  await addIntegerAttribute(id, 'remaining_cents', false, 0);
  await addIntegerAttribute(id, 'donor_count', false, 0);
  await addStringAttribute(id, 'status', 20, true);
  await addStringAttribute(id, 'round_start', 50, true);
  await addStringAttribute(id, 'round_end', 50, true);
  await addStringAttribute(id, 'pool_type', 40, false);
}

async function setupDonations() {
  const id = 'donations';
  await ensureCollection(id, 'Donations');
  await addStringAttribute(id, 'pool_id', 100, true);
  await addStringAttribute(id, 'donor_id', 100, true);
  await addIntegerAttribute(id, 'amount_cents', true);
  await addStringAttribute(id, 'message', 500, false);
  await addStringAttribute(id, 'status', 20, false, 'pending');
  await addStringAttribute(id, 'stripe_session_id', 200, false);
}

async function setupPayouts() {
  const id = 'payouts';
  await ensureCollection(id, 'Payouts');
  await addStringAttribute(id, 'pool_id', 100, true);
  await addStringAttribute(id, 'contributor_id', 100, true);
  await addIntegerAttribute(id, 'amount_cents', true);
  await addFloatAttribute(id, 'score_snapshot', false, 0);
  await addStringAttribute(id, 'status', 20, true);
  await addStringAttribute(id, 'stripe_transfer_id', 200, false);
  await addStringAttribute(id, 'completed_at', 50, false);
  await addStringAttribute(id, 'failure_reason', 200, false);
}

async function setupPlatformFees() {
  const id = 'platform_fees';
  await ensureCollection(id, 'Platform fees');
  await addStringAttribute(id, 'pool_id', 100, true);
  await addIntegerAttribute(id, 'amount_cents', true);
  await addStringAttribute(id, 'source_donation_id', 100, true);
}

async function setupMonthlyContributorStats() {
  const id = 'monthly_contributor_stats';
  await ensureCollection(id, 'Monthly contributor stats');
  await addStringAttribute(id, 'contributor_id', 100, true);
  await addStringAttribute(id, 'repo_id', 100, true);
  await addStringAttribute(id, 'month', 7, true);
  await addIntegerAttribute(id, 'prs_raised', false, 0);
  await addIntegerAttribute(id, 'prs_merged', false, 0);
}

async function setupWeeklyDistributions() {
  const id = 'weekly_distributions';
  await ensureCollection(id, 'Weekly distributions');
  await addStringAttribute(id, 'pool_id', 100, true);
  await addStringAttribute(id, 'week_start', 50, true);
  await addStringAttribute(id, 'week_end', 50, true);
  await addIntegerAttribute(id, 'budget_cents', false, 0);
  await addIntegerAttribute(id, 'distributed_cents', false, 0);
  await addIntegerAttribute(id, 'payouts_created', false, 0);
}

async function setupUsers() {
  const id = 'users';
  await ensureCollection(id, 'Users');
  await addStringAttribute(id, 'github_id', 50, true);
  await addStringAttribute(id, 'github_username', 100, true);
  await addStringAttribute(id, 'avatar_url', 500, false);
  await addStringAttribute(id, 'display_name', 200, false);
  await addStringAttribute(id, 'email', 200, false);
  await addStringAttribute(id, 'stripe_connect_account_id', 100, false);
  await addBooleanAttribute(id, 'stripe_charges_enabled', false, false);
  await addBooleanAttribute(id, 'stripe_payouts_enabled', false, false);
  await addStringAttribute(id, 'payout_pin_hash', 256, false);
  await addStringAttribute(id, 'github_access_token', 2000, false);
}

async function main() {
  if (!process.env.APPWRITE_API_KEY) {
    console.error('Error: APPWRITE_API_KEY is required.');
    process.exit(1);
  }

  console.log('OpenGet database setup starting…');
  console.log('Endpoint:', process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1');
  console.log('Project:', process.env.APPWRITE_PROJECT_ID || '69cd72ef00259a9a29b9');

  await ensureDatabase();

  const steps = [
    ['repos', setupRepos],
    ['contributors', setupContributors],
    ['repo_contributions', setupRepoContributions],
    ['pools', setupPools],
    ['donations', setupDonations],
    ['payouts', setupPayouts],
    ['platform_fees', setupPlatformFees],
    ['monthly_contributor_stats', setupMonthlyContributorStats],
    ['weekly_distributions', setupWeeklyDistributions],
    ['users', setupUsers],
  ];

  for (const [name, fn] of steps) {
    console.log(`\n--- ${name} ---`);
    await fn();
  }

  console.log('\n[done] All collections and attributes processed.');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
