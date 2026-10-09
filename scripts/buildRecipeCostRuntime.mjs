import { build } from 'esbuild';
// One costing implementation for the browser and authorized server calculations.
await build({ entryPoints: ['src/modules/costing/services/recipeCostServerRuntime.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: 'functions/recipeCostRuntime.generated.js' });
