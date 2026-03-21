/**
 * ThayGiap Learning Tracker - Popup Script
 * ==========================================
 * Loads stats from background, renders them in the popup UI.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Load theme
  await loadTheme();

  // Set today's date
  const dateEl = document.getElementById('today-date');
  if (dateEl) {
    const today = new Date();
    dateEl.textContent = today.toLocaleDateString('vi-VN', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit'
    });
  }

  // ── Extension Master Power Toggle ──────────────────────────────────────────
  const btnPower = document.getElementById('btn-toggle-extension');
  const powerIcon = document.getElementById('extension-power-icon');
  const banner = document.getElementById('ext-disabled-banner');

  async function refreshPowerState() {
    const res = await chrome.storage.local.get('extensionEnabled');
    const enabled = res.extensionEnabled !== false; // default ON
    if (btnPower) {
      btnPower.classList.toggle('power-on', enabled);
      btnPower.classList.toggle('power-off', !enabled);
    }
    if (powerIcon) powerIcon.textContent = enabled ? '⏻' : '⏼';
    if (banner) banner.style.display = enabled ? 'none' : 'block';
  }

  if (btnPower) {
    btnPower.addEventListener('click', async () => {
      const res = await chrome.storage.local.get('extensionEnabled');
      const current = res.extensionEnabled !== false;
      await chrome.storage.local.set({ extensionEnabled: !current });
      await refreshPowerState();
    });
  }

  await refreshPowerState();

  // Setup verb lookup input listener
  setupVerbLookup();

  // Load all data
  await loadTodayStats();
  await loadVocabSummary();
  await loadRecentSessions();
  await loadSettingsState();

  // Setup buttons
  setupButtons();
});

let popupSettings = {
  trackingEnabled: true,
  notificationsEnabled: false
};

// ============ Load Today Stats ============
async function loadTodayStats() {
  try {
    const response = await sendMessage({ action: 'get_today_stats' });
    if (!response || !response.ok) return;

    const stats = response.data;

    setTextById('total-attempts', stats.totalAttempts || 0);
    setTextById('correct-count', stats.correctCount || 0);
    setTextById('wrong-count', stats.wrongCount || 0);
    setTextById('accuracy', `${stats.accuracy || 0}%`);

    // Update accuracy bar
    const barEl = document.getElementById('accuracy-bar');
    if (barEl) {
      barEl.style.width = `${stats.accuracy || 0}%`;

      // Color based on accuracy
      if (stats.accuracy >= 80) {
        barEl.style.background = 'linear-gradient(135deg, #34d399 0%, #059669 100%)';
      } else if (stats.accuracy >= 50) {
        barEl.style.background = 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)';
      } else {
        barEl.style.background = 'linear-gradient(135deg, #f87171 0%, #dc2626 100%)';
      }
    }
  } catch (err) {
    console.error('Error loading today stats:', err);
  }
}

// ============ Load Vocab Summary ============
async function loadVocabSummary() {
  try {
    const response = await sendMessage({ action: 'get_vocab_summaries' });
    if (!response || !response.ok) return;

    const summaries = response.data;
    const entries = Object.values(summaries);

    // Total words
    setTextById('words-count', entries.length);

    // Mastery counts
    const masteryCounts = { new: 0, learning: 0, reviewing: 0, mastered: 0 };
    entries.forEach(entry => {
      masteryCounts[entry.mastery || 'new']++;
    });

    setTextById('mastery-new', masteryCounts.new);
    setTextById('mastery-learning', masteryCounts.learning);
    setTextById('mastery-reviewing', masteryCounts.reviewing);
    setTextById('mastery-mastered', masteryCounts.mastered);

    // Top wrong words (sorted by wrongAttempts desc)
    const wrongWords = entries
      .filter(e => e.wrongAttempts > 0)
      .sort((a, b) => b.wrongAttempts - a.wrongAttempts)
      .slice(0, 5);

    const wrongContainer = document.getElementById('top-wrong-words');
    if (wrongContainer) {
      if (wrongWords.length === 0) {
        wrongContainer.innerHTML = '<div class="empty-state">🎉 Chưa có từ nào sai!</div>';
      } else {
        wrongContainer.innerHTML = wrongWords.map(word => `
          <div class="word-item">
            <div class="word-item-text">
              <span class="word-vi">${escapeHtml(word.vietnamese)}</span>
              <span class="word-en">${escapeHtml(word.english || '?')}</span>
            </div>
            <span class="word-wrong-count">${word.wrongAttempts}×</span>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error loading vocab summary:', err);
  }
}

// ============ Load Recent Sessions ============
async function loadRecentSessions() {
  try {
    const response = await sendMessage({ action: 'get_session_summaries' });
    if (!response || !response.ok) return;

    const summaries = response.data;
    const entries = Object.values(summaries)
      .sort((a, b) => (b.lastPracticed || 0) - (a.lastPracticed || 0))
      .slice(0, 4);

    const container = document.getElementById('recent-sessions');
    if (!container) return;

    if (entries.length === 0) {
      container.innerHTML = '<div class="empty-state">Chưa có phiên học</div>';
      return;
    }

    container.innerHTML = entries.map(session => {
      const partTypeClass = session.partType || 'practice';
      const partTypeLabel = {
        practice: 'Luyện tập',
        test: 'Kiểm tra',
        vocab: 'Vocab',
        essay: 'Bài viết',
        unknown: 'Khác'
      }[partTypeClass] || 'Khác';

      const timeAgo = getRelativeTime(session.lastPracticed);
      const totalWords = session.correctWords + session.wrongWords;
      const accuracy = totalWords > 0 ? Math.round(session.correctWords / totalWords * 100) : 0;

      return `
        <div class="session-item">
          <div class="session-item-info">
            <span class="session-title">${escapeHtml(truncateText(session.currentItem || session.lessonTitle || 'Unknown', 30))}</span>
            <span class="session-time">${timeAgo}</span>
          </div>
          <div class="session-score">
            <span class="session-type-badge ${partTypeClass}">${partTypeLabel}</span>
            ${totalWords > 0 ? `<span class="session-score-value">${accuracy}%</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading sessions:', err);
  }
}

async function loadSettingsState() {
  try {
    const response = await sendMessage({ action: 'get_settings' });
    if (response?.ok && response.data) {
      popupSettings = { ...popupSettings, ...response.data };
    }
    renderSettingsUI();
  } catch (err) {
    console.error('Error loading popup settings:', err);
  }
}

function renderSettingsUI() {
  const icon = document.getElementById('tracking-icon');
  if (icon) {
    icon.textContent = '●';
    if (popupSettings.trackingEnabled) {
      icon.classList.remove('inactive');
    } else {
      icon.classList.add('inactive');
    }
  }

  const notifyBtn = document.getElementById('btn-toggle-notification');
  if (notifyBtn) {
    notifyBtn.textContent = `Thông báo: ${popupSettings.notificationsEnabled ? 'Bật' : 'Tắt'}`;
  }
}

// Theme management
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
  const body = document.body;
  const themeIcon = document.getElementById('theme-icon');

  if (theme === 'light') {
    body.classList.add('light-theme');
    if (themeIcon) themeIcon.textContent = '☀️';
  } else {
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

// ============ Button Handlers ============
function setupButtons() {
  // Theme toggle
  const btnTheme = document.getElementById('btn-theme-toggle');
  if (btnTheme) {
    btnTheme.addEventListener('click', toggleTheme);
  }

  // Options page
  const btnOptions = document.getElementById('btn-options');
  if (btnOptions) {
    btnOptions.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // Export
  const btnExport = document.getElementById('btn-export');
  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      try {
        const response = await sendMessage({ action: 'export_data' });
        if (response && response.ok) {
          const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `thaygiap-tracker-export-${formatDateLocal(new Date())}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error('Export error:', err);
      }
    });
  }

  // Toggle tracking
  const btnToggle = document.getElementById('btn-toggle-tracking');
  if (btnToggle) {
    btnToggle.addEventListener('click', async () => {
      try {
        popupSettings.trackingEnabled = !popupSettings.trackingEnabled;
        await sendMessage({
          action: 'update_settings',
          settings: { trackingEnabled: popupSettings.trackingEnabled }
        });
        renderSettingsUI();
      } catch (err) {
        console.error('Toggle error:', err);
      }
    });
  }

  const btnQuickReview10 = document.getElementById('btn-quick-review10');
  if (btnQuickReview10) {
    btnQuickReview10.addEventListener('click', async () => {
      await sendMessage({
        action: 'update_settings',
        settings: { quickActionPreset: 'review-top10-hard' }
      });
      openOptionsWithHash('#review-quick');
    });
  }

  const btnQuickOffline = document.getElementById('btn-quick-offline');
  if (btnQuickOffline) {
    btnQuickOffline.addEventListener('click', async () => {
      await sendMessage({
        action: 'update_settings',
        settings: { quickActionPreset: 'offline-20' }
      });
      openOptionsWithHash('#offline');
    });
  }

  const btnOpenLast = document.getElementById('btn-open-last-lesson');
  if (btnOpenLast) {
    btnOpenLast.addEventListener('click', async () => {
      const res = await sendMessage({ action: 'get_session_summaries' });
      const sessions = Object.values(res?.data || {}).sort((a, b) => (b.lastPracticed || 0) - (a.lastPracticed || 0));
      const lessonKey = sessions[0]?.lessonKey || '';
      const url = lessonKey.split('|')[0];
      if (url && /^https?:\/\//.test(url)) {
        chrome.tabs.create({ url });
      } else {
        openOptionsWithHash('#sessions');
      }
    });
  }

  const btnToggleNotification = document.getElementById('btn-toggle-notification');
  if (btnToggleNotification) {
    btnToggleNotification.addEventListener('click', async () => {
      popupSettings.notificationsEnabled = !popupSettings.notificationsEnabled;
      await sendMessage({
        action: 'update_settings',
        settings: { notificationsEnabled: popupSettings.notificationsEnabled }
      });
      renderSettingsUI();
    });
  }
}

// ============ Utility Functions ============

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

function setTextById(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncateText(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '…';
}

function getRelativeTime(timestamp) {
  if (!timestamp) return '';
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  if (days < 7) return `${days} ngày trước`;

  const d = new Date(timestamp);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function openOptionsWithHash(hash) {
  const url = chrome.runtime.getURL(`options/options.html${hash || ''}`);
  chrome.tabs.create({ url });
}

function formatDateLocal(dateLike) {
  const d = new Date(dateLike);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============ Irregular Verbs Logic ============
const IRREGULAR_VERBS = [
  { base: 'be', past: 'was/were', participle: 'been' },
  { base: 'become', past: 'became', participle: 'become' },
  { base: 'begin', past: 'began', participle: 'begun' },
  { base: 'break', past: 'broke', participle: 'broken' },
  { base: 'bring', past: 'brought', participle: 'brought' },
  { base: 'build', past: 'built', participle: 'built' },
  { base: 'buy', past: 'bought', participle: 'bought' },
  { base: 'catch', past: 'caught', participle: 'caught' },
  { base: 'choose', past: 'chose', participle: 'chosen' },
  { base: 'come', past: 'came', participle: 'come' },
  { base: 'cost', past: 'cost', participle: 'cost' },
  { base: 'cut', past: 'cut', participle: 'cut' },
  { base: 'do', past: 'did', participle: 'done' },
  { base: 'draw', past: 'drew', participle: 'drawn' },
  { base: 'drink', past: 'drank', participle: 'drunk' },
  { base: 'drive', past: 'drove', participle: 'driven' },
  { base: 'eat', past: 'ate', participle: 'eaten' },
  { base: 'fall', past: 'fell', participle: 'fallen' },
  { base: 'feel', past: 'felt', participle: 'felt' },
  { base: 'fight', past: 'fought', participle: 'fought' },
  { base: 'find', past: 'found', participle: 'found' },
  { base: 'fly', past: 'flew', participle: 'flown' },
  { base: 'forget', past: 'forgot', participle: 'forgotten' },
  { base: 'forgive', past: 'forgave', participle: 'forgiven' },
  { base: 'get', past: 'got', participle: 'got/gotten' },
  { base: 'give', past: 'gave', participle: 'given' },
  { base: 'go', past: 'went', participle: 'gone' },
  { base: 'grow', past: 'grew', participle: 'grown' },
  { base: 'have', past: 'had', participle: 'had' },
  { base: 'hear', past: 'heard', participle: 'heard' },
  { base: 'hide', past: 'hid', participle: 'hidden' },
  { base: 'hold', past: 'held', participle: 'held' },
  { base: 'keep', past: 'kept', participle: 'kept' },
  { base: 'know', past: 'knew', participle: 'known' },
  { base: 'lead', past: 'led', participle: 'led' },
  { base: 'leave', past: 'left', participle: 'left' },
  { base: 'lose', past: 'lost', participle: 'lost' },
  { base: 'make', past: 'made', participle: 'made' },
  { base: 'meet', past: 'met', participle: 'met' },
  { base: 'pay', past: 'paid', participle: 'paid' },
  { base: 'put', past: 'put', participle: 'put' },
  { base: 'read', past: 'read', participle: 'read' },
  { base: 'ride', past: 'rode', participle: 'ridden' },
  { base: 'ring', past: 'rang', participle: 'rung' },
  { base: 'rise', past: 'rose', participle: 'risen' },
  { base: 'run', past: 'ran', participle: 'run' },
  { base: 'say', past: 'said', participle: 'said' },
  { base: 'see', past: 'saw', participle: 'seen' },
  { base: 'sell', past: 'sold', participle: 'sold' },
  { base: 'send', past: 'sent', participle: 'sent' },
  { base: 'show', past: 'showed', participle: 'shown' },
  { base: 'sing', past: 'sang', participle: 'sung' },
  { base: 'sit', past: 'sat', participle: 'sat' },
  { base: 'sleep', past: 'slept', participle: 'slept' },
  { base: 'speak', past: 'spoke', participle: 'spoken' },
  { base: 'spend', past: 'spent', participle: 'spent' },
  { base: 'stand', past: 'stood', participle: 'stood' },
  { base: 'swim', past: 'swam', participle: 'swum' },
  { base: 'take', past: 'took', participle: 'taken' },
  { base: 'teach', past: 'taught', participle: 'taught' },
  { base: 'tell', past: 'told', participle: 'told' },
  { base: 'think', past: 'thought', participle: 'thought' },
  { base: 'understand', past: 'understood', participle: 'understood' },
  { base: 'wear', past: 'wore', participle: 'worn' },
  { base: 'win', past: 'won', participle: 'won' },
  { base: 'write', past: 'wrote', participle: 'written' }
];

const irregularVerbIndex = new Map();
IRREGULAR_VERBS.forEach((entry) => {
  [entry.base, entry.past, entry.participle]
    .join('/')
    .split(/[\/,]/)
    .map(part => part.trim().toLowerCase())
    .filter(Boolean)
    .forEach((form) => {
      irregularVerbIndex.set(form, entry);
    });
});

function toRegularPast(base) {
  const verb = String(base || '').toLowerCase().trim();
  if (!verb) return '';
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ied`;
  if (/e$/.test(verb)) return `${verb}d`;
  return `${verb}ed`;
}

function lookupIrregularVerb(term) {
  const normalized = String(term || '').toLowerCase().trim().replace(/[^a-z/-]/g, '');
  if (!normalized) return null;
  const entry = irregularVerbIndex.get(normalized);
  if (entry) {
    return { ...entry, irregular: true };
  }
  return {
    base: normalized,
    past: toRegularPast(normalized),
    participle: toRegularPast(normalized),
    irregular: false
  };
}

function setupVerbLookup() {
  const inputEl = document.getElementById('verb-search-input');
  const resultEl = document.getElementById('verb-search-result');
  if (!inputEl || !resultEl) return;

  inputEl.addEventListener('input', (e) => {
    const term = e.target.value.trim();
    if (!term) {
      resultEl.innerHTML = 'Nhập động từ để xem V2, V3.';
      resultEl.className = 'verb-result';
      return;
    }

    const lookup = lookupIrregularVerb(term);
    if (!lookup) {
      resultEl.innerHTML = 'Vui lòng nhập một từ tiếng Anh hợp lệ.';
      resultEl.className = 'verb-result';
      return;
    }

    resultEl.className = `verb-result has-result ${lookup.irregular ? '' : 'is-regular'}`;

    const sourceLabel = lookup.irregular
      ? 'Bất quy tắc'
      : 'Động từ có quy tắc (thêm ed)';

    resultEl.innerHTML = `
      <div style="margin-bottom: 4px;"><strong>V1:</strong> ${escapeHtml(lookup.base)}</div>
      <div style="margin-bottom: 4px;"><strong>V2:</strong> ${escapeHtml(lookup.past)}</div>
      <div style="margin-bottom: 4px;"><strong>V3:</strong> ${escapeHtml(lookup.participle)}</div>
      <div style="color: var(--text-muted); font-size: 11px; margin-top: 6px;">💡 ${escapeHtml(sourceLabel)}</div>
    `;
  });
}

