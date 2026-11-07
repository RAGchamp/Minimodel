// Seeded generator for the Semantic Product Finder dataset. Run: node tools/build-dataset.mjs [seed]

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CODES, COLOURS, COMPARISON_PAIRS, COMPARISON_TEMPLATES, DUPLICATE_CELLS, FACETS, FILLER,
  LONG_FACTS, NOISY_DEV_QUERIES, PRODUCTS, QUERIES, RAMBLE,
} from './dataset-spec.mjs';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, rand) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Hands out items in shuffled order and only repeats once all have been used. */
function cycler(list, rand) {
  let queue = [];
  return () => {
    if (!queue.length) queue = shuffled(list, rand);
    return queue.pop();
  };
}

export function generate(seed = 20261106) {
  const rand = rng(seed);
  const reviews = [];
  const add = (review) => {
    const id = `r${String(reviews.length + 1).padStart(3, '0')}`;
    reviews.push({ id, facets: [], dupGroup: null, code: null, fact: null, pair: null, winner: null, sarcastic: false, ...review });
    return reviews.at(-1);
  };
  const filler = cycler(FILLER, rand);
  const colour = () => COLOURS[Math.floor(rand() * COLOURS.length)];
  const banks = {};
  const bank = (facet, kind) => {
    const key = `${facet}.${kind}`;
    banks[key] ??= cycler(FACETS[facet][kind], rand);
    return banks[key]();
  };
  const fill = (template, product) => template.replaceAll('{p}', product.name).replaceAll('{c}', colour());

  // One positive and one negative review per product/facet. A third of negatives are sarcastic.
  let negatives = 0;
  for (const product of PRODUCTS) {
    for (const facet of product.facets) {
      for (const pol of ['pos', 'neg']) {
        const sarcastic = pol === 'neg' && negatives % 3 === 0;
        if (pol === 'neg') negatives += 1;
        const main = fill(bank(facet, sarcastic ? 'sarcastic' : pol), product);
        const facets = [{ facet, pol, main: true }];
        const parts = [main];
        const others = product.facets.filter((f) => f !== facet);
        if (pol === 'pos' && others.length && rand() < 0.45) {
          const other = others[Math.floor(rand() * others.length)];
          parts.push(fill(bank(other, 'pos'), product));
          facets.push({ facet: other, pol: 'pos', main: false });
        }
        parts.push(fill(filler(), product));
        add({ product: product.id, productName: product.name, category: product.category, text: shuffled(parts, rand).join(' '), facets, sarcastic });
      }
    }
  }

  // Five syndicated copies of one review in selected cells, enough to fill a top five. Copies count once in the metrics.
  for (const cell of DUPLICATE_CELLS) {
    const source = reviews.find((r) => r.facets[0].facet === cell.facet && r.facets[0].pol === cell.pol);
    source.dupGroup = `dup-${cell.facet}`;
    for (let i = 0; i < 5; i += 1) {
      add({ ...source, id: undefined, text: source.text, facets: source.facets, dupGroup: source.dupGroup });
      reviews.at(-1).id = `r${String(reviews.length).padStart(3, '0')}`;
    }
  }

  // Long reviews: the only mention of the fact sits after more than 256 tokens of storytelling.
  for (const { id, product: productId, fact } of LONG_FACTS) {
    const product = PRODUCTS.find((p) => p.id === productId);
    add({
      product: product.id, productName: product.name, category: product.category,
      text: [...shuffled(RAMBLE, rand).slice(0, 15), fact].join(' '), fact: id,
    });
  }

  // Comparison reviews: three per direction per pair.
  for (const pair of COMPARISON_PAIRS) {
    for (const winner of ['a', 'b']) {
      const w = pair[winner];
      const l = pair[winner === 'a' ? 'b' : 'a'];
      for (const template of COMPARISON_TEMPLATES) {
        add({
          product: pair.id, productName: `${pair.a} / ${pair.b}`, category: 'comparison',
          text: `${template.replaceAll('{w}', w).replaceAll('{l}', l)} ${fill(filler(), { name: w })}`,
          pair: pair.id, winner,
        });
      }
    }
  }

  // Part numbers: added to a few of the product's reviews only.
  for (const { code, product, label } of CODES) {
    const candidates = shuffled(reviews.filter((r) => r.product === product && !r.code && !r.dupGroup && !r.fact), rand);
    for (const review of candidates.slice(0, 3)) {
      review.text += label ? ` Also ordered the ${label}, part ${code}.` : ` Model number ${code}.`;
      review.code = code;
    }
    // Lookalike codes (last two digits swapped) that an exact match rejects and a vector may not.
    const lookalike = code.slice(0, -2) + code.at(-1) + code.at(-2);
    for (const review of candidates.slice(3, 5)) {
      review.text += label ? ` Also ordered the ${label}, part ${lookalike}.` : ` Model number ${lookalike}.`;
      review.code = lookalike;
    }
  }

  const corpus = shuffled(reviews, rand);
  return { corpus, ...labelQueries(corpus) };
}

function grade(review, match) {
  if (match.code) return review.code === match.code ? 2 : 0;
  if (match.fact) return review.fact === match.fact ? 2 : 0;
  if (match.pair) return review.pair === match.pair && review.winner === match.winner ? 2 : 0;
  if (match.all) {
    const hits = match.all.filter((facet) => review.facets.some((f) => f.facet === facet && f.pol === match.pol));
    if (hits.length === match.all.length) return 2;
    return hits.length ? 1 : 0;
  }
  const hit = review.facets.find((f) => f.facet === match.facet && f.pol === match.pol);
  if (!hit) return 0;
  return hit.main ? 2 : 1;
}

function labelQueries(corpus) {
  const label = (split) => QUERIES[split].map((query, i) => {
    const relevant = {};
    for (const review of corpus) {
      const g = grade(review, query.match);
      if (g) relevant[review.id] = g;
    }
    if (!Object.keys(relevant).length) throw new Error(`No relevant reviews for "${query.text}"`);
    return { id: `${split}-${String(i + 1).padStart(2, '0')}`, text: query.text, family: query.family, relevant, noisy: false };
  });
  const dev = label('dev');
  const heldout = label('heldout');
  for (const text of NOISY_DEV_QUERIES) {
    const query = dev.find((q) => q.text === text);
    const match = QUERIES.dev.find((q) => q.text === text).match;
    const opposite = corpus.find((r) => r.facets.some((f) => f.facet === match.facet && f.pol !== match.pol && f.main));
    const dropped = Object.keys(query.relevant).find((id) => query.relevant[id] === 2);
    delete query.relevant[dropped];
    query.relevant[opposite.id] = 2;
    query.noisy = true;
  }
  return { dev, heldout };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const seed = Number(process.argv[2] ?? 20261106);
  const { corpus, dev, heldout } = generate(seed);
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'product-finder');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'corpus.json'), JSON.stringify({ seed, reviews: corpus }));
  await writeFile(join(out, 'dev.json'), JSON.stringify(dev));
  await writeFile(join(out, 'heldout.json'), JSON.stringify(heldout));
  console.log(`${corpus.length} reviews, ${dev.length} dev queries, ${heldout.length} held-out queries (seed ${seed})`);
}
