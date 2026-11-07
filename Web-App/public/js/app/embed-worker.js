// Runs the models off the main thread, so the page stays responsive on slow phones.

import { MiniLmEngine, StaticEngine } from '../micro-embed/engines.js';

const base = new URL('../../', import.meta.url);
const engines = {};

async function readAsset(path) {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw new Error(`Download failed: ${path} (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

async function loadOrt() {
  const ort = await import('../../vendor/ort/ort.wasm.min.mjs');
  ort.env.wasm.wasmPaths = new URL('vendor/ort/', base).href;
  ort.env.wasm.numThreads = 1;   // threads need COOP/COEP headers, which many static hosts can't set
  return ort;
}

async function load(name, onProgress) {
  if (engines[name]) return engines[name].info;
  engines[name] = name === 'static'
    ? await StaticEngine.load(readAsset, onProgress)
    : await MiniLmEngine.load(readAsset, await loadOrt(), onProgress);
  return engines[name].info;
}

self.onmessage = async ({ data }) => {
  const { id, type, engine, texts } = data;
  try {
    if (type === 'load') {
      const info = await load(engine, (progress) => self.postMessage({ id, progress }));
      self.postMessage({ id, result: info });
    } else if (type === 'encode') {
      await load(engine);
      self.postMessage({ id, result: await engines[engine].encode(texts) });
    }
  } catch (error) {
    self.postMessage({ id, error: error.message ?? String(error) });
  }
};
