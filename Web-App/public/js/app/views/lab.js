// The Pipeline Lab: configure, run on the dev queries, inspect failures, log AI use, submit.

import { ENGINES } from '../../micro-embed/engines.js';
import { chargeRun, evaluate, rank } from '../../challenge/pipeline.js';
import { CAUSES, scoreAttempt } from '../../challenge/scoring.js';
import { encode, isLoaded, loadEngine, miniLmProblem } from '../embed-client.js';
import { MIN_PLAN_WORDS } from './brief.js';
import { card, esc, fixed, flash, hideJob, note, overview, showJob, tile, tiles } from '../ui.js';

const FAIL_BELOW = 0.5;
const SUGGESTED_MINUTES = 20;
const DOWNLOADS = {
  static: '7.6 MB',
  minilm: '37 MB (23 MB model and 14 MB runtime)',
};

let lastResult = null;
let lastKey = '';
let freeSearch = null;

const runKey = (attempt, run) => `${attempt.id}:${JSON.stringify(run?.config ?? null)}`;

function minutesLeft(attempt) {
  const used = (Date.now() - new Date(attempt.startedAt).getTime()) / 60000;
  return Math.max(0, Math.round(SUGGESTED_MINUTES - used));
}

function reviewLine(review, ok, chunk) {
  return `<div class="hit ${ok ? 'good' : 'bad'}"><div class="meta">${ok ? 'Relevant' : 'Not relevant'} · ${esc(review.productName)}</div>${esc(chunk ?? review.text)}</div>`;
}

function failedQueries(attempt, data) {
  const failed = lastResult.perQuery.filter((row) => row.ndcg < FAIL_BELOW).sort((a, b) => a.ndcg - b.ndcg);
  if (!failed.length) return '<div class="card-body small text-body-secondary">No query scored below 0.5.</div>';
  const options = (id) => `<option value="">Choose a cause</option>${CAUSES.map((cause) => `<option value="${cause.id}" ${attempt.tags[id] === cause.id ? 'selected' : ''}>${esc(cause.label)}</option>`).join('')}`;
  return `<ul class="list-group list-group-flush sba-list">${failed.map((row) => {
    const expected = data.corpus.reviews.filter((review) => row.query.relevant[review.id]).slice(0, 3);
    return `<li class="list-group-item"><details class="fail" data-query="${esc(row.query.id)}">
      <summary><span class="fail-title">${esc(row.query.text)}<div class="small text-body-secondary">nDCG ${fixed(row.ndcg, 2)}${attempt.tags[row.query.id] ? ' · cause noted' : ''}</div></span></summary>
      <div class="section-label">Your top results</div>
      ${row.hits.length ? row.hits.map((hit) => reviewLine(data.corpus.reviews[hit.doc], Boolean(row.query.relevant[data.corpus.reviews[hit.doc].id]), hit.chunk.length > 220 ? `${hit.chunk.slice(0, 220)}...` : hit.chunk)).join('') : '<p class="small">Nothing passed your settings.</p>'}
      <div class="section-label">Expected, according to the labels</div>
      ${expected.map((review) => reviewLine(review, true, review.text.length > 220 ? `...${review.text.slice(-220)}` : review.text)).join('')}
      <label class="form-label small mt-1" for="cause-${esc(row.query.id)}">Why did this fail?</label>
      <select class="form-select" id="cause-${esc(row.query.id)}" data-cause="${esc(row.query.id)}">${options(row.query.id)}</select>
    </details></li>`;
  }).join('')}</ul>`;
}

function pipelineCard(attempt) {
  const { config } = attempt;
  const lexical = config.engine === 'lexical';
  return card('Pipeline', `
    <div class="setting">
      <label class="setting-head" for="engine">Engine</label>
      <select class="form-select mt-1" id="engine">${Object.values(ENGINES).map((engine) => `<option value="${engine.id}" ${engine.id === config.engine ? 'selected' : ''}>${esc(engine.label)}</option>`).join('')}</select>
      <div class="setting-help">${{
        lexical: 'Keyword matching. Almost free.',
        static: 'Word-level embeddings. About a tenth of the cost of MiniLM.',
        minilm: 'A small transformer. The highest cost, and it reads at most 256 tokens.',
      }[config.engine]}</div>
    </div>
    <div class="setting">
      <label class="setting-head" for="chunking">Chunking</label>
      <select class="form-select mt-1" id="chunking">
        ${[['whole', 'Whole review'], ['passage', 'Passages of 3 sentences'], ['sentence', 'Single sentences']].map(([value, label]) => `<option value="${value}" ${value === config.chunking ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </div>
    <div class="setting">
      <label class="setting-head" for="hybrid"><span>Keyword weight (hybrid)</span><span id="hybrid-value">${fixed(config.hybrid, 1)}</span></label>
      <input class="form-range" type="range" id="hybrid" min="0" max="0.8" step="0.1" value="${config.hybrid}" ${lexical ? 'disabled' : ''}>
      <div class="setting-help">${lexical ? 'Only used with an embedding engine.' : '0 uses embeddings only. Higher values mix in keyword matching.'}</div>
    </div>
    <div class="setting">
      <label class="setting-head" for="threshold"><span>Minimum similarity</span><span id="threshold-value">${fixed(config.threshold, 2)}</span></label>
      <input class="form-range" type="range" id="threshold" min="0" max="0.9" step="0.05" value="${config.threshold}" ${lexical ? 'disabled' : ''}>
      <div class="setting-help">${lexical ? 'Only used with an embedding engine.' : 'Hide results below this cosine similarity.'}</div>
    </div>
    <div class="setting">
      <label class="switch-row form-switch" for="dedupe"><span class="setting-head">Remove duplicates</span><input class="form-check-input" type="checkbox" role="switch" id="dedupe" ${config.dedupe ? 'checked' : ''}></label>
    </div>`);
}

function historyCard(attempt) {
  if (!attempt.runs.length) return '';
  const rows = attempt.runs.slice(-6).reverse().map((run) => `<tr>
    <td>${run.n}</td><td>${esc(run.config.engine)} · ${esc(run.config.chunking)}${run.config.hybrid ? ` · h${fixed(run.config.hybrid, 1)}` : ''}${run.config.dedupe ? ' · dedupe' : ''}${run.config.threshold ? ` · t${fixed(run.config.threshold, 2)}` : ''}</td>
    <td class="num">${fixed(run.ndcg, 2)}</td><td class="num">${Math.round(run.units).toLocaleString('en-US')}</td></tr>`).join('');
  return card('Recent runs', `<div class="table-responsive"><table class="table table-sm table-striped mb-0">
    <thead><tr><th>#</th><th>Design</th><th class="num">nDCG</th><th class="num">Cost</th></tr></thead><tbody>${rows}</tbody></table></div>`, { flush: true });
}

function tryCard(attempt) {
  const { engine } = attempt.config;
  const needsDownload = engine !== 'lexical' && !isLoaded(engine);
  const blocked = engine === 'minilm' ? miniLmProblem() : null;
  const results = freeSearch?.hits.map((hit, i) => `<label class="tick-row"><input class="form-check-input" type="checkbox" data-free="${i}" ${hit.relevant ? 'checked' : ''}>
    <span class="small fit-text">${esc(hit.text.length > 200 ? `${hit.text.slice(0, 200)}...` : hit.text)}<span class="d-block text-body-secondary">${fixed(hit.score, 2)} · ${esc(hit.productName)}</span></span></label>`).join('') ?? '';
  return card('Try your own query', `
    <p class="small text-body-secondary">This runs the model on your phone. Tick the good results and save the query as your own test.</p>
    ${blocked ? note(esc(blocked)) : ''}
    <label class="visually-hidden" for="free-query">Your query</label>
    <input class="form-control" id="free-query" value="${esc(freeSearch?.query ?? '')}" placeholder="for example: quiet blender">
    <button class="btn btn-outline-primary bg-body mt-2" id="free-go" ${blocked ? 'disabled' : ''}>${needsDownload ? `Download model (${DOWNLOADS[engine]}) and search` : 'Search'}</button>
    ${freeSearch ? `<div class="mt-2">${results || '<p class="small mb-0">No results.</p>'}</div>
      ${freeSearch.hits.length ? '<button class="btn btn-outline-primary bg-body mt-1" id="free-save">Save as my test</button>' : ''}` : ''}
    ${attempt.ownTests.length ? `<div class="small text-body-secondary mt-2">${attempt.ownTests.length} of your own test${attempt.ownTests.length === 1 ? '' : 's'} saved.</div>` : ''}`);
}

function aiCard(attempt) {
  const entries = attempt.aiLog.map((entry) => `<li class="list-group-item small"><span class="fit-text">${esc(entry.asked)}</span><div class="text-body-secondary">${esc(entry.outcome)}</div></li>`).join('');
  const decided = { accepted: 'You applied this tip.', rejected: 'You rejected this tip.' }[attempt.hintDecision];
  return `${note(`<b>AI tip</b><p class="mb-2 small">"Set the minimum similarity to 0.8. With sentence embeddings, anything below 0.8 isn't a real match."</p>
    ${decided ? `<div class="small">${decided}</div>` : `<div class="d-flex flex-wrap gap-2">
      <button class="btn btn-outline-primary bg-body" id="hint-apply">Apply tip</button>
      <button class="btn btn-outline-primary bg-body" id="hint-reject">Reject tip</button></div>`}`)}
  ${card('AI log', `
    <p class="small text-body-secondary">Use any assistant in another tab. Note what you asked and what you did with the answer.</p>
    <label class="form-label small" for="ai-asked">What did you ask?</label>
    <textarea class="form-control" id="ai-asked" rows="2"></textarea>
    <label class="form-label small mt-2" for="ai-outcome">What did you do with the answer?</label>
    <select class="form-select" id="ai-outcome">
      <option value="accepted">Used it as it was</option>
      <option value="changed">Changed it after testing</option>
      <option value="rejected">Rejected it</option>
    </select>
    <button class="btn btn-outline-primary bg-body mt-2" id="ai-add">Add to log</button>
    ${entries ? `<ul class="list-group list-group-flush sba-list mt-2">${entries}</ul>` : ''}`)}`;
}

function submitCard(attempt) {
  const field = (id, label, value) => `<label class="form-label small mt-2" for="${id}">${label}</label>
    <textarea class="form-control" id="${id}" rows="3" data-note="${id}">${esc(value)}</textarea>`;
  return card('Submit your design', `
    <p class="small text-body-secondary mb-1">Your current settings will be tested on queries you haven't seen.</p>
    ${field('why', 'Why this design?', attempt.notes.why)}
    ${field('limits', 'What does it still get wrong?', attempt.notes.limits)}
    ${field('scale', 'What would change at 1 million reviews?', attempt.notes.scale)}
    <div class="small text-danger mt-2" id="submit-error" role="alert"></div>
    <button class="btn btn-primary mt-2" id="submit">Submit design</button>`);
}

async function runDev(app, data) {
  const { attempt } = app;
  const config = { ...attempt.config };
  lastResult = evaluate(data.corpus, config, data.dev, data.store, 'dev');
  attempt.cost = chargeRun(attempt.cost, data.corpus, config, data.dev);
  const run = { n: attempt.runs.length + 1, config, ndcg: lastResult.ndcg, recall: lastResult.recall, mrr: lastResult.mrr, units: attempt.cost.units };
  attempt.runs.push(run);
  lastKey = runKey(attempt, run);
  await app.save();
  app.rerender();
}

async function searchFree(root, app, data) {
  const { attempt } = app;
  const query = root.querySelector('#free-query').value.trim();
  if (!query) return;
  const config = { ...attempt.config };
  const { engine, chunking } = config;
  let vector = null;
  try {
    if (engine !== 'lexical') {
      if (!isLoaded(engine)) {
        showJob(`Downloading ${ENGINES[engine].label}...`, 0);
        await loadEngine(engine, ({ loaded, total }) => showJob(`Downloading ${ENGINES[engine].label}...`, Math.round((loaded / total) * 100)));
      }
      showJob('Searching on this phone...');
      [vector] = await encode(engine, [query]);
    }
  } catch (error) {
    const offline = error.message.startsWith('Download failed') || error instanceof TypeError;
    flash(offline ? 'The download stopped. Tap again to continue from where it stopped.' : `The model couldn't start: ${error.message}`, 7000);
    app.rerender();
    return;
  }
  hideJob();
  const vectors = engine === 'lexical' ? null : data.store.chunkVectors(engine, chunking);
  const hits = rank(data.corpus, config, query, vector, vectors);
  attempt.cost = chargeRun(attempt.cost, data.corpus, config, [{ text: query }]);
  freeSearch = {
    query,
    engine,
    hits: hits.map((hit) => ({ id: data.corpus.reviews[hit.doc].id, productName: data.corpus.reviews[hit.doc].productName, text: hit.chunk, score: hit.score, relevant: false })),
  };
  await app.save();
  app.rerender();
}

async function submit(root, app, data) {
  const { attempt } = app;
  const error = root.querySelector('#submit-error');
  if (!attempt.runs.length) { error.textContent = 'Run your design at least once first.'; return; }
  const missing = Object.entries(attempt.notes).find(([, value]) => value.trim().length < 15);
  if (missing) { error.textContent = 'Please answer all three questions in a sentence or two.'; return; }
  attempt.submittedAt = new Date().toISOString();
  attempt.result = scoreAttempt(attempt, data);
  await app.save();
  freeSearch = null;
  app.go('/results');
}

export async function showLab(root, app) {
  const { attempt } = app;
  if (!attempt || attempt.submittedAt) {
    root.innerHTML = `${overview({ title: 'Lab', subtitle: 'Start a challenge to open the Lab.', actions: '<a class="btn btn-primary" href="#/">Go to challenges</a>' })}`;
    return;
  }
  if (attempt.plan.trim().split(/\s+/).filter(Boolean).length < MIN_PLAN_WORDS) {
    app.go('/brief');
    return;
  }
  const data = await app.data();
  const last = attempt.runs.at(-1);
  if (last && lastKey !== runKey(attempt, last)) {
    lastResult = evaluate(data.corpus, last.config, data.dev, data.store, 'dev');
    lastKey = runKey(attempt, last);
  }
  if (!last) lastResult = null;

  root.innerHTML = `
  ${overview({
    title: 'Semantic Product Finder',
    subtitle: `Run ${attempt.runs.length + 1} · about ${minutesLeft(attempt)} min left (a guide, not a limit)`,
    actions: '<button class="btn btn-primary" id="run">Run</button>',
    body: tiles([
      tile('nDCG@5', last ? fixed(last.ndcg, 2) : '-', 'ranking quality'),
      tile('Recall@5', last ? fixed(last.recall, 2) : '-', 'relevant found'),
      tile('Cost', `${Math.round(attempt.cost.units).toLocaleString('en-US')} units`),
      tile('Runs', attempt.runs.length),
    ]),
  })}
  ${pipelineCard(attempt)}
  ${historyCard(attempt)}
  ${lastResult ? card('Failed queries', failedQueries(attempt, data), { flush: true }) : ''}
  ${aiCard(attempt)}
  ${tryCard(attempt)}
  ${submitCard(attempt)}`;

  const setConfig = (key, value, rerender = true) => {
    attempt.config[key] = value;
    app.saveSoon();
    if (rerender) { app.syncEngine(); app.rerender(); }
  };
  root.querySelector('#run').addEventListener('click', () => runDev(app, data));
  root.querySelector('#engine').addEventListener('change', (event) => setConfig('engine', event.target.value));
  root.querySelector('#chunking').addEventListener('change', (event) => setConfig('chunking', event.target.value));
  root.querySelector('#dedupe').addEventListener('change', (event) => setConfig('dedupe', event.target.checked, false));
  for (const [id, digits] of [['hybrid', 1], ['threshold', 2]]) {
    root.querySelector(`#${id}`).addEventListener('input', (event) => {
      root.querySelector(`#${id}-value`).textContent = fixed(event.target.value, digits);
      setConfig(id, Number(event.target.value), false);
    });
  }

  root.querySelectorAll('details.fail').forEach((details) => details.addEventListener('toggle', () => {
    if (details.open && !attempt.inspected.includes(details.dataset.query)) {
      attempt.inspected.push(details.dataset.query);
      app.saveSoon();
    }
  }));
  root.querySelectorAll('[data-cause]').forEach((select) => select.addEventListener('change', () => {
    if (select.value) attempt.tags[select.dataset.cause] = select.value;
    else delete attempt.tags[select.dataset.cause];
    app.saveSoon();
  }));

  root.querySelector('#hint-apply')?.addEventListener('click', () => {
    attempt.hintDecision = 'accepted';
    if (attempt.config.engine !== 'lexical') attempt.config.threshold = 0.8;
    app.saveSoon();
    app.rerender();
  });
  root.querySelector('#hint-reject')?.addEventListener('click', () => {
    attempt.hintDecision = 'rejected';
    app.saveSoon();
    app.rerender();
  });
  root.querySelector('#ai-add').addEventListener('click', () => {
    const asked = root.querySelector('#ai-asked').value.trim();
    if (!asked) return;
    attempt.aiLog.push({ asked, outcome: root.querySelector('#ai-outcome').value });
    app.saveSoon();
    app.rerender();
  });

  root.querySelector('#free-go').addEventListener('click', () => searchFree(root, app, data));
  root.querySelector('#free-query').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchFree(root, app, data);
  });
  root.querySelectorAll('[data-free]').forEach((box) => box.addEventListener('change', () => {
    freeSearch.hits[Number(box.dataset.free)].relevant = box.checked;
  }));
  root.querySelector('#free-save')?.addEventListener('click', () => {
    const relevantIds = freeSearch.hits.filter((hit) => hit.relevant).map((hit) => hit.id);
    attempt.ownTests.push({ query: freeSearch.query, engine: freeSearch.engine, relevantIds });
    freeSearch = null;
    app.saveSoon();
    app.rerender();
  });

  root.querySelectorAll('[data-note]').forEach((area) => area.addEventListener('input', () => {
    attempt.notes[area.dataset.note] = area.value;
    app.saveSoon();
  }));
  root.querySelector('#submit').addEventListener('click', () => submit(root, app, data));
}
