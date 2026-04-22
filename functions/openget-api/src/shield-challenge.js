import vm from 'node:vm';

/** Time-box for one Shield attempt (ms). */
export const SHIELD_SESSION_TTL_MS = 30 * 60 * 1000;

const FORBIDDEN = /(\brequire\b|\bimport\b|\beval\b|Function\s*\(|fetch\s*\(|process\.|Deno|WebAssembly)/i;

/**
 * v1: single parity challenge — proves basic JS reading/debugging without network.
 * @returns { { slug: string, title: string, instructions: string, starter_code: string } }
 */
export function getParityChallenge() {
  return {
    slug: 'parity-v1',
    title: 'Fix isEven',
    instructions:
      'Define a function named isEven that returns true for even integers and false for odd integers. ' +
      'The starter code is wrong. Submit JavaScript containing a single top-level `function isEven(n) { ... }`. ' +
      'No import, require, fetch, eval, or Function constructor.',
    starter_code: `function isEven(n) {\n  return n % 2 === 1;\n}\n`,
  };
}

/**
 * Run bounded tests inside an isolated VM context.
 * @param {string} sourceRaw
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateShieldSolution(sourceRaw) {
  const source = String(sourceRaw || '').trim();
  if (source.length < 12 || source.length > 8000) {
    return { ok: false, error: 'Submission must be between 12 and 8000 characters.' };
  }
  if (FORBIDDEN.test(source)) {
    return { ok: false, error: 'Disallowed constructs in submission.' };
  }
  if (!/\bfunction\s+isEven\s*\(\s*n\s*\)/.test(source)) {
    return { ok: false, error: 'Submission must declare function isEven(n).' };
  }

  const wrapped =
    `"use strict";\n${source}\n;if (typeof isEven !== "function") throw new Error("missing isEven");\n` +
    'const pairs = [[0,true],[1,false],[2,true],[-2,true],[-3,false],[100,true],[101,false]];\n' +
    'for (const [n,exp] of pairs) { const g = isEven(n); if (g !== exp) throw new Error("wrong for "+n+" got "+g); }\n' +
    'true;';

  try {
    vm.runInNewContext(wrapped, Object.create(null), { timeout: 2000 });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Validation failed';
    return { ok: false, error: msg.length > 200 ? `${msg.slice(0, 200)}…` : msg };
  }
}
