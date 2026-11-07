// The embedding engines behind one interface: load(name) -> { encode, info }.
// `readAsset(path, onProgress)` returns a Uint8Array. The browser uses fetch, Node reads files.

import { WordPieceTokenizer } from './tokenizer.js';
import { l2Normalize } from './search.js';

export const ENGINES = {
  lexical: { id: 'lexical', label: 'Lexical (BM25)', modelId: 'bm25', dims: 0, costPerToken: 0.02, loadCost: 0 },
  static: { id: 'static', label: 'Static (potion-8M)', modelId: 'potion-base-8M-int8', dims: 256, costPerToken: 0.1, loadCost: 8 },
  minilm: { id: 'minilm', label: 'MiniLM', modelId: 'all-MiniLM-L6-v2-int8', dims: 384, costPerToken: 1, loadCost: 37 },
};

const STATIC_MAX_TOKENS = 512;

const text = (bytes) => new TextDecoder().decode(bytes);
const vocabFrom = (bytes) => text(bytes).split('\n');

/**
 * Big files ship as ~4 MB parts. Each part is cached on its own, so an interrupted download on a
 * phone resumes from the last finished part.
 */
export async function readParts(readAsset, path, onProgress) {
  const { parts, size } = JSON.parse(text(await readAsset(`${path}.parts.json`)));
  const out = new Uint8Array(size);
  let done = 0;
  for (let i = 0; i < parts; i += 1) {
    const part = await readAsset(`${path}.part${i}`);
    out.set(part, done);
    done += part.byteLength;
    onProgress?.({ loaded: done, total: size });
  }
  return out;
}

export class StaticEngine {
  static async load(readAsset, onProgress) {
    const meta = JSON.parse(text(await readAsset('models/potion-base-8M/meta.json')));
    const vocab = vocabFrom(await readAsset('models/potion-base-8M/vocab.txt'));
    const table = await readParts(readAsset, 'models/potion-base-8M/embeddings.i8.bin', onProgress);
    const scales = await readAsset('models/potion-base-8M/scales.f32.bin');
    return new StaticEngine(meta, vocab, table, scales);
  }

  constructor(meta, vocab, tableBytes, scaleBytes) {
    this.dims = meta.dims;
    this.table = new Int8Array(tableBytes.buffer, tableBytes.byteOffset, tableBytes.byteLength);
    this.scales = new Float32Array(scaleBytes.slice().buffer);
    this.tokenizer = new WordPieceTokenizer(vocab);
    this.info = { ...ENGINES.static, sizeBytes: tableBytes.byteLength };
  }

  /** Same as Python model2vec: cut at 512 tokens, then drop unknown tokens. */
  tokenIds(value) {
    return this.tokenizer.encode(value).slice(0, STATIC_MAX_TOKENS).filter((id) => id !== this.tokenizer.unkId);
  }

  encodeOne(value) {
    const out = new Float32Array(this.dims);
    const ids = this.tokenIds(value);
    for (const id of ids) {
      const scale = this.scales[id];
      const row = id * this.dims;
      for (let d = 0; d < this.dims; d += 1) out[d] += this.table[row + d] * scale;
    }
    return l2Normalize(out);
  }

  async encode(values) {
    return values.map((value) => this.encodeOne(value));
  }

  dispose() {}
}

export class MiniLmEngine {
  /** `ort` is onnxruntime-web in the browser and onnxruntime-node in the build tools. */
  static async load(readAsset, ort, onProgress) {
    const meta = JSON.parse(text(await readAsset('models/all-MiniLM-L6-v2/meta.json')));
    const vocab = vocabFrom(await readAsset('models/all-MiniLM-L6-v2/vocab.txt'));
    const model = await readParts(readAsset, 'models/all-MiniLM-L6-v2/model_quantized.onnx', onProgress);
    const session = await ort.InferenceSession.create(model, { graphOptimizationLevel: 'all' });
    return new MiniLmEngine(meta, vocab, session, ort, model.byteLength);
  }

  constructor(meta, vocab, session, ort, sizeBytes) {
    this.meta = meta;
    this.session = session;
    this.ort = ort;
    this.tokenizer = new WordPieceTokenizer(vocab);
    this.cls = vocab.indexOf('[CLS]');
    this.sep = vocab.indexOf('[SEP]');
    this.info = { ...ENGINES.minilm, sizeBytes, maxTokens: meta.maxTokens };
  }

  async encodeOne(value) {
    const ids = [this.cls, ...this.tokenizer.encode(value).slice(0, this.meta.maxTokens - 2), this.sep];
    const shape = [1, ids.length];
    const tensor = (values) => new this.ort.Tensor('int64', BigInt64Array.from(values, BigInt), shape);
    const feeds = {
      input_ids: tensor(ids),
      attention_mask: tensor(ids.map(() => 1)),
    };
    if (this.session.inputNames.includes('token_type_ids')) feeds.token_type_ids = tensor(ids.map(() => 0));
    const output = await this.session.run(feeds);
    const hidden = output.last_hidden_state.data;
    const dims = output.last_hidden_state.dims[2];
    const pooled = new Float32Array(dims);
    for (let t = 0; t < ids.length; t += 1) {
      for (let d = 0; d < dims; d += 1) pooled[d] += hidden[t * dims + d];
    }
    for (let d = 0; d < dims; d += 1) pooled[d] /= ids.length;
    return l2Normalize(pooled);
  }

  async encode(values) {
    const out = [];
    for (const value of values) out.push(await this.encodeOne(value));
    return out;
  }

  async dispose() {
    await this.session.release?.();
  }
}
