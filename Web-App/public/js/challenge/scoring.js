// Turns a finished attempt into a dimension profile with evidence. Automatic dimensions use the
// held-out queries and the attempt log. Written dimensions are self-reviewed against a checklist.
// Wall-clock time and device speed are never used.

import { evaluate } from './pipeline.js';

export const LEVELS = ['Needs work', 'Developing', 'Good', 'Strong'];

/** How close to the best known score still counts as sufficient. */
export const TOLERANCE = 0.06;

export const CAUSES = [
  { id: 'vocabulary', label: 'Different words, same meaning' },
  { id: 'identifier', label: 'Exact code or ID' },
  { id: 'comparison', label: 'Word order or comparison direction' },
  { id: 'negation', label: 'Negation' },
  { id: 'sarcasm', label: 'Sarcasm' },
  { id: 'duplicates', label: 'Duplicate results' },
  { id: 'long', label: 'Long review or chunking' },
  { id: 'label', label: 'The expected answer looks wrong' },
  { id: 'other', label: 'Something else' },
];

export const SELF_REVIEW = {
  decomposition: {
    label: 'Problem decomposition',
    model: 'A strong plan names the kinds of query users will ask, picks a metric before experimenting, starts with a cheap baseline, and says how failures will be examined.',
    items: [
      'My plan named different kinds of query, not just "search".',
      'I chose how to measure success before my first run.',
      'I started with a simple baseline before anything expensive.',
      'I said how I would examine failures.',
    ],
  },
  ai: {
    label: 'AI utilization',
    model: 'Strong AI use gives the assistant real context, asks for options and trade-offs, tests suggestions against measured results, and rejects advice the data doesn\'t support.',
    items: [
      'I gave the assistant specific context, such as results or failures.',
      'I asked for trade-offs, not just one answer.',
      'I tested at least one suggestion before relying on it.',
      'I changed or rejected at least one suggestion.',
    ],
  },
  production: {
    label: 'Production mindset',
    model: 'At 1 million reviews, brute-force scoring needs an approximate vector index, vectors are built offline, and the cheapest adequate model matters more. A team would track quality on a labelled sample, watch for new vocabulary, and version the model with its vectors.',
    items: [
      'I covered how search changes at 1 million reviews.',
      'I said how quality would be monitored after launch.',
      'I named failure modes this design still has.',
      'I covered re-embedding or versioning when the model changes.',
    ],
  },
};

export const TRAPS = [
  { id: 'vocabulary', label: 'Vocabulary gap', lesson: 'Keyword search misses reviews that say the same thing in different words. Embeddings close most of this gap.' },
  { id: 'identifier', label: 'Exact identifier', lesson: 'Codes need exact matching. Lookalike part numbers confuse vectors over whole reviews, so hybrid search or short chunks help.' },
  { id: 'comparison', label: 'Comparison direction', lesson: 'None of the engines here solves this. The static model ignores word order completely, and MiniLM did no better in testing. The honest answer is to report it as a limitation.' },
  { id: 'negation', label: 'Negation', lesson: '"Not waterproof" sits close to "waterproof" for every engine. Tuning won\'t remove this, so state it as a limitation.' },
  { id: 'sarcasm', label: 'Sarcasm', lesson: 'Sarcastic reviews use praise words for complaints, and all three engines can be fooled.' },
  { id: 'duplicates', label: 'Near-duplicates', lesson: 'Syndicated copies of a review can fill the top five, so deduplication frees slots for different reviews.' },
  { id: 'long', label: 'Long reviews', lesson: 'MiniLM stops reading at 256 tokens, and a whole-review average buries single facts. Chunking fixes both.' },
  { id: 'label', label: 'Wrong test labels', lesson: 'Three dev labels were deliberately wrong. A metric is only as good as its labels, so check failures before tuning to them.' },
  { id: 'hint', label: 'Flawed AI tip', lesson: 'A universal 0.8 threshold removes nearly every result. Suitable thresholds depend on the model and the data, so test advice before applying it.' },
];

export function trapReport(attempt, dev) {
  const tagged = (family) => dev.some((q) => q.family === family && !q.noisy && attempt.tags[q.id] === family);
  const config = attempt.config;
  const usedHybrid = config.engine !== 'lexical' && config.hybrid > 0;
  const found = {
    vocabulary: tagged('vocabulary'),
    identifier: tagged('identifier') || usedHybrid,
    comparison: tagged('comparison'),
    negation: tagged('negation'),
    sarcasm: tagged('sarcasm'),
    duplicates: tagged('duplicates') || config.dedupe,
    long: tagged('long') || config.chunking !== 'whole',
    label: dev.some((q) => q.noisy && attempt.tags[q.id] === 'label'),
    hint: attempt.hintDecision === 'rejected' || (attempt.hintDecision === 'accepted' && config.threshold < 0.8),
  };
  return TRAPS.map((trap) => ({ ...trap, found: found[trap.id] }));
}

const bucket = (value, thresholds) => thresholds.filter((t) => value >= t).length;

function toolSelection(config, held, reference) {
  const gap = reference.best - held.ndcg;
  const within = gap <= TOLERANCE;
  const evidence = [`Your design scored ${held.ndcg.toFixed(3)} on held-out queries. The best known design scored ${reference.best.toFixed(3)}.`];
  if (within && config.engine === 'static') {
    evidence.push('You reached the target with a model about a tenth of the cost of MiniLM.');
    return { level: 3, evidence };
  }
  if (within) {
    evidence.push(config.engine === 'minilm'
      ? 'Good quality, at a much higher cost. A cheaper engine came within tolerance of this score.'
      : 'You got close to the best score with the cheapest engine.');
    return { level: config.engine === 'minilm' ? 2 : 3, evidence };
  }
  evidence.push(`The gap to the best known design is ${gap.toFixed(3)}. Anything within ${TOLERANCE} counts as sufficient.`);
  return { level: gap <= TOLERANCE * 2 ? 1 : 0, evidence };
}

function efficiency(attempt) {
  const units = Math.round(attempt.cost.units);
  const runs = attempt.runs.length;
  const investigated = Object.keys(attempt.tags).length + attempt.inspected.length;
  const evidence = [`${units.toLocaleString('en-US')} cost units over ${runs} run${runs === 1 ? '' : 's'}.`,
    `${attempt.inspected.length} failure${attempt.inspected.length === 1 ? '' : 's'} inspected between runs.`];
  let level = 3 - bucket(units, [2000, 8000, 20000]);
  if (runs > 3 && investigated === 0) {
    level = Math.max(0, level - 1);
    evidence.push('Many runs with no failures inspected suggests trial and error.');
  }
  return { level, evidence };
}

function quality(attempt, held, traps) {
  const found = traps.filter((t) => t.found).length;
  const points = bucket(held.ndcg, [0.45, 0.55]) + bucket(found, [3, 6]) + bucket(attempt.ownTests.length, [1, 3]);
  return {
    level: bucket(points, [1, 3, 5]),
    evidence: [`Held-out nDCG@5 ${held.ndcg.toFixed(3)}, Recall@5 ${held.recall.toFixed(3)}.`,
      `${found} of ${traps.length} traps found.`,
      `${attempt.ownTests.length} test quer${attempt.ownTests.length === 1 ? 'y' : 'ies'} of your own.`],
  };
}

function selfReviewed(id, attempt, evidence) {
  const ticks = attempt.selfReview?.[id] ?? [];
  const count = ticks.filter(Boolean).length;
  const reviewed = attempt.selfReview?.[id] !== undefined;
  return { level: reviewed ? bucket(count, [1, 2, 4]) : null, evidence };
}

export function scoreAttempt(attempt, { corpus, dev, heldout, store, reference }) {
  const held = evaluate(corpus, attempt.config, heldout, store, 'heldout');
  const traps = trapReport(attempt, dev);
  const families = [...new Set(heldout.map((q) => q.family))].map((family) => {
    const rows = held.perQuery.filter((row) => row.query.family === family);
    return { family, ndcg: rows.reduce((sum, row) => sum + row.ndcg, 0) / rows.length };
  });
  const accepted = attempt.aiLog.filter((entry) => entry.outcome === 'accepted').length;
  const dimensions = [
    { id: 'decomposition', label: 'Problem decomposition', source: 'Self-review', ...selfReviewed('decomposition', attempt, [`Plan written before the first run (${attempt.plan.trim().split(/\s+/).length} words).`]) },
    { id: 'tool', label: 'AI tool selection', source: 'Automatic', ...toolSelection(attempt.config, held, reference) },
    { id: 'ai', label: 'AI utilization', source: 'Self-review', ...selfReviewed('ai', attempt, [`${attempt.aiLog.length} AI log entr${attempt.aiLog.length === 1 ? 'y' : 'ies'}, ${attempt.aiLog.length - accepted} changed or rejected.`]) },
    { id: 'efficiency', label: 'Engineering efficiency', source: 'Automatic', ...efficiency(attempt) },
    { id: 'quality', label: 'Quality and validation', source: 'Automatic', ...quality(attempt, held, traps) },
    { id: 'production', label: 'Production mindset', source: 'Self-review', ...selfReviewed('production', attempt, [`Scale answer: ${attempt.notes.scale.trim().split(/\s+/).filter(Boolean).length} words.`]) },
  ];
  return {
    ndcg: held.ndcg, recall: held.recall, mrr: held.mrr, families, traps, dimensions,
    scoredAt: new Date().toISOString(),
  };
}

export function createAttempt(config, now = new Date().toISOString()) {
  return {
    id: `attempt-${Date.now().toString(36)}`, challengeId: 'product-finder', startedAt: now, submittedAt: null,
    plan: '', config: { ...config }, runs: [], cost: { units: 0, loaded: [], embedded: [] },
    inspected: [], tags: {}, ownTests: [], aiLog: [], hintDecision: null,
    notes: { why: '', limits: '', scale: '' }, selfReview: {}, result: null,
  };
}
