// Bake-off: every configuration on the held-out queries. Writes the reference table the scorer
// uses, and prints per-trap results so we can see whether the challenge discriminates.

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CHUNK_MODES, evaluate } from '../public/js/challenge/pipeline.js';
import { dataDir, loadChallenge } from './node-assets.mjs';

const { corpus, dev, heldout, store } = await loadChallenge();
const HYBRIDS = [0, 0.2, 0.4, 0.6, 0.8];

const configs = [];
for (const chunking of CHUNK_MODES) {
  for (const dedupe of [false, true]) {
    configs.push({ engine: 'lexical', chunking, hybrid: 0, threshold: 0, dedupe });
    for (const engine of ['static', 'minilm']) {
      for (const hybrid of HYBRIDS) configs.push({ engine, chunking, hybrid, threshold: 0, dedupe });
    }
  }
}

const rows = configs.map((config) => {
  const held = evaluate(corpus, config, heldout, store, 'heldout');
  const devResult = evaluate(corpus, config, dev, store, 'dev');
  return { config, ndcg: held.ndcg, recall: held.recall, dev: devResult.ndcg, held };
}).sort((a, b) => b.ndcg - a.ndcg);

const families = [...new Set(heldout.map((q) => q.family))];
const byFamily = (result) => Object.fromEntries(families.map((family) => {
  const list = result.perQuery.filter((row) => row.query.family === family);
  return [family, list.reduce((sum, row) => sum + row.ndcg, 0) / list.length];
}));
const name = ({ engine, chunking, hybrid, dedupe }) => `${engine}/${chunking}/h${hybrid}/${dedupe ? 'dedupe' : 'raw'}`;
const fmt = (n) => n.toFixed(3);

console.log('config'.padEnd(34), 'held', 'dev  ', families.map((f) => f.slice(0, 6).padEnd(6)).join(' '));
const show = (row) => console.log(name(row.config).padEnd(34), fmt(row.ndcg), fmt(row.dev),
  Object.values(byFamily(row.held)).map((v) => fmt(v).padEnd(6)).join(' '));

console.log('--- best 6'); rows.slice(0, 6).forEach(show);
console.log('--- best per engine');
const perEngine = {};
for (const engine of ['lexical', 'static', 'minilm']) {
  const best = rows.find((row) => row.config.engine === engine);
  perEngine[engine] = { ndcg: best.ndcg, config: best.config };
  show(best);
}
console.log('--- naive defaults');
for (const engine of ['lexical', 'static', 'minilm']) {
  show(rows.find((row) => row.config.engine === engine && row.config.chunking === 'whole' && row.config.hybrid === 0 && !row.config.dedupe));
}

await writeFile(join(dataDir, 'reference.json'), JSON.stringify({ best: rows[0].ndcg, bestConfig: rows[0].config, perEngine }, null, 2));
