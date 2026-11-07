// Library, pipeline and scoring tests, including the plan's discrimination and calibration gates.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { WordPieceTokenizer } from '../public/js/micro-embed/tokenizer.js';
import { Bm25Index, lexicalTokens } from '../public/js/micro-embed/lexical.js';
import { communityDetection, cosSim, createIndex, paraphraseMining, semanticSearch } from '../public/js/micro-embed/search.js';
import { StaticEngine } from '../public/js/micro-embed/engines.js';
import { chargeRun, chunkReview, emptyCost, evaluate, rank, scoreQuery } from '../public/js/challenge/pipeline.js';
import { LEVELS, createAttempt, scoreAttempt, trapReport } from '../public/js/challenge/scoring.js';
import { dataDir, loadChallenge, readAsset } from '../tools/node-assets.mjs';
import { generate } from '../tools/build-dataset.mjs';

let data;
before(async () => {
  data = await loadChallenge();
  data.reference = JSON.parse(await readFile(join(dataDir, 'reference.json'), 'utf8'));
});

const base = { engine: 'static', chunking: 'whole', hybrid: 0, threshold: 0, dedupe: false };

test('WordPiece splits words, punctuation and unknowns', () => {
  const tokenizer = new WordPieceTokenizer(['[UNK]', 'run', '##ning', 'fast', '!']);
  assert.deepEqual(tokenizer.encode('Running FAST!'), [1, 2, 3, 4]);
  assert.deepEqual(tokenizer.encode('zzz'), [0]);
});

test('similarity helpers behave like sentence-transformers', () => {
  const a = [1, 0];
  const b = [0.9, 0.1];
  const c = [0, 1];
  assert.equal(cosSim(a, a), 1);
  assert.equal(cosSim(a, c), 0);
  const index = createIndex('m1', [a, b, c]);
  assert.equal(semanticSearch(a, index, { topK: 1 })[0].item, 0);
  assert.equal(paraphraseMining([a, b, c], { topK: 1 })[0].j, 1);
  assert.deepEqual(communityDetection([a, b, c], { threshold: 0.9 }), [[0, 1]]);
});

test('searching with the wrong model is refused', () => {
  assert.throws(() => semanticSearch([1, 0], createIndex('m1', [[1, 0]]), { modelId: 'm2' }), /Model mismatch/);
  assert.throws(() => cosSim([1, 0], [1, 0, 0]), /size mismatch/);
});

test('BM25 keeps codes whole', () => {
  assert.ok(lexicalTokens('Model VS-2210.').includes('vs-2210'));
  const index = new Bm25Index(['Model number VS-2210.', 'Model number VS-2201.']);
  const [exact, lookalike] = index.scores('VS-2210');
  assert.ok(exact > lookalike);
});

test('the static model ignores word order, which the comparison trap relies on', async () => {
  const engine = await StaticEngine.load(readAsset);
  const [a, b] = await engine.encode(['the Alto beats the Brio', 'the Brio beats the Alto']);
  assert.ok(cosSim(a, b) > 0.999);
});

test('chunking splits reviews as expected', () => {
  const text = 'One. Two! Three? Four.';
  assert.equal(chunkReview(text, 'whole').length, 1);
  assert.equal(chunkReview(text, 'sentence').length, 4);
  assert.equal(chunkReview(text, 'passage').length, 2);
});

test('duplicate copies earn nothing after the first', () => {
  const reviews = [{ id: 'a', dupGroup: 'g' }, { id: 'b', dupGroup: 'g' }, { id: 'c', dupGroup: null }];
  const query = { relevant: { a: 2, b: 2, c: 2 } };
  const copies = scoreQuery([{ doc: 0 }, { doc: 1 }], query, reviews);
  const distinct = scoreQuery([{ doc: 0 }, { doc: 2 }], query, reviews);
  assert.ok(distinct.ndcg > copies.ndcg);
  assert.equal(distinct.recall, 1);
  assert.equal(copies.recall, 0.5);
});

test('dataset generation is deterministic, and a seed gives a new variant', () => {
  const a = generate(1);
  assert.deepEqual(a, generate(1));
  assert.notDeepEqual(a.corpus.map((r) => r.text), generate(2).corpus.map((r) => r.text));
});

test('every query has relevant reviews; only dev labels contain noise', () => {
  for (const q of [...data.dev, ...data.heldout]) assert.ok(Object.keys(q.relevant).length > 0, q.text);
  assert.equal(data.dev.filter((q) => q.noisy).length, 3);
  assert.equal(data.heldout.filter((q) => q.noisy).length, 0);
  const dev = new Set(data.dev.map((q) => q.text));
  assert.ok(data.heldout.every((q) => !dev.has(q.text)), 'held-out queries must be unseen');
});

test('long reviews exceed MiniLM\'s token limit, so chunking matters', () => {
  const held = (config) => evaluate(data.corpus, config, data.heldout, data.store, 'heldout');
  const family = (result) => {
    const rows = result.perQuery.filter((r) => r.query.family === 'long');
    return rows.reduce((sum, r) => sum + r.ndcg, 0) / rows.length;
  };
  const whole = family(held({ ...base, engine: 'minilm' }));
  const chunked = family(held({ ...base, engine: 'minilm', chunking: 'sentence' }));
  assert.ok(whole < 0.1 && chunked > 0.9, `${whole} -> ${chunked}`);
});

test('a universal 0.8 threshold wrecks results, so the flawed tip is detectable', () => {
  const held = (threshold) => evaluate(data.corpus, { ...base, chunking: 'sentence', threshold }, data.heldout, data.store, 'heldout').ndcg;
  assert.ok(held(0.8) < held(0) / 2, `${held(0.8)} vs ${held(0)}`);
});

test('DISCRIMINATION: tuned designs clearly beat naive ones', () => {
  const held = (config) => evaluate(data.corpus, config, data.heldout, data.store, 'heldout').ndcg;
  const naive = Math.max(held({ ...base, engine: 'lexical' }), held(base), held({ ...base, engine: 'minilm' }));
  assert.ok(data.reference.best - naive >= 0.15, `naive ${naive}, best ${data.reference.best}`);
});

test('DISCRIMINATION: no single engine wins every query type', () => {
  const families = ['vocabulary', 'identifier', 'negation', 'sarcasm'];
  const scores = Object.fromEntries(['lexical', 'static', 'minilm'].map((engine) => {
    const result = evaluate(data.corpus, { ...base, engine, chunking: 'passage' }, data.heldout, data.store, 'heldout');
    return [engine, Object.fromEntries(families.map((f) => {
      const rows = result.perQuery.filter((r) => r.query.family === f);
      return [f, rows.reduce((sum, r) => sum + r.ndcg, 0) / rows.length];
    }))];
  }));
  const winners = new Set(families.map((f) => Object.keys(scores).sort((a, b) => scores[b][f] - scores[a][f])[0]));
  assert.ok(winners.size >= 2, JSON.stringify(scores));
});

test('dev scores predict held-out scores, so tuning on dev is meaningful', () => {
  const pairs = ['lexical', 'static', 'minilm'].flatMap((engine) => ['whole', 'sentence'].map((chunking) => {
    const config = { ...base, engine, chunking };
    return [evaluate(data.corpus, config, data.dev, data.store, 'dev').ndcg, evaluate(data.corpus, config, data.heldout, data.store, 'heldout').ndcg];
  }));
  for (const [dev, held] of pairs) assert.ok(Math.abs(dev - held) < 0.08, `${dev} vs ${held}`);
});

test('cost is deterministic, and MiniLM costs far more than static', () => {
  const cost = (engine) => chargeRun(emptyCost(), data.corpus, { ...base, engine }, data.dev).units;
  assert.equal(cost('static'), cost('static'));
  assert.ok(cost('minilm') > cost('static') * 8);
  assert.ok(cost('static') > cost('lexical'));
});

test('a corpus is only paid for once per engine and chunking', () => {
  const first = chargeRun(emptyCost(), data.corpus, base, data.dev);
  const second = chargeRun(first, data.corpus, base, data.dev);
  assert.ok(second.units - first.units < first.units / 5);
});

function play({ configs, final, plan = 'A plan.', tags = {}, inspect = 0, ownTests = 0, hint = null, ai = 0, review = null }) {
  const attempt = createAttempt(base);
  attempt.plan = plan;
  for (const config of configs) {
    attempt.cost = chargeRun(attempt.cost, data.corpus, config, data.dev);
    attempt.runs.push({ n: attempt.runs.length + 1, config });
  }
  attempt.config = final;
  attempt.tags = tags;
  attempt.inspected = data.dev.slice(0, inspect).map((q) => q.id);
  attempt.ownTests = Array.from({ length: ownTests }, (_, i) => ({ query: `q${i}`, engine: 'static', relevantIds: [] }));
  attempt.hintDecision = hint;
  attempt.aiLog = Array.from({ length: ai }, () => ({ asked: 'x', outcome: 'changed' }));
  attempt.notes = { why: 'because', limits: 'some', scale: 'an index' };
  if (review !== null) {
    for (const id of ['decomposition', 'ai', 'production']) attempt.selfReview[id] = [0, 1, 2, 3].map((i) => i < review);
  }
  return scoreAttempt(attempt, data);
}

const total = (result) => result.dimensions.reduce((sum, d) => sum + (d.level ?? 0), 0);

test('CALIBRATION: weak, medium and strong attempts rank in the right order', () => {
  const tagFor = (family) => data.dev.find((q) => q.family === family && !q.noisy).id;
  const weak = play({
    configs: Array.from({ length: 12 }, () => ({ ...base, engine: 'minilm', threshold: 0.8 })),
    final: { ...base, engine: 'minilm', threshold: 0.8 },
    hint: 'accepted',
    review: 0,
  });
  const medium = play({
    configs: [{ ...base, engine: 'lexical' }, base, { ...base, chunking: 'passage' }],
    final: { ...base, chunking: 'passage' },
    tags: { [tagFor('vocabulary')]: 'vocabulary' },
    inspect: 2,
    ai: 1,
    review: 2,
  });
  const strong = play({
    configs: [{ ...base, engine: 'lexical' }, base, { ...base, chunking: 'sentence' }, { ...base, chunking: 'sentence', dedupe: true }],
    final: { ...base, chunking: 'sentence', dedupe: true },
    tags: Object.fromEntries(['vocabulary', 'comparison', 'negation', 'sarcasm'].map((f) => [tagFor(f), f])),
    inspect: 6,
    ownTests: 3,
    hint: 'rejected',
    ai: 3,
    review: 4,
  });
  console.log('calibration', total(weak), total(medium), total(strong), weak.ndcg, medium.ndcg, strong.ndcg);
  assert.ok(total(weak) < total(medium) && total(medium) < total(strong));
  assert.equal(LEVELS[strong.dimensions.find((d) => d.id === 'tool').level], 'Strong');
  assert.equal(LEVELS[weak.dimensions.find((d) => d.id === 'tool').level], 'Needs work');
});

test('the score never depends on the device or the clock', () => {
  const run = () => play({ configs: [base], final: base, review: 1 }).dimensions.map((d) => d.level);
  assert.deepEqual(run(), run());
});

test('traps are credited only with real evidence', () => {
  const attempt = createAttempt(base);
  assert.equal(trapReport(attempt, data.dev).filter((t) => t.found).length, 0);
  const noisy = data.dev.find((q) => q.noisy);
  attempt.tags[noisy.id] = 'label';
  assert.ok(trapReport(attempt, data.dev).find((t) => t.id === 'label').found);
  attempt.hintDecision = 'accepted';
  attempt.config.threshold = 0.8;
  assert.equal(trapReport(attempt, data.dev).find((t) => t.id === 'hint').found, false);
});

test('rank handles a query with no matches', () => {
  assert.deepEqual(rank(data.corpus, { ...base, engine: 'lexical' }, 'zzzz', null, null), []);
});
