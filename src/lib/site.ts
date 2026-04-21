/**
 * Optional public link to the repo README section for operators (dashboard env notice).
 * Forks can set NEXT_PUBLIC_README_ENV_URL in .env.local.
 */
export const README_ENV_SECTION_URL =
  process.env.NEXT_PUBLIC_README_ENV_URL?.trim() ||
  "https://github.com/mads5/openget-appwrite/blob/main/README.md#environment-variables";
