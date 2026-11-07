// BM25 keyword search. No model, no download.

const STOP = new Set(('a an and are as at be but by for from had has have i in is it its of on or that the '
  + 'this to was were with').split(' '));

/** Lowercased words. Codes like "VS-2210" are kept whole and also split into their parts. */
export function lexicalTokens(text) {
  const tokens = [];
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) ?? []) {
    if (STOP.has(raw)) continue;
    tokens.push(raw);
    if (raw.includes('-')) tokens.push(...raw.split('-').filter((part) => !STOP.has(part)));
  }
  return tokens;
}

export class Bm25Index {
  constructor(texts, { k1 = 1.2, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.docs = texts.map((text) => {
      const counts = new Map();
      const tokens = lexicalTokens(text);
      for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
      return { counts, length: tokens.length };
    });
    this.avgLength = this.docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, this.docs.length);
    this.docFreq = new Map();
    for (const doc of this.docs) {
      for (const token of doc.counts.keys()) this.docFreq.set(token, (this.docFreq.get(token) ?? 0) + 1);
    }
  }

  idf(token) {
    const df = this.docFreq.get(token) ?? 0;
    return Math.log(1 + (this.docs.length - df + 0.5) / (df + 0.5));
  }

  /** One raw BM25 score per document. */
  scores(query) {
    const terms = [...new Set(lexicalTokens(query))];
    return this.docs.map((doc) => {
      let score = 0;
      for (const term of terms) {
        const tf = doc.counts.get(term);
        if (!tf) continue;
        const norm = tf + this.k1 * (1 - this.b + (this.b * doc.length) / this.avgLength);
        score += this.idf(term) * ((tf * (this.k1 + 1)) / norm);
      }
      return score;
    });
  }
}
