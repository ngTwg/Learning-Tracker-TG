/**
 * ThayGiap Learning Tracker - Options/Dashboard Script
 * =====================================================
 * Full statistics dashboard with filtering, search, 
 * chart, and data management.
 */

document.addEventListener('DOMContentLoaded', async () => {
  setupTabNavigation();
  await loadOverviewTab();
  setupVocabFilters();
  setupWrongInputsFilters();
  setupSessionFilters();
  setupHistoryFilters();
  setupSettingsActions();
  setupRvSettings();
});

// ============ Message Helper ============
function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Message error:', chrome.runtime.lastError);
        resolve(null);
      } else {
        resolve(response);
      }
    });
  });
}

// ============ Tab Navigation ============
function setupTabNavigation() {
  const menuItems = document.querySelectorAll('.sidebar-item[data-tab]');
  
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      // Update sidebar active state
      menuItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Update tab content
      const tabId = item.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      const targetTab = document.getElementById(`tab-${tabId}`);
      if (targetTab) {
        targetTab.classList.add('active');
        // Load tab data
        loadTabData(tabId);
      }
    });
  });
}

async function loadTabData(tabId) {
  switch (tabId) {
    case 'overview':     await loadOverviewTab(); break;
    case 'vocab':        await loadVocabTab(); break;
    case 'wrong-inputs': await loadWrongInputsTab(); break;
    case 'review':       await loadReviewTab(); break;
    case 'sessions':     await loadSessionsTab(); break;
    case 'history':      await loadHistoryTab(); break;
    case 'settings':     await loadSettingsTab(); break;
  }
}

// ============ Overview Tab ============
async function loadOverviewTab() {
  // Set date
  const dateEl = document.getElementById('overview-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('vi-VN', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  // Load vocab summaries for overview
  const vocabRes = await sendMessage({ action: 'get_vocab_summaries' });
  const vocabData = vocabRes?.data || {};
  const vocabEntries = Object.values(vocabData);

  // Load session summaries
  const sessionRes = await sendMessage({ action: 'get_session_summaries' });
  const sessionData = sessionRes?.data || {};
  const sessionEntries = Object.values(sessionData);

  // Summary cards
  const mastered = vocabEntries.filter(e => e.mastery === 'mastered').length;
  const totalCorrect = vocabEntries.reduce((a, e) => a + (e.correctAttempts || 0), 0);
  const totalAttempts = vocabEntries.reduce((a, e) => a + (e.totalAttempts || 0), 0);
  const accuracy = totalAttempts > 0 ? Math.round(totalCorrect / totalAttempts * 100) : 0;

  setText('ov-total-words', vocabEntries.length);
  setText('ov-mastered', mastered);
  setText('ov-sessions', sessionEntries.length);
  setText('ov-accuracy', `${accuracy}%`);

  // Weekly chart
  await loadWeeklyChart();

  // Mastery breakdown
  loadMasteryBreakdown(vocabEntries);
}

async function loadWeeklyChart() {
  const res = await sendMessage({ action: 'get_weekly_stats' });
  if (!res?.ok) return;

  const data = res.data;
  const container = document.getElementById('weekly-chart');
  if (!container) return;

  const days = Object.entries(data).reverse(); // Oldest first
  const maxTotal = Math.max(...days.map(([, d]) => d.total), 1);

  container.innerHTML = days.map(([date, stats]) => {
    const d = new Date(date);
    const dayLabel = d.toLocaleDateString('vi-VN', { weekday: 'short' });
    const dateLabel = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    const correctHeight = maxTotal > 0 ? (stats.correct / maxTotal * 100) : 0;
    const wrongHeight = maxTotal > 0 ? (stats.wrong / maxTotal * 100) : 0;

    return `
      <div class="bar-day">
        <div class="bar-count">${stats.total}</div>
        <div class="bar-wrapper">
          <div class="bar-correct" style="height: ${correctHeight}%" title="Đúng: ${stats.correct}"></div>
          <div class="bar-wrong" style="height: ${wrongHeight}%" title="Sai: ${stats.wrong}"></div>
        </div>
        <div class="bar-label">${dayLabel}<br>${dateLabel}</div>
      </div>
    `;
  }).join('');
}

function loadMasteryBreakdown(entries) {
  const counts = { new: 0, learning: 0, reviewing: 0, mastered: 0 };
  entries.forEach(e => counts[e.mastery || 'new']++);
  const total = entries.length || 1;

  const container = document.getElementById('mastery-breakdown');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;gap:0;height:32px;border-radius:16px;overflow:hidden;margin-bottom:12px;">
      ${counts.mastered > 0 ? `<div class="mastery-bar mastered" style="width:${counts.mastered/total*100}%">${counts.mastered}</div>` : ''}
      ${counts.reviewing > 0 ? `<div class="mastery-bar reviewing" style="width:${counts.reviewing/total*100}%">${counts.reviewing}</div>` : ''}
      ${counts.learning > 0 ? `<div class="mastery-bar learning" style="width:${counts.learning/total*100}%">${counts.learning}</div>` : ''}
      ${counts.new > 0 ? `<div class="mastery-bar new" style="width:${counts.new/total*100}%">${counts.new}</div>` : ''}
    </div>
    <div class="mastery-legend">
      <div class="legend-item"><span class="legend-dot mastered"></span> Thành thạo (${counts.mastered})</div>
      <div class="legend-item"><span class="legend-dot reviewing"></span> Ôn tập (${counts.reviewing})</div>
      <div class="legend-item"><span class="legend-dot learning"></span> Đang học (${counts.learning})</div>
      <div class="legend-item"><span class="legend-dot new"></span> Mới (${counts.new})</div>
    </div>
  `;
}

// ============ Vocab Tab ============
let vocabData = {};

async function loadVocabTab() {
  const res = await sendMessage({ action: 'get_vocab_summaries' });
  vocabData = res?.data || {};
  renderVocabTable();
}

function setupVocabFilters() {
  const search = document.getElementById('vocab-search');
  const filter = document.getElementById('vocab-filter');
  const sort = document.getElementById('vocab-sort');

  if (search) search.addEventListener('input', () => renderVocabTable());
  if (filter) filter.addEventListener('change', () => renderVocabTable());
  if (sort) sort.addEventListener('change', () => renderVocabTable());
}

function renderVocabTable() {
  let entries = Object.values(vocabData);

  // Filter
  const searchVal = (document.getElementById('vocab-search')?.value || '').toLowerCase();
  const filterVal = document.getElementById('vocab-filter')?.value || 'all';
  const sortVal = document.getElementById('vocab-sort')?.value || 'recent';

  if (searchVal) {
    entries = entries.filter(e =>
      (e.vietnamese || '').toLowerCase().includes(searchVal) ||
      (e.english || '').toLowerCase().includes(searchVal)
    );
  }

  if (filterVal !== 'all' && filterVal !== 'most-wrong') {
    entries = entries.filter(e => e.mastery === filterVal);
  }

  // Sort
  switch (sortVal) {
    case 'recent':
      entries.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
      break;
    case 'wrong-desc':
      entries.sort((a, b) => (b.wrongAttempts || 0) - (a.wrongAttempts || 0));
      break;
    case 'alpha':
      entries.sort((a, b) => (a.vietnamese || '').localeCompare(b.vietnamese || '', 'vi'));
      break;
    case 'mastery':
      const order = { mastered: 4, reviewing: 3, learning: 2, new: 1 };
      entries.sort((a, b) => (order[b.mastery] || 0) - (order[a.mastery] || 0));
      break;
  }

  if (filterVal === 'most-wrong') {
    entries = entries.filter(e => (e.wrongAttempts || 0) > 0);
    entries.sort((a, b) => (b.wrongAttempts || 0) - (a.wrongAttempts || 0));
  }

  const tbody = document.getElementById('vocab-tbody');
  const emptyEl = document.getElementById('vocab-empty');
  const tableEl = document.querySelector('.table-container');

  if (entries.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (tableEl) tableEl.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (tableEl) tableEl.style.display = 'block';

  if (!tbody) return;

  tbody.innerHTML = entries.map(entry => {
    const masteryClass = entry.mastery || 'new';
    const masteryLabel = {
      new: 'Mới',
      learning: 'Đang học',
      reviewing: 'Ôn tập',
      mastered: 'Thành thạo'
    }[masteryClass] || 'Mới';

    const lastSeen = entry.lastSeen ? getRelativeTime(entry.lastSeen) : '-';

    return `
      <tr>
        <td><strong>${escapeHtml(entry.vietnamese || '')}</strong></td>
        <td style="color:var(--accent-blue)">${escapeHtml(entry.english || '?')}</td>
        <td>${entry.totalAttempts || 0}</td>
        <td style="color:var(--accent-green)">${entry.correctAttempts || 0}</td>
        <td style="color:var(--accent-red)">${entry.wrongAttempts || 0}</td>
        <td>${entry.avgAttemptsBeforeCorrect || '-'}</td>
        <td>${entry.streakCorrect || 0} 🔥</td>
        <td><span class="badge ${masteryClass}">${masteryLabel}</span></td>
        <td style="color:var(--text-muted)">${lastSeen}</td>
      </tr>
    `;
  }).join('');
}

// ============ Wrong Inputs Tab ============
let wrongInputsData = {};

async function loadWrongInputsTab() {
  const res = await sendMessage({ action: 'get_vocab_summaries' });
  wrongInputsData = res?.data || {};
  renderWrongInputs();
}

function setupWrongInputsFilters() {
  const search = document.getElementById('wi-search');
  const sort = document.getElementById('wi-sort');
  if (search) search.addEventListener('input', renderWrongInputs);
  if (sort) sort.addEventListener('change', renderWrongInputs);
}

function renderWrongInputs() {
  // Include words wrong >= 1 even if no wrongInputHistory yet (older data)
  let entries = Object.values(wrongInputsData)
    .filter(e => (e.wrongAttempts || 0) > 0);

  const searchVal = (document.getElementById('wi-search')?.value || '').toLowerCase();
  const sortVal = document.getElementById('wi-sort')?.value || 'wrong-desc';

  if (searchVal) {
    entries = entries.filter(e =>
      (e.vietnamese || '').toLowerCase().includes(searchVal) ||
      (e.english || '').toLowerCase().includes(searchVal) ||
      (e.wrongInputHistory || []).some(h => h.typed.toLowerCase().includes(searchVal))
    );
  }

  switch (sortVal) {
    case 'wrong-desc': entries.sort((a, b) => (b.wrongAttempts || 0) - (a.wrongAttempts || 0)); break;
    case 'recent':     entries.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)); break;
    case 'alpha':      entries.sort((a, b) => (a.vietnamese || '').localeCompare(b.vietnamese || '', 'vi')); break;
  }

  const listEl = document.getElementById('wi-list');
  const emptyEl = document.getElementById('wi-empty');
  const summaryEl = document.getElementById('wi-summary');

  const totalWords = entries.length;
  const totalWrongInstances = entries.reduce((a, e) => a + (e.wrongAttempts || 0), 0);
  const inReview = entries.filter(e => e.inReviewList).length;
  if (summaryEl) {
    summaryEl.innerHTML = [
      `<span class="wi-stat-chip">❌ ${totalWords} từ từng sai</span>`,
      `<span class="wi-stat-chip">📋 ${totalWrongInstances} lần sai tổng</span>`,
      `<span class="wi-stat-chip" style="color:var(--accent-yellow)">🔁 ${inReview} từ đang ôn</span>`
    ].join('');
  }

  if (entries.length === 0) {
    if (listEl) listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (!listEl) return;

  listEl.innerHTML = entries.map(entry => {
    const history = (entry.wrongInputHistory || []).slice().reverse();
    const isInReview = entry.inReviewList;

    // Deduplicated chips of what user typed wrong (always visible)
    const uniqueTyped = [];
    const seen = new Set();
    for (const h of history) {
      const key = h.typed.toLowerCase();
      if (!seen.has(key)) { seen.add(key); uniqueTyped.push(h.typed); }
    }
    const visibleChips = uniqueTyped.slice(0, 6);
    const extraCount = uniqueTyped.length - visibleChips.length;

    const chipsHtml = visibleChips.length > 0
      ? `<div class="wi-inline-chips">
          <span class="wi-chips-label">Gõ sai:</span>
          ${visibleChips.map(t => `<span class="wi-inline-chip">${escapeHtml(t)}</span>`).join('')}
          ${extraCount > 0 ? `<span class="wi-inline-chip wi-chip-more">+${extraCount} nữa</span>` : ''}
        </div>`
      : `<div class="wi-inline-chips"><em class="wi-no-history">Chưa có lịch sử chi tiết</em></div>`;

    // Full history rows (in expanded body)
    const attemptsHtml = history.length > 0
      ? history.map(h => {
          const time = h.at ? getRelativeTime(h.at) : '';
          const correct = escapeHtml(h.correct || entry.english || '?');
          return `<div class="wi-attempt-row">
            <span class="wi-typed">"${escapeHtml(h.typed)}"</span>
            <span class="wi-arrow">→</span>
            <span class="wi-correct-ans">${correct}</span>
            <span class="wi-attempt-time">${time}</span>
          </div>`;
        }).join('')
      : `<p style="color:var(--text-muted);font-size:13px;">Chưa có chi tiết (dữ liệu cũ).</p>`;

    const inReviewBtn = isInReview
      ? `<button class="btn btn-secondary" style="font-size:12px;padding:6px 12px" onclick="removeFromReview('${escapeHtml(entry.vietnamese || '')}')">✓ Đang ôn tập</button>`
      : `<button class="btn btn-secondary" style="font-size:12px;padding:6px 12px" onclick="addToReview('${escapeHtml(entry.vietnamese || '')}')">+ Thêm vào ôn tập</button>`;

    const reviewBadge = isInReview ? `<span class="wi-review-badge">🔁</span>` : '';

    return `
      <div class="wi-card" id="wi-card-${btoa(encodeURIComponent(entry.vietnamese || '')).slice(0,10)}">
        <div class="wi-card-header" onclick="this.parentElement.classList.toggle('expanded')">
          <div class="wi-card-left">
            <div class="wi-card-info">
              <div class="wi-word-row">
                <span class="wi-word">${escapeHtml(entry.vietnamese || '')}</span>
                <span class="wi-arrow-en">→</span>
                <span class="wi-english">${escapeHtml(entry.english || '?')}</span>
                ${reviewBadge}
              </div>
              ${chipsHtml}
            </div>
          </div>
          <div class="wi-card-right">
            <span class="wi-wrong-count">✗ ${entry.wrongAttempts || 0} lần</span>
            <span class="wi-chevron">▼</span>
          </div>
        </div>
        <div class="wi-card-body">
          <div class="wi-attempts-title">Lịch sử từng lần gõ sai (${history.length} lần)</div>
          <div class="wi-attempts-list">${attemptsHtml}</div>
          <div class="wi-card-actions">${inReviewBtn}</div>
        </div>
      </div>`;
  }).join('');
}



window.addToReview = async function(vietnamese) {
  await sendMessage({ action: 'add_to_review_list', vietnamese });
  await loadWrongInputsTab();
};

window.removeFromReview = async function(vietnamese) {
  await sendMessage({ action: 'mark_review_correct', vietnamese });
  await loadWrongInputsTab();
};

// ============ Review / Flashcard Tab — Full Implementation ============

// ─── Settings State ───────────────────────────────────────────────────
const rvSettings = {
  count:      20,          // number of words (0 = all)
  minWrong:   1,           // min wrong attempts to include
  order:      'shuffle',   // shuffle | wrong-desc | recent | alpha | streak-asc
  direction:  'vi-en',     // vi-en | en-vi | mixed
  mode:       'type',      // type | choice4 | reveal
  mastery:    'all',       // all | new | learning | reviewing | not-mastered
  autoAdvance: 0,          // ms delay (0 = off)
  source:     'review-list' // review-list | all-wrong | all-vocab
};

// ─── Session State ────────────────────────────────────────────────────
let rvQueue       = [];    // [{word, direction}]
let rvDoneIdx     = new Set();
let rvCurIdx      = 0;
let rvSessionStats = { correct: 0, wrong: 0, skip: 0 };
let rvAutoTimer   = null;
let rvAllVocab    = {};    // cache of all vocab summaries

// ─── Initialize Review Tab ───────────────────────────────────────────
async function loadReviewTab() {
  const res = await sendMessage({ action: 'get_vocab_summaries' });
  rvAllVocab = res?.data || {};
  setupRvSettings();
  updateRvPreviewCount();
  showRvPanel('settings');
}

// ─── Settings Panel: button group interactions ───────────────────────
function setupRvSettings() {
  const groups = {
    'rv-count-group':      'count',
    'rv-min-wrong-group':  'minWrong',
    'rv-order-group':      'order',
    'rv-direction-group':  'direction',
    'rv-mode-group':       'mode',
    'rv-mastery-group':    'mastery',
    'rv-advance-group':    'autoAdvance',
    'rv-source-group':     'source'
  };

  for (const [groupId, key] of Object.entries(groups)) {
    const group = document.getElementById(groupId);
    if (!group) continue;
    group.querySelectorAll('.rv-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.rv-opt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const raw = btn.dataset.val;
        rvSettings[key] = isNaN(raw) ? raw : (raw === '0' && key !== 'count' ? 0 : parseInt(raw));
        // autoAdvance keeps numeric even if 0
        if (key === 'autoAdvance') rvSettings[key] = parseInt(raw);
        if (key === 'count') rvSettings[key] = parseInt(raw);
        updateRvPreviewCount();
      });
    });
  }

  // Start button
  document.getElementById('btn-rv-start')?.addEventListener('click', startRvSession);

  // Shuffle / Reset (top bar) — reuse settings
  document.getElementById('btn-review-shuffle')?.addEventListener('click', () => {
    if (rvQueue.length > 0) { rvQueue = shuffleArray([...rvQueue]); rvDoneIdx.clear(); rvCurIdx = 0; resetRvStats(); renderRvCard(); }
  });
  document.getElementById('btn-review-reset')?.addEventListener('click', () => {
    rvDoneIdx.clear(); rvCurIdx = 0; resetRvStats(); if (rvQueue.length > 0) renderRvCard();
  });

  // Back to settings buttons
  document.getElementById('btn-rv-back-settings')?.addEventListener('click',  () => showRvPanel('settings'));
  document.getElementById('btn-rv-done-settings')?.addEventListener('click',  () => showRvPanel('settings'));
  document.getElementById('btn-review-restart')?.addEventListener('click', () => {
    rvDoneIdx.clear(); rvCurIdx = 0; resetRvStats(); renderRvCard();
  });

  // Flashcard actions
  document.getElementById('fc-check')?.addEventListener('click', checkRvTypeAnswer);
  document.getElementById('fc-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') checkRvTypeAnswer(); });
  document.getElementById('fc-skip')?.addEventListener('click', () => rvSkip());
  document.getElementById('fc-hint-btn')?.addEventListener('click', showRvHint);

  // Choice4 skip
  document.getElementById('fc-skip-choice')?.addEventListener('click', () => rvSkip());

  // Reveal mode
  document.getElementById('fc-reveal-btn')?.addEventListener('click', () => {
    const word = rvQueue[rvCurIdx]?.word;
    const isEnVi = rvQueue[rvCurIdx]?.direction === 'en-vi';
    const ans = isEnVi ? word?.vietnamese : word?.english;
    const ipa = (!isEnVi && word?.ipa) ? word.ipa : null;
    
    const ra = document.getElementById('fc-reveal-answer');
    if (ra) { 
      ra.innerHTML = `${escapeHtml(ans || '?')} ${ipa ? `<div style="font-size:16px; font-style:italic; color:var(--text-muted); margin-top:4px; font-weight:normal;">/${escapeHtml(ipa)}/</div>` : ''}`; 
      ra.style.display = 'block'; 
    }
    document.getElementById('fc-reveal-btn').style.display = 'none';
    const sj = document.getElementById('fc-self-judge');
    if (sj) sj.style.display = 'flex';
  });
  document.getElementById('fc-judge-correct')?.addEventListener('click', () => rvRevealJudge(true));
  document.getElementById('fc-judge-wrong')?.addEventListener('click',   () => rvRevealJudge(false));
  document.getElementById('fc-skip-reveal')?.addEventListener('click', () => rvSkip());

  setupRvShortcuts();
}

// ─── Build queue from settings ───────────────────────────────────────
function buildRvQueue() {
  let words = Object.values(rvAllVocab);

  // Source filter
  if (rvSettings.source === 'review-list')  words = words.filter(w => w.inReviewList);
  else if (rvSettings.source === 'all-wrong') words = words.filter(w => (w.wrongAttempts || 0) > 0);
  // all-vocab: use all

  // Min wrong filter
  if (rvSettings.minWrong > 0) words = words.filter(w => (w.wrongAttempts || 0) >= rvSettings.minWrong);

  // Mastery filter
  if (rvSettings.mastery !== 'all') {
    if (rvSettings.mastery === 'not-mastered') words = words.filter(w => (w.masteryLevel || 'new') !== 'mastered');
    else words = words.filter(w => (w.masteryLevel || 'new') === rvSettings.mastery);
  }

  // Order
  switch (rvSettings.order) {
    case 'shuffle':    words = shuffleArray([...words]); break;
    case 'wrong-desc': words.sort((a,b) => (b.wrongAttempts||0) - (a.wrongAttempts||0)); break;
    case 'recent':     words.sort((a,b) => (b.lastSeen||0) - (a.lastSeen||0)); break;
    case 'alpha':      words.sort((a,b) => (a.vietnamese||'').localeCompare(b.vietnamese||'', 'vi')); break;
    case 'streak-asc': words.sort((a,b) => (a.streak||0) - (b.streak||0)); break;
  }

  // Limit count
  if (rvSettings.count > 0) words = words.slice(0, rvSettings.count);

  // Assign direction per card
  return words.map(word => {
    let dir = rvSettings.direction;
    if (dir === 'mixed') dir = Math.random() > 0.5 ? 'vi-en' : 'en-vi';
    return { word, direction: dir };
  });
}

function updateRvPreviewCount() {
  const count = buildRvQueue().length;
  const el = document.getElementById('rv-preview-count');
  if (el) el.textContent = count;
}

// ─── Start session ────────────────────────────────────────────────────
function startRvSession() {
  rvQueue = buildRvQueue();
  rvDoneIdx.clear();
  rvCurIdx = 0;
  resetRvStats();

  if (rvQueue.length === 0) { showRvPanel('empty'); return; }

  updateRvSessionBar();
  showRvPanel('card');
  renderRvCard();
}

function resetRvStats() { rvSessionStats = { correct: 0, wrong: 0, skip: 0 }; updateRvSessionBar(); }

function updateRvSessionBar() {
  setText('rv-stat-total',   rvQueue.length);
  setText('rv-stat-correct', rvSessionStats.correct);
  setText('rv-stat-wrong',   rvSessionStats.wrong);
  setText('rv-stat-skip',    rvSessionStats.skip);
}

// ─── Panel visibility ─────────────────────────────────────────────────
function showRvPanel(which) {
  // Hide all
  ['rv-settings-panel','rv-session-bar','review-progress-wrap','review-flashcard','review-done','review-empty'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  if (which === 'settings') {
    show('rv-settings-panel');
  } else if (which === 'card') {
    show('rv-session-bar');
    show('review-progress-wrap');
    show('review-flashcard');
  } else if (which === 'done') {
    show('rv-session-bar');
    show('review-progress-wrap');
    show('review-done');
  } else if (which === 'empty') {
    show('rv-settings-panel');
    show('review-empty');
  }
}

function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }

// ─── Render Card ──────────────────────────────────────────────────────
function renderRvCard() {
  clearRvAutoAdvance();

  // Find next not-done card
  let found = -1;
  for (let i = 0; i < rvQueue.length; i++) {
    const idx = (rvCurIdx + i) % rvQueue.length;
    if (!rvDoneIdx.has(idx)) { found = idx; break; }
  }

  const done = rvDoneIdx.size;
  const total = rvQueue.length;
  setText('review-progress-text', `${done} / ${total} hoàn thành`);
  setText('review-remaining', `${total - done} còn lại`);
  const fill = document.getElementById('review-progress-fill');
  if (fill) fill.style.width = `${total > 0 ? (done/total*100) : 0}%`;

  if (found === -1) {
    // All done
    const acc = total > 0 ? Math.round(rvSessionStats.correct / total * 100) : 0;
    setText('review-done-text', `Hoàn thành ${total} từ! Độ chính xác: ${acc}%`);
    const doneStats = document.getElementById('rv-done-stats');
    if (doneStats) {
      doneStats.innerHTML = [
        `<div class="rv-done-stat stat-correct"><div class="rv-done-stat-val">${rvSessionStats.correct}</div><div class="rv-done-stat-lbl">Đúng</div></div>`,
        `<div class="rv-done-stat stat-wrong"><div class="rv-done-stat-val">${rvSessionStats.wrong}</div><div class="rv-done-stat-lbl">Sai</div></div>`,
        `<div class="rv-done-stat stat-skip"><div class="rv-done-stat-val">${rvSessionStats.skip}</div><div class="rv-done-stat-lbl">Bỏ qua</div></div>`,
        `<div class="rv-done-stat stat-accuracy"><div class="rv-done-stat-val">${acc}%</div><div class="rv-done-stat-lbl">Chính xác</div></div>`
      ].join('');
    }
    showRvPanel('done');
    fireConfetti();
    return;
  }

  rvCurIdx = found;
  const { word, direction } = rvQueue[rvCurIdx];

  // Direction label + question word
  const labelEl = document.getElementById('fc-direction-label');
  const fcWord  = document.getElementById('fc-vietnamese');
  const ipaEl   = document.getElementById('fc-ipa');
  
  if (direction === 'en-vi') {
    if (labelEl) labelEl.textContent = 'Tiếng Anh (nghĩa là gì?)';
    if (fcWord)  fcWord.textContent   = word.english || '';
    if (ipaEl) {
      if (word.ipa) { ipaEl.textContent = `/${word.ipa}/`; ipaEl.style.display = 'block'; }
      else { ipaEl.style.display = 'none'; }
    }
  } else {
    if (labelEl) labelEl.textContent = 'Nghĩa tiếng Việt';
    if (fcWord)  fcWord.textContent   = word.vietnamese || '';
    if (ipaEl)   ipaEl.style.display  = 'none';
  }

  const audioBtn = document.getElementById('fc-audio');
  if (audioBtn) {
    if (direction === 'en-vi') {
      audioBtn.style.display = ''; // or block/flex depending on parent
      audioBtn.onclick = () => playAudio(word.english, 'en-US');
    } else {
      audioBtn.style.display = 'none';
      audioBtn.onclick = null;
    }
  }


  const wrongBadge = document.getElementById('fc-wrong-count');
  if (wrongBadge) wrongBadge.textContent = word.wrongAttempts > 0 ? `✗ đã sai ${word.wrongAttempts} lần` : '';

  // Reset hint and feedback
  const hintEl = document.getElementById('fc-hint');
  if (hintEl) hintEl.textContent = '';
  
  const fb = document.getElementById('fc-feedback');
  if (fb) fb.style.display = 'none';

  // Mode-specific UI
  const typeArea    = document.getElementById('fc-type-area');
  const choiceArea  = document.getElementById('fc-choices-area');
  const revealArea  = document.getElementById('fc-reveal-area');
  [typeArea, choiceArea, revealArea].forEach(el => { if (el) el.style.display = 'none'; });

  if (rvSettings.mode === 'type') {
    if (typeArea) typeArea.style.display = '';
    const inp = document.getElementById('fc-input');
    if (inp) { inp.value = ''; inp.className = 'fc-input'; inp.disabled = false; setTimeout(() => inp.focus(), 80); }
    const cb = document.getElementById('fc-check');
    if (cb) { cb.textContent = '✓ Kiểm tra'; cb.onclick = checkRvTypeAnswer; }

  } else if (rvSettings.mode === 'choice4') {
    if (choiceArea) choiceArea.style.display = '';
    renderChoice4(word, direction);

  } else if (rvSettings.mode === 'reveal') {
    if (revealArea) revealArea.style.display = '';
    const ra  = document.getElementById('fc-reveal-answer');
    const sj  = document.getElementById('fc-self-judge');
    const rb  = document.getElementById('fc-reveal-btn');
    if (ra)  { ra.textContent = ''; ra.style.display = 'none'; }
    if (sj)  sj.style.display = 'none';
    if (rb)  rb.style.display = '';
  }

  // Past wrong chips
  const pastEl = document.getElementById('fc-past-wrongs');
  const hist = (word.wrongInputHistory || []).slice(-5).reverse();
  if (pastEl && hist.length > 0) {
    pastEl.innerHTML = `<div class="fc-past-wrongs-title">Từng gõ sai:</div>
      <div class="fc-past-chips">${hist.map(h => `<span class="fc-past-chip">${escapeHtml(h.typed)}</span>`).join('')}</div>`;
  } else if (pastEl) { pastEl.innerHTML = ''; }
}

// ─── Type mode ────────────────────────────────────────────────────────
function checkRvTypeAnswer() {
  const input = document.getElementById('fc-input');
  const feedback = document.getElementById('fc-feedback');
  if (!input || !feedback) return;

  const userAnswer = input.value.trim().toLowerCase();
  if (!userAnswer) { input.focus(); return; }

  const { word, direction } = rvQueue[rvCurIdx];
  const correctRaw = direction === 'en-vi' ? word.vietnamese : word.english;
  const correct = (correctRaw || '').trim().toLowerCase();

  // Normalize: strip parenthetical hints, accept typo ≤1 for longer words
  const normalize = s => s.replace(/\(.*?\)/g, '').replace(/[_\s]+/g, ' ').trim();
  const normUser = normalize(userAnswer);
  const normCorr = normalize(correct);

  const isCorrect = normUser === normCorr ||
    (normCorr.length > 3 && levenshtein(normUser, normCorr) <= 1);

  input.disabled = true;

  if (isCorrect) {
    const ipaStr = (direction === 'vi-en' && word.ipa) ? `<span style="font-style:italic;color:var(--text-muted);margin-left:8px;font-weight:normal;">/${escapeHtml(word.ipa)}/</span>` : '';
    input.classList.add('fc-correct');
    feedback.className = 'fc-feedback correct-fb';
    feedback.innerHTML = `✅ Chính xác! <span class="fc-correct-word">${escapeHtml(correctRaw || '')}</span>${ipaStr}`;
    feedback.style.display = 'block';
    rvSessionStats.correct++;
    if (!rvDoneIdx.has(rvCurIdx)) rvDoneIdx.add(rvCurIdx);
    if (!rvQueue[rvCurIdx].graded) {
      sendMessage({ action: 'sm2_review', vietnamese: word.vietnamese, quality: 4 });
      rvQueue[rvCurIdx].graded = true;
    }

    const cb = document.getElementById('fc-check');
    if (cb) { cb.textContent = '→ Tiếp theo'; cb.onclick = rvNextCard; }
    updateRvSessionBar();

    if (rvSettings.autoAdvance > 0) {
      rvAutoTimer = setTimeout(rvNextCard, rvSettings.autoAdvance);
    }
  } else {
    const ipaStr = (direction === 'vi-en' && word.ipa) ? `<span style="font-style:italic;color:var(--text-muted);margin-left:8px;font-weight:normal;">/${escapeHtml(word.ipa)}/</span>` : '';
    input.classList.add('fc-wrong');
    feedback.className = 'fc-feedback wrong-fb';
    feedback.innerHTML = `❌ Sai! Đáp án: <span class="fc-correct-word">${escapeHtml(correctRaw || '')}</span>${ipaStr}`;
    feedback.style.display = 'block';
    rvSessionStats.wrong++;
    if (!rvQueue[rvCurIdx].graded) {
      sendMessage({ action: 'sm2_review', vietnamese: word.vietnamese, quality: 1 });
      rvQueue[rvCurIdx].graded = true;
    }
    updateRvSessionBar();

    const cb = document.getElementById('fc-check');
    if (cb) { cb.textContent = '→ Thử lại'; cb.onclick = () => {
      input.value = '';
      input.className = 'fc-input';
      input.disabled = false;
      feedback.style.display = 'none';
      cb.textContent = '✓ Kiểm tra';
      cb.onclick = checkRvTypeAnswer;
      input.focus();
    }; }
  }
}

// ─── Choice4 mode ─────────────────────────────────────────────────────
function renderChoice4(word, direction) {
  const grid = document.getElementById('fc-choices-grid');
  if (!grid) return;

  const correct = direction === 'en-vi' ? word.vietnamese : word.english;

  // 3 random distractors from vocab
  const allWords = Object.values(rvAllVocab).filter(w => {
    const val = direction === 'en-vi' ? w.vietnamese : w.english;
    return val && val !== correct;
  });
  const distractors = shuffleArray(allWords).slice(0, 3).map(w => direction === 'en-vi' ? w.vietnamese : w.english);
  const options = shuffleArray([correct, ...distractors]);

  grid.innerHTML = options.map((opt, i) => {
    const safeOpt = escapeHtml(opt).replace(/"/g, '&quot;');
    return `
    <button class="fc-choice-btn" data-idx="${i}" data-val="${safeOpt}">
      <span class="key-hint" style="margin-right:8px; margin-left:0;">${i+1}</span>
      ${escapeHtml(opt)}
    </button>`;
  }).join('');

  document.querySelectorAll('.fc-choice-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      handleChoice4(this.dataset.val, correct);
    });
  });
}

window.handleChoice4 = function(selected, correct) {
  const isCorrect = selected.trim().toLowerCase() === correct.trim().toLowerCase();
  const { word, direction } = rvQueue[rvCurIdx];

  // Disable all buttons and highlight
  document.querySelectorAll('.fc-choice-btn').forEach(btn => {
    btn.disabled = true;
    const btnVal = btn.dataset.val || '';
    if (btnVal.trim().toLowerCase() === correct.trim().toLowerCase()) {
      btn.classList.add('correct-choice');
    } else if (btnVal.trim().toLowerCase() === selected.trim().toLowerCase() && !isCorrect) {
      btn.classList.add('wrong-choice');
    }
  });

  const feedback = document.getElementById('fc-feedback');
  const correctRaw = direction === 'en-vi' ? word.vietnamese : word.english;
  const ipaStr = (direction === 'vi-en' && word.ipa) ? `<span style="font-style:italic;color:var(--text-muted);margin-left:8px;font-weight:normal;">/${escapeHtml(word.ipa)}/</span>` : '';

  if (isCorrect) {
    rvSessionStats.correct++;
    if (!rvDoneIdx.has(rvCurIdx)) rvDoneIdx.add(rvCurIdx);
    if (!rvQueue[rvCurIdx].graded) {
      sendMessage({ action: 'sm2_review', vietnamese: word.vietnamese, quality: 4 });
      rvQueue[rvCurIdx].graded = true;
    }
    
    if (feedback) {
      feedback.className = 'fc-feedback correct-fb';
      feedback.innerHTML = `✅ Chính xác! <span class="fc-correct-word">${escapeHtml(correctRaw || '')}</span>${ipaStr}`;
      feedback.style.display = 'block';
    }
  } else {
    rvSessionStats.wrong++;
    if (!rvQueue[rvCurIdx].graded) {
      sendMessage({ action: 'sm2_review', vietnamese: word.vietnamese, quality: 1 });
      rvQueue[rvCurIdx].graded = true;
    }

    if (feedback) {
      feedback.className = 'fc-feedback wrong-fb';
      feedback.innerHTML = `❌ Sai! Đáp án: <span class="fc-correct-word">${escapeHtml(correctRaw || '')}</span>${ipaStr}`;
      feedback.style.display = 'block';
    }
  }
  updateRvSessionBar();

  const delay = rvSettings.autoAdvance > 0 ? rvSettings.autoAdvance : 1400;
  rvAutoTimer = setTimeout(rvNextCard, delay);
};

// ─── Reveal mode ──────────────────────────────────────────────────────
function rvRevealJudge(remembered) {
  const { word } = rvQueue[rvCurIdx];
  if (remembered) {
    rvSessionStats.correct++;
    if (!rvDoneIdx.has(rvCurIdx)) rvDoneIdx.add(rvCurIdx);
    if (!rvQueue[rvCurIdx].graded) {
      sendMessage({ action: 'sm2_review', vietnamese: word.vietnamese, quality: 4 });
      rvQueue[rvCurIdx].graded = true;
    }
  } else {
    rvSessionStats.wrong++;
    if (!rvQueue[rvCurIdx].graded) {
      sendMessage({ action: 'sm2_review', vietnamese: word.vietnamese, quality: 1 });
      rvQueue[rvCurIdx].graded = true;
    }
  }
  updateRvSessionBar();
  const delay = rvSettings.autoAdvance > 0 ? rvSettings.autoAdvance : 900;
  rvAutoTimer = setTimeout(rvNextCard, delay);
}

// ─── Navigation ───────────────────────────────────────────────────────
function rvNextCard() {
  clearRvAutoAdvance();
  rvCurIdx++;
  renderRvCard();
}

function rvSkip() {
  clearRvAutoAdvance();
  rvSessionStats.skip++;
  updateRvSessionBar();
  rvCurIdx++;
  renderRvCard();
}

function clearRvAutoAdvance() {
  if (rvAutoTimer) { clearTimeout(rvAutoTimer); rvAutoTimer = null; }
}

// ─── Hint ─────────────────────────────────────────────────────────────
function showRvHint() {
  const { word, direction } = rvQueue[rvCurIdx] || {};
  if (!word) return;
  const correct = direction === 'en-vi' ? word.vietnamese : word.english;
  const hint = (correct || '').split('').map((c, i) => i === 0 ? c : (c === ' ' ? ' ' : '_')).join('');
  const hintEl = document.getElementById('fc-hint');
  if (hintEl) hintEl.textContent = hint;
}




// ============ Helpers ============
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] :
        1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

// --- Stage 1 Upgrades: Audio, Gamification & Hotkeys ---
function playAudio(text, lang) {
  if (!text || !window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function fireConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;

  const pieces = [];
  const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800', '#FF5722'];

  for (let i = 0; i < 100; i++) {
    pieces.push({
      x: canvas.width / 2,
      y: canvas.height / 2 + 50,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 1) * 20 - 5,
      size: Math.random() * 10 + 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10
    });
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;
    pieces.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.5; // gravity
      p.rotation += p.rotationSpeed;
      if (p.y < canvas.height) active = true;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });

    if (active) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  animate();
}

function setupRvShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Only act if Review Flashcard is visible
    const fc = document.getElementById('review-flashcard');
    if (!fc || fc.style.display === 'none') return;
    
    // Ignore if user is typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (rvSettings.mode === 'reveal') {
      const revealBtn = document.getElementById('fc-reveal-btn');
      const sjGroup = document.getElementById('fc-self-judge');
      
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        // If reveal button is visible, click it
        if (revealBtn && revealBtn.style.display !== 'none') {
          revealBtn.click();
        } else if (sjGroup && sjGroup.style.display !== 'none') {
          document.getElementById('fc-judge-correct')?.click();
        }
      } else if (sjGroup && sjGroup.style.display !== 'none') {
        if (e.key === '1') { e.preventDefault(); document.getElementById('fc-judge-wrong')?.click(); }
        if (e.key === '2') { e.preventDefault(); document.getElementById('fc-judge-correct')?.click(); }
      }
    } else if (rvSettings.mode === 'choice4') {
      if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const btns = document.querySelectorAll('.fc-choice-btn');
        const idx = parseInt(e.key) - 1;
        if (btns[idx] && !btns[idx].disabled) btns[idx].click();
      }
    }
  });
}

// ============ Sessions Tab ============
let sessionData = {};

async function loadSessionsTab() {
  const res = await sendMessage({ action: 'get_session_summaries' });
  sessionData = res?.data || {};
  renderSessions();
}

function setupSessionFilters() {
  const filter = document.getElementById('session-filter-type');
  if (filter) filter.addEventListener('change', () => renderSessions());
}

function renderSessions() {
  let entries = Object.values(sessionData);
  const filterVal = document.getElementById('session-filter-type')?.value || 'all';

  if (filterVal !== 'all') {
    entries = entries.filter(e => e.partType === filterVal);
  }

  entries.sort((a, b) => (b.lastPracticed || 0) - (a.lastPracticed || 0));

  const container = document.getElementById('sessions-grid');
  const emptyEl = document.getElementById('sessions-empty');

  if (entries.length === 0) {
    if (container) container.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (container) container.style.display = 'grid';
  if (emptyEl) emptyEl.style.display = 'none';

  if (!container) return;

  container.innerHTML = entries.map(session => {
    const total = (session.correctWords || 0) + (session.wrongWords || 0);
    const accuracy = total > 0 ? Math.round(session.correctWords / total * 100) : 0;
    const partType = session.partType || 'unknown';
    const partLabel = { practice: 'Luyện tập', test: 'Kiểm tra', vocab: 'Vocab', unknown: 'Khác' }[partType] || 'Khác';
    const lastDate = session.lastPracticed ? getRelativeTime(session.lastPracticed) : '-';
    const datesCount = (session.dates || []).length;

    return `
      <div class="session-card">
        <div class="session-card-header">
          <div>
            <div class="session-card-title">${escapeHtml(session.currentItem || session.lessonTitle || 'Unknown')}</div>
            <div class="session-card-subtitle">${escapeHtml(session.sessionTitle || '')}</div>
          </div>
          <span class="type-badge ${partType}">${partLabel}</span>
        </div>
        <div class="session-card-stats">
          <div class="session-stat">
            <div class="session-stat-value">${accuracy}%</div>
            <div class="session-stat-label">Chính xác</div>
          </div>
          <div class="session-stat correct">
            <div class="session-stat-value">${session.correctWords || 0}</div>
            <div class="session-stat-label">Đúng</div>
          </div>
          <div class="session-stat wrong">
            <div class="session-stat-value">${session.wrongWords || 0}</div>
            <div class="session-stat-label">Sai</div>
          </div>
        </div>
        <div class="session-card-footer">
          <span>📅 ${datesCount} ngày</span>
          <span>🔄 ${session.attempts || 0} lượt</span>
          <span>🕐 ${lastDate}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ============ History Tab ============
let historyEvents = [];
let historyPage = 0;
const EVENTS_PER_PAGE = 50;

async function loadHistoryTab() {
  const dateInput = document.getElementById('history-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  await fetchHistoryEvents();
}

function setupHistoryFilters() {
  const dateInput = document.getElementById('history-date');
  const typeSelect = document.getElementById('history-type');

  if (dateInput) dateInput.addEventListener('change', () => { historyPage = 0; fetchHistoryEvents(); });
  if (typeSelect) typeSelect.addEventListener('change', () => { historyPage = 0; fetchHistoryEvents(); });
}

async function fetchHistoryEvents() {
  const date = document.getElementById('history-date')?.value;
  const type = document.getElementById('history-type')?.value;

  const filters = {};
  if (date) filters.date = date;
  if (type && type !== 'all') filters.type = type;

  const res = await sendMessage({ action: 'get_events', filters });
  historyEvents = res?.data || [];
  historyEvents.reverse(); // Newest first

  renderHistoryEvents();
}

function renderHistoryEvents() {
  const startIdx = historyPage * EVENTS_PER_PAGE;
  const pageEvents = historyEvents.slice(startIdx, startIdx + EVENTS_PER_PAGE);

  const container = document.getElementById('event-list');
  const emptyEl = document.getElementById('history-empty');

  if (historyEvents.length === 0) {
    if (container) container.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (!container) return;

  const icons = {
    answer_result: '📝',
    answer_attempt: '⌨️',
    submit_click: '🔘',
    lesson_open: '📖',
    lesson_close: '🚪',
    mode_switch: '🔄',
    round_switch: '🔁',
    score_detected: '🏆'
  };

  container.innerHTML = pageEvents.map(event => {
    const icon = icons[event.type] || '📌';
    const time = new Date(event.timestamp).toLocaleTimeString('vi-VN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    let title = event.type;
    let detail = '';
    let resultHtml = '';

    if (event.type === 'answer_result' && event.data) {
      title = event.data.vietnamese || 'Trả lời';
      detail = `Nhập: "${escapeHtml(event.data.userInput || '')}" | Đúng: ${escapeHtml(event.data.english || event.data.correctAnswer || '?')}`;
      const isCorrect = event.data.isCorrect;
      resultHtml = `<span class="event-result ${isCorrect ? 'correct' : 'wrong'}">${isCorrect ? '✓' : '✗'}</span>`;
    } else if (event.type === 'submit_click' && event.data) {
      title = `Bấm: ${event.data.buttonText || 'Button'}`;
      detail = `Đúng: ${event.data.sessionCorrect || 0} | Sai: ${event.data.sessionWrong || 0}`;
    } else if (event.type === 'lesson_open') {
      title = 'Mở bài';
      detail = event.context?.lessonTitle || event.context?.url || '';
    } else if (event.type === 'score_detected' && event.data) {
      title = `Điểm: ${event.data.score}đ`;
      detail = event.data.label || '';
      resultHtml = `<span class="event-result correct">${event.data.score}đ</span>`;
    } else if (event.type === 'mode_switch' && event.data) {
      title = `Chuyển mode: ${event.data.buttonText || ''}`;
    }

    return `
      <div class="event-item">
        <span class="event-icon">${icon}</span>
        <div class="event-info">
          <div class="event-title">${escapeHtml(title)}</div>
          <div class="event-detail">${detail}</div>
        </div>
        ${resultHtml}
        <span class="event-time">${time}</span>
      </div>
    `;
  }).join('');

  // Pagination
  renderPagination();
}

function renderPagination() {
  const container = document.getElementById('history-pagination');
  if (!container) return;

  const totalPages = Math.ceil(historyEvents.length / EVENTS_PER_PAGE);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '';
  for (let i = 0; i < totalPages; i++) {
    html += `<button class="${i === historyPage ? 'active' : ''}" data-page="${i}">${i + 1}</button>`;
  }
  container.innerHTML = html;

  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      historyPage = parseInt(btn.dataset.page);
      renderHistoryEvents();
    });
  });
}

// ============ Settings Tab ============
async function loadSettingsTab() {
  const res = await sendMessage({ action: 'get_settings' });
  const settings = res?.data || {};

  const trackingCheckbox = document.getElementById('setting-tracking');
  if (trackingCheckbox) trackingCheckbox.checked = settings.trackingEnabled !== false;

  // Data stats
  const eventsRes = await sendMessage({ action: 'get_events' });
  const vocabRes = await sendMessage({ action: 'get_vocab_summaries' });
  const sessionRes = await sendMessage({ action: 'get_session_summaries' });

  const statsEl = document.getElementById('data-stats');
  if (statsEl) {
    const eventsCount = (eventsRes?.data || []).length;
    const vocabCount = Object.keys(vocabRes?.data || {}).length;
    const sessionCount = Object.keys(sessionRes?.data || {}).length;

    statsEl.textContent = `📊 ${eventsCount} events | 📝 ${vocabCount} từ vựng | 📅 ${sessionCount} phiên học`;
  }
}

function setupSettingsActions() {
  // Toggle tracking setting
  const trackingCheckbox = document.getElementById('setting-tracking');
  if (trackingCheckbox) {
    trackingCheckbox.addEventListener('change', () => {
      sendMessage({
        action: 'update_settings',
        settings: { trackingEnabled: trackingCheckbox.checked }
      });
    });
  }

  // Export JSON
  const btnExportJSON = document.getElementById('btn-export-json');
  if (btnExportJSON) {
    btnExportJSON.addEventListener('click', async () => {
      const res = await sendMessage({ action: 'export_data' });
      if (res?.ok) downloadFile(
        JSON.stringify(res.data, null, 2),
        `thaygiap-export-${getDateStr()}.json`,
        'application/json'
      );
    });
  }

  // Export CSV
  const btnExportCSV = document.getElementById('btn-export-csv');
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', async () => {
      const res = await sendMessage({ action: 'get_vocab_summaries' });
      if (res?.ok) {
        const entries = Object.values(res.data);
        const headers = ['Vietnamese', 'English', 'Total Attempts', 'Correct', 'Wrong', 'Avg Attempts Before Correct', 'Streak', 'Mastery', 'Last Seen'];
        const rows = entries.map(e => [
          e.vietnamese, e.english, e.totalAttempts, e.correctAttempts,
          e.wrongAttempts, e.avgAttemptsBeforeCorrect, e.streakCorrect,
          e.mastery, e.lastSeen ? new Date(e.lastSeen).toLocaleString('vi-VN') : ''
        ]);

        const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
        downloadFile(csv, `thaygiap-vocab-${getDateStr()}.csv`, 'text/csv');
      }
    });
  }

  // Clear data
  const btnClear = document.getElementById('btn-clear-data');
  if (btnClear) {
    btnClear.addEventListener('click', async () => {
      if (confirm('⚠️ Bạn có chắc muốn XÓA TOÀN BỘ dữ liệu? Hành động này không thể hoàn tác!')) {
        if (confirm('Xác nhận lần cuối: XÓA TẤT CẢ dữ liệu tracking?')) {
          await sendMessage({ action: 'clear_data' });
          alert('✅ Đã xóa toàn bộ dữ liệu.');
          location.reload();
        }
      }
    });
  }
}

// ============ Utility ============
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getRelativeTime(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);

  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min}p trước`;
  if (hr < 24) return `${hr}h trước`;
  if (day < 7) return `${day}d trước`;
  return new Date(timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function getDateStr() {
  return new Date().toISOString().split('T')[0];
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
