// BERT-style WordPiece tokenizer in plain JavaScript.
// Mirrors the Hugging Face BertNormalizer + BertPreTokenizer + WordPiece pipeline, which both
// potion-base-8M and all-MiniLM-L6-v2 use. Parity with the Python tokenizer is tested in tests/.

const PUNCT = /[\p{P}!-/:-@[-`{-~]/u;
const SPACE = /\s/u;
const CONTROL = /[\p{Cc}\p{Cf}]/u;
const CJK = /[一-鿿㐀-䶿豈-﫿]/u;

export class WordPieceTokenizer {
  constructor(vocab, { unkToken = '[UNK]', maxCharsPerWord = 100 } = {}) {
    this.vocab = new Map(vocab.map((token, id) => [token, id]));
    this.unkId = this.vocab.get(unkToken);
    this.maxCharsPerWord = maxCharsPerWord;
  }

  normalize(text) {
    let out = '';
    for (const ch of text) {
      if (ch === '\0' || ch === '�') continue;
      if (ch === '\t' || ch === '\n' || ch === '\r') { out += ' '; continue; }
      if (CONTROL.test(ch)) continue;
      out += CJK.test(ch) ? ` ${ch} ` : ch;
    }
    return out.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
  }

  preTokenize(text) {
    const words = [];
    let word = '';
    for (const ch of text) {
      if (SPACE.test(ch)) {
        if (word) { words.push(word); word = ''; }
      } else if (PUNCT.test(ch)) {
        if (word) { words.push(word); word = ''; }
        words.push(ch);
      } else {
        word += ch;
      }
    }
    if (word) words.push(word);
    return words;
  }

  wordPiece(word) {
    const chars = Array.from(word);
    if (chars.length > this.maxCharsPerWord) return [this.unkId];
    const ids = [];
    let start = 0;
    while (start < chars.length) {
      let end = chars.length;
      let found;
      while (start < end) {
        const piece = (start > 0 ? '##' : '') + chars.slice(start, end).join('');
        found = this.vocab.get(piece);
        if (found !== undefined) break;
        end -= 1;
      }
      if (found === undefined) return [this.unkId];
      ids.push(found);
      start = end;
    }
    return ids;
  }

  /** Token ids without special tokens. */
  encode(text) {
    const ids = [];
    for (const word of this.preTokenize(this.normalize(text))) {
      for (const id of this.wordPiece(word)) ids.push(id);
    }
    return ids;
  }
}
