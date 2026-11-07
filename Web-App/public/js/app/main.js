// App shell: hash routing, the menu, the current attempt and offline registration.

import { ENGINES } from '../micro-embed/engines.js';
import { DEFAULT_CONFIG } from '../challenge/pipeline.js';
import { createAttempt } from '../challenge/scoring.js';
import { loadChallengeData } from './challenge-data.js';
import { listAttempts, saveAttempt } from './store.js';
import { esc, note } from './ui.js';
import { showChallenges } from './views/challenges.js';
import { showBrief } from './views/brief.js';
import { showLab } from './views/lab.js';
import { showResults } from './views/results.js';
import { showGuide } from './views/guide.js';

const ROUTES = {
  '/': { label: 'Challenges', show: showChallenges },
  '/lab': { label: 'Lab', show: showLab },
  '/results': { label: 'Results', show: showResults },
  '/guide': { label: 'Guide', show: showGuide },
  '/brief': { label: 'Challenges', show: showBrief, hidden: true },
};

const root = document.getElementById('view');
const nav = document.getElementById('nav');
const toggle = document.getElementById('menu-toggle');
const engineSelect = document.getElementById('engine-select');

let saveTimer;

export const app = {
  attempt: null,
  data: loadChallengeData,
  go(path) {
    if (window.location.hash === `#${path}`) render();
    else window.location.hash = `#${path}`;
  },
  async start() {
    app.attempt = createAttempt(DEFAULT_CONFIG);
    await saveAttempt(app.attempt);
    app.go('/brief');
  },
  async open(attempt) {
    app.attempt = attempt;
    app.go(attempt.submittedAt ? '/results' : '/lab');
  },
  /** Saves soon after typing stops, so nothing is lost if the tab is killed. */
  saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveAttempt(app.attempt), 400);
  },
  save: () => saveAttempt(app.attempt),
  rerender: () => render({ keepScroll: true }),
  syncEngine,
};

function syncEngine() {
  const current = app.attempt?.config.engine ?? DEFAULT_CONFIG.engine;
  engineSelect.innerHTML = Object.values(ENGINES).map((engine) => `<option value="${engine.id}" ${engine.id === current ? 'selected' : ''}>${esc(engine.label)}</option>`).join('');
  engineSelect.disabled = !app.attempt || Boolean(app.attempt.submittedAt);
}

function renderMenu(path) {
  const active = ROUTES[path] ?? ROUTES['/'];
  document.getElementById('menu-links').innerHTML = Object.entries(ROUTES)
    .filter(([, route]) => !route.hidden)
    .map(([href, route]) => {
      const on = route.label === active.label;
      return `<li class="nav-item"><a class="nav-link ${on ? 'active' : ''}" href="#${href}" ${on ? 'aria-current="page"' : ''}>${esc(route.label)}</a></li>`;
    }).join('');
  document.getElementById('menu-title').textContent = active.label;
  document.title = `${active.label} - AI Interview Challenges`;
}

function closeMenu() {
  nav.classList.remove('show');
  toggle.setAttribute('aria-expanded', 'false');
}

async function render({ keepScroll = false } = {}) {
  const path = window.location.hash.slice(1) || '/';
  const route = ROUTES[path] ?? ROUTES['/'];
  const scroll = window.scrollY;
  renderMenu(path);
  syncEngine();
  closeMenu();
  try {
    await route.show(root, app);
  } catch (error) {
    console.error(error);
    root.innerHTML = note(`<b>Something went wrong.</b> ${esc(error.message)} <a href="#/">Back to challenges</a>`);
  }
  if (keepScroll) window.scrollTo(0, scroll);
  else { window.scrollTo(0, 0); root.focus({ preventScroll: true }); }
}

toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('show');
  toggle.setAttribute('aria-expanded', String(open));
});

engineSelect.addEventListener('change', () => {
  if (!app.attempt) return;
  app.attempt.config.engine = engineSelect.value;
  app.saveSoon();
  app.rerender();
});

window.addEventListener('hashchange', () => render());

// Load the newest attempt so an interrupted session continues where it stopped.
const attempts = await listAttempts();
app.attempt = attempts.find((a) => !a.submittedAt) ?? attempts[0] ?? null;
await render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url), { type: 'classic' }).catch(() => {});
}
