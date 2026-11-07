// Turns the downloaded model files in .cache/hf into the small files the app ships,
// and copies the pinned browser dependencies into public/vendor.

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.cache', 'hf');
const pub = join(root, 'public');

const PART_SIZE = 4 * 1024 * 1024;

/** Writes a big file as parts plus a small index, so downloads can resume part by part. */
async function writeParts(path, bytes) {
  const parts = Math.ceil(bytes.length / PART_SIZE);
  for (let i = 0; i < parts; i += 1) {
    await writeFile(`${path}.part${i}`, bytes.subarray(i * PART_SIZE, (i + 1) * PART_SIZE));
  }
  await writeFile(`${path}.parts.json`, JSON.stringify({ parts, size: bytes.length }));
}

function vocabFromTokenizer(json) {
  const vocab = [];
  for (const [token, id] of Object.entries(json.model.vocab)) vocab[id] = token;
  return vocab;
}

async function buildPotion() {
  const out = join(pub, 'models', 'potion-base-8M');
  await mkdir(out, { recursive: true });
  const file = await readFile(join(cache, 'potion', 'model.safetensors'));
  const headerSize = Number(file.readBigUInt64LE(0));
  const header = JSON.parse(file.subarray(8, 8 + headerSize).toString('utf8'));
  const { dtype, shape, data_offsets: offsets } = header.embeddings;
  if (dtype !== 'F32') throw new Error(`Unexpected dtype ${dtype}`);
  const [rows, dims] = shape;
  const start = 8 + headerSize + offsets[0];
  const weights = new Float32Array(file.buffer.slice(file.byteOffset + start, file.byteOffset + start + rows * dims * 4));

  // One scale per token row, because row length carries the token's weight.
  const table = new Int8Array(rows * dims);
  const scales = new Float32Array(rows);
  for (let r = 0; r < rows; r += 1) {
    let max = 0;
    for (let d = 0; d < dims; d += 1) max = Math.max(max, Math.abs(weights[r * dims + d]));
    const scale = max / 127 || 1;
    scales[r] = scale;
    for (let d = 0; d < dims; d += 1) table[r * dims + d] = Math.round(weights[r * dims + d] / scale);
  }
  await writeParts(join(out, 'embeddings.i8.bin'), Buffer.from(table.buffer));
  await writeFile(join(out, 'scales.f32.bin'), Buffer.from(scales.buffer));
  const tokenizer = JSON.parse(await readFile(join(cache, 'potion', 'tokenizer.json'), 'utf8'));
  await writeFile(join(out, 'vocab.txt'), vocabFromTokenizer(tokenizer).join('\n'));
  await writeFile(join(out, 'meta.json'), JSON.stringify({ modelId: 'potion-base-8M-int8', rows, dims, license: 'MIT' }, null, 2));
  console.log(`potion: ${rows} x ${dims} -> ${(table.byteLength / 1e6).toFixed(2)} MB int8`);
}

async function buildMiniLm() {
  const out = join(pub, 'models', 'all-MiniLM-L6-v2');
  await mkdir(out, { recursive: true });
  await writeParts(join(out, 'model_quantized.onnx'), await readFile(join(cache, 'minilm', 'onnx', 'model_quantized.onnx')));
  const tokenizer = JSON.parse(await readFile(join(cache, 'minilm', 'tokenizer.json'), 'utf8'));
  await writeFile(join(out, 'vocab.txt'), vocabFromTokenizer(tokenizer).join('\n'));
  await writeFile(join(out, 'meta.json'), JSON.stringify({ modelId: 'all-MiniLM-L6-v2-int8', dims: 384, maxTokens: 256, license: 'Apache-2.0' }, null, 2));
  console.log('minilm: copied');
}

async function copyVendor() {
  const ort = join(root, 'node_modules', 'onnxruntime-web', 'dist');
  const vendor = join(pub, 'vendor');
  await mkdir(join(vendor, 'ort'), { recursive: true });
  await mkdir(join(vendor, 'bootstrap'), { recursive: true });
  for (const name of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
    await copyFile(join(ort, name), join(vendor, 'ort', name));
  }
  await copyFile(join(root, 'node_modules', 'bootstrap', 'dist', 'css', 'bootstrap.min.css'), join(vendor, 'bootstrap', 'bootstrap.min.css'));
  console.log('vendor: copied');
}

await buildPotion();
await buildMiniLm();
await copyVendor();
