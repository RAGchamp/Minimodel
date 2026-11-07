// SBERT-style utilities: cos_sim, semantic_search, paraphrase_mining, community_detection.

export function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

export function l2Normalize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i += 1) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < vec.length; i += 1) vec[i] /= norm;
  return vec;
}

export function cosSim(a, b) {
  if (a.length !== b.length) throw new Error(`Vector size mismatch: ${a.length} vs ${b.length}`);
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}

/** A vector index remembers which model made it, because vectors from different models don't mix. */
export function createIndex(modelId, vectors, items = vectors.map((_, i) => i)) {
  return { modelId, vectors, items };
}

export function semanticSearch(query, index, { topK = 5, modelId } = {}) {
  if (modelId && modelId !== index.modelId) {
    throw new Error(`Model mismatch: query from ${modelId}, index from ${index.modelId}`);
  }
  return index.vectors
    .map((vec, i) => ({ item: index.items[i], score: cosSim(query, vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function paraphraseMining(vectors, { topK = 100, minScore = 0 } = {}) {
  const pairs = [];
  for (let i = 0; i < vectors.length; i += 1) {
    for (let j = i + 1; j < vectors.length; j += 1) {
      const score = cosSim(vectors[i], vectors[j]);
      if (score >= minScore) pairs.push({ i, j, score });
    }
  }
  return pairs.sort((a, b) => b.score - a.score).slice(0, topK);
}

/** Greedy clustering, as in sentence-transformers: densest centre first, no shared members. */
export function communityDetection(vectors, { threshold = 0.75, minSize = 2 } = {}) {
  const neighbours = vectors.map((a) => vectors
    .map((b, j) => ({ j, score: cosSim(a, b) }))
    .filter((n) => n.score >= threshold)
    .map((n) => n.j));
  const order = neighbours
    .map((members, i) => ({ i, size: members.length }))
    .sort((a, b) => b.size - a.size);
  const used = new Set();
  const groups = [];
  for (const { i } of order) {
    const members = neighbours[i].filter((j) => !used.has(j));
    if (members.length >= minSize) {
      members.forEach((j) => used.add(j));
      groups.push(members);
    }
  }
  return groups;
}
