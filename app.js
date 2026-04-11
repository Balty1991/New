const state = {
  allRows: [],
  visibleRows: [],
  interval: 'all',
  type: 'all',
  probBand: '70-80',
  sort: 'prob'
};

const $ = (id) => document.getElementById(id);
const el = {
  refresh: $('refreshBtn'),
  msg: $('messageBox'),
  out: $('results'),
  total: $('statTotal'),
  high: $('statHigh'),
  avg: $('statAverage'),
  topProb: $('statTopProb'),
  interval: $('intervalSelect'),
  type: $('typeSelect'),
  minProb: $('minProbSelect'),
  sort: $('sortSelect')
};

function show(msg, type = 'info') {
  el.msg.textContent = msg;
  el.msg.className = `message ${type}`;
}

function hide() {
  el.msg.textContent = '';
  el.msg.className = 'message hidden';
}

function toPct(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  return raw <= 1 ? raw * 100 : raw;
}

function confidencePct(prediction) {
  return toPct(prediction?.confidence) ?? 0;
}

function markets(prediction) {
  if (!prediction) return { winner: [], goals: [], btts: [] };

  const over15 = toPct(prediction.prob_over_15);
  const over25 = toPct(prediction.prob_over_25);
  const over35 = toPct(prediction.prob_over_35);
  const bttsYes = toPct(prediction.prob_btts_yes);

  const winner = [
    { label: '1', value: toPct(prediction.prob_home_win), kind: 'winner' },
    { label: 'X', value: toPct(prediction.prob_draw), kind: 'winner' },
    { label: '2', value: toPct(prediction.prob_away_win), kind: 'winner' }
  ].filter((m) => m.value != null);

  const goals = [
    { label: 'Over 1.5', value: over15, kind: 'goals' },
    { label: 'Over 2.5', value: over25, kind: 'goals' },
    { label: 'Under 3.5', value: over35 == null ? null : 100 - over35, kind: 'goals' }
  ].filter((m) => m.value != null);

  const btts = [
    { label: 'BTTS Da', value: bttsYes, kind: 'btts' },
    { label: 'BTTS Nu', value: bttsYes == null ? null : 100 - bttsYes, kind: 'btts' }
  ].filter((m) => m.value != null);

  return { winner, goals, btts };
}

function flattenMarkets(prediction) {
  const group = markets(prediction);
  return [...group.winner, ...group.goals, ...group.btts].filter((m) => m.value >= 0 && m.value <= 100);
}

function bestMarket(prediction, type = 'all') {
  const group = markets(prediction);
  const pool = type === 'winner' ? group.winner : type === 'goals' ? group.goals : type === 'btts' ? group.btts : flattenMarkets(prediction);
  return [...pool].sort((a, b) => b.value - a.value)[0] || null;
}

function computeScore(prediction) {
  if (!prediction) return null;
  const conf = confidencePct(prediction);
  const best = bestMarket(prediction)?.value ?? 0;
  const raw = Math.round(conf * 0.35 + best * 0.65 + (best >= 75 && conf >= 50 ? 4 : 0));
  return Math.max(0, Math.min(100, raw));
}

function level(score) {
  if (score >= 80) return ['RIDICAT', 'badge-high'];
  if (score >= 65) return ['BUN', 'badge-good'];
  if (score >= 50) return ['MEDIU', 'badge-mid'];
  return ['SCĂZUT', 'badge-low'];
}

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString('ro-RO', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return value || '-';
  }
}

function timeBucket(value) {
  const now = new Date();
  const eventDate = new Date(value);
  const diff = eventDate - now;
  const oneDay = 24 * 60 * 60 * 1000;
  if (diff < 0) return 'past';
  if (diff <= oneDay) return '24h';
  if (diff <= oneDay * 3) return '3d';
  return 'later';
}

function matchProbBand(value) {
  if (state.probBand === 'all') return true;
  const [min, max] = state.probBand.split('-').map(Number);
  return value >= min && value < max;
}

function applyFilters() {
  const type = state.type;

  let rows = state.allRows.filter((row) => {
    const bucket = timeBucket(row.date);
    if (state.interval === '24h' && bucket !== '24h') return false;
    if (state.interval === '3d' && !['24h', '3d'].includes(bucket)) return false;
    if (state.interval === 'today') {
      const d = new Date(row.date);
      const now = new Date();
      if (d.toDateString() !== now.toDateString()) return false;
    }

    const best = bestMarket(row.prediction, type);
    return best && matchProbBand(best.value);
  });

  rows = rows.map((row) => {
    const best = bestMarket(row.prediction, type);
    return { ...row, bestFiltered: best };
  });

  rows.sort((a, b) => {
    if (state.sort === 'date') return new Date(a.date) - new Date(b.date);
    if (state.sort === 'score') return b.score - a.score;
    return (b.bestFiltered?.value ?? 0) - (a.bestFiltered?.value ?? 0);
  });

  state.visibleRows = rows;
}

function updateStats() {
  const rows = state.visibleRows;
  el.total.textContent = rows.length;
  el.high.textContent = rows.filter((r) => r.score >= 80).length;
  el.avg.textContent = rows.length ? `${Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length)}` : '0';
  el.topProb.textContent = rows.length ? `${Math.round(Math.max(...rows.map((r) => r.bestFiltered?.value ?? 0)))}%` : '0%';
}

function sectionHtml(title, items) {
  if (!items.length) return '';
  return `
    <div class="market-section">
      <div class="section-title">${title}</div>
      <div class="market-grid">
        ${items.sort((a, b) => b.value - a.value).map((m) => `
          <div class="market-chip ${m.value >= 70 ? 'strong' : ''}">
            <span>${esc(m.label)}</span>
            <strong>${m.value.toFixed(1)}%</strong>
          </div>`).join('')}
      </div>
    </div>`;
}

function render() {
  updateStats();

  if (!state.visibleRows.length) {
    el.out.innerHTML = '<div class="empty-card">Nu există meciuri care să corespundă filtrului ales.</div>';
    return;
  }

  const grouped = state.visibleRows.reduce((acc, row) => {
    const day = new Date(row.date).toLocaleDateString('ro-RO', { weekday: 'long', day: '2-digit', month: '2-digit' });
    acc[day] = acc[day] || [];
    acc[day].push(row);
    return acc;
  }, {});

  el.out.innerHTML = Object.entries(grouped).map(([day, rows]) => `
    <section class="day-block">
      <div class="day-heading">${esc(day)}</div>
      <div class="cards-grid">
        ${rows.map((row) => {
          const [label, badgeClass] = level(row.score);
          const groupedMarkets = markets(row.prediction);
          return `
            <article class="match-card ${badgeClass}">
              <div class="card-top">
                <div>
                  <h3>${esc(row.home)} <span>vs</span> ${esc(row.away)}</h3>
                  <div class="meta">${esc(row.league || 'Necunoscut')} • ${formatDate(row.date)}</div>
                </div>
                <div class="score-box">
                  <span class="score-number">${row.score}</span>
                  <span class="score-label">${label}</span>
                </div>
              </div>

              <div class="summary-grid">
                <div class="summary-card">
                  <span>Pronostic principal</span>
                  <strong>${esc(row.bestFiltered?.label || '-')}</strong>
                </div>
                <div class="summary-card">
                  <span>Probabilitate</span>
                  <strong>${row.bestFiltered ? row.bestFiltered.value.toFixed(1) + '%' : '-'}</strong>
                </div>
                <div class="summary-card">
                  <span>Confidence model</span>
                  <strong>${confidencePct(row.prediction).toFixed(1)}%</strong>
                </div>
              </div>

              ${sectionHtml('1X2', groupedMarkets.winner)}
              ${sectionHtml('Goluri', groupedMarkets.goals)}
              ${sectionHtml('BTTS', groupedMarkets.btts)}
            </article>`;
        }).join('')}
      </div>
    </section>`).join('');
}

async function loadData() {
  hide();
  el.out.innerHTML = '<div class="empty-card">Se încarcă datele locale din repo...</div>';

  try {
    const res = await fetch(`data/latest.json?t=${Date.now()}`);
    if (!res.ok) throw new Error('Fișierul data/latest.json nu este încă generat.');
    const data = await res.json();

    state.allRows = (Array.isArray(data?.matches) ? data.matches : [])
      .map((row) => ({ ...row, score: computeScore(row.prediction) }))
      .filter((row) => row.score != null);

    applyFilters();

    if (data.generated_at) {
      show(`Date generate la: ${formatDate(data.generated_at)} • interval: ${data.date_from || '-'} → ${data.date_to || '-'}`, 'info');
    }

    render();
  } catch (error) {
    state.allRows = [];
    state.visibleRows = [];
    show(error.message || 'Nu am putut încărca datele locale.', 'error');
    render();
  }
}

function bindFilters() {
  el.interval.onchange = () => {
    state.interval = el.interval.value;
    applyFilters();
    render();
  };
  el.type.onchange = () => {
    state.type = el.type.value;
    applyFilters();
    render();
  };
  el.minProb.onchange = () => {
    state.probBand = el.minProb.value;
    applyFilters();
    render();
  };
  el.sort.onchange = () => {
    state.sort = el.sort.value;
    applyFilters();
    render();
  };
}

(function init() {
  bindFilters();
  el.refresh.onclick = loadData;
  loadData();
})();
