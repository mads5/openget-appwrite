/**
 * OpenAI-generated Shield challenges. Expected outputs are always computed server-side
 * from `FORMULA_IMPL` in shield-challenge.js — the model never supplies ground truth.
 */

import crypto from 'node:crypto';
import { AI_FORMULA_KEYS, validateShieldSolution } from './shield-challenge.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const FORMULA_ENGLISH = {
  square_plus_n:
    'For any integer n, return n plus (n times n). Equivalently: n squared plus n. Example: shieldFix(3) should be 12.',
  triple_minus_one:
    'For any integer n, return three times n, minus one. Example: shieldFix(4) should be 11.',
  n_squared:
    'For any integer n, return n times n (n squared). Example: shieldFix(-3) should be 9.',
  abs_times_two:
    'For any integer n, return two times the absolute value of n. Example: shieldFix(-5) should be 10 and shieldFix(0) should be 0.',
};

/**
 * @param {(msg: string) => void} [log]
 * @returns {Promise<{ formulaKey: string; title: string; instructions: string; starter_code: string } | null>}
 */
export async function generateShieldChallenge(log) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || String(apiKey).trim() === '') return null;

  const formulaKey = AI_FORMULA_KEYS[crypto.randomInt(0, AI_FORMULA_KEYS.length)];
  const behavior = FORMULA_ENGLISH[formulaKey];
  const model = process.env.OPENAI_SHIELD_MODEL || 'gpt-4o-mini';

  const system = `You output only valid JSON objects with keys: title (string), instructions (string), starter_code (string).
The starter_code must contain exactly one top-level function named shieldFix with one parameter n, implementing JavaScript that runs in strict mode.
The code must be subtly wrong relative to the described behavior but syntactically valid. No import, require, fetch, eval, Function constructor, process, Deno, or WebAssembly.`;

  const user = `Write a tiny debugging exercise.

Correct behavior: ${behavior}

Return JSON like:
{"title":"...","instructions":"...","starter_code":"function shieldFix(n) {\\n  ...\\n}\\n"}

instructions should tell the candidate to fix shieldFix to match the behavior (without giving the algebraic answer away in a single formula line — use words and examples only).`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.85,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        if (log) log(`shield-ai: OpenAI ${res.status} ${t.slice(0, 200)}`);
        return null;
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        if (log) log('shield-ai: empty content');
        return null;
      }
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        if (log) log('shield-ai: JSON parse failed');
        continue;
      }
      const title = String(parsed.title || '').trim().slice(0, 120);
      const instructions = String(parsed.instructions || '').trim().slice(0, 2000);
      let starter_code = String(parsed.starter_code || '').trim();
      if (!title || !instructions || starter_code.length < 20 || starter_code.length > 6000) continue;
      if (!/\bfunction\s+shieldFix\s*\(\s*n\s*\)/.test(starter_code)) continue;

      const meta = { formulaKey, fnName: 'shieldFix' };
      const check = validateShieldSolution(starter_code, meta);
      if (check.ok) continue;

      return { formulaKey, title, instructions, starter_code };
    } catch (e) {
      if (log) log(`shield-ai attempt ${attempt}: ${e.message}`);
    }
  }
  return null;
}
