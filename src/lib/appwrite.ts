import { Client, Account, Databases, OAuthProvider } from "appwrite";

export const APPWRITE_ENDPOINT = "https://sgp.cloud.appwrite.io/v1";
export const APPWRITE_PROJECT_ID = "69cd72ef00259a9a29b9";
export const DATABASE_ID = "openget-db";

export const COLLECTION = {
  REPOS: "repos",
  CONTRIBUTORS: "contributors",
  REPO_CONTRIBUTIONS: "repo_contributions",
  POOLS: "pools",
  DONATIONS: "donations",
  PAYOUTS: "payouts",
  PLATFORM_FEES: "platform_fees",
  MONTHLY_STATS: "monthly_contributor_stats",
  WEEKLY_DISTRIBUTIONS: "weekly_distributions",
  USERS: "users",
} as const;

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

const account = new Account(client);
const databases = new Databases(client);

export { client, account, databases, OAuthProvider };
