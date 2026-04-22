import vm from 'node:vm';

/** Time-box for one Shield attempt (ms) — aligns with “up to 30 minutes” product copy. */
export const SHIELD_SESSION_TTL_MS = 30 * 60 * 1000;

/** One violation (tab hidden or leaving fullscreen) voids the session server-side. */
export const MAX_INTEGRITY_STRIKES = 1;

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

/**
 * Pure integer formulas: grading uses these only (never model-supplied outputs).
 * Keys must stay in sync with `parseShieldChallengeMeta` and the static pool.
 */
export const FORMULA_IMPL = {
  square_plus_n: (n) => n * n + n,
  triple_minus_one: (n) => 3 * n - 1,
  n_squared: (n) => n * n,
  abs_times_two: (n) => Math.abs(n) * 2,
  cube_minus_n: (n) => n * n * n - n,
  double_square: (n) => 2 * n * n,
  sum_three_consecutive: (n) => n + (n + 1) + (n + 2),
  abs_plus_ten: (n) => Math.abs(n) + 10,
  diff_prev_square: (n) => n * n - (n - 1) * (n - 1),
};

export const AI_FORMULA_KEYS = Object.keys(FORMULA_IMPL);

/** Natural-language spec for OpenAI prompts (no algebraic “answer key” in one line). */
export const FORMULA_ENGLISH = {
  square_plus_n:
    'For any integer n, return n plus (n squared). Example: shieldFix(3) should be 12; shieldFix(-2) should be 2.',
  triple_minus_one:
    'For any integer n, return (three times n) minus one. Example: shieldFix(4) should be 11.',
  n_squared:
    'For any integer n, return n squared (n times n). Example: shieldFix(-4) should be 16.',
  abs_times_two:
    'For any integer n, return two times the absolute value of n. Example: shieldFix(-5) should be 10; shieldFix(0) should be 0.',
  cube_minus_n:
    'For any integer n, return (n cubed) minus n. Example: shieldFix(2) should be 6; shieldFix(-1) should be 0.',
  double_square:
    'For any integer n, return two times (n squared). Example: shieldFix(3) should be 18.',
  sum_three_consecutive:
    'For any integer n, return the sum of three consecutive integers starting at n: n + (n+1) + (n+2). Example: shieldFix(10) should be 33.',
  abs_plus_ten:
    'For any integer n, return the absolute value of n, plus ten. Example: shieldFix(-4) should be 14; shieldFix(0) should be 10.',
  diff_prev_square:
    'For any integer n, return (n squared) minus ((n minus one) squared). Example: shieldFix(5) should be 9; shieldFix(0) should be -1.',
};

/**
 * @param {string} formulaKey
 * @returns {Array<[number, number]>}
 */
function numericTestPairs(formulaKey) {
  const impl = FORMULA_IMPL[formulaKey];
  if (!impl) return [];
  const ns = [-500, -17, -8, -3, -2, -1, 0, 1, 2, 4, 7, 11, 15, 42, 99];
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
    if (k in FORMULA_IMPL) {
      return { formulaKey: k, fnName: 'shieldFix' };
    }
  } catch {
    /* default */
  }
  return { formulaKey: 'parity_is_even', fnName: 'isEven' };
}

/**
 * Last-resort challenge when OpenAI and the static pool are both unavailable.
 * @returns { { slug: string, title: string, instructions: string, starter_code: string } }
 */
export function getParityChallenge() {
  return {
    slug: 'parity-v1',
    title: 'Fix isEven',
    instructions:
      'Define a function named isEven that returns true for even integers and false for odd integers. ' +
      'The starter code is wrong. Submit JavaScript containing a single top-level `function isEven(n) { ... }`. ' +
      'No import, require, fetch, eval, or Function constructor. You may use up to 30 minutes (see server timer).',
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
    vm.runInNewContext(wrapped, { Math }, { timeout: 3000 });
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
