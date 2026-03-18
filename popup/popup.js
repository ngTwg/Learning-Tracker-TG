/**
 * ThayGiap Learning Tracker - Popup Script
 * ==========================================
 * Loads stats from background, renders them in the popup UI.
 */

document.addEventListener('DOMContentLoaded', async () => {
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

  // Load all data
  await loadTodayStats();
  await loadVocabSummary();
  await loadRecentSessions();

  // Setup buttons
  setupButtons();
});

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

// ============ Button Handlers ============
function setupButtons() {
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
          a.download = `thaygiap-tracker-export-${new Date().toISOString().split('T')[0]}.json`;
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
        // Send toggle to content script of active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && tab.url.includes('thaygiap.com')) {
          chrome.tabs.sendMessage(tab.id, { action: 'toggle_tracking' }, (response) => {
            const icon = document.getElementById('tracking-icon');
            if (icon) {
              icon.textContent = response && response.isTracking ? '🟢' : '🔴';
            }
          });
        }
      } catch (err) {
        console.error('Toggle error:', err);
      }
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
