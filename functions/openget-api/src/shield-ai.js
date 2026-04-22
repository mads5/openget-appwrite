/**
 * LLM-generated Shield challenges (Gemini and/or OpenAI). Expected outputs are always
 * computed server-side from `FORMULA_IMPL` in shield-challenge.js — the model never supplies ground truth.
 */

import crypto from 'node:crypto';
import { AI_FORMULA_KEYS, FORMULA_ENGLISH, validateShieldSolution } from './shield-challenge.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function buildPrompts(formulaKey, behavior) {
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

  return { system, user };
}

/** Strip optional ```json fences some models still emit. */
function extractJsonText(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  return s;
}

/**
 * @param {string} content
 * @param {string} formulaKey
 * @returns {{ formulaKey: string; title: string; instructions: string; starter_code: string } | null}
 */
function parseAndValidateChallenge(content, formulaKey) {
  let parsed;
  try {
    parsed = JSON.parse(extractJsonText(content));
  } catch {
    return null;
  }
  const title = String(parsed.title || '').trim().slice(0, 120);
  const instructions = String(parsed.instructions || '').trim().slice(0, 4000);
  let starter_code = String(parsed.starter_code || '').trim();
  if (!title || !instructions || starter_code.length < 80 || starter_code.length > 8000) return null;
  if (!/\bfunction\s+shieldFix\s*\(\s*n\s*\)/.test(starter_code)) return null;
  const bodyLines = starter_code.split('\n').filter((l) => String(l).trim() !== '');
  if (bodyLines.length < 8) return null;

  const meta = { formulaKey, fnName: 'shieldFix' };
  const check = validateShieldSolution(starter_code, meta);
  if (check.ok) return null;

  return { formulaKey, title, instructions, starter_code };
}

/**
 * Google Gemini (AI Studio / Vertex API key in query param).
 * @param {string} apiKey
 * @param {string} system
 * @param {string} user
 * @param {(msg: string) => void} [log]
 * @returns {Promise<string | null>}
 */
async function geminiGenerateText(apiKey, system, user, log) {
  const model = process.env.GEMINI_SHIELD_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.88,
        maxOutputTokens: 2200,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    if (log) log(`shield-ai: Gemini ${res.status} ${t.slice(0, 240)}`);
    return null;
  }
  const data = await res.json();
  const block = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
  if (block && String(block).toUpperCase().includes('SAFETY')) {
    if (log) log(`shield-ai: Gemini blocked (${block})`);
    return null;
  }
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = parts?.[0]?.text;
  if (!text || typeof text !== 'string') {
    if (log) log('shield-ai: Gemini empty content');
    return null;
  }
  return text;
}

/**
 * @param {string} apiKey
 * @param {string} system
 * @param {string} user
 * @param {(msg: string) => void} [log]
 * @returns {Promise<string | null>}
 */
async function openaiGenerateText(apiKey, system, user, log) {
  const model = process.env.OPENAI_SHIELD_MODEL || 'gpt-4o-mini';
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
    if (log) log(`shield-ai: OpenAI ${res.status} ${t.slice(0, 240)}`);
    return null;
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    if (log) log('shield-ai: OpenAI empty content');
    return null;
  }
  return content;
}

/**
 * @param {(msg: string) => void} [log]
 * @returns {Promise<{ formulaKey: string; title: string; instructions: string; starter_code: string } | null>}
 */
export async function generateShieldChallenge(log) {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!geminiKey && !openaiKey) return null;

  const formulaKey = AI_FORMULA_KEYS[crypto.randomInt(0, AI_FORMULA_KEYS.length)];
  const behavior = FORMULA_ENGLISH[formulaKey];
  const { system, user } = buildPrompts(formulaKey, behavior);

  const tryProvider = async (name, genText) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const content = await genText();
        if (!content) continue;
        const parsed = parseAndValidateChallenge(content, formulaKey);
        if (parsed) return parsed;
      } catch (e) {
        if (log) log(`shield-ai ${name} attempt ${attempt}: ${e.message}`);
      }
    }
    return null;
  };

  if (geminiKey) {
    const out = await tryProvider('gemini', () => geminiGenerateText(geminiKey, system, user, log));
    if (out) return out;
    if (log) log('shield-ai: Gemini produced no valid challenge after retries');
  }

  if (openaiKey) {
    const out = await tryProvider('openai', () => openaiGenerateText(openaiKey, system, user, log));
    if (out) return out;
    if (log) log('shield-ai: OpenAI produced no valid challenge after retries');
  }

  return null;
}
