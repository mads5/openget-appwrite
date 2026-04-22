import vm from 'node:vm';

/** Time-box for one Shield attempt (ms). */
export const SHIELD_SESSION_TTL_MS = 30 * 60 * 1000;

/** Tab / document-hidden violations before the session is voided server-side. */
export const MAX_INTEGRITY_STRIKES = 3;

/** Formulas used for AI-generated challenges (expected values computed server-side only). */
export const AI_FORMULA_KEYS = ['square_plus_n', 'triple_minus_one', 'n_squared', 'abs_times_two'];

const FORBIDDEN = /(\brequire\b|\bimport\b|\beval\b|Function\s*\(|fetch\s*\(|process\.|Deno|WebAssembly)/i;

/** VM errors may not be `instanceof Error` (different realm). */
function vmThrownMessage(e) {
  if (e != null && typeof e === 'object' && typeof e.message === 'string') return e.message;
  if (e instanceof Error) return e.message;
  try {
    return String(e);
  } catch {
    return 'Validation failed';
  }
}

export const FORMULA_IMPL = {
  square_plus_n: (n) => n * n + n,
  triple_minus_one: (n) => 3 * n - 1,
  n_squared: (n) => n * n,
  abs_times_two: (n) => Math.abs(n) * 2,
};

/**
 * @param {string} formulaKey
 * @returns {Array<[number, number]>}
 */
function numericTestPairs(formulaKey) {
  const impl = FORMULA_IMPL[formulaKey];
  if (!impl) return [];
  const ns = [-8, -3, -2, -1, 0, 1, 2, 5, 7, 11, 15];
  return ns.map((n) => [n, impl(n)]);
}

/**
 * @param {unknown} raw Stored JSON on shield_sessions.challenge_meta
 * @returns {{ formulaKey: string; fnName: 'isEven' | 'shieldFix' }}
 */
export function parseShieldChallengeMeta(raw) {
  if (raw == null || String(raw).trim() === '') {
    return { formulaKey: 'parity_is_even', fnName: 'isEven' };
  }
  try {
    const o = JSON.parse(String(raw));
    const k = typeof o.formulaKey === 'string' ? o.formulaKey : '';
    if (k === 'square_plus_n' || k === 'triple_minus_one' || k === 'n_squared' || k === 'abs_times_two') {
      return { formulaKey: k, fnName: 'shieldFix' };
    }
  } catch {
    /* default */
  }
  return { formulaKey: 'parity_is_even', fnName: 'isEven' };
}

/**
 * v1 fallback: single parity challenge when OpenAI is unavailable.
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
 * @param {string} sourceRaw
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function validateParity(sourceRaw) {
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
    const msg = vmThrownMessage(e);
    return { ok: false, error: msg.length > 200 ? `${msg.slice(0, 200)}…` : msg };
  }
}

/**
 * @param {string} sourceRaw
 * @param {string} formulaKey
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function validateNumericFormula(sourceRaw, formulaKey) {
  const source = String(sourceRaw || '').trim();
  if (source.length < 12 || source.length > 8000) {
    return { ok: false, error: 'Submission must be between 12 and 8000 characters.' };
  }
  if (FORBIDDEN.test(source)) {
    return { ok: false, error: 'Disallowed constructs in submission.' };
  }
  if (!/\bfunction\s+shieldFix\s*\(\s*n\s*\)/.test(source)) {
    return { ok: false, error: 'Submission must declare function shieldFix(n).' };
  }
  if (!FORMULA_IMPL[formulaKey]) {
    return { ok: false, error: 'Unknown challenge type.' };
  }

  const pairs = numericTestPairs(formulaKey);
  const wrapped =
    `"use strict";\n${source}\n;if (typeof shieldFix !== "function") throw new Error("missing shieldFix");\n` +
    `const pairs = ${JSON.stringify(pairs)};\n` +
    'for (const [n,exp] of pairs) { const g = shieldFix(n); if (g !== exp) throw new Error("wrong for "+n+" got "+g); }\n' +
    'true;';

  try {
    vm.runInNewContext(wrapped, { Math }, { timeout: 2000 });
    return { ok: true };
  } catch (e) {
    const msg = vmThrownMessage(e);
    return { ok: false, error: msg.length > 200 ? `${msg.slice(0, 200)}…` : msg };
  }
}

/**
 * Run bounded tests inside an isolated VM context.
 * @param {string} sourceRaw
 * @param {{ formulaKey: string; fnName?: string }} [meta] When omitted, parity is assumed (legacy sessions).
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateShieldSolution(sourceRaw, meta) {
  const m = meta || parseShieldChallengeMeta(null);
  if (m.formulaKey === 'parity_is_even') {
    return validateParity(sourceRaw);
  }
  return validateNumericFormula(sourceRaw, m.formulaKey);
}
