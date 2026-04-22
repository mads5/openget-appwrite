/**
 * Rotating Shield challenges when OpenAI is unavailable. Each starter is hand-checked to
 * fail `validateShieldSolution`; grading still uses server-side `FORMULA_IMPL` only.
 */

import crypto from 'node:crypto';
import { validateShieldSolution } from './shield-challenge.js';

const TIME_HINT =
  '\n\nTake your time: the server allows up to 30 minutes. Read edge cases (negatives and zero) carefully.';

const POOL = [
  {
    formulaKey: 'square_plus_n',
    title: 'Growth curve bug',
    instructions:
      'Implement `shieldFix(n)` for integers n so it matches the product spec: ' +
      'output must equal n squared plus n (same as n times (n+1)). ' +
      'The starter passes some smoke tests but fails hidden checks — find every wrong branch.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  if (n === 0) {
    return 0;
  }
  if (n < 0) {
    return n * n - n;
  }
  let s = 0;
  for (let i = 1; i <= n; i++) {
    s += n;
  }
  return s + 1;
}
`,
  },
  {
    formulaKey: 'square_plus_n',
    title: 'Signal aggregation',
    instructions:
      'Fix `shieldFix(n)` so that for every integer n the result is exactly n plus n squared. ' +
      'The legacy pipeline below mixes two half-measures; unify the logic.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  const square = n * n;
  const linear = n;
  if (Math.abs(n) > 100) {
    return square;
  }
  return square - linear;
}
`,
  },
  {
    formulaKey: 'triple_minus_one',
    title: 'Rate limiter offset',
    instructions:
      'The spec: for integer n, return (3 * n) - 1. The starter mishandles negatives and uses the wrong final offset.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  const triple = n + n + n;
  if (n < 0) {
    return triple + 1;
  }
  return triple;
}
`,
  },
  {
    formulaKey: 'triple_minus_one',
    title: 'Tripled delta',
    instructions:
      'Return three times n, minus one, for all integers. The staged rollout below is incorrect.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  return 3 * (n - 1);
}
`,
  },
  {
    formulaKey: 'n_squared',
    title: 'Quadratic sensor',
    instructions:
      'Return n squared for every integer n. The starter rounds and mishandles zero.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  if (n === 0) {
    return 1;
  }
  return Math.round(Math.sqrt(n * n * n));
}
`,
  },
  {
    formulaKey: 'n_squared',
    title: 'Area helper',
    instructions:
      'For integer n, output must be n * n (including negatives). Fix the implementation.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  const a = Math.abs(n);
  return a * a * (n < 0 ? -1 : 1);
}
`,
  },
  {
    formulaKey: 'abs_times_two',
    title: 'Magnitude doubler',
    instructions:
      'For integer n, return twice the absolute value of n. Starter uses the wrong multiplier on negatives.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  if (n < 0) {
    return n * 2;
  }
  return n + n;
}
`,
  },
  {
    formulaKey: 'abs_times_two',
    title: 'Symmetric channel',
    instructions:
      'shieldFix(n) must equal 2 * abs(n) for all integers. The normalization step is wrong.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  const m = n < 0 ? -n - 1 : n;
  return m + m;
}
`,
  },
  {
    formulaKey: 'cube_minus_n',
    title: 'Cubic residual',
    instructions:
      'For integer n, return (n cubed) minus n. The starter uses a cheap approximation for large |n|.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  if (Math.abs(n) > 20) {
    return n * n * n;
  }
  return n * n * n + n;
}
`,
  },
  {
    formulaKey: 'cube_minus_n',
    title: 'Volume minus unit',
    instructions:
      'Implement the full cubic identity n^3 - n for every integer (no floating point).' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  return (n - 1) * (n - 1) * (n - 1) - (n - 1);
}
`,
  },
  {
    formulaKey: 'double_square',
    title: 'Twin squares',
    instructions:
      'For integer n, return 2 * (n squared). The starter squares (2n) by mistake.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  const d = n + n;
  return d * d;
}
`,
  },
  {
    formulaKey: 'double_square',
    title: 'Amplified baseline',
    instructions:
      'Output = two times n squared, for all integers including zero.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  return n * n + n;
}
`,
  },
  {
    formulaKey: 'sum_three_consecutive',
    title: 'Rolling window sum',
    instructions:
      'Return n + (n+1) + (n+2). The starter drops the last term when n is odd.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  if (n % 2 !== 0) {
    return n + (n + 1);
  }
  return n + (n + 1) + (n + 2);
}
`,
  },
  {
    formulaKey: 'sum_three_consecutive',
    title: 'Triple stride',
    instructions:
      'Three consecutive integers starting at n must sum correctly for every integer.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  return 3 * n + 2;
}
`,
  },
  {
    formulaKey: 'abs_plus_ten',
    title: 'Bias offset',
    instructions:
      'Return abs(n) + 10 for every integer n. The starter uses the wrong bias on zero.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  if (n === 0) {
    return 0;
  }
  return (n < 0 ? -n : n) + 9;
}
`,
  },
  {
    formulaKey: 'abs_plus_ten',
    title: 'Guard rail metric',
    instructions:
      'Absolute value of n, plus ten — no exceptions.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  return Math.abs(n + 10);
}
`,
  },
  {
    formulaKey: 'diff_prev_square',
    title: 'Discrete derivative',
    instructions:
      'For integer n, return n squared minus (n-1) squared. Check negative n and n === 0.' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  if (n <= 0) {
    return 0;
  }
  return n * n - n * n + 2 * n;
}
`,
  },
  {
    formulaKey: 'diff_prev_square',
    title: 'Backward difference',
    instructions:
      'Implement n^2 - (n-1)^2 exactly for all integers (algebraically equal to 2n-1).' +
      TIME_HINT,
    starter_code: `function shieldFix(n) {
  return 2 * n + 1;
}
`,
  },
];

for (const c of POOL) {
  const r = validateShieldSolution(c.starter_code, { formulaKey: c.formulaKey, fnName: 'shieldFix' });
  if (r.ok) {
    throw new Error(`shield-static-fallback: starter incorrectly passes tests — ${c.title} (${c.formulaKey})`);
  }
}

/**
 * @returns {{ formulaKey: string; title: string; instructions: string; starter_code: string }}
 */
export function pickStaticShieldChallenge() {
  const c = POOL[crypto.randomInt(0, POOL.length)];
  return {
    formulaKey: c.formulaKey,
    title: c.title,
    instructions: c.instructions,
    starter_code: c.starter_code,
  };
}
