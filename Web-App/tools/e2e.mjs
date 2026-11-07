// Browser test: plays a full attempt at phone size, runs both models in the browser, checks
// offline reload and horizontal overflow, and saves screenshots.
// Run: node tools/e2e.mjs [chromium|webkit] [outDir]

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, devices, webkit } from 'playwright';
import { root } from './node-assets.mjs';

const browserName = process.argv[2] ?? 'chromium';
const outDir = process.argv[3] ?? join(root, '.cache', 'e2e', browserName);
const port = browserName === 'webkit' ? 8092 : 8091;
await mkdir(outDir, { recursive: true });

const server = spawn(process.execPath, ['tools/serve.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
await new Promise((resolve) => server.stdout.once('data', resolve));

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const engine = browserName === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
const profile = browserName === 'webkit' ? devices['iPhone 13'] : devices['Pixel 7'];
const context = await browser.newContext({ ...profile, serviceWorkers: 'allow' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

const noOverflow = async (label) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `no sideways scroll: ${label} (${overflow}px)`);
};
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });

try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('text=Start challenge');
  await noOverflow('home');
  await shot('1-home');

  await page.click('text=Start challenge');
  await page.waitForSelector('#plan');
  check(await page.isDisabled('#to-lab'), 'Lab stays locked until a plan is written');
  await page.fill('#plan', 'Shoppers will use everyday wording, part numbers and comparisons. I will track nDCG at five, start with the cheap keyword baseline, then read every failure before changing anything.');
  await noOverflow('brief');
  await shot('2-brief');
  await page.click('#to-lab');
  await page.waitForSelector('#run');

  // Naive baseline, then an informed design.
  await page.selectOption('#engine', 'lexical');
  await page.waitForSelector('text=Keyword matching');
  await page.click('#run');
  await page.waitForSelector('text=Failed queries');
  const baseline = Number(await page.locator('.tile .v').first().innerText());
  check(baseline > 0.2 && baseline < 0.6, `baseline run scores in a sensible range (${baseline})`);

  await page.locator('details.fail summary').first().click();
  await page.locator('details.fail select').first().selectOption('vocabulary');
  await noOverflow('lab with open failure');

  await page.selectOption('#engine', 'static');
  await page.waitForSelector('text=Word-level embeddings');
  await page.selectOption('#chunking', 'sentence');
  await page.check('#dedupe');
  await page.click('#run');
  await page.waitForFunction((before) => Number(document.querySelector('.tile .v').textContent) > before, baseline);
  const tuned = Number(await page.locator('.tile .v').first().innerText());
  check(tuned > baseline, `tuned design beats the baseline (${baseline} -> ${tuned})`);
  await shot('3-lab');

  // Static model, for real, in the browser.
  await page.fill('#free-query', 'quiet blender for early mornings');
  await page.click('#free-go');
  await page.waitForSelector('[data-free]', { timeout: 60000 });
  check(await page.locator('[data-free]').count() === 5, 'static model returns five results on the phone');
  await page.locator('[data-free]').first().check();
  await page.click('#free-save');
  await page.waitForSelector('text=1 of your own test saved');

  // MiniLM, for real, in the browser.
  await page.selectOption('#engine', 'minilm');
  await page.waitForSelector('text=A small transformer');
  const simd = await page.evaluate(async () => (await import('/js/app/embed-client.js')).hasWasmSimd());
  if (simd) {
    await page.fill('#free-query', 'keeps me dry in a storm');
    await page.click('#free-go');
    await page.waitForSelector('[data-free]', { timeout: 120000 });
    check(await page.locator('[data-free]').count() === 5, 'MiniLM returns five results on the phone');
  } else {
    await page.waitForSelector('text=lacks WebAssembly SIMD');
    check(await page.isDisabled('#free-go'), 'no SIMD: MiniLM is refused before any download, with a clear message');
    await page.click('#run');
    await page.waitForFunction(() => document.querySelector('.sba-sub').textContent.startsWith('Run 4'));
    check(true, 'no SIMD: MiniLM can still be compared using stored vectors');
  }
  await page.selectOption('#engine', 'static');
  await page.waitForSelector('text=Word-level embeddings');

  // AI log and the flawed tip.
  await page.click('#hint-reject');
  await page.waitForSelector('text=You rejected this tip');
  await page.fill('#ai-asked', 'Why does the threshold of 0.8 remove most of my results?');
  await page.selectOption('#ai-outcome', 'rejected');
  await page.click('#ai-add');
  await page.waitForSelector('text=Why does the threshold');

  // Autosave survives a reload mid-attempt.
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForSelector('#run');
  check(await page.locator('text=Why does the threshold').count() === 1, 'attempt survives a page reload');

  await page.click('#submit');
  await page.waitForSelector('text=Please answer all three');
  await page.fill('#why', 'Sentence chunks with the static model found almost everything at a tenth of the cost.');
  await page.fill('#limits', 'It cannot tell comparison direction, negation or sarcasm.');
  await page.fill('#scale', 'Use an approximate vector index, embed offline, and monitor quality on a labelled sample.');
  await page.click('#submit');
  await page.waitForSelector('text=Your results');
  await page.waitForSelector('text=Your profile');
  await noOverflow('results');
  await shot('4-results');
  check(await page.locator('text=Self-review needed').count() === 3, 'written dimensions wait for a self-review');

  for (const box of await page.locator('[data-review]').all()) await box.check();
  await page.click('#save-review');
  await page.waitForFunction(() => !document.body.textContent.includes('Self-review needed'));
  check(true, 'self-review updates the profile');

  await page.goto(`http://localhost:${port}/#/guide`);
  await page.waitForSelector('text=Device test');
  await noOverflow('guide');
  await page.click(simd ? '#bench-all' : '#bench-static');
  await page.waitForFunction(() => document.querySelector('#bench-output').textContent.includes('ranAt'), null, { timeout: 180000 });
  const bench = JSON.parse(await page.locator('#bench-output').textContent());
  console.log('device test', JSON.stringify({ static: bench.static, minilm: bench.minilm, error: bench.error }));
  check(!bench.error && bench.static && (bench.minilm || !simd), 'device test completes');
  await shot('5-guide');

  // Parity: the browser's vectors must match the ones built in Node.
  const parity = await page.evaluate(async () => {
    const client = await import('/js/app/embed-client.js');
    const data = await import('/js/app/challenge-data.js');
    const pipeline = await import('/js/challenge/pipeline.js');
    const { dev, store, corpus, heldout } = await data.loadChallengeData();
    const out = {};
    for (const engineId of client.hasWasmSimd() ? ['static', 'minilm'] : ['static']) {
      await client.loadEngine(engineId);
      const live = await client.encode(engineId, dev.map((q) => q.text));
      const vectors = store.chunkVectors(engineId, 'sentence');
      const config = { engine: engineId, chunking: 'sentence', hybrid: 0, threshold: 0, dedupe: false };
      let same = 0;
      dev.forEach((query, i) => {
        const a = pipeline.rank(corpus, config, query.text, live[i], vectors).map((h) => h.doc).join();
        const b = pipeline.rank(corpus, config, query.text, store.queryVector(engineId, 'dev', i), vectors).map((h) => h.doc).join();
        if (a === b) same += 1;
      });
      out[engineId] = same / dev.length;
    }
    return { ...out, heldout: heldout.length };
  });
  console.log('top-5 agreement, live browser vs stored vectors', JSON.stringify(parity));
  check(parity.static >= 0.9 && (parity.minilm >= 0.9 || !simd), 'live browser vectors agree with precomputed vectors');

  // Offline: everything needed must already be cached.
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active !== null);
  await page.reload();
  await page.waitForSelector('text=Device test');
  await context.setOffline(true);
  await page.goto(`http://localhost:${port}/#/`);
  await page.reload();
  await page.waitForSelector('text=Challenge 001', { timeout: 15000 });
  check(true, 'app reloads with no network');
  await context.setOffline(false);

  const real = errors.filter((text) => !text.includes('ERR_INTERNET_DISCONNECTED'));
  check(real.length === 0, `no console errors${real.length ? `: ${real.slice(0, 3).join(' | ')}` : ''}`);
} catch (error) {
  failures.push(error.message);
  console.log('FAIL ', error.message);
  await shot('error').catch(() => {});
  console.log('console errors:', errors.slice(0, 5));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures.length ? `\n${failures.length} failed` : '\nAll browser checks passed');
process.exit(failures.length ? 1 : 0);
