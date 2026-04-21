/**
 * Default “industry reference” set: widely depended-on open-source projects across stacks.
 * Shown on /repos; merged with live index by `full_name`. Not auto-inserted into Appwrite.
 */
export type IndustryRepo = {
  full_name: string;
  blurb: string;
  tag: string;
};

export const INDUSTRY_DEFAULT_REPOS: IndustryRepo[] = [
  { full_name: "facebook/react", blurb: "UI library used across most modern web apps", tag: "Web" },
  { full_name: "vercel/next.js", blurb: "Full-stack React framework, common in product teams", tag: "Web" },
  { full_name: "microsoft/TypeScript", blurb: "Typed JavaScript; default for large codebases", tag: "Languages" },
  { full_name: "nodejs/node", blurb: "JavaScript runtime on servers and tooling", tag: "Runtime" },
  { full_name: "tensorflow/tensorflow", blurb: "Machine learning; standard in data & research", tag: "ML / data" },
  { full_name: "pytorch/pytorch", blurb: "Deep learning framework in industry AI pipelines", tag: "ML / data" },
  { full_name: "kubernetes/kubernetes", blurb: "Container orchestration; default in cloud native", tag: "Infra" },
  { full_name: "langchain-ai/langchain", blurb: "LLM / agent apps; common in gen-AI products", tag: "AI" },
  { full_name: "microsoft/vscode", blurb: "Editor stack used by a large share of developers", tag: "Tooling" },
  { full_name: "golang/go", blurb: "Cloud services, CLIs, and backend microservices", tag: "Languages" },
  { full_name: "rust-lang/rust", blurb: "Systems, security-sensitive and performance work", tag: "Languages" },
  { full_name: "hashicorp/terraform", blurb: "Infrastructure as code for teams and companies", tag: "Infra" },
  { full_name: "prometheus/prometheus", blurb: "Metrics and monitoring in production", tag: "Observability" },
  { full_name: "redis/redis", blurb: "In-memory data store; ubiquitous in web stacks", tag: "Data" },
  { full_name: "apache/kafka", blurb: "Event streaming; backbone of data platforms", tag: "Data" },
  { full_name: "elastic/elasticsearch", blurb: "Search and log analytics in enterprises", tag: "Data" },
  { full_name: "mongodb/mongo", blurb: "Document database; common in product backends", tag: "Data" },
  { full_name: "ansible/ansible", blurb: "Automation and configuration at scale", tag: "Infra" },
  { full_name: "opensearch-project/OpenSearch", blurb: "Search and analytics (fork lineage)", tag: "Data" },
  { full_name: "traefik/traefik", blurb: "Edge / ingress; widely used in front of services", tag: "Infra" },
];
