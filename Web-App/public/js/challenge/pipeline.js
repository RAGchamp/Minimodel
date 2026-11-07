// The candidate's retrieval pipeline. The same code runs in the browser, the tests and the
// build tools, so a score can't drift between them.

import { Bm25Index, lexicalTokens } from '../micro-embed/lexical.js';
import { ENGINES } from '../micro-embed/engines.js';
import { dot, l2Normalize } from '../micro-embed/search.js';

export const CHUNK_MODES = ['whole', 'passage', 'sentence'];
export const DEDUPE_JACCARD = 0.9;
export const TOP_K = 5;

export const DEFAULT_CONFIG = { engine: 'static', chunking: 'whole', hybrid: 0, threshold: 0, dedupe: false };

export function splitSentences(text) {
  return text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

export function chunkReview(text, mode) {
  if (mode === 'whole') return [text];
  const sentences = splitSentences(text);
  if (mode === 'sentence') return sentences;
  const out = [];
  for (let i = 0; i < sentences.length; i += 3) out.push(sentences.slice(i, i + 3).join(' '));
  return out;
}

/** Chunk lists and BM25 indexes for every chunk mode, built once. */
export function prepareCorpus(reviews) {
  const modes = {};
  for (const mode of CHUNK_MODES) {
    const chunks = [];
    reviews.forEach((review, doc) => {
      for (const text of chunkReview(review.text, mode)) chunks.push({ doc, text });
    });
    modes[mode] = { chunks, bm25: new Bm25Index(chunks.map((c) => c.text)) };
  }
  const tokenSets = reviews.map((r) => new Set(lexicalTokens(r.text)));
  return { reviews, modes, tokenSets };
}

function jaccard(a, b) {
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared || 1);
}

/**
 * Rank reviews for one query.
 * `vectors` are the chunk vectors for config.engine and config.chunking (absent for lexical).
 * Returns up to `topK` of { doc, score, chunk }.
 */
export function rank(corpus, config, query, queryVec, vectors, topK = TOP_K) {
  const { chunks, bm25 } = corpus.modes[config.chunking];
  const isLexical = config.engine === 'lexical';
  const weight = isLexical ? 1 : config.hybrid;
  const raw = weight > 0 ? bm25.scores(query) : null;
  const maxLexical = raw ? Math.max(...raw, 1e-9) : 1;
  const cosines = isLexical ? null : vectors.map((vec) => dot(queryVec, vec));

  // Hybrid puts both signals on a 0-1 scale for this query. Pure embeddings keep the raw cosine.
  let low = 0;
  let span = 1;
  if (cosines && weight > 0) {
    low = Math.min(...cosines);
    span = Math.max(...cosines) - low || 1;
  }

  const best = new Map();
  chunks.forEach((chunk, i) => {
    const lexical = raw ? raw[i] / maxLexical : 0;
    const cosine = cosines ? cosines[i] : 0;
    const score = weight * lexical + (1 - weight) * (cosines ? (cosine - low) / span : 0);
    const current = best.get(chunk.doc);
    if (!current) {
      best.set(chunk.doc, { doc: chunk.doc, score, chunk: chunk.text, cosine });
    } else {
      current.cosine = Math.max(current.cosine, cosine);
      if (score > current.score) Object.assign(current, { score, chunk: chunk.text });
    }
  });

  // The threshold is a minimum cosine similarity, so it only applies to embedding engines.
  const ordered = [...best.values()]
    .filter((hit) => hit.score > 0 && (isLexical || hit.cosine >= config.threshold))
    .sort((a, b) => b.score - a.score || a.doc - b.doc);
  if (!config.dedupe) return ordered.slice(0, topK);

  const kept = [];
  for (const hit of ordered) {
    if (!kept.some((k) => jaccard(corpus.tokenSets[k.doc], corpus.tokenSets[hit.doc]) >= DEDUPE_JACCARD)) kept.push(hit);
    if (kept.length === topK) break;
  }
  return kept;
}

/** Later copies of a syndicated review earn nothing, so duplicates can't pad a result list. */
export function scoreQuery(hits, query, reviews) {
  const groupOf = (review) => review.dupGroup ?? review.id;
  const seen = new Set();
  const gains = hits.map((hit) => {
    const review = reviews[hit.doc];
    const group = groupOf(review);
    const gain = seen.has(group) ? 0 : (query.relevant[review.id] ?? 0);
    if (gain) seen.add(group);
    return gain;
  });

  const bestByGroup = new Map();
  for (const review of reviews) {
    const gain = query.relevant[review.id];
    if (gain) bestByGroup.set(groupOf(review), Math.max(gain, bestByGroup.get(groupOf(review)) ?? 0));
  }
  const ideal = [...bestByGroup.values()].sort((a, b) => b - a).slice(0, TOP_K);
  const dcg = (list) => list.reduce((sum, gain, i) => sum + (2 ** gain - 1) / Math.log2(i + 2), 0);
  const firstHit = gains.findIndex((gain) => gain > 0);
  return {
    ndcg: ideal.length ? dcg(gains) / dcg(ideal) : 0,
    recall: ideal.length ? gains.filter((gain) => gain > 0).length / ideal.length : 0,
    mrr: firstHit >= 0 ? 1 / (firstHit + 1) : 0,
  };
}

/** Run a configuration over a query set. `store` supplies the precomputed vectors. */
export function evaluate(corpus, config, queries, store, split) {
  const vectors = config.engine === 'lexical' ? null : store.chunkVectors(config.engine, config.chunking);
  const perQuery = queries.map((query, i) => {
    const queryVec = config.engine === 'lexical' ? null : store.queryVector(config.engine, split, i);
    const hits = rank(corpus, config, query.text, queryVec, vectors);
    return { query, hits, ...scoreQuery(hits, query, corpus.reviews) };
  });
  const mean = (key) => perQuery.reduce((sum, row) => sum + row[key], 0) / Math.max(1, perQuery.length);
  return { ndcg: mean('ndcg'), recall: mean('recall'), mrr: mean('mrr'), perQuery };
}

const roughTokens = (text) => Math.ceil(text.trim().split(/\s+/).length * 1.3);

/**
 * Deterministic cost, identical on every phone. Loading an engine and embedding a corpus are
 * charged once per attempt. `state` remembers what has already been paid for.
 */
export function chargeRun(state, corpus, config, queries) {
  const next = { units: state.units, loaded: [...state.loaded], embedded: [...state.embedded] };
  const engine = ENGINES[config.engine];
  if (!next.loaded.includes(engine.id)) {
    next.loaded.push(engine.id);
    next.units += engine.loadCost;
  }
  const key = `${engine.id}:${config.chunking}`;
  const corpusTokens = corpus.modes[config.chunking].chunks.reduce((sum, c) => sum + roughTokens(c.text), 0);
  if (!next.embedded.includes(key)) {
    next.embedded.push(key);
    next.units += corpusTokens * engine.costPerToken;
  }
  const queryTokens = queries.reduce((sum, q) => sum + roughTokens(q.text), 0);
  next.units += queryTokens * engine.costPerToken;
  if (config.engine !== 'lexical' && config.hybrid > 0) next.units += queryTokens * ENGINES.lexical.costPerToken;
  return next;
}

export const emptyCost = () => ({ units: 0, loaded: [], embedded: [] });

/** Precomputed int8 vectors. Rows are renormalized on load, so no scale table is needed. */
export function createVectorStore(manifest) {
  const banks = {};
  const unpack = (bytes, dims, rows, offset) => {
    const view = new Int8Array(bytes.buffer, bytes.byteOffset + offset * dims, rows * dims);
    const out = [];
    for (let r = 0; r < rows; r += 1) out.push(l2Normalize(Float32Array.from(view.subarray(r * dims, (r + 1) * dims))));
    return out;
  };
  return {
    add(engine, bank, bytes) {
      const { dims, sections } = manifest.engines[engine][bank];
      banks[engine] ??= {};
      for (const [name, { offset, rows }] of Object.entries(sections)) banks[engine][name] = unpack(bytes, dims, rows, offset);
    },
    has: (engine, section) => Boolean(banks[engine]?.[section]),
    chunkVectors: (engine, mode) => banks[engine][mode],
    queryVector: (engine, split, i) => banks[engine][split][i],
  };
}
