// Full rebuild: models, dataset, vectors and the bake-off reference table.

import { execFileSync } from 'node:child_process';

for (const script of ['fetch-models', 'build-models', 'build-dataset', 'build-vectors', 'bakeoff']) {
  execFileSync(process.execPath, [`tools/${script}.mjs`], { stdio: 'inherit' });
}
