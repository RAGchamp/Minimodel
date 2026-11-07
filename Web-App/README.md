# AI Interview Challenges: Web App

A JavaScript app that behaves like SBERT and runs entirely in a phone browser, with no install and no backend. Candidates use it to take AI/ML challenges. The plan is in `../INFO/MINI-MODEL-PLAN.md`.

## Run it

```bash
npm install
npm run serve            # http://localhost:8080
```

To try it on a phone on the same Wi-Fi:

```bash
node tools/serve.mjs --lan
```

Open the printed address on the phone. Plain `http://` works for everything except offline mode and the Copy button, which browsers only allow over HTTPS.

## Deploy it

Upload the `public/` folder to any static host with HTTPS, such as GitHub Pages, Netlify or Cloudflare Pages. It has no server code, and all paths are relative, so it also works in a subfolder.

**After changing any file, raise `VERSION` in `public/sw.js`.** Otherwise returning phones keep the cached copy.

## What's inside

| Path | Purpose |
|---|---|
| `public/` | The whole app; this is what you deploy |
| `public/js/micro-embed/` | The SBERT-style library: tokenizer, BM25, engines, `cosSim`, `semanticSearch`, `paraphraseMining`, `communityDetection` |
| `public/js/challenge/` | Search pipeline, metrics, cost units and scoring |
| `public/js/app/` | Screens, worker, offline storage |
| `tools/` | Model conversion, dataset generator, vector builder, bake-off, browser test |
| `tests/` | Unit, parity, discrimination and calibration tests |

## Engines

| Engine | Download | Runtime |
|---|---|---|
| Lexical (BM25) | None | Plain JS |
| Static (`potion-base-8M`, MIT) | 7.6 MB | Plain JS |
| MiniLM (`all-MiniLM-L6-v2`, Apache-2.0) | 23 MB model, plus a 14 MB runtime (about 3.8 MB gzipped) | ONNX Runtime Web 1.31.1 |

The app shell is about 58 KB gzipped. Models download only when a candidate runs their own query. Vectors for the fixed queries are precomputed (about 0.6 MB of challenge data), so any phone can compare all three engines without downloading a model.

## Rebuild

```bash
npm run build     # models, dataset, vectors, bake-off reference
npm test          # 24 tests
npm run e2e       # full browser test; add "webkit" for Safari's engine
```

The dataset comes from `tools/dataset-spec.mjs`. `node tools/build-dataset.mjs <seed>` gives a new variant. Rerun the vector and bake-off steps after changing it.

The four parity tests compare against the real Python libraries, and are skipped until you create the reference data:

```bash
pip install model2vec sentence-transformers
node tools/parity-sentences.mjs
python tools/parity-reference.py
```

## Measured results (2026-11-06)

**Parity with Python, 1,000 sentences**

| Check | Gate | Result |
|---|---|---|
| Tokenizers | Exact | Exact match, both models |
| Static, JS fp32 vs `model2vec` | At least 0.999 | 1.000 |
| Static, int8 vs fp32 | At least 0.98 | 0.99997 |
| Static, Recall@5 lost to int8 | At most 2 points | 0 |
| MiniLM, JS int8 vs Python fp32 | At least 0.98 | 0.990 |

**Bake-off, held-out nDCG@5**

| Engine | Naive default | Best design |
|---|---|---|
| Lexical | 0.415 | 0.448 |
| Static | 0.389 | 0.544 |
| MiniLM | 0.370 | 0.595 |

## Not yet verified

- **No real phone has run this.** Tests used Chromium with a Pixel 7 profile, and WebKit with an iPhone 13 profile, on a Windows PC. The Windows WebKit build has no WebAssembly SIMD, so **MiniLM has never run in a Safari engine.** iPhone memory limits are also untested. Use Guide > Device test on real phones.
- **No person has reviewed the gold labels.** They're derived from the generator's structure, and the plan requires a human review.
- **No pilot has run.** Score thresholds are starting values, checked only with scripted weak, medium and strong attempts.
