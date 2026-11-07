// Precomputes corpus and query vectors with the same engines the browser uses, stored as int8.
// This lets every phone compare all engines on the fixed queries without loading a model.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as ort from 'onnxruntime-node';
import { MiniLmEngine, StaticEngine } from '../public/js/micro-embed/engines.js';
import { CHUNK_MODES, prepareCorpus } from '../public/js/challenge/pipeline.js';
import { dataDir, readAsset } from './node-assets.mjs';

const json = async (name) => JSON.parse(await readFile(join(dataDir, name), 'utf8'));
const { reviews } = await json('corpus.json');
const dev = await json('dev.json');
const heldout = await json('heldout.json');
const corpus = prepareCorpus(reviews);

function toInt8(vectors, dims) {
  const out = new Int8Array(vectors.length * dims);
  vectors.forEach((vec, r) => {
    const max = vec.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
    for (let d = 0; d < dims; d += 1) out[r * dims + d] = Math.round((vec[d] / max) * 127);
  });
  return out;
}

async function writeBank(engine, id, name, sections, dims) {
  const meta = { dims, file: `vectors.${id}.${name}.i8`, sections: {} };
  const parts = [];
  let offset = 0;
  for (const [section, texts] of Object.entries(sections)) {
    const vectors = await engine.encode(texts);
    parts.push(toInt8(vectors, dims));
    meta.sections[section] = { offset, rows: vectors.length };
    offset += vectors.length;
  }
  await writeFile(join(dataDir, meta.file), Buffer.concat(parts.map((p) => Buffer.from(p.buffer))));
  return meta;
}

const manifest = { engines: {} };
const engines = {
  static: await StaticEngine.load(readAsset),
  minilm: await MiniLmEngine.load(readAsset, ort),
};
for (const [id, engine] of Object.entries(engines)) {
  const dims = engine.info.dims;
  const main = { dev: dev.map((q) => q.text) };
  for (const mode of CHUNK_MODES) main[mode] = corpus.modes[mode].chunks.map((c) => c.text);
  manifest.engines[id] = {
    main: await writeBank(engine, id, 'main', main, dims),
    heldout: await writeBank(engine, id, 'heldout', { heldout: heldout.map((q) => q.text) }, dims),
  };
  console.log(`${id}: done`);
}
await writeFile(join(dataDir, 'vectors.json'), JSON.stringify(manifest));
