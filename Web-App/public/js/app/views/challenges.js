// Home screen: the challenge list and past attempts.

import { deleteAttempt, listAttempts } from '../store.js';
import { card, esc, fixed, overview, tile, tiles } from '../ui.js';

const PLANNED = [
  ['Duplicate review detector', 'Threshold choice and the cost of false matches'],
  ['Review triage', 'Whether simple rules beat embeddings for five fixed categories'],
  ['Long manual retrieval', 'Chunking, page citations and evidence quality'],
  ['Fake-review outliers', 'Whether similarity outliers mean anything'],
];

export async function showChallenges(root, app) {
  const attempts = await listAttempts();
  const open = attempts.find((a) => !a.submittedAt);
  const finished = attempts.filter((a) => a.submittedAt);
  const best = finished.reduce((max, a) => Math.max(max, a.result?.ndcg ?? 0), 0);

  root.innerHTML = `
  ${overview({
    title: 'AI Interview Challenges',
    subtitle: 'Solve problems with an SBERT-style model that runs in this browser. Nothing to install, and nothing leaves your phone.',
    body: tiles([
      tile('Challenges', '1', 'more planned'),
      tile('In progress', open ? '1' : '0'),
      tile('Finished', finished.length),
      tile('Best score', finished.length ? fixed(best) : '-', 'held-out nDCG@5'),
    ]),
  })}
  ${card('Challenge 001: Semantic Product Finder', `
    <p class="mb-2">Shoppers search 130 product reviews in their own words. Design the search, prove it works, and be honest about where it fails.</p>
    <p class="small text-body-secondary">About 20 minutes · Beginner to intermediate · No coding</p>
    <div class="d-flex flex-wrap gap-2">
      ${open ? '<button class="btn btn-primary" data-action="resume">Continue attempt</button>' : '<button class="btn btn-primary" data-action="start">Start challenge</button>'}
      ${open ? '<button class="btn btn-outline-primary" data-action="restart">Start over</button>' : ''}
    </div>`)}
  ${finished.length ? card('Past attempts', `
    <ul class="list-group list-group-flush sba-list">
      ${finished.map((a) => `<li class="list-group-item d-flex justify-content-between align-items-center gap-2">
        <span>${esc(new Date(a.submittedAt).toLocaleDateString())} · ${esc(a.config.engine)}<div class="small text-body-secondary">nDCG@5 ${fixed(a.result?.ndcg)}</div></span>
        <span class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-primary" data-open="${esc(a.id)}">Open</button>
          <button class="btn btn-sm btn-outline-danger" data-delete="${esc(a.id)}" aria-label="Delete attempt from ${esc(new Date(a.submittedAt).toLocaleDateString())}">Delete</button>
        </span></li>`).join('')}
    </ul>`, { flush: true }) : ''}
  ${card('Planned challenges', `
    <ul class="list-group list-group-flush sba-list">
      ${PLANNED.map(([name, about]) => `<li class="list-group-item">${esc(name)}<div class="small text-body-secondary">${esc(about)}</div></li>`).join('')}
    </ul>`, { flush: true })}`;

  root.querySelector('[data-action=start]')?.addEventListener('click', () => app.start());
  root.querySelector('[data-action=resume]')?.addEventListener('click', () => app.open(open));
  root.querySelector('[data-action=restart]')?.addEventListener('click', async () => {
    if (!window.confirm('Delete this attempt and start again?')) return;
    await deleteAttempt(open.id);
    app.start();
  });
  root.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => {
    app.open(finished.find((a) => a.id === button.dataset.open));
  }));
  root.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!window.confirm('Delete this attempt?')) return;
    await deleteAttempt(button.dataset.delete);
    if (app.attempt?.id === button.dataset.delete) app.attempt = null;
    app.rerender();
  }));
}
