// Results: held-out score, dimension profile with evidence, self-review, traps and export.

import { LEVELS, SELF_REVIEW, scoreAttempt } from '../../challenge/scoring.js';
import { card, esc, fixed, levelBadge, note, overview, tile, tiles } from '../ui.js';

const FAMILY_LABELS = {
  vocabulary: 'Different words, same meaning', identifier: 'Exact codes', comparison: 'Comparison direction',
  negation: 'Negation', sarcasm: 'Sarcasm', duplicates: 'Duplicates', long: 'Long reviews', multi: 'Two needs in one query',
};

function exportAttempt(attempt) {
  const blob = new Blob([JSON.stringify(attempt, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `product-finder-${attempt.submittedAt.slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const selfReviewCard = (attempt) => card('Self-review', `
  <p class="small text-body-secondary">Compare your work with each model answer, then tick what you honestly did.</p>
  ${Object.entries(SELF_REVIEW).map(([id, section]) => `
    <div class="section-label">${esc(section.label)}</div>
    ${note(`<div class="small">${esc(section.model)}</div>`)}
    ${section.items.map((item, i) => `<label class="tick-row"><input class="form-check-input" type="checkbox" data-review="${id}" data-item="${i}" ${attempt.selfReview[id]?.[i] ? 'checked' : ''}><span class="small">${esc(item)}</span></label>`).join('')}`).join('')}
  <button class="btn btn-primary mt-2" id="save-review">Save self-review</button>`);

export async function showResults(root, app) {
  const { attempt } = app;
  if (!attempt?.result) {
    root.innerHTML = overview({ title: 'Results', subtitle: 'Submit a design in the Lab to see your results.', actions: '<a class="btn btn-primary" href="#/">Go to challenges</a>' });
    return;
  }
  const { result } = attempt;
  const data = await app.data();
  const found = result.traps.filter((trap) => trap.found).length;

  root.innerHTML = `
  ${overview({
    title: 'Your results',
    subtitle: `Semantic Product Finder · ${attempt.config.engine} · ${attempt.config.chunking} · practice score`,
    actions: '<button class="btn btn-outline-primary bg-body" id="export">Export</button>',
    body: tiles([
      tile('Held-out nDCG@5', fixed(result.ndcg, 2), `best known ${fixed(data.reference.best, 2)}`),
      tile('Held-out Recall@5', fixed(result.recall, 2)),
      tile('Cost', `${Math.round(attempt.cost.units).toLocaleString('en-US')} units`),
      tile('Traps found', `${found} of ${result.traps.length}`),
    ]),
  })}
  ${card('Your profile', `<ul class="list-group list-group-flush sba-list">
    ${result.dimensions.map((dim) => `<li class="list-group-item">
      <div class="d-flex justify-content-between align-items-center gap-2"><span class="fw-semibold">${esc(dim.label)}</span>${levelBadge(dim.level, LEVELS)}</div>
      <div class="small text-body-secondary">${esc(dim.source)}</div>
      ${dim.evidence.map((line) => `<div class="small">${esc(line)}</div>`).join('')}
    </li>`).join('')}</ul>`, { flush: true })}
  ${selfReviewCard(attempt)}
  ${card('Traps in this challenge', `<ul class="list-group list-group-flush sba-list">
    ${result.traps.map((trap) => `<li class="list-group-item">
      <div class="d-flex justify-content-between align-items-center gap-2"><span class="fw-semibold">${esc(trap.label)}</span>
      <span class="badge ${trap.found ? 'text-bg-success' : 'text-bg-secondary'}">${trap.found ? 'Found' : 'Missed'}</span></div>
      <div class="small">${esc(trap.lesson)}</div></li>`).join('')}</ul>`, { flush: true })}
  ${card('Score by query type', `<div class="table-responsive"><table class="table table-sm table-striped mb-0">
    <thead><tr><th>Query type</th><th class="num">nDCG@5</th></tr></thead>
    <tbody>${result.families.map((row) => `<tr><td>${esc(FAMILY_LABELS[row.family] ?? row.family)}</td><td class="num">${fixed(row.ndcg, 2)}</td></tr>`).join('')}</tbody></table></div>`, { flush: true })}
  ${card('Best known designs', `<div class="table-responsive"><table class="table table-sm table-striped mb-0">
    <thead><tr><th>Engine</th><th>Design</th><th class="num">nDCG@5</th></tr></thead>
    <tbody>${Object.entries(data.reference.perEngine).map(([engine, row]) => `<tr><td>${esc(engine)}</td><td>${esc(row.config.chunking)}${row.config.hybrid ? ` · hybrid ${row.config.hybrid}` : ''}${row.config.dedupe ? ' · dedupe' : ''}</td><td class="num">${fixed(row.ndcg, 2)}</td></tr>`).join('')}</tbody></table></div>`, { flush: true })}
  <div class="d-flex flex-wrap gap-2"><button class="btn btn-primary" id="again">Try again</button></div>`;

  root.querySelector('#export').addEventListener('click', () => exportAttempt(attempt));
  root.querySelector('#again').addEventListener('click', () => app.start());
  root.querySelector('#save-review').addEventListener('click', async () => {
    for (const [id, section] of Object.entries(SELF_REVIEW)) {
      attempt.selfReview[id] = section.items.map((_, i) => root.querySelector(`[data-review="${id}"][data-item="${i}"]`).checked);
    }
    attempt.result = scoreAttempt(attempt, data);
    await app.save();
    app.rerender();
  });
}
