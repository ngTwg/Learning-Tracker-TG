/**
 * ThayGiap Learning Tracker - Background Service Worker
 * ======================================================
 * Receives messages from content.js, saves events, and computes summaries.
 */

// Import storage utilities (non-module service worker)
try {
  importScripts('utils/storage.js');
} catch (e) {
  console.error('[ThayGiap Tracker] Failed to import storage.js:', e);
}

console.log('[ThayGiap Tracker] Background service worker started');

const CONTEXT_MENU_ADD_REVIEW = 'tg-add-selection-review';

// ============ Message Handler ============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) {
    sendResponse({ ok: false, error: 'Invalid message' });
    return true;
  }

  handleMessage(message, sender)
    .then(result => sendResponse(result))
    .catch(err => {
      console.error('[ThayGiap Tracker] Error handling message:', err);
      sendResponse({ ok: false, error: err.message });
    });

  return true; // Keep sendResponse channel open for async
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'log_event':
      return handleLogEvent(message.payload);

    case 'get_today_stats':
      return { ok: true, data: await getTodayStats() };

    case 'get_weekly_stats':
      return { ok: true, data: await getWeeklyStats() };

    case 'get_vocab_summaries':
      return { ok: true, data: await getVocabSummaries() };

    case 'get_session_summaries':
      return { ok: true, data: await getSessionSummaries() };

    case 'get_events':
      return { ok: true, data: await getEvents(message.filters || {}) };

    case 'export_data':
      return { ok: true, data: await exportAllData() };

    case 'clear_data':
      await clearAllData();
      return { ok: true };

    case 'get_settings':
      return { ok: true, data: await getSettings() };

    case 'update_settings':
      const updated = await updateSettings(message.settings);
      await broadcastSettingsToTrackedTabs(updated);
      return { ok: true, data: updated };

    case 'get_review_list':
      return { ok: true, data: await getReviewList() };

    case 'mark_review_correct':
      await markReviewCorrect(message.vietnamese);
      return { ok: true };

    case 'add_to_review_list':
      await addToReviewList(message.vietnamese);
      return { ok: true };

    case 'sm2_review':
      await processSM2Review(message.vietnamese, message.quality);
      return { ok: true };

    case 'import_anki_rows':
      return { ok: true, data: await importAnkiRows(message.rows || []) };

    default:
      return { ok: false, error: `Unknown action: ${message.action}` };
  }
}

async function broadcastSettingsToTrackedTabs(settings) {
  const tabs = await chrome.tabs.query({
    url: ['https://thaygiap.com/*', 'http://thaygiap.com/*']
  });

  await Promise.all(
    tabs.map(tab =>
      chrome.tabs.sendMessage(tab.id, { action: 'settings_updated', settings }).catch(() => {})
    )
  );
}

// ============ Event Processing ============

async function handleLogEvent(payload) {
  if (!payload || !payload.type) {
    return { ok: false, error: 'Invalid payload' };
  }

  // Save raw event
  const savedEvent = await saveEvent(payload);

  // Process specific event types
  switch (payload.type) {
    case 'answer_result':
      await processAnswerResult(payload);
      break;

    case 'submit_click':
      await processSubmitClick(payload);
      break;

    case 'score_detected':
      await processScoreDetected(payload);
      break;

    case 'lesson_open':
      await processLessonOpen(payload);
      break;
  }

  return { ok: true, event: savedEvent };
}

async function processAnswerResult(payload) {
  const data = payload.data || {};
  const context = payload.context || {};

  // Update vocab summary
  if (data.vietnamese) {
    await updateVocabSummary({
      vietnamese: data.vietnamese,
      english: data.isCorrect ? data.userInput : (data.correctAnswer || data.english || ''),
      userInput: data.userInput || '',      // ← pass what user typed
      correctAnswer: data.correctAnswer || '',
      isCorrect: data.isCorrect,
      attemptNumber: data.attemptNumber || 1
    });
  }

  // Update session summary
  if (context.lessonTitle) {
    const lessonKey = `${context.url || ''}|${context.lessonTitle}|${context.partType || 'unknown'}|${context.currentItem || ''}`;
    await updateSessionSummary({
      lessonKey,
      lessonTitle: context.lessonTitle,
      sessionTitle: context.sessionTitle,
      partType: context.partType,
      currentItem: context.currentItem,
      correct: data.isCorrect ? 1 : 0,
      wrong: data.isCorrect ? 0 : 1
    });
  }
}

async function processSubmitClick(payload) {
  const context = payload.context || {};
  const data = payload.data || {};

  if (context.lessonTitle) {
    const lessonKey = `${context.url || ''}|${context.lessonTitle}|${context.partType || 'unknown'}|${context.currentItem || ''}`;
    await updateSessionSummary({
      lessonKey,
      lessonTitle: context.lessonTitle,
      sessionTitle: context.sessionTitle,
      partType: context.partType,
      currentItem: context.currentItem
    });
  }
}

async function processScoreDetected(payload) {
  const context = payload.context || {};
  const data = payload.data || {};

  if (context.lessonTitle && data.score !== undefined) {
    const lessonKey = `${context.url || ''}|${context.lessonTitle}|test|${context.currentItem || ''}`;
    await updateSessionSummary({
      lessonKey,
      lessonTitle: context.lessonTitle,
      sessionTitle: context.sessionTitle,
      partType: 'test',
      currentItem: context.currentItem,
      score: data.score
    });
  }
}

async function processLessonOpen(payload) {
  const context = payload.context || {};

  if (context.lessonTitle) {
    const lessonKey = `${context.url || ''}|${context.lessonTitle}|${context.partType || 'unknown'}|${context.currentItem || ''}`;
    await updateSessionSummary({
      lessonKey,
      lessonTitle: context.lessonTitle,
      sessionTitle: context.sessionTitle,
      partType: context.partType,
      currentItem: context.currentItem
    });
  }
}

// ============ Tab/Navigation Tracking ============

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('thaygiap.com')) {
    // Notify content script about page load
    chrome.tabs.sendMessage(tabId, { action: 'page_loaded', url: tab.url })
      .catch(() => {
        // Content script not yet ready, ignore
      });
  }
});

// ============ Extension Install/Update ============

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[ThayGiap Tracker] Extension installed!');
    // Set default settings
    storageSet({
      [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS
    });
  } else if (details.reason === 'update') {
    console.log('[ThayGiap Tracker] Extension updated to', chrome.runtime.getManifest().version);
  }

  // Create an alarm to check for reviews every hour
  chrome.alarms.create('checkReviewCount', { periodInMinutes: 60 });
  createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('checkReviewCount', { periodInMinutes: 60 });
  createContextMenus();
});

function createContextMenus() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: CONTEXT_MENU_ADD_REVIEW,
        title: 'Thêm "%s" vào danh sách ôn tập',
        contexts: ['selection'],
        documentUrlPatterns: ['https://thaygiap.com/*', 'http://thaygiap.com/*']
      });
    });
  } catch (err) {
    console.error('[ThayGiap Tracker] createContextMenus error:', err);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ADD_REVIEW) return;

  const selected = (info.selectionText || '').trim();
  if (!selected) return;

  try {
    await addToReviewList(selected);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Đã thêm vào ôn tập',
      message: `"${selected}" đã được thêm vào danh sách ôn tập.`,
      priority: 1
    });
  } catch (err) {
    console.error('[ThayGiap Tracker] context menu add review error:', err);
  }
});

// ============ Notifications & Spaced Repetition (SM-2) ============

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkReviewCount') {
    try {
      const settings = await getSettings();
      if (!settings.notificationsEnabled) return;

      const reviews = await getReviewList();
      if (reviews && reviews.length > 0) {
        const data = await storageGet(['tg_last_notified']);
        const lastNotified = data['tg_last_notified'];
        const today = getDateString();

        if (lastNotified !== today) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '⏰ Đến giờ ôn tập rồi!',
            message: `Hôm nay bạn có ${reviews.length} từ vựng cần ôn tập bằng Flashcards (SM-2). Hãy ôn ngay kẻo quên nhé!`,
            priority: 2
          });
          await storageSet({ tg_last_notified: today });
        }
      }
    } catch (err) {
      console.error('[ThayGiap Tracker] Error checking review count:', err);
    }
  }
});
