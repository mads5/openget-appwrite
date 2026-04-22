import './load-env.mjs';

process.env.OPENGET_ACTION = 'recompute-percentiles';

await import('./run-openget-action.js');
