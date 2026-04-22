/**
 * F7: manual entropy / "human rhythm" from recent commits (default branch, sample).
 * Returns 0-1. Falls back to 0.5 on rate limits or empty data.
 */
export async function computeF7Entropy(githubLogin, allRc, ghHeaders, log) {
  if (!githubLogin || !allRc || allRc.length === 0) return 0.5;

  const samples = [...allRc]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 2);

  const timestamps = [];
  for (const rc of samples) {
    if (!rc.repo_full_name) continue;
    const [owner, repo] = String(rc.repo_full_name).split('/');
    if (!owner || !repo) continue;
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?author=${encodeURIComponent(githubLogin)}&per_page=15`;
    try {
      const res = await fetch(url, { headers: ghHeaders });
      if (!res.ok) continue;
      const arr = await res.json();
      if (!Array.isArray(arr)) continue;
      for (const c of arr) {
        const d = c.commit?.author?.date || c.commit?.committer?.date;
        if (d) timestamps.push(new Date(d).getTime());
      }
    } catch (e) {
      if (log) log(`F7: commits ${rc.repo_full_name}: ${e.message}`);
    }
  }

  if (timestamps.length < 4) {
    return 0.5;
  }
  timestamps.sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < timestamps.length; i++) {
    gaps.push((timestamps[i] - timestamps[i - 1]) / 3600000);
  }
  if (gaps.length === 0) return 0.5;
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  let variance = 0;
  for (const g of gaps) {
    variance += (g - mean) * (g - mean);
  }
  variance /= gaps.length;
  const sd = Math.sqrt(variance);
  const cv = mean > 1e-6 ? Math.min(3, sd / mean) : 0;
  const entropyish = Math.min(1, Math.log1p(cv * 2) / Math.log1p(4));
  const burst = gaps.some((g) => g < 0.25) && gaps.some((g) => g > 48) ? 0.15 : 0;
  return Math.min(1, Math.max(0, entropyish * 0.85 + burst + 0.05));
}
