// Offline support. The app shell and challenge data are cached on install. Models are cached part
// by part the first time they are fetched, so a phone only downloads what it uses, and an
// interrupted download picks up from the last finished part.

const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const MODELS = `models-${VERSION}`;

const SHELL_FILES = [
  './', 'index.html', 'manifest.webmanifest', 'logo.svg', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'vendor/bootstrap/bootstrap.min.css', 'css/app.css',
  'js/app/main.js', 'js/app/ui.js', 'js/app/store.js', 'js/app/challenge-data.js', 'js/app/embed-client.js',
  'js/app/embed-worker.js', 'js/app/views/challenges.js', 'js/app/views/brief.js', 'js/app/views/lab.js',
  'js/app/views/results.js', 'js/app/views/guide.js',
  'js/challenge/pipeline.js', 'js/challenge/scoring.js',
  'js/micro-embed/engines.js', 'js/micro-embed/lexical.js', 'js/micro-embed/search.js', 'js/micro-embed/tokenizer.js',
  'data/product-finder/corpus.json', 'data/product-finder/dev.json', 'data/product-finder/heldout.json',
  'data/product-finder/reference.json', 'data/product-finder/vectors.json',
  'data/product-finder/vectors.static.main.i8', 'data/product-finder/vectors.static.heldout.i8',
  'data/product-finder/vectors.minilm.main.i8', 'data/product-finder/vectors.minilm.heldout.i8',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== SHELL && key !== MODELS).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

async function cacheFirst(request) {
  const cache = await caches.open(MODELS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function shellFirst(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  return hit ?? fetch(request);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const isModel = url.pathname.includes('/models/') || url.pathname.includes('/vendor/ort/');
  event.respondWith(isModel ? cacheFirst(event.request) : shellFirst(event.request));
});
