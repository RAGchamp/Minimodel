// Downloads the pretrained model files into .cache/hf. Skips files that are already there.

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cache = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'hf');
const files = [
  ['minishlab/potion-base-8M', 'potion', ['tokenizer.json', 'model.safetensors']],
  ['Xenova/all-MiniLM-L6-v2', 'minilm', ['tokenizer.json', 'onnx/model_quantized.onnx']],
];

for (const [repo, folder, names] of files) {
  for (const name of names) {
    const target = join(cache, folder, name);
    if (existsSync(target)) continue;
    await mkdir(dirname(target), { recursive: true });
    const response = await fetch(`https://huggingface.co/${repo}/resolve/main/${name}`);
    if (!response.ok) throw new Error(`${repo}/${name}: HTTP ${response.status}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    console.log(`fetched ${repo}/${name}`);
  }
}
