// Shared helpers for build tools and tests: read app files from disk and load challenge data.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVectorStore, prepareCorpus } from '../public/js/challenge/pipeline.js';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const publicDir = join(root, 'public');
export const dataDir = join(publicDir, 'data', 'product-finder');

export const readAsset = async (path) => new Uint8Array(await readFile(join(publicDir, path)));

export async function loadChallenge() {
  const json = async (name) => JSON.parse(await readFile(join(dataDir, name), 'utf8'));
  const { reviews } = await json('corpus.json');
  const manifest = await json('vectors.json');
  const store = createVectorStore(manifest);
  for (const engine of Object.keys(manifest.engines)) {
    for (const bank of Object.keys(manifest.engines[engine])) {
      store.add(engine, bank, new Uint8Array(await readFile(join(dataDir, manifest.engines[engine][bank].file))));
    }
  }
  return {
    corpus: prepareCorpus(reviews),
    dev: await json('dev.json'),
    heldout: await json('heldout.json'),
    store,
  };
}
