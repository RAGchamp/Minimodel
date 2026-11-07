// The brief and the plan step. A plan comes first, so thinking is captured before experimenting.

import { card, esc, note, overview } from '../ui.js';

export const MIN_PLAN_WORDS = 15;
const words = (text) => text.trim().split(/\s+/).filter(Boolean).length;

export async function showBrief(root, app) {
  if (!app.attempt || app.attempt.submittedAt) {
    await app.start();
    return;
  }
  const { attempt } = app;

  root.innerHTML = `
  ${overview({ title: 'Semantic Product Finder', subtitle: 'Challenge 001 · suggested time 20 minutes' })}
  ${card('The problem', `
    <p>Fennel &amp; Finch is a fictional online store with 130 customer reviews. Shoppers search in their own words, for example:</p>
    <p class="fst-italic">"headphones that stay put during a run"</p>
    <p class="mb-0">Design a search that returns the <b>five most relevant reviews</b> for any query.</p>`)}
  ${card('What you will do', `
    <ol class="mb-0 ps-3">
      <li>Write a short plan.</li>
      <li>Try different designs in the Lab and compare the results.</li>
      <li>Open the failures and work out why they happened.</li>
      <li>Use any AI assistant you like, in another tab, and note what you asked.</li>
      <li>Submit your design. It's then tested on queries you haven't seen.</li>
    </ol>`)}
  ${note('<b>How this is scored.</b> Using AI is allowed and expected. You\'re scored on your choices, your checks and your honesty about limits. Phone speed never counts, and a cheaper design that works beats an expensive one.')}
  ${card('Your plan', `
    <label class="form-label" for="plan">Before your first run: what kinds of query will people ask, how will you measure success, and where will you start?</label>
    <textarea class="form-control" id="plan" rows="6">${esc(attempt.plan)}</textarea>
    <div class="setting-help mt-1" id="plan-count"></div>
    <button class="btn btn-primary mt-2" id="to-lab">Start the Lab</button>`)}`;

  const plan = root.querySelector('#plan');
  const count = root.querySelector('#plan-count');
  const refresh = () => {
    const n = words(plan.value);
    count.textContent = n >= MIN_PLAN_WORDS ? `${n} words` : `${n} of at least ${MIN_PLAN_WORDS} words`;
    root.querySelector('#to-lab').disabled = n < MIN_PLAN_WORDS;
  };
  plan.addEventListener('input', () => {
    attempt.plan = plan.value;
    app.saveSoon();
    refresh();
  });
  root.querySelector('#to-lab').addEventListener('click', async () => {
    await app.save();
    app.go('/lab');
  });
  refresh();
}
