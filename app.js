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

function toPct(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  return raw <= 1 ? raw * 100 : raw;
}

function confidencePct(prediction) {
  return toPct(prediction?.confidence) ?? 0;
}

function marketList(prediction) {
  if (!prediction) return [];

  const over15 = toPct(prediction.prob_over_15);
  const over25 = toPct(prediction.prob_over_25);
  const over35 = toPct(prediction.prob_over_35);
  const bttsYes = toPct(prediction.prob_btts_yes);

  return [
    { label: '1', value: toPct(prediction.prob_home_win) },
    { label: 'X', value: toPct(prediction.prob_draw) },
    { label: '2', value: toPct(prediction.prob_away_win) },
    { label: 'Over 1.5', value: over15 },
    { label: 'Over 2.5', value: over25 },
    { label: 'Under 3.5', value: over35 == null ? null : 100 - over35 },
    { label: 'BTTS Da', value: bttsYes },
    { label: 'BTTS Nu', value: bttsYes == null ? null : 100 - bttsYes }
  ].filter((item) => item.value != null && item.value >= 0 && item.value <= 100);
}

function computeScore(prediction) {
  if (!prediction) return null;
  const conf = confidencePct(prediction);
  const best = marketList(prediction).sort((a, b) => b.value - a.value)[0]?.value ?? 0;
  let score = Math.round((conf * 0.35) + (best * 0.65));
  if (conf >= 60 && best >= 70) score += 4;
  return Math.max(0, Math.min(100, score));
}

function level(score) {
  if (score >= 80) return ['RIDICAT', '#16a34a'];
  if (score >= 65) return ['BUN', '#15803d'];
  if (score >= 50) return ['MEDIU', '#d97706'];
  return ['SCĂZUT', '#dc2626'];
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
    el.out.innerHTML = '<div class="card empty">Nu există meciuri cu prediction valid în setul curent de date.</div>';
    return;
  }

  el.out.innerHTML = rows.map((row) => {
    const [label, color] = level(row.score);
    const topMarkets = marketList(row.prediction)
      .sort((a, b) => b.value - a.value)
      .slice(0, 4)
      .map((item) => `<div class="prob-row"><strong>${esc(item.label)}</strong><span>${item.value.toFixed(1)}%</span></div>`)
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
          <div class="subtle">Piețe principale</div>
          ${topMarkets}
        </div>
        <div class="tips">
          <div class="subtle">Observații</div>
          <div class="tip-row"><span>Confidence model</span><strong>${confidencePct(row.prediction).toFixed(1)}%</strong></div>
          <div class="tip-row"><span>Nivel intern</span><strong>${label}</strong></div>
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

    const rows = Array.isArray(data?.matches) ? data.matches : [];
    s.rows = rows
      .map((row) => ({ ...row, score: computeScore(row.prediction) }))
      .filter((row) => row.score != null)
      .sort((a, b) => b.score - a.score);

    if (!s.rows.length) {
      show('Nu există predictions valide în fișierul curent.', 'info');
    } else if (data.generated_at) {
      show(`Date generate la: ${dt(data.generated_at)}`, 'info');
    }

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
