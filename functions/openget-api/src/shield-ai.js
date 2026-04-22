/**
 * OpenAI-generated Shield challenges. Expected outputs are always computed server-side
 * from `FORMULA_IMPL` in shield-challenge.js — the model never supplies ground truth.
 */

import crypto from 'node:crypto';
import { AI_FORMULA_KEYS, FORMULA_ENGLISH, validateShieldSolution } from './shield-challenge.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

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

Difficulty: this is a serious debugging exercise (candidates may spend many minutes, up to ~30). The starter must be MULTI-STEP wrong code (at least 6 non-empty lines inside the function body, not a one-line typo). Use misleading variable names, redundant branches, wrong edge cases for n===0 or n<0, off-by-one loops, or confused operator precedence — but keep it readable JavaScript.

The code must be wrong for the described behavior yet syntactically valid. No import, require, fetch, eval, Function constructor, process, Deno, or WebAssembly.`;

  const user = `Write a debugging exercise for experienced developers.

Correct behavior for shieldFix(n) with integer n:
${behavior}

Return JSON like:
{"title":"...","instructions":"...","starter_code":"function shieldFix(n) {\\n  ...\\n}\\n"}

instructions: Set expectations, mention negatives and zero, and say they may use up to 30 minutes (server enforces a deadline). Do not print the closed-form answer as a single formula line — use words and numeric examples only.

starter_code: Must be subtly broken; must NOT be trivially fixable by flipping one obvious operator in a one-liner.`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.88,
          max_tokens: 2200,
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
      const instructions = String(parsed.instructions || '').trim().slice(0, 4000);
      let starter_code = String(parsed.starter_code || '').trim();
      if (!title || !instructions || starter_code.length < 80 || starter_code.length > 8000) continue;
      if (!/\bfunction\s+shieldFix\s*\(\s*n\s*\)/.test(starter_code)) continue;
      const bodyLines = starter_code.split('\n').filter((l) => String(l).trim() !== '');
      if (bodyLines.length < 8) continue;

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
