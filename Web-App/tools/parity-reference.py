"""Writes reference tokens and vectors from the real Python libraries, for tests/parity.test.mjs.

Needs: pip install model2vec sentence-transformers
Run:   python tools/parity-reference.py   (after: node tools/parity-sentences.mjs)
"""

import json
from pathlib import Path

import numpy as np
from model2vec import StaticModel
from sentence_transformers import SentenceTransformer

out = Path(__file__).resolve().parent.parent / ".cache" / "parity"
sentences = json.loads((out / "sentences.json").read_text(encoding="utf-8"))

static = StaticModel.from_pretrained(str(out.parent / "hf" / "potion"))
static_vectors = static.encode(sentences).astype(np.float32)
static_vectors.tofile(out / "static.f32")
tokens = [e.ids for e in static.tokenizer.encode_batch_fast(sentences, add_special_tokens=False)]

minilm = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
minilm_vectors = minilm.encode(sentences, normalize_embeddings=True).astype(np.float32)
minilm_vectors.tofile(out / "minilm.f32")
minilm_tokens = [e.ids for e in minilm.tokenizer.backend_tokenizer.encode_batch(sentences, add_special_tokens=False)]

(out / "tokens.json").write_text(json.dumps({"static": tokens, "minilm": minilm_tokens}), encoding="utf-8")
print(len(sentences), "sentences", static_vectors.shape, minilm_vectors.shape)
