/**
 * ThayGiap Learning Tracker - Options/Dashboard Script
 * =====================================================
 * Full statistics dashboard with filtering, search, 
 * chart, and data management.
 */

document.addEventListener('DOMContentLoaded', async () => {
  await loadTheme();
  setupThemeToggle();
  setupTabNavigation();
  setupDeepLinkRouting();
  await loadOverviewTab();
  setupVocabFilters();
  setupWrongInputsFilters();
  setupSessionFilters();
  setupHistoryFilters();
  setupSettingsActions();
  applyInitialRoute();
});

let rvSettingsInitialized = false;
let vocabCompactMode = false;

// ============ Theme Management ============
async function loadTheme() {
  try {
    const result = await chrome.storage.local.get(['theme']);
    const theme = result.theme || 'dark';
    applyTheme(theme);
  } catch (err) {
    console.error('Error loading theme:', err);
  }
}

function applyTheme(theme) {
  const html = document.documentElement;
  const body = document.body;
  const themeIcon = document.getElementById('theme-icon');

  if (theme === 'light') {
    html.classList.add('light-theme');
    body.classList.add('light-theme');
    if (themeIcon) themeIcon.textContent = '☀️';
  } else {
    html.classList.remove('light-theme');
    body.classList.remove('light-theme');
    if (themeIcon) themeIcon.textContent = '🌙';
  }
}

async function toggleTheme() {
  try {
    const result = await chrome.storage.local.get(['theme']);
    const currentTheme = result.theme || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    await chrome.storage.local.set({ theme: newTheme });
    applyTheme(newTheme);
  } catch (err) {
    console.error('Error toggling theme:', err);
  }
}

function setupThemeToggle() {
  const btnTheme = document.getElementById('btn-theme-toggle');
  if (btnTheme) {
    btnTheme.addEventListener('click', toggleTheme);
  }
}

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

function setupDeepLinkRouting() {
  window.addEventListener('hashchange', () => applyInitialRoute());
}

function activateTabById(tabId) {
  const menuItems = document.querySelectorAll('.sidebar-item[data-tab]');
  menuItems.forEach(i => i.classList.toggle('active', i.dataset.tab === tabId));
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.classList.add('active');
  loadTabData(tabId);
}

async function applyInitialRoute() {
  const hash = (location.hash || '').replace('#', '');
  if (!hash) return;

  if (hash === 'review-quick') {
    activateTabById('review');
    await runQuickActionPreset();
    return;
  }

  if (hash === 'offline') {
    activateTabById('offline');
    return;
  }

  if (hash === 'sessions') {
    activateTabById('sessions');
    return;
  }

  const knownTabs = ['overview', 'vocab', 'wrong-inputs', 'review', 'goals', 'weakness', 'offline', 'sessions', 'history', 'settings', 'sentence-forge', 'vocab-dungeon'];
  if (knownTabs.includes(hash)) {
    activateTabById(hash);
  }
}

// ============ Tab Navigation ============
function setupTabNavigation() {
  const menuItems = document.querySelectorAll('.sidebar-item[data-tab]');

  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.dataset.tab;
      if (location.hash !== `#${tabId}`) {
        location.hash = tabId;
      } else {
        activateTabById(tabId);
      }
    });
  });
}

async function loadTabData(tabId) {
  switch (tabId) {
    case 'overview': await loadOverviewTab(); break;
    case 'vocab': await loadVocabTab(); break;
    case 'wrong-inputs': await loadWrongInputsTab(); break;
    case 'review': await loadReviewTab(); break;
    case 'goals': await loadGoalsTab(); break;
    case 'weakness': await loadWeaknessTab(); break;
    case 'offline': await loadOfflineTab(); break;
    case 'sessions': await loadSessionsTab(); break;
    case 'history': await loadHistoryTab(); break;
    case 'settings': await loadSettingsTab(); break;
    case 'sentence-forge': await loadSentenceForgeTab(); break;
    case 'vocab-dungeon': await loadVocabDungeonTab(); break;
    case 'grammar-vault': await loadGrammarVaultTab(); break;
    case 'skill-matrix': await loadSkillMatrixTab(); break;
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
      ${counts.mastered > 0 ? `<div class="mastery-bar mastered" style="width:${counts.mastered / total * 100}%">${counts.mastered}</div>` : ''}
      ${counts.reviewing > 0 ? `<div class="mastery-bar reviewing" style="width:${counts.reviewing / total * 100}%">${counts.reviewing}</div>` : ''}
      ${counts.learning > 0 ? `<div class="mastery-bar learning" style="width:${counts.learning / total * 100}%">${counts.learning}</div>` : ''}
      ${counts.new > 0 ? `<div class="mastery-bar new" style="width:${counts.new / total * 100}%">${counts.new}</div>` : ''}
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
  const settingsRes = await sendMessage({ action: 'get_settings' });
  vocabCompactMode = !!settingsRes?.data?.vocabCompactMode;
  const compactBtn = document.getElementById('btn-vocab-compact');
  if (compactBtn) compactBtn.textContent = `Compact: ${vocabCompactMode ? 'Bật' : 'Tắt'}`;
  applyVocabCompactMode();

  const vocabTabHeader = document.querySelector('#tab-vocab .tab-header');
  if (vocabTabHeader) vocabTabHeader.classList.add('sticky');

  const res = await sendMessage({ action: 'get_vocab_summaries' });
  vocabData = res?.data || {};
  renderVocabTable();
}

function setupVocabFilters() {
  const search = document.getElementById('vocab-search');
  const filter = document.getElementById('vocab-filter');
  const sort = document.getElementById('vocab-sort');
  const compactBtn = document.getElementById('btn-vocab-compact');

  if (search) search.addEventListener('input', () => renderVocabTable());
  if (filter) filter.addEventListener('change', () => renderVocabTable());
  if (sort) sort.addEventListener('change', () => renderVocabTable());
  if (compactBtn) {
    compactBtn.addEventListener('click', async () => {
      vocabCompactMode = !vocabCompactMode;
      compactBtn.textContent = `Compact: ${vocabCompactMode ? 'Bật' : 'Tắt'}`;
      await sendMessage({ action: 'update_settings', settings: { vocabCompactMode } });
      applyVocabCompactMode();
    });
  }
}

function applyVocabCompactMode() {
  const tableContainer = document.querySelector('.table-container');
  if (!tableContainer) return;
  tableContainer.classList.toggle('compact', !!vocabCompactMode);
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
    case 'recent': entries.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)); break;
    case 'alpha': entries.sort((a, b) => (a.vietnamese || '').localeCompare(b.vietnamese || '', 'vi')); break;
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

    const viEncoded = encodeURIComponent(entry.vietnamese || '');
    const inReviewBtn = isInReview
      ? `<button class="btn btn-secondary" style="font-size:12px;padding:6px 12px" onclick="removeFromReview(decodeURIComponent('${viEncoded}'))">✓ Đang ôn tập</button>`
      : `<button class="btn btn-secondary" style="font-size:12px;padding:6px 12px" onclick="addToReview(decodeURIComponent('${viEncoded}'))">+ Thêm vào ôn tập</button>`;

    const reviewBadge = isInReview ? `<span class="wi-review-badge">🔁</span>` : '';

    return `
      <div class="wi-card" id="wi-card-${btoa(encodeURIComponent(entry.vietnamese || '')).slice(0, 10)}">
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
          <div class="wi-card-actions">
            ${inReviewBtn}
            <button class="btn btn-secondary" style="font-size:12px;padding:6px 12px; margin-left:8px;" onclick="generateMnemonic('${viEncoded}', '${encodeURIComponent(entry.english || '?')}', this)">💡 Tạo Mẹo Nhớ</button>
            <div class="mnemonic-result" style="display:none; margin-top:10px; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; font-style:italic; font-size:13px; width:100%; text-align:left;"></div>
          </div>
        </div>
      </div>`;
  }).join('');
}



window.addToReview = async function (vietnamese) {
  await sendMessage({ action: 'add_to_review_list', vietnamese });
  await loadWrongInputsTab();
};

window.removeFromReview = async function (vietnamese) {
  await sendMessage({ action: 'mark_review_correct', vietnamese });
  await loadWrongInputsTab();
};

window.generateMnemonic = async function (viEncoded, enEncoded, btn) {
  const vi = decodeURIComponent(viEncoded);
  const en = decodeURIComponent(enEncoded);
  const resultDiv = btn.nextElementSibling;

  btn.disabled = true;
  btn.textContent = 'Đang phân tích...';
  resultDiv.style.display = 'block';
  resultDiv.textContent = 'Đang tìm mẹo liên tưởng...';

  const prompt = `Hãy đóng vai chuyên gia ngôn ngữ học. Ta cần tạo một câu mẹo liên tưởng (Mnemonic) cực kỳ hài hước và dễ nhớ bằng tiếng Việt để ghi nhớ từ vựng tiếng Anh sau:\n- Từ tiếng Anh: ${en}\n- Nghĩa tiếng Việt: ${vi}\nBạn có thể chơi chữ, mượn âm tương đồng tiếng Việt hoặc chẻ từ thành các phần nhỏ (root/prefix) để kể một câu chuyện siêu ngắn gọn. Chỉ trả về giải thích ngắn.`;

  chrome.runtime.sendMessage({
    action: 'ask_ai',
    aiType: 'grammar', // reuse the built in endpoint
    wordOrContext: prompt
  }, (response) => {
    btn.disabled = false;
    btn.textContent = '💡 Tạo mẹo khác';
    if (!response || response.error) {
      resultDiv.textContent = 'Phản hồi thất bại từ AI: ' + (response?.error || 'Unknown Error');
    } else {
      resultDiv.innerHTML = (response.data || '').replace(/\n/g, '<br>');
    }
  });
};

// ============ Review / Flashcard Tab — Full Implementation ============

// ─── Settings State ───────────────────────────────────────────────────
const rvSettings = {
  count: 20,          // number of words (0 = all)
  minWrong: 1,           // min wrong attempts to include
  order: 'shuffle',   // shuffle | wrong-desc | recent | alpha | streak-asc
  direction: 'vi-en',     // vi-en | en-vi | mixed
  mode: 'type',      // type | choice4 | reveal
  mastery: 'all',       // all | new | learning | reviewing | not-mastered
  autoAdvance: 0,          // ms delay (0 = off)
  source: 'review-list' // review-list | all-wrong | all-vocab
};

// ─── Session State ────────────────────────────────────────────────────
let rvQueue = [];    // [{word, direction}]
let rvDoneIdx = new Set();
let rvCurIdx = 0;
let rvSessionStats = { correct: 0, wrong: 0, skip: 0 };
let rvAutoTimer = null;
let rvAllVocab = {};    // cache of all vocab summaries

// ─── Initialize Review Tab ───────────────────────────────────────────
async function loadReviewTab() {
  const res = await sendMessage({ action: 'get_vocab_summaries' });
  rvAllVocab = res?.data || {};
  setupRvSettings();
  syncRvSettingButtonsUI();
  updateRvPreviewCount();
  showRvPanel('settings');
}

// ─── Settings Panel: button group interactions ───────────────────────
function setupRvSettings() {
  if (rvSettingsInitialized) return;
  rvSettingsInitialized = true;

  const groups = {
    'rv-count-group': 'count',
    'rv-min-wrong-group': 'minWrong',
    'rv-order-group': 'order',
    'rv-direction-group': 'direction',
    'rv-mode-group': 'mode',
    'rv-mastery-group': 'mastery',
    'rv-advance-group': 'autoAdvance',
    'rv-source-group': 'source'
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
  document.getElementById('btn-rv-back-settings')?.addEventListener('click', () => showRvPanel('settings'));
  document.getElementById('btn-rv-done-settings')?.addEventListener('click', () => showRvPanel('settings'));
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
  document.getElementById('fc-judge-wrong')?.addEventListener('click', () => rvRevealJudge(false));
  document.getElementById('fc-skip-reveal')?.addEventListener('click', () => rvSkip());

  setupRvShortcuts();
}

function syncRvSettingButtonsUI() {
  const groupMap = {
    'rv-count-group': rvSettings.count,
    'rv-min-wrong-group': rvSettings.minWrong,
    'rv-order-group': rvSettings.order,
    'rv-direction-group': rvSettings.direction,
    'rv-mode-group': rvSettings.mode,
    'rv-mastery-group': rvSettings.mastery,
    'rv-advance-group': rvSettings.autoAdvance,
    'rv-source-group': rvSettings.source
  };

  Object.entries(groupMap).forEach(([groupId, val]) => {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll('.rv-opt-btn').forEach(btn => {
      btn.classList.toggle('active', String(btn.dataset.val) === String(val));
    });
  });
}

function applyRvPreset(preset) {
  Object.assign(rvSettings, preset || {});
  syncRvSettingButtonsUI();
  updateRvPreviewCount();
}

async function runQuickActionPreset() {
  const settingsRes = await sendMessage({ action: 'get_settings' });
  const preset = settingsRes?.data?.quickActionPreset || '';
  if (!preset) return;

  if (preset === 'review-top10-hard') {
    await loadReviewTab();
    applyRvPreset({
      count: 10,
      minWrong: 1,
      order: 'wrong-desc',
      direction: 'vi-en',
      mode: 'type',
      mastery: 'not-mastered',
      autoAdvance: 1500,
      source: 'all-wrong'
    });
    startRvSession();
  } else if (preset === 'review-hard5') {
    await loadReviewTab();
    applyRvPreset({
      count: 5,
      minWrong: 1,
      order: 'wrong-desc',
      direction: 'vi-en',
      mode: 'type',
      mastery: 'not-mastered',
      autoAdvance: 1000,
      source: 'all-wrong'
    });
    startRvSession();
  } else if (preset === 'review-due-3m') {
    await loadReviewTab();
    applyRvPreset({
      count: 20,
      minWrong: 0,
      order: 'wrong-desc',
      direction: 'mixed',
      mode: 'type',
      mastery: 'not-mastered',
      autoAdvance: 0,
      source: 'review-list'
    });
    startRvSession();
  } else if (preset === 'offline-20') {
    activateTabById('offline');
    await loadOfflineTab();
  }

  await sendMessage({
    action: 'update_settings',
    settings: { quickActionPreset: '' }
  });
}

// ─── Build queue from settings ───────────────────────────────────────
function buildRvQueue() {
  let words = Object.values(rvAllVocab);

  // Source filter
  if (rvSettings.source === 'review-list') words = words.filter(w => w.inReviewList || (w.nextReviewDate && w.nextReviewDate <= Date.now()));
  else if (rvSettings.source === 'all-wrong') words = words.filter(w => (w.wrongAttempts || 0) > 0);
  // all-vocab: use all

  // Min wrong filter
  if (rvSettings.minWrong > 0) words = words.filter(w => (w.wrongAttempts || 0) >= rvSettings.minWrong);

  // Mastery filter
  if (rvSettings.mastery !== 'all') {
    if (rvSettings.mastery === 'not-mastered') words = words.filter(w => (w.mastery || 'new') !== 'mastered');
    else words = words.filter(w => (w.mastery || 'new') === rvSettings.mastery);
  }

  // Order
  switch (rvSettings.order) {
    case 'shuffle': words = shuffleArray([...words]); break;
    case 'wrong-desc': words.sort((a, b) => (b.wrongAttempts || 0) - (a.wrongAttempts || 0)); break;
    case 'recent': words.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)); break;
    case 'alpha': words.sort((a, b) => (a.vietnamese || '').localeCompare(b.vietnamese || '', 'vi')); break;
    case 'streak-asc': words.sort((a, b) => (a.streakCorrect || 0) - (b.streakCorrect || 0)); break;
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
  setText('rv-stat-total', rvQueue.length);
  setText('rv-stat-correct', rvSessionStats.correct);
  setText('rv-stat-wrong', rvSessionStats.wrong);
  setText('rv-stat-skip', rvSessionStats.skip);
}

// ─── Panel visibility ─────────────────────────────────────────────────
function showRvPanel(which) {
  // Hide all
  ['rv-settings-panel', 'rv-session-bar', 'review-progress-wrap', 'review-flashcard', 'review-done', 'review-empty'].forEach(id => {
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
  if (fill) fill.style.width = `${total > 0 ? (done / total * 100) : 0}%`;

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
  const fcWord = document.getElementById('fc-vietnamese');
  const ipaEl = document.getElementById('fc-ipa');

  if (direction === 'en-vi') {
    if (labelEl) labelEl.textContent = 'Tiếng Anh (nghĩa là gì?)';
    if (fcWord) fcWord.textContent = word.english || '';
    if (ipaEl) {
      if (word.ipa) { ipaEl.textContent = `/${word.ipa}/`; ipaEl.style.display = 'block'; }
      else { ipaEl.style.display = 'none'; }
    }
  } else {
    if (labelEl) labelEl.textContent = 'Nghĩa tiếng Việt';
    if (fcWord) fcWord.textContent = word.vietnamese || '';
    if (ipaEl) ipaEl.style.display = 'none';
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
  const typeArea = document.getElementById('fc-type-area');
  const choiceArea = document.getElementById('fc-choices-area');
  const revealArea = document.getElementById('fc-reveal-area');
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
    const ra = document.getElementById('fc-reveal-answer');
    const sj = document.getElementById('fc-self-judge');
    const rb = document.getElementById('fc-reveal-btn');
    if (ra) { ra.textContent = ''; ra.style.display = 'none'; }
    if (sj) sj.style.display = 'none';
    if (rb) rb.style.display = '';
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
    if (cb) {
      cb.textContent = '→ Thử lại'; cb.onclick = () => {
        input.value = '';
        input.className = 'fc-input';
        input.disabled = false;
        feedback.style.display = 'none';
        cb.textContent = '✓ Kiểm tra';
        cb.onclick = checkRvTypeAnswer;
        input.focus();
      };
    }
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
      <span class="key-hint" style="margin-right:8px; margin-left:0;">${i + 1}</span>
      ${escapeHtml(opt)}
    </button>`;
  }).join('');

  document.querySelectorAll('.fc-choice-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      handleChoice4(this.dataset.val, correct);
    });
  });
}

window.handleChoice4 = function (selected, correct) {
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
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] :
        1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
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

// ============ Goals Tab ============
async function loadGoalsTab() {
  const [settingsRes, todayRes, weeklyRes, allEventsRes] = await Promise.all([
    sendMessage({ action: 'get_settings' }),
    sendMessage({ action: 'get_today_stats' }),
    sendMessage({ action: 'get_weekly_stats' }),
    sendMessage({ action: 'get_events' })
  ]);

  const settings = settingsRes?.data || {};
  const todayStats = todayRes?.data || {};
  const weeklyStats = weeklyRes?.data || {};
  const allEvents = allEventsRes?.data || [];

  const dailyGoal = Number(settings.dailyAttemptGoal || 30);
  const weeklyGoal = Number(settings.weeklyAttemptGoal || 180);

  const dailyAttempts = Number(todayStats.totalAttempts || 0);
  const weeklyAttempts = Object.values(weeklyStats).reduce((sum, d) => sum + (d.total || 0), 0);

  const dailyInput = document.getElementById('goal-daily-attempts');
  const weeklyInput = document.getElementById('goal-weekly-attempts');
  if (dailyInput) dailyInput.value = dailyGoal;
  if (weeklyInput) weeklyInput.value = weeklyGoal;

  setText('goal-daily-progress-text', `${dailyAttempts} / ${dailyGoal}`);
  setText('goal-weekly-progress-text', `${weeklyAttempts} / ${weeklyGoal}`);
  setText('goal-learning-streak', calculateLearningStreak(allEvents));

  const dailyPct = dailyGoal > 0 ? Math.min(100, Math.round((dailyAttempts / dailyGoal) * 100)) : 0;
  const weeklyPct = weeklyGoal > 0 ? Math.min(100, Math.round((weeklyAttempts / weeklyGoal) * 100)) : 0;

  const dayBar = document.getElementById('goal-daily-progress-bar');
  const weekBar = document.getElementById('goal-weekly-progress-bar');
  if (dayBar) dayBar.style.width = `${dailyPct}%`;
  if (weekBar) weekBar.style.width = `${weeklyPct}%`;

  const saveBtn = document.getElementById('btn-save-goals');
  if (saveBtn && !saveBtn.dataset.bound) {
    saveBtn.dataset.bound = 'true';
    saveBtn.addEventListener('click', async () => {
      const daily = Math.max(1, Number(document.getElementById('goal-daily-attempts')?.value || 30));
      const weekly = Math.max(1, Number(document.getElementById('goal-weekly-attempts')?.value || 180));
      await sendMessage({
        action: 'update_settings',
        settings: { dailyAttemptGoal: daily, weeklyAttemptGoal: weekly }
      });
      await loadGoalsTab();
    });
  }
}

function calculateLearningStreak(events) {
  const activeDays = new Set(
    (events || [])
      .filter(e => e.type === 'answer_result')
      .map(e => e.date)
      .filter(Boolean)
  );

  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = formatLocalDate(cursor);
    if (!activeDays.has(key)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function formatLocalDate(dateLike) {
  const d = new Date(dateLike);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============ Weakness Tab ============
async function loadWeaknessTab() {
  const res = await sendMessage({ action: 'get_vocab_summaries' });
  const entries = Object.values(res?.data || {}).filter(e => (e.wrongAttempts || 0) > 0);

  const emptyEl = document.getElementById('weakness-empty');
  const gridEl = document.getElementById('weakness-grid');
  const wordListEl = document.getElementById('weakness-word-list');
  if (!gridEl || !wordListEl) return;

  if (entries.length === 0) {
    gridEl.innerHTML = '';
    wordListEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const categoryCount = {};
  const wordInsights = [];

  entries.forEach(entry => {
    const hist = entry.wrongInputHistory || [];
    const localTypes = {};

    if (hist.length === 0) {
      const key = 'Nhầm nghĩa/khác';
      categoryCount[key] = (categoryCount[key] || 0) + (entry.wrongAttempts || 0);
      localTypes[key] = (localTypes[key] || 0) + (entry.wrongAttempts || 0);
    } else {
      hist.forEach(h => {
        const type = classifyWrongPattern(h.typed || '', h.correct || entry.english || '');
        categoryCount[type] = (categoryCount[type] || 0) + 1;
        localTypes[type] = (localTypes[type] || 0) + 1;
      });
    }

    const dominantType = Object.entries(localTypes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Nhầm nghĩa/khác';
    wordInsights.push({
      vietnamese: entry.vietnamese || '',
      english: entry.english || '?',
      wrongAttempts: entry.wrongAttempts || 0,
      dominantType
    });
  });

  const topCategories = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
  gridEl.innerHTML = topCategories.map(([type, count]) => `
    <div class="weakness-card">
      <div class="weakness-card-title">${escapeHtml(type)}</div>
      <div class="weakness-card-value">${count}</div>
    </div>
  `).join('');

  wordInsights.sort((a, b) => b.wrongAttempts - a.wrongAttempts);
  wordListEl.innerHTML = wordInsights.slice(0, 30).map(item => `
    <div class="event-item weakness-word-item">
      <div class="weakness-word-main">
        <div class="weakness-word-title">${escapeHtml(item.vietnamese)} → ${escapeHtml(item.english)}</div>
        <div class="weakness-word-sub">Lỗi chính: ${escapeHtml(item.dominantType)}</div>
      </div>
      <div class="event-result wrong">✗ ${item.wrongAttempts}</div>
    </div>
  `).join('');

  bindClickOnce('btn-weakness-micro-test', async () => {
    activateTabById('review');
    await loadReviewTab();
    applyRvPreset({
      count: 5,
      minWrong: 1, // Only words that have been wrong at least once
      order: 'shuffle',
      direction: 'mixed',
      mode: 'choice4', // micro-test is usually quick choice format
      autoStart: true
    });
  });
}

function classifyWrongPattern(typedRaw, correctRaw) {
  const typed = normalizeToken(typedRaw);
  const correct = normalizeToken(correctRaw);
  if (!typed || !correct) return 'Nhầm nghĩa/khác';

  if (typed.replace(/\s+/g, '') === correct.replace(/\s+/g, '') && typed !== correct) {
    return 'Thiếu/Thừa khoảng trắng';
  }

  if (hasVietnameseDiacritics(typedRaw) && !hasVietnameseDiacritics(correctRaw)) {
    return 'Gõ tiếng Việt thay tiếng Anh';
  }

  const distance = levenshtein(typed, correct);
  if (distance <= 1) return 'Sai chính tả';
  if (distance <= 2 && Math.max(typed.length, correct.length) >= 6) return 'Sai chính tả';

  const stem = v => v.replace(/(ing|ed|es|s)$/i, '');
  if (stem(typed) === stem(correct) && typed !== correct) {
    return 'Sai dạng từ (s/ed/ing)';
  }

  if (Math.abs(typed.length - correct.length) >= 3) return 'Thiếu/Thừa ký tự';
  return 'Nhầm nghĩa/khác';
}

function normalizeToken(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[_\s]+/g, ' ')
    .trim();
}

function hasVietnameseDiacritics(v) {
  return /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(v || '');
}

// ============ Offline Tab ============
async function loadOfflineTab() {
  const [reviewRes, vocabRes] = await Promise.all([
    sendMessage({ action: 'get_review_list' }),
    sendMessage({ action: 'get_vocab_summaries' })
  ]);

  const dueCount = (reviewRes?.data || []).length;
  const totalVocab = Object.keys(vocabRes?.data || {}).length;
  const statsEl = document.getElementById('offline-stats');
  if (statsEl) {
    statsEl.textContent = `📌 ${dueCount} từ đến hạn ôn | 📚 ${totalVocab} từ có sẵn cho chế độ tự học`;
  }

  bindClickOnce('btn-offline-start-20', async () => {
    activateTabById('review');
    await loadReviewTab();
    applyRvPreset({
      count: 20,
      minWrong: 0,
      order: 'shuffle',
      direction: 'mixed',
      mode: 'type',
      mastery: 'all',
      autoAdvance: 0,
      source: 'all-vocab'
    });
    startRvSession();
  });

  bindClickOnce('btn-offline-start-due', async () => {
    activateTabById('review');
    await loadReviewTab();
    applyRvPreset({
      count: 0,
      minWrong: 0,
      order: 'wrong-desc',
      direction: 'mixed',
      mode: 'type',
      mastery: 'not-mastered',
      autoAdvance: 0,
      source: 'review-list'
    });
    startRvSession();
  });

  bindClickOnce('btn-offline-open-review', async () => {
    activateTabById('review');
    await loadReviewTab();
  });
}

function bindClickOnce(id, handler) {
  const el = document.getElementById(id);
  if (!el || el.dataset.bound) return;
  el.dataset.bound = 'true';
  el.addEventListener('click', handler);
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
    dateInput.value = formatLocalDate(new Date());
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
    score_detected: '🏆',
    exam_fullscreen_exit: '🖥️',
    exam_lock_violation: '⛔'
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
    } else if (event.type === 'exam_fullscreen_exit' && event.data) {
      title = `Thoát toàn màn hình (${event.data.exitCount || 0})`;
      detail = `Thoát lúc: ${event.data.exitedAtText || '-'}`;
      resultHtml = `<span class="event-result wrong">FS</span>`;
    } else if (event.type === 'exam_lock_violation' && event.data) {
      title = `Vi phạm khóa test`;
      detail = `Lý do: ${event.data.reason || 'unknown'} | Số lần: ${event.data.violationCount || 0}`;
      resultHtml = `<span class="event-result wrong">!</span>`;
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
  const notificationsCheckbox = document.getElementById('setting-notifications');
  if (notificationsCheckbox) notificationsCheckbox.checked = !!settings.notificationsEnabled;
  const examLockCheckbox = document.getElementById('setting-exam-lock');
  if (examLockCheckbox) examLockCheckbox.checked = settings.examLockEnabled !== false;
  const examFullscreenCheckbox = document.getElementById('setting-exam-fullscreen');
  if (examFullscreenCheckbox) examFullscreenCheckbox.checked = settings.examFullscreenEnabled !== false;
  const hudAutoMinimizeCheckbox = document.getElementById('setting-hud-auto-minimize');
  if (hudAutoMinimizeCheckbox) hudAutoMinimizeCheckbox.checked = settings.hudAutoMinimizeEnabled !== false;
  vocabCompactMode = !!settings.vocabCompactMode;

  const aiProviderSelect = document.getElementById('setting-ai-provider');
  const aiKeyInput = document.getElementById('setting-ai-key');
  if (aiProviderSelect) aiProviderSelect.value = settings.aiProvider || 'none';
  if (aiKeyInput) aiKeyInput.value = settings.aiKey || '';
  updateAiHelpText();

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

  // ── Load Toll-booth Settings ─────────────────────────────────────────────────
  try {
    const tollRes = await new Promise(r => chrome.storage.local.get('tollboothSettings', r));
    const ts = tollRes.tollboothSettings || {};
    let domains = ts.customDomains;
    if (!domains) {
      // Migrate from old platforms config if it exists
      const oldPlatforms = ts.platforms || { facebook: true, youtube: true };
      domains = Object.keys(oldPlatforms).filter(p => oldPlatforms[p]).map(p => p + '.com');
    }
    
    window.currentTollDomains = domains;
    renderTollDomainsList();

    // Word count buttons
    const wordCount = ts.wordCount || 5;
    document.querySelectorAll('#toll-words-count-group .rv-opt-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.val) === wordCount);
    });

    // Interval buttons
    const intervalMin = ts.intervalMin || 15;
    document.querySelectorAll('#toll-interval-group .rv-opt-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.val) === intervalMin);
    });

    const skipCb = document.getElementById('toll-allow-skip');
    if (skipCb) skipCb.checked = ts.allowSkip !== false;
  } catch (_) {}
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

  const aiProviderSelect = document.getElementById('setting-ai-provider');
  if (aiProviderSelect) {
    aiProviderSelect.addEventListener('change', () => {
      const provider = aiProviderSelect.value;
      sendMessage({
        action: 'update_settings',
        settings: { aiProvider: provider }
      });
      updateAiHelpText();
    });
  }

  const btnSaveAiKey = document.getElementById('btn-save-ai-key');
  const aiKeyInput = document.getElementById('setting-ai-key');
  if (btnSaveAiKey && aiKeyInput) {
    btnSaveAiKey.addEventListener('click', () => {
      sendMessage({
        action: 'update_settings',
        settings: { aiKey: aiKeyInput.value.trim() }
      });
      btnSaveAiKey.textContent = 'Đã lưu ✓';
      setTimeout(() => btnSaveAiKey.textContent = 'Lưu Key', 2000);
    });
  }

  const notificationsCheckbox = document.getElementById('setting-notifications');
  if (notificationsCheckbox) {
    notificationsCheckbox.addEventListener('change', () => {
      sendMessage({
        action: 'update_settings',
        settings: { notificationsEnabled: notificationsCheckbox.checked }
      });
    });
  }

  const examLockCheckbox = document.getElementById('setting-exam-lock');
  if (examLockCheckbox) {
    examLockCheckbox.addEventListener('change', () => {
      sendMessage({
        action: 'update_settings',
        settings: { examLockEnabled: examLockCheckbox.checked }
      });
    });
  }

  const examFullscreenCheckbox = document.getElementById('setting-exam-fullscreen');
  if (examFullscreenCheckbox) {
    examFullscreenCheckbox.addEventListener('change', () => {
      sendMessage({
        action: 'update_settings',
        settings: { examFullscreenEnabled: examFullscreenCheckbox.checked }
      });
    });
  }

  const hudAutoMinimizeCheckbox = document.getElementById('setting-hud-auto-minimize');
  if (hudAutoMinimizeCheckbox) {
    hudAutoMinimizeCheckbox.addEventListener('change', () => {
      sendMessage({
        action: 'update_settings',
        settings: { hudAutoMinimizeEnabled: hudAutoMinimizeCheckbox.checked }
      });
    });
  }

  // Tanglish Mode toggle
  const tanglishCb = document.getElementById('setting-tanglish');
  if (tanglishCb) {
    chrome.storage.local.get(['tg_tanglish_enabled'], (d) => {
      tanglishCb.checked = d.tg_tanglish_enabled !== false;
    });
    tanglishCb.addEventListener('change', () => {
      chrome.storage.local.set({ tg_tanglish_enabled: tanglishCb.checked });
    });
  }

  // Signal Word Highlighter toggle
  const signalWordCb = document.getElementById('setting-signal-words');
  if (signalWordCb) {
    chrome.storage.local.get(['tg_signal_words_enabled'], (d) => {
      signalWordCb.checked = d.tg_signal_words_enabled !== false; // default ON
    });
    signalWordCb.addEventListener('change', () => {
      chrome.storage.local.set({ tg_signal_words_enabled: signalWordCb.checked });
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

  const btnExportAnki = document.getElementById('btn-export-anki');
  if (btnExportAnki) {
    btnExportAnki.addEventListener('click', async () => {
      const res = await sendMessage({ action: 'get_vocab_summaries' });
      const entries = Object.values(res?.data || {});
      const headers = ['Front', 'Back', 'Tags', 'IPA'];
      const rows = entries.map(e => {
        const tags = ['thaygiap', e.mastery || 'new'];
        if (e.inReviewList) tags.push('review');
        return [e.vietnamese || '', e.english || '', tags.join(' '), e.ipa || ''];
      });
      const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
      downloadFile(csv, `thaygiap-anki-${getDateStr()}.csv`, 'text/csv');
    });
  }

  const btnImportAnki = document.getElementById('btn-import-anki');
  const ankiFileInput = document.getElementById('anki-file-input');
  if (btnImportAnki && ankiFileInput) {
    btnImportAnki.addEventListener('click', () => ankiFileInput.click());
    ankiFileInput.addEventListener('change', async () => {
      const file = ankiFileInput.files?.[0];
      if (!file) return;
      const text = await file.text();
      const rows = parseAnkiCsv(text);
      if (rows.length === 0) {
        alert('Không đọc được dữ liệu Anki từ file CSV.');
        return;
      }

      const res = await sendMessage({ action: 'import_anki_rows', rows });
      const report = res?.data || {};
      alert(`Đã import ${report.imported || 0} dòng (${report.created || 0} mới, ${report.updated || 0} cập nhật, ${report.skipped || 0} bỏ qua).`);
      ankiFileInput.value = '';
      if (location.hash === '#vocab') await loadVocabTab();
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

  // ── Toll-booth option btn groups ─────────────────────────────────────────────
  document.querySelectorAll('#toll-words-count-group .rv-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#toll-words-count-group .rv-opt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('#toll-interval-group .rv-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#toll-interval-group .rv-opt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ── Save Toll-booth Settings ──────────────────────────────────────────────────
  const btnSaveToll = document.getElementById('btn-save-toll-settings');
  const tollSaveMsg = document.getElementById('toll-save-msg');

  // Input events
  const domainInput = document.getElementById('toll-custom-domain-input');
  const btnAddDomain = document.getElementById('btn-toll-add-domain');

  if (btnAddDomain && domainInput) {
    const addFn = () => {
      let val = domainInput.value.trim().toLowerCase();
      if (!val) return;
      // remove protocol if present
      val = val.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

      if (val && !window.currentTollDomains.includes(val)) {
        window.currentTollDomains.push(val);
        renderTollDomainsList();
      }
      domainInput.value = '';
    };
    btnAddDomain.addEventListener('click', addFn);
    domainInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addFn();
      }
    });
  }

  if (btnSaveToll) {
    btnSaveToll.addEventListener('click', async () => {
      const customDomains = window.currentTollDomains || [];

      const activeWordBtn = document.querySelector('#toll-words-count-group .rv-opt-btn.active');
      const wordCount = activeWordBtn ? Number(activeWordBtn.dataset.val) : 5;

      const activeIntervalBtn = document.querySelector('#toll-interval-group .rv-opt-btn.active');
      const intervalMin = activeIntervalBtn ? Number(activeIntervalBtn.dataset.val) : 15;

      const skipCb = document.getElementById('toll-allow-skip');
      const allowSkip = skipCb ? skipCb.checked : true;

      await chrome.storage.local.set({
        tollboothSettings: { customDomains, wordCount, intervalMin, allowSkip }
      });

      if (tollSaveMsg) {
        tollSaveMsg.style.display = 'block';
        setTimeout(() => { if (tollSaveMsg) tollSaveMsg.style.display = 'none'; }, 2500);
      }
    });
  }

  // ── Test Toll-booth ───────────────────────────────────────────────────────────
  const btnTestToll = document.getElementById('btn-test-toll');
  if (btnTestToll) {
    btnTestToll.addEventListener('click', async () => {
      // Clear unlock keys in localStorage of all tabs (can't directly, open a test page)
      const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
      if (tabs[0]) {
        chrome.tabs.create({ url: 'https://www.facebook.com/', active: true });
      }
    });
  }
}

function updateAiHelpText() {
  const provider = document.getElementById('setting-ai-provider')?.value || 'none';
  const container = document.getElementById('ai-key-container');
  const helpText = document.getElementById('ai-help-text');

  if (provider === 'none') {
    if (container) container.style.display = 'none';
    return;
  }

  if (container) container.style.display = 'block';
  if (!helpText) return;

  if (provider === 'openai') {
    helpText.innerHTML = `<strong>Hướng dẫn lấy OpenAI API Key:</strong><br>
    1. Truy cập <a href="https://platform.openai.com/api-keys" target="_blank" style="color:var(--accent-blue)">platform.openai.com/api-keys</a><br>
    2. Đăng nhập hoặc tạo tài khoản mới.<br>
    3. Nhấn nút <strong>Create new secret key</strong>.<br>
    4. Copy đoạn mã bắt đầu bằng <code>sk-...</code> và dán vào ô bên trên.<br>
    <em>Lưu ý: OpenAI yêu cầu bạn phải nạp sẵn tiền (trả trước) thì tài khoản mới dùng được API.</em>`;
  } else if (provider === 'gemini') {
    helpText.innerHTML = `<strong>Hướng dẫn lấy Gemini API Key (Miễn phí):</strong><br>
    1. Truy cập <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--accent-blue)">Google AI Studio</a><br>
    2. Đăng nhập bằng tài khoản Google.<br>
    3. Nhấn nút <strong>Create API Key</strong>.<br>
    4. Copy đoạn mã key hiển thị và dán vào ô bên trên.<br>
    <em>Lưu ý: Gemini API hiện đang thu phí hoặc giới hạn tùy quốc gia, tuy nhiên gói miễn phí khá rộng rãi.</em>`;
  } else if (provider === 'openrouter') {
    helpText.innerHTML = `<strong>Hướng dẫn lấy OpenRouter API Key (Hỗ trợ nhiều model miễn phí):</strong><br>
    1. Truy cập <a href="https://openrouter.ai/keys" target="_blank" style="color:var(--accent-blue)">openrouter.ai/keys</a><br>
    2. Đăng nhập bằng Google/Email.<br>
    3. Nhấn nút <strong>Create Key</strong>.<br>
    4. Copy đoạn mã bắt đầu bằng <code>sk-or-...</code> và dán vào ô bên trên.<br>
    <em>Lưu ý: Bạn có thể chọn model ở cấu hình nâng cao, mặc định sẽ dùng dòng Claude Haiku hoặc Gemini Flash cực nhanh miễn phí.</em>`;
  }
}

// ============ Sentence Forge Tab ============
let sentenceForgeWords = [];

async function loadSentenceForgeTab() {
  const sfInput = document.getElementById('sf-user-input');
  const sfResult = document.getElementById('sf-result-container');
  const msgEl = document.getElementById('sf-feedback-msg');
  if (sfInput) sfInput.value = '';
  if (sfResult) sfResult.style.display = 'none';
  if (msgEl) msgEl.textContent = '';

  await fetchSFWords();

  const btnReroll = document.getElementById('btn-sf-reroll');
  if (btnReroll) {
    btnReroll.onclick = async () => {
      if (sfInput) sfInput.value = '';
      if (sfResult) sfResult.style.display = 'none';
      if (msgEl) msgEl.textContent = '';
      await fetchSFWords();
    };
  }

  const btnSubmit = document.getElementById('btn-sf-submit');
  if (btnSubmit) {
    btnSubmit.onclick = async () => {
      const text = sfInput?.value.trim() || '';
      if (!text) {
        if (msgEl) msgEl.textContent = 'Vui lòng viết ít nhất một câu!';
        return;
      }

      const missing = sentenceForgeWords.filter(w => !text.toLowerCase().includes((w.english || '').toLowerCase()));
      if (missing.length > 0) {
        if (msgEl) msgEl.textContent = `Bạn chưa dùng các từ: ${missing.map(m => m.english).join(', ')}`;
        return;
      }

      btnSubmit.disabled = true;
      if (msgEl) msgEl.textContent = 'Đang gửi cho AI phân tích...';

      const res = await sendMessage({
        action: 'ask_ai',
        aiType: 'grammar',
        wordOrContext: `Học sinh được yêu cầu viết câu dùng các từ: ${sentenceForgeWords.map(w => w.english).join(', ')}. Học sinh đã viết: "${text}". Hãy nhận xét xem học sinh viết đúng ngữ pháp không, dùng từ có tự nhiên không, và sửa lại câu cho hay hơn (nếu có lỗi).`
      });

      btnSubmit.disabled = false;
      if (msgEl) msgEl.textContent = '';
      if (sfResult) {
        sfResult.style.display = 'block';
        if (res && res.result) {
          sfResult.innerHTML = `<strong>Nhận xét từ AI:</strong><br><br>` + escapeHtml(res.result).replace(/\\n/g, '<br/>');
        } else {
          sfResult.innerHTML = `<span style="color:var(--accent-red)">Lỗi khi gọi AI. Hãy kiểm tra lại API Key ở phần Cài đặt.</span>`;
        }
      }
    };
  }
}

async function fetchSFWords() {
  const res = await sendMessage({ action: 'get_vocab_summaries' });
  const entries = Object.values(res?.data || {}).filter(w => w.english && w.vietnamese);

  // Try to pick from learning/reviewing/most wrong
  entries.sort(() => Math.random() - 0.5);
  sentenceForgeWords = entries.slice(0, 3);

  const listEl = document.getElementById('sf-words-list');
  if (listEl) {
    listEl.innerHTML = sentenceForgeWords.map(w => `
      <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 12px 18px; display: flex; flex-direction: column; gap: 4px;">
        <span style="color: #38bdf8; font-weight: 700; font-size: 18px;">${escapeHtml(w.english)}</span>
        <span style="color: #94a3b8; font-size: 13px;">${escapeHtml(w.vietnamese)}</span>
      </div>
    `).join('');
  }
}

// ============ Vocab Dungeon Tab ============
let vdState = {
  running: false,
  words: [],
  currentFloor: 0,
  hp: 3,
  timeLeft: 10,
  timerInterval: null
};

async function loadVocabDungeonTab() {
  const startBtn = document.getElementById('btn-vd-start');
  if (startBtn) {
    startBtn.onclick = startDungeon;
  }

  const input = document.getElementById('vd-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleDungeonAnswer();
    });
  }
}

async function startDungeon() {
  document.getElementById('vd-start-screen').style.display = 'none';
  document.getElementById('vd-game-screen').style.display = 'block';

  const res = await sendMessage({ action: 'get_review_list' });
  let pool = res?.data || [];

  if (pool.length < 20) {
    const sumRes = await sendMessage({ action: 'get_vocab_summaries' });
    const dict = sumRes?.data || {};
    const all = Object.values(dict).filter(w => w.english && w.vietnamese);
    all.sort(() => Math.random() - 0.5);
    pool = pool.concat(all).slice(0, 20);
  } else {
    pool = pool.sort(() => Math.random() - 0.5).slice(0, 20);
  }

  vdState = {
    running: true,
    words: pool,
    currentFloor: 0,
    hp: 3,
    timeLeft: 10,
    timerInterval: null
  };

  renderVdHud();
  nextVdFloor();
}

function renderVdHud() {
  const hpBar = document.getElementById('vd-hp-bar');
  if (hpBar) {
    hpBar.innerHTML = Array(3).fill('🖤').map((heart, i) => i < vdState.hp ? '❤️' : '🖤').join('');
  }
  const floorEl = document.getElementById('vd-floor');
  if (floorEl) {
    floorEl.textContent = `${Math.min(vdState.currentFloor + 1, 20)}/20`;
  }
}

function nextVdFloor() {
  if (vdState.hp <= 0) {
    endDungeon(false);
    return;
  }

  if (vdState.currentFloor >= vdState.words.length || vdState.currentFloor >= 20) {
    endDungeon(true);
    return;
  }

  renderVdHud();

  const word = vdState.words[vdState.currentFloor];
  const nameEl = document.getElementById('vd-monster-name');
  if (nameEl) nameEl.textContent = word.vietnamese || '???';

  const input = document.getElementById('vd-input');
  if (input) {
    input.value = '';
    input.focus();
    input.style.borderColor = '#334155';
    input.disabled = false;
  }

  const monster = document.getElementById('vd-monster');
  if (monster) {
    const emojis = ['👿', '👹', '👺', '👾', '🧟', '🧛', '🐲', '☠️'];
    monster.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    monster.style.transform = 'translateY(0) scale(1)';
    monster.style.opacity = '1';
  }

  startVdTimer();
}

function startVdTimer() {
  if (vdState.timerInterval) clearInterval(vdState.timerInterval);
  vdState.timeLeft = 10; // 10 seconds per monster
  updateVdTimerBar();

  vdState.timerInterval = setInterval(() => {
    vdState.timeLeft -= 0.1;
    updateVdTimerBar();

    if (vdState.timeLeft <= 0) {
      clearInterval(vdState.timerInterval);
      handleVdDamage(); // Time's up! Monster hits.
    }
  }, 100);
}

function updateVdTimerBar() {
  const bar = document.getElementById('vd-timer-bar');
  if (!bar) return;
  const pct = Math.max(0, (vdState.timeLeft / 10) * 100);
  bar.style.width = `${pct}%`;

  if (pct > 50) bar.style.background = '#10b981';
  else if (pct > 20) bar.style.background = '#f59e0b';
  else bar.style.background = '#ef4444';
}

function handleDungeonAnswer() {
  if (!vdState.running) return;

  const input = document.getElementById('vd-input');
  if (!input) return;

  const word = vdState.words[vdState.currentFloor];
  const typed = input.value.trim().toLowerCase();
  const arr = word.english.split('/').map(s => s.trim().toLowerCase());

  if (arr.includes(typed)) {
    // Correct! Player attacks
    clearInterval(vdState.timerInterval);
    input.disabled = true;
    input.style.borderColor = '#10b981';

    const isCrit = vdState.timeLeft >= 7; // Answered in < 3s
    showVdFx(isCrit ? 'Chí Mạng!' : 'Băm!', isCrit ? '#f59e0b' : '#fff');

    // Animate monster death
    const monster = document.getElementById('vd-monster');
    if (monster) {
      monster.style.transform = 'translateY(20px) scale(0.5)';
      monster.style.opacity = '0';
    }

    // Player attack animation
    const player = document.getElementById('vd-player');
    if (player) {
      player.style.transform = 'translateX(20px)';
      setTimeout(() => player.style.transform = 'translateX(0)', 200);
    }

    setTimeout(() => {
      vdState.currentFloor++;
      nextVdFloor();
    }, 1000);

  } else {
    // Wrong! Shake input
    input.style.borderColor = '#ef4444';
    input.classList.remove('shake');
    void input.offsetWidth;
    input.classList.add('shake');
  }
}

function handleVdDamage() {
  clearInterval(vdState.timerInterval);
  showVdFx('-1 HP', '#ef4444');

  const player = document.getElementById('vd-player');
  if (player) {
    player.style.transform = 'translateX(-20px) skewX(10deg)';
    setTimeout(() => player.style.transform = 'translateX(0) skewX(0)', 300);
  }

  const input = document.getElementById('vd-input');
  if (input) {
    input.value = vdState.words[vdState.currentFloor].english; // Show answer
    input.disabled = true;
    input.style.borderColor = '#ef4444';
  }

  vdState.hp--;
  renderVdHud();

  setTimeout(() => {
    vdState.currentFloor++;
    nextVdFloor();
  }, 2000);
}

function showVdFx(text, color) {
  const layer = document.getElementById('vd-fx-layer');
  if (!layer) return;

  const fx = document.createElement('div');
  fx.textContent = text;
  fx.style.position = 'absolute';
  fx.style.top = '50%';
  fx.style.left = '50%';
  fx.style.transform = 'translate(-50%, -50%)';
  fx.style.color = color;
  fx.style.fontSize = '40px';
  fx.style.fontWeight = '900';
  fx.style.textShadow = '0 4px 10px rgba(0,0,0,0.8)';
  fx.style.transition = 'all 1s cubic-bezier(0.16, 1, 0.3, 1)';

  layer.appendChild(fx);

  setTimeout(() => {
    fx.style.transform = 'translate(-50%, -100px) scale(1.5)';
    fx.style.opacity = '0';
  }, 50);

  setTimeout(() => fx.remove(), 1000);
}

function endDungeon(isWin) {
  vdState.running = false;
  if (vdState.timerInterval) clearInterval(vdState.timerInterval);

  const layer = document.getElementById('vd-fx-layer');
  if (layer) {
    layer.innerHTML = `
      <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.8); display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="font-size: 80px; margin-bottom: 20px;">${isWin ? '🏆' : '💀'}</div>
        <div style="font-size: 32px; font-weight: 800; color: ${isWin ? '#fbbf24' : '#ef4444'}; margin-bottom: 20px;">
          ${isWin ? 'CHINH PHỤC HẦM NGỤC!' : 'GAMEOVER'}
        </div>
        <p style="color: #f8fafc; font-size: 20px; font-weight: 500; margin-bottom: 30px;">
          Tầng đạt được: ${vdState.currentFloor}/20
        </p>
        <button id="btn-vd-restart" class="btn btn-primary" style="font-size: 18px; padding: 12px 32px;">${isWin ? 'Chơi lại' : 'Thử sức lại'}</button>
      </div>
    `;

    document.getElementById('btn-vd-restart').onclick = () => {
      layer.innerHTML = '';
      startDungeon();
    };
  }
}

// ============ Utility ============
function parseCsvRow(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map(v => v.trim());
}

function parseAnkiCsv(csvText) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  const header = parseCsvRow(lines[0]).map(h => h.toLowerCase());
  const idxFront = header.findIndex(h => ['front', 'vietnamese', 'vi', 'nghia'].includes(h));
  const idxBack = header.findIndex(h => ['back', 'english', 'en'].includes(h));
  const idxTags = header.findIndex(h => h === 'tags');
  const idxIpa = header.findIndex(h => h === 'ipa');

  const hasHeader = idxFront >= 0 || idxBack >= 0;
  const start = hasHeader ? 1 : 0;

  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const vietnamese = cells[hasHeader ? idxFront : 0] || '';
    const english = cells[hasHeader ? idxBack : 1] || '';
    const tags = idxTags >= 0 ? (cells[idxTags] || '') : '';
    const ipa = idxIpa >= 0 ? (cells[idxIpa] || '') : '';
    if (!vietnamese.trim() || !english.trim()) continue;
    rows.push({ vietnamese, english, tags, ipa });
  }

  return rows;
}

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
  return formatLocalDate(new Date());
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

// ============ Grammar Vault Tab ============
async function loadGrammarVaultTab() {
  const data = await chrome.storage.local.get(['tg_grammar_vault']);
  const vault = data.tg_grammar_vault || [];

  const listEl = document.getElementById('gv-list');
  const emptyEl = document.getElementById('gv-empty');
  const countEl = document.getElementById('gv-count-label');

  if (countEl) countEl.textContent = `${vault.length} câu`;

  const addDemoBtn = document.getElementById('btn-gv-add-demo');
  const clearBtn = document.getElementById('btn-gv-clear');
  if (addDemoBtn) addDemoBtn.onclick = addGrammarVaultDemo;
  if (clearBtn) clearBtn.onclick = async () => {
    if (confirm('Xóa toàn bộ Kho Ngữ Pháp?')) {
      await chrome.storage.local.set({ tg_grammar_vault: [] });
      await loadGrammarVaultTab();
    }
  };

  if (!listEl) return;

  if (vault.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    listEl.innerHTML = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  listEl.innerHTML = vault.map((item, idx) => {
    const parts = (item.sentence || '').split('___');
    const blankWidth = Math.max(80, ((item.answer || '').length + 2) * 9);
    const blankHtml = `<input type="text" id="gv-input-${idx}" autocomplete="off" placeholder="?" style="width:${blankWidth}px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#fff;padding:4px 8px;font-size:15px;text-align:center;">`;
    const sentenceHtml = parts.map(p => `<span style="color:#e2e8f0;">${escapeHtml(p)}</span>`).join(blankHtml);

    return `
      <div class="wi-card" style="margin-bottom:12px;">
        <div style="padding:20px;">
          <div style="font-size:12px;color:#475569;margin-bottom:10px;display:flex;justify-content:space-between;">
            <span>📚 ${escapeHtml(item.context || 'Exam')}</span>
            <span style="color:#334155;cursor:pointer;" onclick="removeGvItem(${idx})">✕</span>
          </div>
          <div style="font-size:18px;line-height:2.5;font-family:Georgia,serif;">${sentenceHtml}</div>
          <div style="margin-top:16px;display:flex;gap:10px;align-items:center;">
            <button class="btn btn-primary" style="font-size:13px;" onclick="checkGvAnswer(${idx},'${encodeURIComponent(item.answer || '')}')">✓ Kiểm tra</button>
            <span id="gv-feedback-${idx}" style="font-size:13px;"></span>
          </div>
          <div style="margin-top:8px;font-size:12px;color:#334155;">Gợi ý: ${Array.from(item.answer || '').map((c, i) => i === 0 ? c : (c === ' ' ? ' ' : '_')).join('')}</div>
        </div>
      </div>`;
  }).join('');
}

window.checkGvAnswer = function (idx, encodedAnswer) {
  const correct = decodeURIComponent(encodedAnswer).toLowerCase().trim();
  const input = document.getElementById(`gv-input-${idx}`);
  const feedback = document.getElementById(`gv-feedback-${idx}`);
  if (!input || !feedback) return;
  const typed = input.value.toLowerCase().trim();
  const isCorrect = typed === correct || typed.replace(/\s+/g, ' ') === correct.replace(/\s+/g, ' ');
  if (isCorrect) {
    feedback.innerHTML = `<span style="color:#10b981">✓ Đúng rồi! "${escapeHtml(decodeURIComponent(encodedAnswer))}"</span>`;
    input.style.borderColor = '#10b981';
    if (typeof fireConfetti === 'function') fireConfetti();
  } else {
    feedback.innerHTML = `<span style="color:#ef4444">✗ Sai! Đáp án: "${escapeHtml(decodeURIComponent(encodedAnswer))}"</span>`;
    input.style.borderColor = '#ef4444';
    input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
  }
};

window.removeGvItem = async function (idx) {
  const data = await chrome.storage.local.get(['tg_grammar_vault']);
  const vault = data.tg_grammar_vault || [];
  vault.splice(idx, 1);
  await chrome.storage.local.set({ tg_grammar_vault: vault });
  await loadGrammarVaultTab();
};

async function addGrammarVaultDemo() {
  const data = await chrome.storage.local.get(['tg_grammar_vault']);
  const vault = data.tg_grammar_vault || [];
  const demos = [
    { sentence: 'She ___ (already, watch) this movie.', answer: 'has already watched', context: 'Demo - Present Perfect' },
    { sentence: 'They ___ (not give) me the book yet.', answer: 'have not given', context: 'Demo - Present Perfect' },
    { sentence: 'By the time she arrived, we ___ dinner.', answer: 'had finished', context: 'Demo - Past Perfect' },
    { sentence: 'He ___ to Paris three times since 2020.', answer: 'has been', context: 'Demo - Present Perfect' }
  ];
  for (const d of demos) {
    if (!vault.find(v => v.sentence === d.sentence)) {
      vault.unshift({ ...d, addedAt: Date.now() });
    }
  }
  await chrome.storage.local.set({ tg_grammar_vault: vault });
  await loadGrammarVaultTab();
}

// ============ Skill Matrix Tab ============
async function loadSkillMatrixTab() {
  const vocabRes = await sendMessage({ action: 'get_vocab_summaries' });
  const vocabData = Object.values(vocabRes?.data || {});

  const totalAttempts = vocabData.reduce((a, e) => a + (e.totalAttempts || 0), 0);
  const totalCorrect = vocabData.reduce((a, e) => a + (e.correctAttempts || 0), 0);
  const vocabAccuracy = totalAttempts > 0 ? Math.round(totalCorrect / totalAttempts * 100) : 0;
  setText('sm-vocab-accuracy', `${vocabAccuracy}%`);

  const errorData = await chrome.storage.local.get(['tg_error_buckets']);
  const buckets = errorData.tg_error_buckets || { form: 0, meaning: 0, spelling: 0, spacing: 0 };
  const totalErrors = (buckets.form + buckets.meaning + buckets.spelling + buckets.spacing) || 1;
  const formPct = Math.round(buckets.form / totalErrors * 100);
  const meaningPct = Math.round(buckets.meaning / totalErrors * 100);
  setText('sm-exam-form-err', `${formPct}%`);
  setText('sm-exam-meaning-err', `${meaningPct}%`);

  let topWeakness = 'Chưa đủ dữ liệu';
  if (formPct > meaningPct && formPct > 20) topWeakness = 'Chia dạng từ';
  else if (meaningPct > formPct && meaningPct > 20) topWeakness = 'Hiểu ý nghĩa';
  else if (vocabAccuracy < 70) topWeakness = 'Từ vựng cơ bản';
  setText('sm-top-weakness', topWeakness);

  // AI Conclusion
  const conclusionEl = document.getElementById('sm-ai-conclusion');
  if (conclusionEl) {
    const lines = [];
    if (totalAttempts < 10) {
      lines.push('📊 Chưa có đủ dữ liệu để phân tích. Hãy cài đặt và làm bài tập trên ThayGiap để extension thu thập thông tin.');
    } else {
      if (vocabAccuracy >= 80) lines.push(`✅ <strong>Từ vựng:</strong> Xuất sắc! Bạn đúng <strong>${vocabAccuracy}%</strong> lần nhập từ vựng.`);
      else if (vocabAccuracy >= 60) lines.push(`⚠️ <strong>Từ vựng:</strong> Trung bình — ${vocabAccuracy}% đúng. Nên ôn lại qua tab "Lỗi nhập".`);
      else lines.push(`❌ <strong>Từ vựng:</strong> Cần cải thiện — chỉ đúng ${vocabAccuracy}%. Hãy dùng Vocab Dungeon để luyện.`);

      if (formPct > 30) lines.push(`🔴 <strong>Lỗi nổi bật:</strong> ${formPct}% lỗi do CHIA DẠNG TỪ. Bạn thường hiểu nghĩa nhưng điền sai dạng từ (ví dụ: dùng quy tắc cho động từ bất quy tắc).`);
      if (meaningPct > 30) lines.push(`🟡 <strong>Lỗi nổi bật:</strong> ${meaningPct}% lỗi do SAI Ý NGHĨA — có thể nhầm từ hoặc không hiểu nội dung câu hỏi.`);
    }
    conclusionEl.innerHTML = lines.join('<br><br>') || 'Dữ liệu đang được phân tích...';
  }

  // CTA Buttons
  const ctaEl = document.getElementById('sm-cta-buttons');
  if (ctaEl) {
    ctaEl.innerHTML = '';
    const addBtn = (label, hash, cls = 'btn-secondary') => {
      const btn = document.createElement('button');
      btn.className = `btn ${cls}`;
      btn.textContent = label;
      btn.onclick = () => { location.hash = hash; };
      ctaEl.appendChild(btn);
    };
    if (formPct > 20) addBtn('⚔️ Luyện động từ bất quy tắc', 'offline', 'btn-primary');
    if (vocabAccuracy < 75) addBtn('🔁 Ôn tập từ vựng sai', 'wrong-inputs');
    addBtn('🧩 Kho Ngữ Pháp', 'grammar-vault');
    addBtn('✍️ Lò rèn Câu', 'sentence-forge');
  }

  // Top 5 hardest words
  const topWordsEl = document.getElementById('sm-top-words');
  if (topWordsEl) {
    const hardest = vocabData
      .filter(e => (e.wrongAttempts || 0) > 0)
      .sort((a, b) => (b.wrongAttempts || 0) - (a.wrongAttempts || 0))
      .slice(0, 5);

    if (hardest.length === 0) {
      topWordsEl.innerHTML = '<p style="color:#475569;">Chưa có dữ liệu lỗi.</p>';
    } else {
      topWordsEl.innerHTML = hardest.map((e, i) => {
        const wrongPct = e.totalAttempts > 0 ? Math.round(e.wrongAttempts / e.totalAttempts * 100) : 0;
        const barColor = wrongPct > 60 ? '#ef4444' : wrongPct > 30 ? '#f59e0b' : '#10b981';
        const viEnc = encodeURIComponent(e.vietnamese || '');
        const enEnc = encodeURIComponent(e.english || '?');
        return `
          <div style="background:var(--bg-card);border-radius:10px;padding:16px 20px;display:flex;align-items:center;gap:16px;border:1px solid var(--border-color);box-shadow:var(--shadow);">
            <div style="font-size:24px;font-weight:800;color:var(--text-muted);width:28px;">${i + 1}</div>
            <div style="flex:1;">
              <div style="font-weight:700;color:var(--text-primary);font-size:15px;">${escapeHtml(e.vietnamese || '')} → <span style="color:var(--accent-blue)">${escapeHtml(e.english || '?')}</span></div>
              <div style="margin-top:6px;height:6px;background:var(--border-color);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${wrongPct}%;background:${barColor};border-radius:3px;"></div>
              </div>
              <div style="margin-top:4px;font-size:12px;color:var(--text-secondary);">${e.wrongAttempts} lần sai / ${e.totalAttempts} lần tổng (${wrongPct}% sai)</div>
            </div>
            <button class="btn btn-secondary" style="font-size:12px;white-space:nowrap;" onclick="generateMnemonic('${viEnc}','${enEnc}',this)">💡 Mẹo</button>
          </div>`;
      }).join('');
    }
  }
}

// ============ Toll-booth Ext ============
function renderTollDomainsList() {
  const container = document.getElementById('toll-custom-domain-list');
  if (!container) return;

  const domains = window.currentTollDomains || [];
  if (domains.length === 0) {
    container.innerHTML = '<div style="color:var(--text-secondary); font-size:13px; font-style:italic;">Chưa có trang web nào được thêm.</div>';
    return;
  }

  container.innerHTML = domains.map(d => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); border:1px solid var(--border-color); padding:10px 14px; border-radius:var(--radius-md);">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:16px;">🌐</span>
        <span style="font-size:14px; font-weight:600; color:var(--text-primary);">${escapeHtml(d)}</span>
      </div>
      <button class="btn-remove-domain" data-domain="${escapeHtml(d)}" style="background:transparent; border:none; color:var(--accent-danger); cursor:pointer; font-size:18px; line-height:1; display:flex; align-items:center; justify-content:center; padding:4px; border-radius:4px; transition:background 0.2s;">×</button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-remove-domain').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = btn.dataset.domain;
      window.currentTollDomains = window.currentTollDomains.filter(item => item !== d);
      renderTollDomainsList();
    });
  });
}
