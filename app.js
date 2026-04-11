const s = { filter: 'all', rows: [] };
const $ = (id) => document.getElementById(id);
const el = {
  refresh: $('refreshBtn'),
  msg: $('messageBox'),
  out: $('results'),
  total: $('statTotal'),
  top: $('statTop'),
  value: $('statValue'),
  risky: $('statRisky')
};

function show(msg, type = 'info') {
  el.msg.textContent = msg;
  el.msg.className = `message ${type}`;
}

function hide() {
  el.msg.className = 'message hidden';
  el.msg.textContent = '';
}

function confidencePct(prediction) {
  const raw = Number(prediction?.confidence || 0);
  if (!Number.isFinite(raw)) return 0;
  return raw <= 1 ? raw * 100 : raw;
}

function verdict(score) {
  if (score >= 80) return ['TOP', '#16a34a'];
  if (score >= 65) return ['VALUE', '#15803d'];
  if (score >= 50) return ['RISKY', '#d97706'];
  return ['LOW', '#dc2626'];
}

function score(prediction) {
  if (!prediction) return 25;

  const conf = confidencePct(prediction);
  let value = 20;

  if (conf >= 70) value += 38;
  else if (conf >= 60) value += 30;
  else if (conf >= 50) value += 22;
  else if (conf >= 40) value += 14;
  else if (conf >= 30) value += 8;
  else value += 4;

  const maxProb = Math.max(
    Number(prediction.prob_home_win || 0),
    Number(prediction.prob_draw || 0),
    Number(prediction.prob_away_win || 0),
    Number(prediction.prob_over_25 || 0),
    Number(prediction.prob_btts_yes || 0)
  );

  if (maxProb >= 75) value += 20;
  else if (maxProb >= 65) value += 14;
  else if (maxProb >= 55) value += 8;
  else if (maxProb >= 45) value += 4;

  return Math.max(0, Math.min(100, Math.round(value)));
}

function best(prediction) {
  if (!prediction) return [{ label: 'Fără prediction disponibil', value: '-' }];

  return [
    { label: '1', value: Number(prediction.prob_home_win || 0) },
    { label: 'X', value: Number(prediction.prob_draw || 0) },
    { label: '2', value: Number(prediction.prob_away_win || 0) },
    { label: 'Over 2.5', value: Number(prediction.prob_over_25 || 0) },
    { label: 'BTTS Da', value: Number(prediction.prob_btts_yes || 0) }
  ]
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((item) => ({ label: item.label, value: `${item.value.toFixed(1)}%` }));
}

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function dt(v) {
  try {
    return new Date(v).toLocaleString('ro-RO', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return v || '-';
  }
}

function render() {
  const rows = s.rows.filter((row) => {
    if (s.filter === 'top') return row.score >= 80;
    if (s.filter === 'value') return row.score >= 65 && row.score < 80;
    if (s.filter === 'risky') return row.score >= 50 && row.score < 65;
    return true;
  });

  el.total.textContent = s.rows.length;
  el.top.textContent = s.rows.filter((x) => x.score >= 80).length;
  el.value.textContent = s.rows.filter((x) => x.score >= 65 && x.score < 80).length;
  el.risky.textContent = s.rows.filter((x) => x.score >= 50 && x.score < 65).length;

  if (!rows.length) {
    el.out.innerHTML = '<div class="card empty">Nu există date. Rulează workflow-ul din Actions.</div>';
    return;
  }

  el.out.innerHTML = rows.map((row) => {
    const [label, color] = verdict(row.score);
    const tips = best(row.prediction)
      .map((tip) => `<div class="prob-row"><strong>${esc(tip.label)}</strong><span>${esc(tip.value)}</span></div>`)
      .join('');

    return `
      <article class="card match-card" style="border-left-color:${color}">
        <div class="match-head">
          <div>
            <h3>${esc(row.home)} vs ${esc(row.away)}</h3>
            <div class="league">${esc(row.league || 'Necunoscut')} • ${dt(row.date)}</div>
          </div>
          <div class="badge" style="background:${color}"><span class="score">${row.score}</span>${label}</div>
        </div>
        <div class="prob-list">
          <div class="subtle">Probabilități principale</div>
          ${tips}
        </div>
        <div class="tips">
          <div class="subtle">Observații</div>
          <div class="tip-row"><span>Confidence model</span><strong>${row.prediction ? `${confidencePct(row.prediction).toFixed(1)}%` : 'Lipsește'}</strong></div>
          <div class="tip-row"><span>Sursă</span><strong>${esc(row.source || 'repo data')}</strong></div>
        </div>
      </article>`;
  }).join('');
}

async function loadData() {
  hide();
  el.out.innerHTML = '<div class="card empty">Se încarcă datele locale din repo...</div>';

  try {
    const res = await fetch(`data/latest.json?t=${Date.now()}`);
    if (!res.ok) throw new Error('Fișierul data/latest.json nu este încă generat.');
    const data = await res.json();
    s.rows = Array.isArray(data?.matches) ? data.matches.map((row) => ({ ...row, score: score(row.prediction) })) : [];

    if (!s.rows.length) {
      show('Workflow-ul a rulat, dar nu a generat meciuri.', 'info');
    } else if (data.generated_at) {
      show(`Date generate la: ${dt(data.generated_at)}`, 'info');
    }

    s.rows.sort((a, b) => b.score - a.score);
    render();
  } catch (error) {
    s.rows = [];
    show(error.message || 'Nu am putut încărca datele locale.', 'error');
    render();
  }
}

(function init() {
  document.querySelectorAll('.filter-btn').forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll('.filter-btn').forEach((x) => x.classList.remove('active'));
      button.classList.add('active');
      s.filter = button.dataset.filter;
      render();
    };
  });

  el.refresh.onclick = loadData;
  loadData();
})();
