// Guide: how the app works, the metrics, and the device test from Phase 0 of the plan.

import { encode, hasWasmSimd, isMiniLmBlocked, loadEngine, miniLmProblem, unblockMiniLm } from '../embed-client.js';
import { card, hideJob, note, overview, showJob } from '../ui.js';

const SAMPLE = [
  'never budged during my morning runs',
  'the battery does not survive one afternoon',
  'great build quality that lasts for years',
  'soft light with no glare on my screen',
  'I returned it because the other one beats it in every way',
];

async function measure(engine, log) {
  const started = performance.now();
  await loadEngine(engine, ({ loaded, total }) => showJob(`Loading ${engine}...`, Math.round((loaded / total) * 100)));
  const loadMs = performance.now() - started;
  await encode(engine, SAMPLE);          // warm up
  const times = [];
  for (let i = 0; i < 20; i += 1) {
    const t = performance.now();
    await encode(engine, [SAMPLE[i % SAMPLE.length]]);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  log[engine] = {
    loadMs: Math.round(loadMs),
    encodeP50Ms: Number(times[10].toFixed(1)),
    encodeP95Ms: Number(times[18].toFixed(1)),
  };
}

async function runDeviceTest(root, withMiniLm) {
  const output = root.querySelector('#bench-output');
  const log = {
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency ?? null,
    memoryGb: navigator.deviceMemory ?? null,
    ranAt: new Date().toISOString(),
  };
  output.textContent = 'Running...';
  try {
    await measure('static', log);
    if (withMiniLm) await measure('minilm', log);
    log.jsHeapMb = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null;
  } catch (error) {
    log.error = error.message;
  }
  hideJob();
  output.textContent = JSON.stringify(log, null, 2);
  root.querySelector('#bench-copy').hidden = false;
}

export async function showGuide(root, app) {
  root.innerHTML = `
  ${overview({ title: 'Guide', subtitle: 'How this app works, and how to read your results.' })}
  ${card('How it works', `
    <p>This is a JavaScript app that behaves like SBERT. It turns text into vectors and finds matches by similarity, all inside your browser.</p>
    <p class="mb-0">There's no account and no server. Your attempts stay on this phone until you export them.</p>`)}
  ${card('The three engines', `<div class="table-responsive"><table class="table table-sm table-striped mb-0">
    <thead><tr><th>Engine</th><th>Download</th><th>Strength</th><th>Weakness</th></tr></thead>
    <tbody>
      <tr><td>Lexical</td><td class="text-nowrap">None</td><td>Exact words and codes</td><td>Misses other wording</td></tr>
      <tr><td>Static</td><td class="text-nowrap">7.6 MB</td><td>Meaning, at low cost</td><td>Ignores word order</td></tr>
      <tr><td>MiniLM</td><td class="text-nowrap">37 MB</td><td>Best understanding</td><td>Cost, 256-token limit</td></tr>
    </tbody></table></div>`, { flush: true })}
  ${card('What the numbers mean', `
    <p class="mb-2"><b>nDCG@5</b> measures how good the top five are, and rewards putting the best results first. 1.0 is perfect.</p>
    <p class="mb-2"><b>Recall@5</b> is the share of relevant reviews found in the top five.</p>
    <p class="mb-2"><b>Cost units</b> count the work a design needs. They're the same on every phone, so a slow phone never lowers your score.</p>
    <p class="mb-0"><b>Held-out queries</b> are tested after you submit, to check that your design works beyond the queries you tuned it on.</p>`)}
  ${note('<b>Practice scores only.</b> The answers ship with the app, so these scores can\'t prove anything to an employer. They\'re for your own learning.')}
  ${isMiniLmBlocked() ? note('MiniLM didn\'t finish loading last time, so it\'s switched off here to protect your work. <button class="btn btn-outline-primary bg-body mt-2" id="unblock">Allow MiniLM again</button>') : ''}
  ${hasWasmSimd() ? '' : note("This browser can't run MiniLM, because it lacks WebAssembly SIMD. The Static engine works normally.")}
  ${card('Device test', `
    <p class="small text-body-secondary">Measures how this phone runs the models. Results stay here unless you copy them.</p>
    <div class="d-flex flex-wrap gap-2">
      <button class="btn btn-outline-primary bg-body" id="bench-static">Test Static (7.6 MB)</button>
      <button class="btn btn-outline-primary bg-body" id="bench-all" ${miniLmProblem() ? 'disabled' : ''}>Test both (45 MB)</button>
    </div>
    <pre class="bench mt-2" id="bench-output" aria-live="polite"></pre>
    <button class="btn btn-outline-primary bg-body mt-2" id="bench-copy" hidden>Copy results</button>`)}`;

  root.querySelector('#bench-static').addEventListener('click', () => runDeviceTest(root, false));
  root.querySelector('#bench-all').addEventListener('click', () => runDeviceTest(root, true));
  root.querySelector('#bench-copy').addEventListener('click', async (event) => {
    try {
      await navigator.clipboard.writeText(root.querySelector('#bench-output').textContent);
      event.target.textContent = 'Copied';
    } catch {
      event.target.textContent = 'Copy failed. Select the text instead.';
    }
  });
  root.querySelector('#unblock')?.addEventListener('click', () => {
    unblockMiniLm();
    app.rerender();
  });
}
