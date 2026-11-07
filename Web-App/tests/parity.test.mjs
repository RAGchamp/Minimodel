// The plan's correctness gates: JavaScript against the real Python libraries.
// Skipped until tools/parity-sentences.mjs and tools/parity-reference.py have been run.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import * as ort from 'onnxruntime-node';
import { MiniLmEngine, StaticEngine } from '../public/js/micro-embed/engines.js';
import { cosSim, l2Normalize } from '../public/js/micro-embed/search.js';
import { evaluate } from '../public/js/challenge/pipeline.js';
import { loadChallenge, readAsset, root } from '../tools/node-assets.mjs';

const dir = join(root, '.cache', 'parity');
const skip = existsSync(join(dir, 'tokens.json')) ? false : 'run the parity tools first';

async function reference(name, dims) {
  const bytes = await readFile(join(dir, name));
  const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  return Array.from({ length: all.length / dims }, (_, i) => all.subarray(i * dims, (i + 1) * dims));
}

async function float32Table() {
  const file = await readFile(join(root, '.cache', 'hf', 'potion', 'model.safetensors'));
  const headerSize = Number(file.readBigUInt64LE(0));
  const start = 8 + headerSize;
  return new Float32Array(file.buffer.slice(file.byteOffset + start, file.byteOffset + file.length));
}

const encodeFloat32 = (engine, table, value) => {
  const out = new Float32Array(256);
  for (const id of engine.tokenIds(value)) {
    for (let d = 0; d < 256; d += 1) out[d] += table[id * 256 + d];
  }
  return l2Normalize(out);
};

// Text with no known tokens gives a zero vector in both libraries, which counts as a match.
const isZero = (vec) => vec.every((v) => v === 0);
const meanCos = (a, b) => a.reduce((sum, vec, i) => sum + (isZero(vec) && isZero(b[i]) ? 1 : cosSim(vec, b[i])), 0) / a.length;

test('tokenizers match Python on every sentence', { skip }, async () => {
  const sentences = JSON.parse(await readFile(join(dir, 'sentences.json'), 'utf8'));
  const tokens = JSON.parse(await readFile(join(dir, 'tokens.json'), 'utf8'));
  const engines = { static: await StaticEngine.load(readAsset), minilm: await MiniLmEngine.load(readAsset, ort) };
  for (const [name, engine] of Object.entries(engines)) {
    // Python may truncate, so compare up to its length, and require any cut to be at a known limit.
    const wrong = sentences.filter((s, i) => {
      const python = tokens[name][i].filter((id) => id !== 0);   // sentence-transformers pads with [PAD]
      const js = engine.tokenizer.encode(s);
      const cut = js.length !== python.length;
      return JSON.stringify(js.slice(0, python.length)) !== JSON.stringify(python) || (cut && ![254, 256, 512].includes(python.length));
    });
    assert.deepEqual(wrong.slice(0, 5), [], `${name}: ${wrong.length} sentences differ`);
  }
});

test('static model: JS fp32 matches Python model2vec (mean cosine >= 0.999)', { skip }, async () => {
  const sentences = JSON.parse(await readFile(join(dir, 'sentences.json'), 'utf8'));
  const engine = await StaticEngine.load(readAsset);
  const table = await float32Table();
  const python = await reference('static.f32', 256);
  const score = meanCos(sentences.map((s) => encodeFloat32(engine, table, s)), python);
  console.log('static fp32 vs python', score);
  assert.ok(score >= 0.999, String(score));
});

test('static model: int8 stays close to fp32 (cosine >= 0.98, Recall@5 drop <= 2 points)', { skip }, async () => {
  const sentences = JSON.parse(await readFile(join(dir, 'sentences.json'), 'utf8'));
  const engine = await StaticEngine.load(readAsset);
  const table = await float32Table();
  const score = meanCos(await engine.encode(sentences), sentences.map((s) => encodeFloat32(engine, table, s)));
  console.log('static int8 vs fp32', score);
  assert.ok(score >= 0.98, String(score));

  const { corpus, heldout, store } = await loadChallenge();
  const config = { engine: 'static', chunking: 'sentence', hybrid: 0, threshold: 0, dedupe: false };
  const chunks = corpus.modes.sentence.chunks.map((c) => encodeFloat32(engine, table, c.text));
  const queries = heldout.map((q) => encodeFloat32(engine, table, q.text));
  const float32 = evaluate(corpus, config, heldout, { chunkVectors: () => chunks, queryVector: (_, __, i) => queries[i] }, 'heldout');
  const int8 = evaluate(corpus, config, heldout, store, 'heldout');
  console.log('Recall@5 fp32', float32.recall, 'int8', int8.recall);
  assert.ok(float32.recall - int8.recall <= 0.02);
});

test('MiniLM: JS int8 stays close to Python fp32 (mean cosine >= 0.98)', { skip }, async () => {
  const sentences = JSON.parse(await readFile(join(dir, 'sentences.json'), 'utf8'));
  const engine = await MiniLmEngine.load(readAsset, ort);
  const score = meanCos(await engine.encode(sentences), await reference('minilm.f32', 384));
  console.log('minilm int8 vs python fp32', score);
  assert.ok(score >= 0.98, String(score));
});
