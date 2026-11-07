// Main-thread side of the embedding worker, including the iPhone crash guard.

const CRASH_FLAG = 'mm.minilm.loading';
const BLOCK_FLAG = 'mm.minilm.blocked';

function storage(action) {
  try {
    return action(window.localStorage);
  } catch {
    return null;
  }
}

// iOS can kill the tab during a big load with no catchable error. A flag still set at startup
// means the last load never finished, so MiniLM is switched off on this device.
if (storage((s) => s.getItem(CRASH_FLAG))) {
  storage((s) => { s.removeItem(CRASH_FLAG); s.setItem(BLOCK_FLAG, '1'); });
}

// ONNX Runtime needs WebAssembly SIMD (iOS 16.4 and later). Checking first avoids a pointless
// 23 MB download on a browser that could never run the model.
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
export const hasWasmSimd = () => typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_PROBE);

export const isMiniLmBlocked = () => Boolean(storage((s) => s.getItem(BLOCK_FLAG)));

/** Why MiniLM can't run here, or null if it can. */
export function miniLmProblem() {
  if (!hasWasmSimd()) return "This browser can't run MiniLM, because it lacks WebAssembly SIMD. You can still compare MiniLM with Run, which uses stored results. To try your own queries, pick another engine.";
  if (isMiniLmBlocked()) return 'MiniLM stopped loading on this device, so it was switched off. Pick another engine, or try again from the Guide.';
  return null;
}

export const unblockMiniLm = () => storage((s) => s.removeItem(BLOCK_FLAG));

let worker;
let nextId = 1;
const pending = new Map();
const loaded = new Set();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./embed-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const call = pending.get(data.id);
    if (!call) return;
    if (data.progress) { call.onProgress?.(data.progress); return; }
    pending.delete(data.id);
    if (data.error) call.reject(new Error(data.error));
    else call.resolve(data.result);
  };
  worker.onerror = (event) => {
    for (const call of pending.values()) call.reject(new Error(event.message || 'The model worker stopped.'));
    pending.clear();
    worker = null;
    loaded.clear();
  };
  return worker;
}

function call(message, onProgress) {
  return new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ id, ...message });
  });
}

export const isLoaded = (engine) => loaded.has(engine);

export async function loadEngine(engine, onProgress) {
  if (engine === 'minilm') storage((s) => s.setItem(CRASH_FLAG, '1'));
  try {
    const info = await call({ type: 'load', engine }, onProgress);
    loaded.add(engine);
    return info;
  } finally {
    if (engine === 'minilm') storage((s) => s.removeItem(CRASH_FLAG));
  }
}

export const encode = (engine, texts) => call({ type: 'encode', engine, texts });
