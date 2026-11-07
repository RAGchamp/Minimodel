// Loads the challenge files. Vectors for all engines are small and precomputed, so every phone
// can compare every engine on the fixed queries without downloading a model.

import { createVectorStore, prepareCorpus } from '../challenge/pipeline.js';

const base = new URL('../../data/product-finder/', import.meta.url);
let cached;

async function get(name, kind = 'json') {
  const response = await fetch(new URL(name, base));
  if (!response.ok) throw new Error(`Could not load ${name} (${response.status})`);
  return kind === 'json' ? response.json() : new Uint8Array(await response.arrayBuffer());
}

export function loadChallengeData() {
  cached ??= (async () => {
    const [{ reviews }, dev, heldout, reference, manifest] = await Promise.all(
      ['corpus.json', 'dev.json', 'heldout.json', 'reference.json', 'vectors.json'].map((name) => get(name)),
    );
    const store = createVectorStore(manifest);
    for (const [engine, banks] of Object.entries(manifest.engines)) {
      for (const [bank, { file }] of Object.entries(banks)) store.add(engine, bank, await get(file, 'bytes'));
    }
    return { corpus: prepareCorpus(reviews), dev, heldout, reference, store };
  })().catch((error) => { cached = null; throw error; });
  return cached;
}
