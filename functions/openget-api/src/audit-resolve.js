/**
 * Human-Risk audit: package.json / dependency names → npm metadata → GitHub repo → OpenGet index.
 */

const NPM_UA = { 'User-Agent': 'OpenGet-Appwrite-Function/audit', Accept: 'application/json' };

/**
 * @param {string} text - Raw package.json
 * @param {{ includeDev?: boolean, includePeer?: boolean, includeOptional?: boolean }} [opts]
 * @returns {string[]}
 */
export function listDependencyNamesFromPackageJson(text, opts = {}) {
  const includeDev = opts.includeDev !== false;
  const includePeer = opts.includePeer === true;
  const includeOptional = opts.includeOptional === true;
  const j = JSON.parse(text);
  if (!j || typeof j !== 'object') return [];
  const names = new Set();
  const add = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    for (const k of Object.keys(obj)) names.add(k);
  };
  add(j.dependencies);
  if (includeDev) add(j.devDependencies);
  if (includePeer) add(j.peerDependencies);
  if (includeOptional) add(j.optionalDependencies);
  return [...names].sort();
}

/**
 * @param {Record<string, string>} [deps] - e.g. dependencies object only
 * @returns {string[]}
 */
export function listDependencyNamesFromObject(deps) {
  if (!deps || typeof deps !== 'object' || Array.isArray(deps)) return [];
  return Object.keys(deps).sort();
}

/**
 * @param {unknown} repo - npm "repository" field
 * @returns {{ full_name: string, raw: string } | null} full_name = owner/name
 */
export function githubFullNameFromNpmRepository(repo) {
  if (!repo) return null;
  let url = null;
  if (typeof repo === 'string') url = repo.trim();
  else if (typeof repo === 'object' && repo !== null) {
    if (typeof repo.url === 'string') url = repo.url.trim();
  }
  if (!url) return null;
  // git+https://github.com/foo/bar.git
  const m = String(url).match(/github\.com\/([^/]+)\/([^/?.#]+)(?:\.git)?/i);
  if (m) {
    return { full_name: `${m[1]}/${m[2]}`, raw: url };
  }
  // shortcut "github:foo/bar"
  const short = String(url).match(/^github:([^/]+)\/([^/]+)$/i);
  if (short) return { full_name: `${short[1]}/${short[2]}`, raw: url };
  return null;
}

/**
 * Fetch npm `latest` dist manifest (public registry).
 * @param {string} packageName
 * @returns {Promise<{ name: string, version: string, license?: string, repository?: unknown, maintainers?: Array<{name?:string, email?:string}> } | { error: string, status: number }>}
 */
export async function fetchNpmLatest(packageName) {
  const q = encodeURIComponent(packageName);
  const res = await fetch(`https://registry.npmjs.org/${q}/latest`, {
    headers: NPM_UA,
  });
  if (res.status === 404) {
    return { error: 'not found on npm', status: 404 };
  }
  if (!res.ok) {
    return { error: `npm ${res.status}`, status: res.status };
  }
  return res.json();
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
