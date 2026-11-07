// Picks 1,000 test sentences for the parity check: real corpus text plus tokenizer edge cases.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RAMBLE } from './dataset-spec.mjs';
import { loadChallenge, root } from './node-assets.mjs';

const EDGE_CASES = [
  'Café crème, naïve résumé, and a jalapeño.', 'VS-2210 / KP-3150 (rev. B) — $19.99!', "don't can't won't it's",
  'ALL CAPS SENTENCE HERE', 'tabs\tand\nnewlines   and  spaces', '日本語のテキスト and English', 'emoji 🙂 in the middle',
  'hyphenated-word well-known state-of-the-art', 'a', '...', 'supercalifragilisticexpialidocious', 'x'.repeat(120),
  'email me at someone@example.com', 'C++ and C# aren\'t the same', '100% of 3.5kg = 3,500g', 'Ångström Zürich Москва',
];

const { corpus, dev, heldout } = await loadChallenge();
const pool = new Set(EDGE_CASES);
for (const list of [dev, heldout]) for (const q of list) pool.add(q.text);
for (const text of RAMBLE) pool.add(text);
for (const mode of ['sentence', 'passage', 'whole']) for (const chunk of corpus.modes[mode].chunks) pool.add(chunk.text);

const sentences = [...pool];
for (let i = 0; sentences.length < 1000; i += 1) {
  sentences.push(`${sentences[i]} ${sentences[(i * 7 + 3) % pool.size]}`);
}
const out = join(root, '.cache', 'parity');
await mkdir(out, { recursive: true });
await writeFile(join(out, 'sentences.json'), JSON.stringify(sentences.slice(0, 1000)));
console.log('wrote', Math.min(sentences.length, 1000), 'sentences');
