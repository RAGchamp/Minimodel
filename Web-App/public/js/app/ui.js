// Building blocks shared by every screen, matching the macros in SMALL-BIZ-ACCTG/Web-App/_ui.html.

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

export const overview = ({ title, subtitle = '', actions = '', body = '' }) => `
<section class="sba-overview" aria-label="Overview">
  <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
    <div class="sba-head">
      <h1 class="sba-title">${esc(title)}</h1>
      ${subtitle ? `<div class="sba-sub">${esc(subtitle)}</div>` : ''}
    </div>
    ${actions ? `<div class="d-flex flex-wrap gap-2 align-items-center">${actions}</div>` : ''}
  </div>
  ${body ? `<div class="sba-body">${body}</div>` : ''}
</section>`;

export const tile = (label, value, tileNote = '', cls = '') => `
<div class="col"><div class="tile">
  <div class="t">${esc(label)}</div>
  <div class="v ${cls}">${esc(value)}</div>
  ${tileNote ? `<div class="t">${esc(tileNote)}</div>` : ''}
</div></div>`;

export const tiles = (items) => `<div class="row g-2 row-cols-2 row-cols-lg-4">${items.join('')}</div>`;

export const card = (header, body, { flush = false, right = '' } = {}) => `
<div class="card mb-3 shadow-sm">
  <div class="card-header d-flex justify-content-between align-items-center gap-2"><span>${esc(header)}</span>${right}</div>
  ${flush ? body : `<div class="card-body">${body}</div>`}
</div>`;

export const note = (html) => `<div class="sba-note mb-3">${html}</div>`;

export const fixed = (value, digits = 3) => (value === null || value === undefined ? '-' : Number(value).toFixed(digits));

export const levelBadge = (level, names) => {
  if (level === null) return '<span class="badge text-bg-secondary">Self-review needed</span>';
  const cls = ['text-bg-danger', 'text-bg-warning', 'text-bg-primary', 'text-bg-success'][level];
  return `<span class="badge ${cls}">${esc(names[level])}</span>`;
};

const box = () => document.getElementById('job-box');

/** The floating progress box, reused from the accounting app's job box. */
export function showJob(message, percent = null) {
  box().innerHTML = `<div class="card"><div class="card-body py-2">
    <div class="small">${esc(message)}</div>
    ${percent === null ? '' : `<div class="progress mt-1" role="progressbar" aria-label="Download progress" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" style="height:.5rem"><div class="progress-bar" style="width:${percent}%"></div></div>`}
  </div></div>`;
}

export function hideJob() {
  box().innerHTML = '';
}

export function flash(message, ms = 4000) {
  showJob(message);
  setTimeout(hideJob, ms);
}
