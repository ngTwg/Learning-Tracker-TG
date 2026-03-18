/**
 * ThayGiap Learning Tracker - Storage Utilities
 * ================================================
 * Helper functions for chrome.storage.local operations.
 * Used by both content.js and popup/options.
 */

// ============ Constants ============
const STORAGE_KEYS = {
  EVENTS: 'tg_events',
  VOCAB_SUMMARY: 'tg_vocab_summary',
  SESSION_SUMMARY: 'tg_session_summary',
  SETTINGS: 'tg_settings',
  LAST_SYNC: 'tg_last_sync'
};

const MAX_EVENTS = 50000; // Max events to keep before auto-cleanup

// ============ UUID Generator ============
function generateUUID() {
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============ Date Helpers ============
function getDateString(timestamp) {
  const d = new Date(timestamp || Date.now());
  return d.toISOString().split('T')[0]; // "2026-03-18"
}

function getTimeString(timestamp) {
  const d = new Date(timestamp || Date.now());
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  if (days < 7) return `${days} ngày trước`;
  return getDateString(timestamp);
}

// ============ Storage Read/Write ============

/**
 * Get data from chrome.storage.local
 * @param {string|string[]} keys 
 * @returns {Promise<object>}
 */
function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (data) => {
      resolve(data);
    });
  });
}

/**
 * Set data to chrome.storage.local
 * @param {object} data 
 * @returns {Promise<void>}
 */
function storageSet(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => {
      resolve();
    });
  });
}

/**
 * Remove keys from chrome.storage.local
 * @param {string|string[]} keys 
 * @returns {Promise<void>}
 */
function storageRemove(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => {
      resolve();
    });
  });
}

// ============ Event Management ============

/**
 * Save a new event
 * @param {object} event 
 */
async function saveEvent(event) {
  const data = await storageGet([STORAGE_KEYS.EVENTS]);
  const events = data[STORAGE_KEYS.EVENTS] || [];

  const fullEvent = {
    id: generateUUID(),
    timestamp: Date.now(),
    date: getDateString(),
    ...event
  };

  events.push(fullEvent);

  // Auto-cleanup: keep last MAX_EVENTS
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }

  await storageSet({ [STORAGE_KEYS.EVENTS]: events });
  return fullEvent;
}

/**
 * Get all events, optionally filtered
 * @param {object} filters - { date, type, partType, lessonTitle }
 * @returns {Promise<object[]>}
 */
async function getEvents(filters = {}) {
  const data = await storageGet([STORAGE_KEYS.EVENTS]);
  let events = data[STORAGE_KEYS.EVENTS] || [];

  if (filters.date) {
    events = events.filter(e => e.date === filters.date);
  }
  if (filters.type) {
    events = events.filter(e => e.type === filters.type);
  }
  if (filters.partType) {
    events = events.filter(e => e.context && e.context.partType === filters.partType);
  }
  if (filters.lessonTitle) {
    events = events.filter(e => e.context && e.context.lessonTitle === filters.lessonTitle);
  }

  return events;
}

/**
 * Get events for today
 */
async function getTodayEvents() {
  return getEvents({ date: getDateString() });
}

// ============ Vocab Summary ============

/**
 * Update vocab summary when an answer_result event occurs
 * @param {object} vocabData - { vietnamese, english, isCorrect, userInput, attemptNumber }
 */
async function updateVocabSummary(vocabData) {
  const data = await storageGet([STORAGE_KEYS.VOCAB_SUMMARY]);
  const summaries = data[STORAGE_KEYS.VOCAB_SUMMARY] || {};

  const key = vocabData.vietnamese.toLowerCase().trim();
  const now = Date.now();

  if (!summaries[key]) {
    summaries[key] = {
      vietnamese: vocabData.vietnamese,
      english: vocabData.english || '',
      totalAttempts: 0,
      wrongAttempts: 0,
      correctAttempts: 0,
      firstSeen: now,
      lastSeen: now,
      avgAttemptsBeforeCorrect: 0,
      streakCorrect: 0,
      attemptsBeforeCorrectList: [],
      wrongInputHistory: [], // ← NEW: log what user actually typed wrong
      inReviewList: false,   // ← NEW: whether in practice review list
      mastery: 'new'
    };
  }

  const s = summaries[key];
  s.lastSeen = now;
  s.totalAttempts++;

  // Update english if we got the correct answer
  if (vocabData.english && vocabData.english.trim()) {
    s.english = vocabData.english;
  }

  if (vocabData.isCorrect) {
    s.correctAttempts++;
    s.streakCorrect++;
    if (vocabData.attemptNumber) {
      s.attemptsBeforeCorrectList.push(vocabData.attemptNumber);
      if (s.attemptsBeforeCorrectList.length > 20) s.attemptsBeforeCorrectList.shift();
      const sum = s.attemptsBeforeCorrectList.reduce((a, b) => a + b, 0);
      s.avgAttemptsBeforeCorrect = +(sum / s.attemptsBeforeCorrectList.length).toFixed(2);
    }
  } else {
    s.wrongAttempts++;
    s.streakCorrect = 0;

    // ← NEW: track what the user actually typed when wrong
    if (!s.wrongInputHistory) s.wrongInputHistory = [];
    if (vocabData.userInput && vocabData.userInput.trim()) {
      s.wrongInputHistory.push({
        typed: vocabData.userInput.trim(),
        correct: vocabData.english || vocabData.correctAnswer || '',
        at: now
      });
      // Keep last 50 wrong entries per word
      if (s.wrongInputHistory.length > 50) s.wrongInputHistory.shift();
    }

    // Auto-add to review list if wrong ≥ 1 time
    if (s.wrongAttempts >= 1) s.inReviewList = true;
  }

  // Update mastery level
  if (s.correctAttempts === 0) {
    s.mastery = 'new';
  } else if (s.streakCorrect >= 3 && s.avgAttemptsBeforeCorrect <= 1.2) {
    s.mastery = 'mastered';
  } else if (s.streakCorrect >= 2) {
    s.mastery = 'reviewing';
  } else {
    s.mastery = 'learning';
  }

  await storageSet({ [STORAGE_KEYS.VOCAB_SUMMARY]: summaries });
  return s;
}

/**
 * Get words in the review list (wrong ≥ 2 times and not yet mastered)
 */
async function getReviewList() {
  const summaries = await getVocabSummaries();
  return Object.values(summaries).filter(s =>
    s.inReviewList && s.mastery !== 'mastered'
  );
}

/**
 * Mark a word as correctly answered in review → remove from review list
 * @param {string} vietnamese
 */
async function markReviewCorrect(vietnamese) {
  const data = await storageGet([STORAGE_KEYS.VOCAB_SUMMARY]);
  const summaries = data[STORAGE_KEYS.VOCAB_SUMMARY] || {};
  const key = vietnamese.toLowerCase().trim();
  if (summaries[key]) {
    summaries[key].inReviewList = false;
    summaries[key].streakCorrect = (summaries[key].streakCorrect || 0) + 1;
    // Upgrade mastery if earned
    if (summaries[key].streakCorrect >= 3) summaries[key].mastery = 'mastered';
    else if (summaries[key].streakCorrect >= 2) summaries[key].mastery = 'reviewing';
    else summaries[key].mastery = 'learning';
    await storageSet({ [STORAGE_KEYS.VOCAB_SUMMARY]: summaries });
  }
}

/**
 * Re-add a word back to review list manually
 * @param {string} vietnamese
 */
async function addToReviewList(vietnamese) {
  const data = await storageGet([STORAGE_KEYS.VOCAB_SUMMARY]);
  const summaries = data[STORAGE_KEYS.VOCAB_SUMMARY] || {};
  const key = vietnamese.toLowerCase().trim();
  if (summaries[key]) {
    summaries[key].inReviewList = true;
    await storageSet({ [STORAGE_KEYS.VOCAB_SUMMARY]: summaries });
  }
}

/**
 * Get all vocab summaries
 * @returns {Promise<object>} 
 */
async function getVocabSummaries() {
  const data = await storageGet([STORAGE_KEYS.VOCAB_SUMMARY]);
  return data[STORAGE_KEYS.VOCAB_SUMMARY] || {};
}

// ============ Session Summary ============

/**
 * Update session summary
 * @param {object} sessionData
 */
async function updateSessionSummary(sessionData) {
  const data = await storageGet([STORAGE_KEYS.SESSION_SUMMARY]);
  const summaries = data[STORAGE_KEYS.SESSION_SUMMARY] || {};

  const key = sessionData.lessonKey;
  const now = Date.now();
  const today = getDateString();

  if (!summaries[key]) {
    summaries[key] = {
      lessonKey: key,
      lessonTitle: sessionData.lessonTitle || '',
      sessionTitle: sessionData.sessionTitle || '',
      partType: sessionData.partType || 'unknown',
      currentItem: sessionData.currentItem || '',
      totalWords: 0,
      correctWords: 0,
      wrongWords: 0,
      avgWrongBeforeCorrect: 0,
      scores: [],
      timeSpentMs: 0,
      dates: [],
      lastPracticed: now,
      attempts: 0
    };
  }

  const s = summaries[key];
  s.lastPracticed = now;

  if (!s.dates.includes(today)) {
    s.dates.push(today);
  }

  if (sessionData.correct !== undefined) {
    s.correctWords += sessionData.correct;
  }
  if (sessionData.wrong !== undefined) {
    s.wrongWords += sessionData.wrong;
  }
  if (sessionData.totalWords !== undefined) {
    s.totalWords = Math.max(s.totalWords, sessionData.totalWords);
  }
  if (sessionData.score !== undefined) {
    s.scores.push(sessionData.score);
  }
  if (sessionData.timeSpentMs) {
    s.timeSpentMs += sessionData.timeSpentMs;
  }
  s.attempts++;

  await storageSet({ [STORAGE_KEYS.SESSION_SUMMARY]: summaries });
  return s;
}

/**
 * Get all session summaries
 */
async function getSessionSummaries() {
  const data = await storageGet([STORAGE_KEYS.SESSION_SUMMARY]);
  return data[STORAGE_KEYS.SESSION_SUMMARY] || {};
}

// ============ Settings ============

const DEFAULT_SETTINGS = {
  trackingEnabled: true,
  notificationsEnabled: false,
  autoExport: false,
  theme: 'dark'
};

async function getSettings() {
  const data = await storageGet([STORAGE_KEYS.SETTINGS]);
  return { ...DEFAULT_SETTINGS, ...(data[STORAGE_KEYS.SETTINGS] || {}) };
}

async function updateSettings(newSettings) {
  const current = await getSettings();
  const merged = { ...current, ...newSettings };
  await storageSet({ [STORAGE_KEYS.SETTINGS]: merged });
  return merged;
}

// ============ Export/Clear ============

async function exportAllData() {
  const data = await storageGet([
    STORAGE_KEYS.EVENTS,
    STORAGE_KEYS.VOCAB_SUMMARY,
    STORAGE_KEYS.SESSION_SUMMARY,
    STORAGE_KEYS.SETTINGS
  ]);
  return {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    ...data
  };
}

async function clearAllData() {
  await storageRemove([
    STORAGE_KEYS.EVENTS,
    STORAGE_KEYS.VOCAB_SUMMARY,
    STORAGE_KEYS.SESSION_SUMMARY
  ]);
}

// ============ Statistics Helpers ============

async function getTodayStats() {
  const events = await getTodayEvents();
  const vocabAttempts = events.filter(e => e.type === 'answer_result');
  const correct = vocabAttempts.filter(e => e.data && e.data.isCorrect);
  const wrong = vocabAttempts.filter(e => e.data && !e.data.isCorrect);
  const uniqueWords = new Set(vocabAttempts.map(e => e.data && e.data.vietnamese).filter(Boolean));

  return {
    totalEvents: events.length,
    totalAttempts: vocabAttempts.length,
    correctCount: correct.length,
    wrongCount: wrong.length,
    accuracy: vocabAttempts.length > 0 ? +(correct.length / vocabAttempts.length * 100).toFixed(1) : 0,
    uniqueWords: uniqueWords.size,
    wordsList: Array.from(uniqueWords)
  };
}

async function getWeeklyStats() {
  const data = await storageGet([STORAGE_KEYS.EVENTS]);
  const allEvents = data[STORAGE_KEYS.EVENTS] || [];

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const weekEvents = allEvents.filter(e => e.timestamp >= weekAgo);

  const dailyStats = {};
  for (let i = 0; i < 7; i++) {
    const date = getDateString(now - i * 86400000);
    const dayEvents = weekEvents.filter(e => e.date === date);
    const attempts = dayEvents.filter(e => e.type === 'answer_result');
    dailyStats[date] = {
      total: attempts.length,
      correct: attempts.filter(e => e.data && e.data.isCorrect).length,
      wrong: attempts.filter(e => e.data && !e.data.isCorrect).length
    };
  }

  return dailyStats;
}
