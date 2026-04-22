/**
 * Keep in sync with `src/lib/industry-default-repos.ts` (full_name only).
 * Used by `import-industry-repos` to bulk-ingest public benchmark repos.
 */
export const INDUSTRY_FULL_NAMES = [
  'facebook/react',
  'vercel/next.js',
  'microsoft/TypeScript',
  'nodejs/node',
  'tensorflow/tensorflow',
  'pytorch/pytorch',
  'kubernetes/kubernetes',
  'langchain-ai/langchain',
  'microsoft/vscode',
  'golang/go',
  'rust-lang/rust',
  'hashicorp/terraform',
  'prometheus/prometheus',
  'redis/redis',
  'apache/kafka',
  'elastic/elasticsearch',
  'mongodb/mongo',
  'ansible/ansible',
  'opensearch-project/OpenSearch',
  'traefik/traefik',
];

export const INDUSTRY_IMPORT_BATCH = 4;
