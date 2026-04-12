export type RepoSummaryInput = {
  full_name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  criticality_score?: number;
  bus_factor?: number;
  eligible_pool_types?: string[];
  has_security_md?: boolean;
};

export function buildFallbackSummary(r: RepoSummaryInput): string {
  const pools = (r.eligible_pool_types ?? []).filter(Boolean);
  const poolNote =
    pools.length > 0
      ? ` It is included in OpenGet funding lanes: ${pools.join(", ")}.`
      : "";
  const desc = r.description?.trim();
  const base = desc
    ? `${r.full_name} is listed on OpenGet with this GitHub description: "${desc.slice(0, 280)}${desc.length > 280 ? "…" : ""}"`
    : `${r.full_name} is an open-source project${r.language ? ` with primary language ${r.language}` : ""} on GitHub.`;
  const metrics = ` It has about ${r.stars} stars and ${r.forks} forks.`;
  const crit =
    r.criticality_score != null
      ? ` Estimated ecosystem criticality (heuristic 0–1): ${r.criticality_score.toFixed(2)}.`
      : "";
  const bf =
    r.bus_factor != null
      ? ` Estimated bus factor: ${r.bus_factor.toFixed(1)}.`
      : "";
  const sec = r.has_security_md ? " The default branch includes a SECURITY.md file." : "";
  return `${base}${metrics}${crit}${bf}${poolNote}${sec}`;
}

export async function fetchOpenAiSummary(r: RepoSummaryInput): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You write concise blurbs about open-source repositories for a maintainer-funding platform. Be factual; do not invent people, companies, or unverifiable claims. If the GitHub description is empty, infer cautiously from the repository name and language only.",
        },
        {
          role: "user",
          content: `Write 2–4 sentences describing this repository for potential sponsors and contributors.

full_name: ${r.full_name}
GitHub description: ${r.description?.trim() || "(none)"}
language: ${r.language || "unknown"}
stars: ${r.stars}
forks: ${r.forks}
criticality (0–1 heuristic): ${r.criticality_score ?? "unknown"}
bus_factor estimate: ${r.bus_factor ?? "unknown"}
eligible_pool_types (funding lanes): ${(r.eligible_pool_types ?? []).join(", ") || "none"}
has_security_md: ${r.has_security_md ?? "unknown"}`,
        },
      ],
      max_tokens: 240,
      temperature: 0.35,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  return text && text.length > 0 ? text : null;
}
