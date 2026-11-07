# Mini-Model Plan: an SBERT-style Micro Model for Phone-Browser AI Interview Challenges

**Date:** 2026-11-06
**Status:** v1 built in `../Web-App` (§16); next step is the device test on real phones
**Inputs:** `Design-analysis.txt`, `../../SMALL-BIZ-ACCTG/Web-App` (UI), `../../AI-ML-INT-QUESTIONS/INFO/MVP-PLAN.md`, the current `MVP-APP` README, and the sources in §15.

---

## 1. Summary

**Goal.** A candidate opens a link on their phone, with nothing to install, and solves an AI/ML challenge using an SBERT-like model that runs in the browser. The challenge measures how well they use AI, not only whether they reach an answer.

**Recommendation.**

1. **Do not train a model from scratch.** Ship pretrained weights behind one small JavaScript library with an SBERT-shaped API, `micro-embed`.
2. **Make a distilled static embedding model the default engine.** This option is missing from the design analysis. `potion-base-8M` is about 30 MB as float32, and an estimated 7.6 MB as int8. It scores about 92% of MiniLM on average MTEB. Inference is a table lookup and a mean, so it needs no ML runtime.
3. **Offer MiniLM as a lazy-loaded option** (23 MB int8, through Transformers.js) and BM25/TF-IDF as the near-zero-cost option. A candidate's choice between the three engines is itself assessment evidence.
4. **Run everything in the browser in v1.** The model, the challenge and the scoring all run on the phone, with no backend. A static host only delivers the files. Scores are for practice, because a candidate could read the browser files. Server-side scoring is a later add-on for employer use (§7).
5. **Prove it on real phones first.** Phase 0 is a short spike with a go/no-go gate.

**First milestone.** One playable challenge, "Semantic Product Finder", on real Android and iPhone browsers, with scoring in the browser, then calibrated with a small pilot.

**Estimated effort.** 109–166 hours, plus 10–20 optional hours for domain distillation (§11).

---

## 2. Changes from the design analysis

| Design analysis said | This plan | Why |
|---|---|---|
| Two engines: pure-JS algorithms and MiniLM | Three engines, adding a distilled static model in the middle | It gets most of MiniLM's quality at a fraction of the size, with no WASM. Hand-built synonym tables would cost more effort and likely perform worse. |
| A custom engine with a hand-built vocabulary and synonyms | Dropped; use distillation if domain tuning is needed (Phase 6) | Distillation produces the same small artifact from a real teacher model. |
| The micro model covers classification, entity extraction, summarization and more | Scope limited to what embeddings can do (§3) | Embeddings cannot do entity extraction or generative summarization. |
| "All in JavaScript" | JavaScript at runtime; Python is acceptable at build time | Quantizing and distilling use Python tooling offline. Candidates never see it. |
| Measure processing time | Never score on wall-clock time; score on deterministic cost units | Otherwise an expensive phone earns a better score than a cheap one (§8). |
| Interactive coding environment | Touch-first "Pipeline Lab"; no code required in v1 | Writing code on a phone mostly measures thumb tolerance. |

---

## 3. Scope

### 3.1 In scope: SBERT-equivalent functions

| Function | SBERT equivalent | Example challenge use |
|---|---|---|
| `model.encode(texts)` | `SentenceTransformer.encode` | Base operation |
| `cosSim(a, b)` | `util.cos_sim` | Compare product reviews |
| `semanticSearch(q, corpus, {topK})` | `util.semantic_search` | Find relevant reviews or listings |
| `paraphraseMining(texts)` | `util.paraphrase_mining` | Detect duplicate reviews |
| `communityDetection(vecs, {threshold})` | `util.community_detection` | Group similar complaints |

Built on top of these with little extra code:

- Zero-shot classification by label embedding
- kNN classification
- Outlier detection by centroid distance
- Extractive summaries by sentence centrality

### 3.2 Out of scope

- Text generation, chat, and generative summarization
- Entity extraction (use regex or rules in a challenge, which is also a good "don't use AI here" lesson)
- Training in the browser
- Cross-encoder reranking (revisit after v1)
- Languages other than English
- WebGPU (§5.3)

---

## 4. Engine options

Sizes marked *verified* were read from the Hugging Face file API on 2026-11-06. MTEB numbers come from the Model2Vec model cards and vary a little between releases, so treat them as approximate. Our own bake-off decides (§6).

| | Tier 0: `lexical` | Tier 1: `static` (default) | Tier 2: `minilm` |
|---|---|---|---|
| **Method** | BM25 / TF-IDF | Token embedding lookup + mean | 6-layer transformer + mean pooling |
| **Model** | None | `minishlab/potion-base-8M` (MIT) | `Xenova/all-MiniLM-L6-v2` (Apache-2.0) |
| **Download** | Under 50 KB (target) | 30.2 MB fp32 *verified*; about 7.6 MB int8 *estimated* | 23.0 MB int8 *verified*, plus ONNX Runtime WASM (measure) |
| **Dimensions** | Sparse | 256 | 384 |
| **Runtime** | Plain JS | Plain JS typed arrays | Transformers.js + ONNX Runtime Web |
| **Avg MTEB** | n/a | About 51.1 | About 55.9 |
| **Understands synonyms** | No | Mostly | Yes |
| **Understands word order** | No | **No** | Yes |
| **Handles exact IDs and codes** | **Yes** | Poorly | Poorly |

Also test `potion-base-4M` and `potion-base-2M` in Phase 0. If they hold up on the product-review gold set, Tier 1 could fall below 4 MB. Their dimensions and sizes still need checking.

**Weaknesses are useful here.** Each engine fails in a different, explainable way. Tier 1 treats "the Alto is better than the Brio" and "the Brio is better than the Alto" almost identically. Challenges are built around these differences (§8.3), so each engine's limits become material for the assessment.

**Vectors are not interchangeable.** Vectors from different engines have different dimensions and meanings. Every stored vector set must record its `modelId`, and `semanticSearch` must throw on a mismatch.

---

## 5. Architecture

### 5.1 System view

```
 BUILD TIME (Python + Node, offline)
   quantize potion ─► embeddings.i8.bin + vocab
   generate synthetic reviews + gold labels
   precompute corpus and query vectors, all engines × all chunk options
        │
        ▼
 STATIC HOST / CDN (delivers files only, runs no logic)
        │
        ▼
 PHONE BROWSER (PWA): everything runs here
   UI thread:  brief · Pipeline Lab · results · decision log
   Web Worker: micro-embed
      lexical | static | minilm (lazy-loaded)
   Scorer:     runs the candidate's configuration on held-out queries
   Storage:    Cache API (models) · IndexedDB (attempts)
        │
        ▼
 Attempt export: a file the candidate can keep or share
```

### 5.2 Key design choice: everything stays on the phone

Candidate data and model inference never leave the device. After the first load, the challenge works offline.

The candidate tunes a **pipeline configuration** on the dev queries: engine, chunking, hybrid weight, threshold, deduplication, and so on. On submission, the browser applies that configuration to **held-out queries** the candidate hasn't seen in the lab. That rewards a design that generalizes, not one tuned to the visible test set.

### 5.3 Runtime rules for phones

| Concern | Decision |
|---|---|
| Initial load | App shell under 150 KB gzipped. No model fetched until needed. |
| Weak devices | **Corpus and dev-query vectors for every engine are precomputed** and ship as small int8 files (100 reviews × 384 dims × 3 chunk options is about 115 KB). Every candidate can evaluate every engine on the dev set without loading a model. A model is needed only for free-text queries. |
| Threading | All encoding runs in a Web Worker to keep the UI responsive. |
| iOS memory | WebKit bug reports say only about 300 MB is reliably available to WASM pages, and exceeding it can reload the tab with no catchable error. Target peak Tier 2 use under 200 MB. |
| Crash recovery | Set a `loading-minilm` flag before loading Tier 2 and clear it on success. If the page starts with the flag still set, assume a crash, disable Tier 2 for that device, and tell the candidate. Auto-save attempts to IndexedDB. |
| WASM threads | Assume single-threaded. Multi-threading needs COOP/COEP headers, which some static hosts cannot set. Treat it as a bonus. |
| WebGPU | Not in v1. These models are small, so gains are likely modest, availability varies by device, and a second backend doubles the test matrix. Revisit if Phase 0 shows Tier 2 is too slow on WASM. |
| Model hosting | Self-host model files with version pinning. Do not depend on the Hugging Face CDN during an interview. |
| Version pinning | Pin exact versions. `@huggingface/transformers` 4.3.2 currently depends on a **dev build** of `onnxruntime-web` (`1.31.0-dev.20260914`), so upgrades need a retest on real devices. |
| Cache eviction | Safari may evict stored data. Treat the cache as disposable and show progress on re-download. |
| Interrupted networks | Resumable or chunked model download; show size before downloading on cellular. |

### 5.4 Library API

```js
import { load, cosSim, semanticSearch } from 'micro-embed';

const model = await load('static', { onProgress });   // 'lexical' | 'static' | 'minilm'
const vecs  = await model.encode(texts);              // normalized Float32Array[]
const hits  = semanticSearch(queryVec, index, { topK: 5 });

model.info();   // { modelId, dims, sizeBytes, maxTokens, costPerToken }
```

### 5.5 Proposed layout

```
LOCAL-MINI-MODEL/
├── INFO/                  # this plan, design analysis
├── packages/micro-embed/  # engines, tokenizer, search, tests
├── build/                 # Python: quantize, distill, precompute vectors
├── bench/                 # device benchmark page + results
├── challenges/product-finder/
│   └── public/            # brief, corpus, dev and held-out queries
├── web/                   # mobile PWA
└── scoring/               # in-browser scorer
```

### 5.6 UI design

The app reuses the look of `SMALL-BIZ-ACCTG/Web-App`, defined in `static/app.css`, `templates/base.html`, `templates/_ui.html` and `INFO/UI-REVAMP-PLAN.md`. Every screen follows the same pattern: top bar → menu → yellow overview box → cards and tables with light-blue headers.

**Reused as is**

| Element | Detail |
|---|---|
| Framework | Bootstrap 5.3 plus one `app.css` loaded after it; system font stack |
| Colours | All colours are CSS tokens: navy `#04264d`, yellow `#ffd60a`, overview `#fff8dc`, headers `#e3eefc`, menu `#f1f3f5`, with their dark values |
| Theme | Light and dark follow the phone's system setting |
| Top bar | Navy bar with the RAG Champ logo; the tagline becomes **AI INTERVIEW CHALLENGES** and hides on phones, as it does today |
| Menu | Light-grey sticky bar with a 2 px underline on the active item; collapses behind a toggler on phones |
| Overview box | Light-yellow panel with title, sub-line, action buttons and figure tiles |
| Content | Cards with light-blue headers, striped lists and tables, yellow `.sba-note` help boxes |

**How each part maps to this app**

| Web-App element | Use here |
|---|---|
| Menu: Dashboard, Inbox, Review ... | **Challenges, Lab, Results, Guide** |
| Orange sandbox bar | Practice bar: "Practice mode. Everything stays on this phone." |
| Live books / Sandbox dropdown | Engine selector: Lexical, Static, MiniLM |
| Four dashboard tiles | Recall@5, nDCG@5, cost units, runs used |
| "Work to do" list | Failed queries to investigate |
| Floating job box, bottom right | Model download and encoding progress |
| Light-yellow help box | Brief hints and the flawed AI hint |

**What must change for this app**

| Web-App today | This app | Why |
|---|---|---|
| Flask server renders Jinja templates | Static HTML and JavaScript; macros `overview()` and `tile()` become small JS functions | No backend in v1 |
| Bootstrap loaded from jsDelivr | Bootstrap self-hosted and cached by the PWA | Must work offline |
| Designed mainly for desktop, wide tables | Phone first: one column, two tiles per row, results as stacked cards | Wide tables are hard to use on a phone |
| Standard Bootstrap control sizes | Touch targets of at least 44 px; sliders and toggles instead of small inputs | Touch use |

**Phone layout (Lab screen)**

```
┌──────────────────────────────┐
│ (logo) RAG Champ             │  navy top bar
├──────────────────────────────┤
│ Practice mode. Stays on phone│  orange practice bar
├──────────────────────────────┤
│ Lab                     [≡]  │  sticky grey menu
└──────────────────────────────┘
┌─ light-yellow overview ──────┐
│ Semantic Product Finder      │
│ Run 4 · 11 min left   [Run]  │
│ ┌ Recall@5 ┐ ┌ nDCG@5  ┐     │
│ │ 0.72     │ │ 0.64    │     │
│ ├ Cost ────┤ ├ Runs ───┤     │
│ │ 140 units│ │ 4       │     │
│ └──────────┘ └─────────┘     │
└──────────────────────────────┘
┌─ light-blue: Pipeline ───────┐
│ Engine        [Static     ▾] │
│ Hybrid weight ──●────── 0.4  │
│ Deduplicate   [on]           │
└──────────────────────────────┘
┌─ light-blue: Failed queries ─┐
│ striped list, tap to inspect │
└──────────────────────────────┘
```

---

## 6. Evaluation of the model

### 6.1 Correctness gates

| Check | Pass condition |
|---|---|
| Tier 1 JS vs Python `model2vec`, fp32, 1,000 sentences | Mean cosine ≥ 0.999 |
| Tier 1 int8 vs fp32 | Mean cosine ≥ 0.98, and Recall@5 drop ≤ 2 points |
| Tier 2 JS vs Python `sentence-transformers` | Mean cosine ≥ 0.98 (the int8 model will differ from fp32) |

The tokenizer is the likeliest source of silent bugs, so test it directly against the Python tokenizer, including punctuation, accents, and unknown tokens.

### 6.2 Bake-off metrics

Run all engines on the product-review gold set and on STS-B for a general reference.

- **Quality:** Recall@5, nDCG@5, MRR, STS-B Spearman
- **Cost:** download size, cold-load time, warm encode p50/p95, peak memory
- **Reliability:** crash rate over 20 consecutive load and reload cycles on iPhone

### 6.3 Device matrix

Use real hardware, since desktop emulation will not reproduce memory kills.

| Class | Device | Browser |
|---|---|---|
| Low-end Android | About 3–4 GB RAM | Chrome |
| Mid-range Android | About 6 GB RAM | Chrome |
| Older iPhone | Oldest iOS version we intend to support | Safari |
| Recent iPhone | Current iOS | Safari |

Borrow devices or use a real-device cloud service. Target numbers (draft, to be confirmed in Phase 0):

| Metric | Tier 1 | Tier 2 |
|---|---|---|
| First usable, good 4G | Under 5 s | Under 20 s |
| Encode one query, warm, low-end device | Under 20 ms | Under 500 ms |
| Peak memory | Under 60 MB | Under 200 MB |

---

## 7. Assessment integrity

v1 is for practice, so scoring runs in the browser. Held-out queries and labels ship with the app, and a determined candidate could read them. That only spoils their own practice.

| Threat | v1 (practice) | Later, if employers use it |
|---|---|---|
| Reading answers from browser files | Accepted; held-out queries stay out of the UI until submission | Move held-out queries and labels to a small scoring service |
| Overfitting to the visible test set | Scored on held-out queries | Same, on a server |
| Sharing answers between candidates | Accepted | Seeded dataset variants per candidate or cohort |
| Forged results | Accepted | Server-computed score; client logs are supporting evidence only |
| Using AI | **Allowed and expected.** The test asks how well it is used. | Same |
| Someone else taking the test | Not relevant | A short live follow-up on the candidate's decisions |

The engine is JavaScript, so a future scoring service can reuse the same search code unchanged. Nothing in v1 needs rework to add it.

---

## 8. Challenge design

### 8.1 Candidate flow: Challenge 001, Semantic Product Finder (20 minutes)

1. **Read the brief.** 100 synthetic product reviews from a fictional store. A shopper asks something like "headphones that stay put during a run", and needs the five most relevant reviews.
2. **Plan.** A short written plan before the first run, so we capture thinking before experimentation.
3. **Experiment in the Pipeline Lab.** Pick an engine, chunking, hybrid weight, threshold and deduplication. Run the dev queries and see metrics, failures and cost.
4. **Investigate failures.** Open wrong results, tag the cause, and add test queries.
5. **Use AI.** Consult an assistant as needed, and record what was asked and what was accepted or rejected.
6. **Submit** the configuration and a short note: why this design, what it still gets wrong, and what would change at 1 million reviews.

### 8.2 Scoring map

The dimensions come from the design analysis. The last column links to the rubric keys already used in `challenge.yaml`, so the schema can be extended without replacing it.

| Dimension | Evidence | Scored by | Existing rubric key |
|---|---|---|---|
| Problem decomposition | Plan written before the first run | Self-review against a model answer | `framing` |
| AI tool selection | Chosen engine vs the cheapest engine within tolerance of the best held-out score | Automatic | `design_choices` |
| AI utilization | AI log: quality of questions, verification, rejected suggestions | Self-review against a model answer | *New: `ai_utilization`* |
| Engineering efficiency | Cost units used; experiments run vs insight gained | Automatic | *New: `efficiency`* |
| Quality and validation | Held-out nDCG@5, traps found, own test cases added | Automatic | `validation_rigor`, `testing` |
| Production mindset | Scale, monitoring and failure-mode answer | Self-review against a model answer | `deployment_reasoning`, `communication` |

**Cost units** are deterministic: tokens embedded × an engine weight, plus a one-off engine load charge. They are identical on every device, so phone speed cannot affect the score.

The output is a **dimension profile with evidence**, not a single number. Candidates should be able to see why each rating was given. Automatic dimensions are computed on the phone. Written dimensions use a checklist and a model answer shown after submission, so v1 needs no LLM or API key.

### 8.3 Seeded traps

| Trap | What it looks like | What a strong candidate does |
|---|---|---|
| Vocabulary gap | "Stays put during a run" vs "never slips at the gym" | Sees BM25 fail; moves to embeddings |
| Exact identifier | Query contains a SKU or model number | Sees embeddings fail; uses hybrid or a rule |
| Comparison direction | "The Alto beats the Brio" vs "the Brio beats the Alto" | Spots the word-order limit and reports it. MiniLM did not solve this in testing (§16) |
| Negation | "Not waterproof" vs "waterproof" | Finds the failure and states the limitation honestly |
| Sarcasm | "Great, it broke within a week" reads as positive | Finds the failure, and states it as a limitation rather than tuning around it |
| Near-duplicates | The same review, syndicated across colour variants, fills the top five | Adds deduplication |
| Long review | The key fact sits after the model's token limit | Changes chunking |
| Label noise | A few visible gold labels are wrong | Inspects failures and questions the metric |
| Flawed AI hint | The in-app hint recommends one universal cosine threshold of 0.8 | Tests the advice and rejects it |

The last two traps directly test AI mindset: does the candidate trust output or verify it?

### 8.4 Later challenges on the same engine

| Challenge | Core judgment tested |
|---|---|
| Duplicate review detector | Threshold choice; precision vs recall cost |
| Review triage with five fixed categories | Whether rules or a linear baseline beat embeddings |
| Support-ticket routing | Reuses the challenge already planned in `MVP-PLAN.md` §D3 |
| Long product manual retrieval | Chunking, page citations, evidence quality |
| Fake-review outliers | Whether similarity outliers mean anything; false-positive cost |

---

## 9. Data

- **Synthetic only**, following risk R4 in `MVP-PLAN.md`. No scraped reviews, and no real brands, products or people.
- Seeded generator producing 100–1,000 reviews plus variants.
- Gold set: about 30 dev queries and 30 held-out queries, with graded relevance (0/1/2).
- **A person reviews every gold label.** LLM drafting is fine, but unreviewed labels would compromise everything scored against them.
- Language variety matters: if the generator's phrasing is too uniform, every engine will look good and the challenge will not discriminate.

---

## 10. Connection to the existing project

`AI-ML-INT-QUESTIONS/MVP-APP` already provides a FastAPI app, a challenge schema with `traps` and a six-part rubric, a framing scorer, and funnel events.

**Reuse:**

- The challenge list can link to the lab. Attempt storage and auth are needed only if server scoring is added later.
- `challenge.yaml`, extended with a `micro_lab` block

**New:**

- `micro-embed`, the Pipeline Lab PWA, and the in-browser scorer
- The lab can be served as static files from the app or a CDN

**Scheduling risk.** The MVP is unfinished: its README reports about 44 of 250 knowledge-bank entries and 2 of 5 challenges. This plan competes for the same hours, so §13 records the priority call.

---

## 11. Phases

Hours assume solo work with Claude Code.

| Phase | Work | Hours | Exit gate |
|---|---|---|---|
| **0. Device spike** | Minimal Tier 1 and Tier 2 encoders; benchmark page; run the device matrix; int8 quantization test | 12–18 | **Go/no-go:** Tier 1 meets its targets on all four device classes, and Tier 2 either passes or falls back cleanly |
| **1. `micro-embed` library** | Three engines, tokenizer, search utilities, Worker wrapper, crash fallback, parity tests | 25–35 | §6.1 gates pass in CI |
| **2. Dataset and gold set** | Generator, traps, reviewed labels, precomputed vectors, bake-off | 15–25 | **Discrimination check:** naive configurations score clearly below well-tuned ones, and no single engine wins on everything |
| **3. Pipeline Lab PWA** | Port the Web-App look (§5.6), then brief, plan step, lab, failure view, decision log, autosave, offline support | 30–45 | A full attempt completes on all four device classes in 20 minutes, and the UI matches §5.6 in light and dark |
| **4. Scoring** | In-browser scorer, cost units, self-review checklists, results page, attempt export to a file | 12–18 | **Calibration bots:** scripted weak, medium and strong attempts rank in the correct order |
| **5. Pilot** | 5–10 people of known skill levels; compare with blind human ratings; fix the brief and weights | 15–25 | Scores broadly match human ratings; completion rate is at least 80% on phones |
| **6. Domain distillation** *(optional)* | Distill a retail-tuned static model with Model2Vec/Tokenlearn | 10–20 | Only run if the bake-off shows a real domain gap; must beat Tier 1 on held-out queries |
| | **Total without Phase 6** | **109–166** | |

**If Phase 0 fails:** Tier 1 uses plain typed arrays, so failure there is unlikely. If Tier 2 proves unreliable on iPhones, ship Tier 0 and Tier 1 on the device. Precomputed vectors still let candidates compare all three engines on the dev set, so the challenge survives.

---

## 12. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | iPhone memory kills during Tier 2 | Crash flag, autosave, Tier 1 default, precomputed vectors |
| 2 | Quantized Tier 1 loses too much quality | Measure in Phase 0; alternatives are fp16, or a larger download |
| 3 | The challenge rewards one obvious configuration | Discrimination check in Phase 2; traps that pull in different directions |
| 4 | The score measures phone comfort rather than skill | No wall-clock scoring, little typing, pilot on real phones, optional tablet or desktop use |
| 5 | AI-use evidence is self-reported | Treat the log as reflection in v1, not proof; a built-in assistant is the upgrade path |
| 6 | Self-review is too generous | Specific checklists, model answers, and a comparison with blind human ratings in the pilot |
| 7 | Accessibility and device inequality | Screen-reader support, low-bandwidth path, alternative device allowed, accommodations process |
| 8 | Hiring-use legal exposure | Automated hiring tools can fall under rules such as NYC Local Law 144 and the EU AI Act's high-risk employment category. Keep a human decision-maker, keep candidate notices, and get legal advice before any employer use. |
| 9 | Dependency churn in Transformers.js / ONNX Runtime | Pin versions, self-host, rerun the device matrix before upgrades |
| 10 | Scope creep toward a full platform | One challenge until the Phase 5 pilot passes |

---

## 13. Decisions

Decided on 2026-11-06.

| # | Question | Decision | Effect on the plan |
|---|---|---|---|
| 1 | Who is this for first? | **Job-seeker practice**, with scored mode built in | Matches PLAN-11's free tier. Employer use, and the legal review in §12 risk 8, come later. |
| 2 | How do candidates use AI? | **Their own assistant, with a structured AI log** | Evidence is self-reported in v1. A built-in, token-budgeted assistant is the upgrade path after the pilot. |
| 3 | Priority against the MVP? | **Run Phase 0 now, then decide** | Commit only 12–18 hours. Phases 1–6 are not yet scheduled. |
| 4 | Domain for Challenge 001? | **Product reviews / e-commerce** | Replaces the insurance example from the design analysis. Needs no domain knowledge. Traps are in §8.3. |
| 5 | Minimum supported devices? | **Set after Phase 0** | Depends on real results from the four device classes. |
| 6 | Where does v1 run? | **Entirely in the phone browser, with no backend** | Static hosting only. Scores are for practice. Server scoring waits for employer use. |
| 7 | What should the UI look like? | **The same look as `SMALL-BIZ-ACCTG/Web-App`** | Reuses its tokens and page pattern, adapted for phones and offline use (§5.6). |

---

## 14. Next steps

1. Line up the four test devices.
2. Build the Phase 0 benchmark page.
3. Review results against the go/no-go gate.
4. Use those results to set the minimum supported devices, and to decide how this ranks against the MVP.

---

## 15. Sources

Checked on 2026-11-06. The npm versions and Hugging Face file sizes were read directly from their APIs.

- [Transformers.js v4 announcement](https://huggingface.co/blog/transformersjs-v4)
- [Transformers.js releases](https://github.com/huggingface/transformers.js/releases)
- [`Xenova/all-MiniLM-L6-v2` ONNX files](https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/main/onnx)
- [`minishlab/potion-base-8M` model card](https://huggingface.co/minishlab/potion-base-8M)
- [`minishlab/potion-retrieval-32M` model card](https://huggingface.co/minishlab/potion-retrieval-32M)
- [Model2Vec results](https://minish.ai/packages/model2vec/results/)
- [WebKit bug 269777: about 300 MB reliably available to WebAssembly pages](https://bugs.webkit.org/show_bug.cgi?id=269777)
- [WebKit bug 221530: Wasm memory boundaries in Safari](https://bugs.webkit.org/show_bug.cgi?id=221530)

**Not yet verified, to be measured in Phase 0:** the int8 size and quality of Tier 1, the ONNX Runtime WASM download size, all phone latency and memory figures, and the specifications of `potion-base-2M` and `potion-base-4M`. The targets in §6 are working goals, not measurements.

---

## 16. Build status

Built on 2026-11-06 in `../Web-App`. See its README for how to run, test and deploy it. Where this section differs from the sections above, this section reflects what was actually built and measured.

**Changed from the plan**

| Plan said | Built | Why |
|---|---|---|
| Tier 2 through Transformers.js | ONNX Runtime Web 1.31.1 called directly | 14 MB runtime instead of 28 MB, and a stable release instead of the dev build flagged in §5.3 |
| 100 reviews | 130 reviews | Room for duplicates, long reviews and comparison pairs |
| Example products "Alto" and "Brio" | Invented brands such as Vantro and Kelvra | Avoids real brand names |
| Word-order trap solved by Tier 2 | Reported as an open limitation | MiniLM scored 0.64 against 0.69 for Static on comparison queries |
| Identifier trap needs hybrid search | Sentence chunking also solves it | Measured: both reach 1.00 |

**Measured**

- Static model: 7.56 MB as int8, confirming the estimate in §4. Recall@5 lost to int8: none.
- ONNX Runtime WASM: 14.3 MB raw, 3.8 MB gzipped.
- App shell: about 58 KB gzipped, against the 150 KB budget.
- Parity gates in §6.1 passed (static 1.000, int8 0.99997, MiniLM 0.990). The browser-vs-Node top-5 agreement was 97% for Static and 100% for MiniLM over 30 dev queries. Static missed the 99% target by one query, and the gate was replaced by a 90% check in the browser test.
- Discrimination: naive defaults 0.37 to 0.42, best design 0.595, on held-out nDCG@5.
- Calibration: scripted weak, medium and strong attempts scored 0, 11 and 18 in total.

**Still open**

| Item | Plan phase |
|---|---|
| Run the device matrix on real phones, using Guide > Device test | 0 |
| MiniLM has never run in a Safari engine, because the Windows WebKit test build lacks WASM SIMD. It needs iOS 16.4 or later. | 0 |
| A person must review the gold labels | 2 |
| Run the 5 to 10 person pilot and tune the score thresholds | 5 |
| Set minimum supported devices and decide priority against the MVP | §13 |
