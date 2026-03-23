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
const examLockByWindow = new Map(); // windowId -> { tabId, updatedAt }
const examLockNotifyByTab = new Map(); // tabId -> timestamp
const AI_PROVIDER_CONFIG = Object.freeze({
  openai: {
    label: 'OpenAI',
    model: 'gpt-4o-mini'
  },
  gemini: {
    label: 'Google Gemini',
    model: 'gemini-2.5-flash'
  },
  openrouter: {
    label: 'OpenRouter',
    model: 'google/gemini-2.5-flash'
  }
});

// ============ Pomodoro State ============
let isPomodoroRunning = false;
let isPomodoroBreak = false;
const BLOCKED_SITES = [
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com', 'reddit.com'
];

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

    case 'exam_lock_update':
      return handleExamLockUpdate(message, sender);

    case 'ask_ai':
      return await handleAskAi(message);

    case 'test_ai_connection':
      return await handleTestAiConnection(message);

    case 'pomodoro_state':
      isPomodoroRunning = message.isRunning;
      isPomodoroBreak = message.isBreak;
      if (isPomodoroRunning && !isPomodoroBreak) enforcePomodoroBlock();
      return { ok: true };

    case 'notify_pomodoro':
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: message.isBreak ? 'Đến giờ nghỉ giải lao! (5 phút)' : 'Hết giờ nghỉ! Quay lại học nhé (25 phút)',
        message: 'Pomodoro timer',
        priority: 2
      });
      return { ok: true };

    case 'save_grammar_sentence':
      await saveGrammarSentence(message.payload);
      return { ok: true };

    case 'get_grammar_sentences':
      return { ok: true, data: await getGrammarSentences() };

    case 'save_grammar_sentences': {
      const batchRes = await saveGrammarSentences(message.sentences);
      return { ok: true, data: batchRes };
    }

    case 'update_grammar_sentence':
      await markGrammarSentenceCorrect(message.id, message.isCorrect);
      return { ok: true };

    case 'get_ai_usage':
      return { ok: true, data: await getAiUsage() };

    case 'reset_ai_usage':
      await resetAiUsage();
      return { ok: true };

    default:
      return { ok: false, error: `Unknown action: ${message.action}` };
  }
}

async function getAiUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const res = await new Promise(r => chrome.storage.local.get('ai_usage', r));
  const usage = res.ai_usage || {};
  if (usage.date !== today) return { date: today, requests: 0, tokensIn: 0, tokensOut: 0, tokensTotal: 0 };
  return usage;
}

async function saveAiUsage(delta) {
  const today = new Date().toISOString().slice(0, 10);
  const current = await getAiUsage();
  const next = {
    date: today,
    requests: (current.requests || 0) + (delta.requests || 0),
    tokensIn: (current.tokensIn || 0) + (delta.tokensIn || 0),
    tokensOut: (current.tokensOut || 0) + (delta.tokensOut || 0),
    tokensTotal: (current.tokensTotal || 0) + (delta.tokensTotal || 0)
  };
  await new Promise(r => chrome.storage.local.set({ ai_usage: next }, r));
  return next;
}

async function resetAiUsage() {
  await new Promise(r => chrome.storage.local.remove('ai_usage', r));
}

async function handleAskAi(message) {
  const { provider, apiKey } = await getAiCredentials(message);

  if (provider === 'none' || !apiKey) {
    return { ok: false, error: 'AI provider or API key is not configured.' };
  }

  const payload = message.payload || {};
  const aiType = message.aiType || payload.aiType;
  const wordOrContext = message.wordOrContext || payload.wordOrContext;
  const word = message.word || payload.word;
  const contextInfo = message.contextInfo || payload.contextInfo;
  const history = message.history || payload.history;

  let prompt = '';

  if (aiType === 'example') {
    prompt = `Bạn là một giáo viên tiếng Anh xuất sắc. Hãy đưa ra 3 câu ví dụ dễ hiểu mang tính ứng dụng cao chứa từ vựng "${word || wordOrContext}" (nếu có thể, hãy dịch nghĩa tiếng Việt cho các ví dụ này). Lời giải thích phải rất ngắn gọn, trực quan, dễ nhớ.`;
  } else if (aiType === 'grammar_gen') {
    prompt = wordOrContext;
  } else if (aiType === 'grammar') {
    if (wordOrContext && (wordOrContext.includes('Học sinh nhập:') || wordOrContext.includes('Học sinh viết:'))) {
      prompt = wordOrContext; // Use the rich prompt passed directly from content script
    } else {
      prompt = `Bạn là một giáo viên tiếng Anh xuất sắc.
Ngữ cảnh (câu hỏi/từ): "${contextInfo || word || wordOrContext}"
Học sinh gõ sai thành: "${history ? history.map(h => h.typed).join(', ') : '?'}"

Yêu cầu:
1. Giải thích siêu ngắn gọn, cực kỳ dễ hiểu, tuyệt đối không dùng thuật ngữ chuyên ngành ngữ pháp phức tạp.
2. Trình bày bằng các gạch đầu dòng rõ ràng để dễ đọc (VD: "- Lỗi sai:", "- Cách nhớ đúng:").
3. Sửa lại cho đúng và hướng dẫn trực quan.`;
    }
  } else {
    return { ok: false, error: 'Invalid AI prompt type.' };
  }

  try {
    const { text: resultText, usage } = await requestAiText({ provider, apiKey, prompt });
    // Track usage
    if (usage && usage.tokensTotal > 0) {
      await saveAiUsage({ requests: 1, ...usage });
    } else {
      await saveAiUsage({ requests: 1, tokensIn: 0, tokensOut: 0, tokensTotal: 0 });
    }
    return { ok: true, data: resultText, result: resultText };
  } catch (error) {
    console.error('AI API error:', error);
    return { ok: false, error: 'AI Request failed: ' + error.message };
  }
}

async function handleTestAiConnection(message) {
  const { provider, apiKey } = await getAiCredentials(message);
  const config = AI_PROVIDER_CONFIG[provider];

  if (!config) {
    return { ok: false, error: 'Nhà cung cấp AI không hợp lệ.' };
  }

  if (!apiKey) {
    return { ok: false, error: 'Bạn chưa nhập API key để kiểm tra.' };
  }

  try {
    const { text: resultText } = await requestAiText({
      provider,
      apiKey,
      prompt: 'Trả lời chính xác 1 từ: OK',
      isConnectionTest: true
    });

    return {
      ok: true,
      data: {
        provider,
        providerLabel: config.label,
        model: config.model,
        preview: resultText,
        message: `Kết nối thành công với ${config.label} (${config.model}). AI phản hồi: "${resultText}".`
      }
    };
  } catch (error) {
    console.error('AI connection test failed:', error);
    return { ok: false, error: error.message || 'Không thể kiểm tra API AI.' };
  }
}

async function getAiCredentials(message = {}) {
  const settings = await getSettings();
  const hasProvider = Object.prototype.hasOwnProperty.call(message, 'provider');
  const hasApiKey = Object.prototype.hasOwnProperty.call(message, 'apiKey');

  const provider = hasProvider ? (message.provider || 'none') : (settings.aiProvider || 'none');
  const apiKeyRaw = hasApiKey ? message.apiKey : settings.aiKey;
  const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw.trim() : '';

  return { provider, apiKey };
}

async function requestAiText({ provider, apiKey, prompt, isConnectionTest = false }) {
  const config = AI_PROVIDER_CONFIG[provider];

  if (!config) {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  if (provider === 'openai') {
    const data = await postJson(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: isConnectionTest ? 0 : 0.7,
          max_tokens: isConnectionTest ? 8 : 2000
        })
      },
      provider
    );

    const content = normalizeMessageContent(data?.choices?.[0]?.message?.content);
    if (!content) {
      throw new Error(`${config.label} không trả về nội dung phản hồi.`);
    }
    const usageOai = data?.usage || {};
    return {
      text: content,
      usage: {
        tokensIn: usageOai.prompt_tokens || 0,
        tokensOut: usageOai.completion_tokens || 0,
        tokensTotal: usageOai.total_tokens || 0
      }
    };
  }

  if (provider === 'gemini') {
    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: isConnectionTest ? 0 : 0.7,
        maxOutputTokens: isConnectionTest ? 8 : 8192
      }
    };

    const data = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(body)
      },
      provider
    );

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const content = parts
      .map(part => part?.text || '')
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!content) {
      const finishReason = data?.candidates?.[0]?.finishReason;
      throw new Error(
        finishReason
          ? `${config.label} không trả về nội dung (finish reason: ${finishReason}).`
          : `${config.label} không trả về nội dung phản hồi.`
      );
    }
    const meta = data?.usageMetadata || {};
    return {
      text: content,
      usage: {
        tokensIn: meta.promptTokenCount || 0,
        tokensOut: meta.candidatesTokenCount || 0,
        tokensTotal: meta.totalTokenCount || 0
      }
    };
  }

  // OpenRouter / OpenAI path - return same shape
  const data2 = await postJson(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: isConnectionTest ? 0 : 0.7,
        max_tokens: isConnectionTest ? 8 : 2000
      })
    },
    provider
  );

  const content2 = normalizeMessageContent(data2?.choices?.[0]?.message?.content);
  if (!content2) {
    throw new Error(`${config.label} không trả về nội dung phản hồi.`);
  }
  const usage2 = data2?.usage || {};
  return {
    text: content2,
    usage: {
      tokensIn: usage2.prompt_tokens || 0,
      tokensOut: usage2.completion_tokens || 0,
      tokensTotal: usage2.total_tokens || 0
    }
  };
}

async function postJson(url, options, provider) {
  const response = await fetch(url, options);
  const rawText = await response.text();

  let data = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      data = null;
    }
  }

  if (!response.ok) {
    throw new Error(buildAiHttpError(provider, response, data, rawText));
  }

  if (data?.error) {
    const message = typeof data.error === 'string'
      ? data.error
      : (data.error.message || data.error.status || JSON.stringify(data.error));
    throw new Error(message);
  }

  return data;
}

function buildAiHttpError(provider, response, data, rawText) {
  const config = AI_PROVIDER_CONFIG[provider];
  let detail = '';

  if (typeof data?.error === 'string') {
    detail = data.error;
  } else if (data?.error?.message) {
    detail = data.error.message;
  } else if (data?.message) {
    detail = data.message;
  } else if (rawText) {
    detail = rawText.slice(0, 300);
  } else {
    detail = response.statusText || 'Unknown error';
  }

  if (provider === 'openrouter' && response.status === 402) {
    detail = 'OpenRouter chưa đủ credit hoặc model này yêu cầu thanh toán.';
  }

  return `${config?.label || provider} API lỗi (${response.status}): ${detail}`;
}

function normalizeMessageContent(content) {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        return part?.text || '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
}

function isThayGiapUrl(url) {
  return typeof url === 'string' && /https?:\/\/([^/]+\.)?thaygiap\.com\//i.test(url);
}

function clearExamLockForWindow(windowId) {
  if (typeof windowId !== 'number') return;
  const locked = examLockByWindow.get(windowId);
  if (locked) {
    examLockNotifyByTab.delete(locked.tabId);
  }
  examLockByWindow.delete(windowId);
}

function clearExamLockForTab(tabId) {
  if (typeof tabId !== 'number') return;
  for (const [windowId, lock] of examLockByWindow.entries()) {
    if (lock.tabId === tabId) {
      clearExamLockForWindow(windowId);
      break;
    }
  }
}

async function handleExamLockUpdate(message, sender) {
  const tab = sender?.tab;
  if (!tab || typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
    return { ok: false, error: 'Missing sender tab' };
  }

  if (!isThayGiapUrl(tab.url || message?.context?.url || '')) {
    clearExamLockForTab(tab.id);
    return { ok: true, active: false };
  }

  if (message.active) {
    examLockByWindow.set(tab.windowId, {
      tabId: tab.id,
      updatedAt: Date.now()
    });
    return { ok: true, active: true };
  }

  const current = examLockByWindow.get(tab.windowId);
  if (current && current.tabId === tab.id) {
    clearExamLockForWindow(tab.windowId);
  }
  return { ok: true, active: false };
}

async function notifyExamLockViolation(tabId, reason) {
  const now = Date.now();
  const last = examLockNotifyByTab.get(tabId) || 0;
  if ((now - last) < 600) return;
  examLockNotifyByTab.set(tabId, now);

  let message = 'Bạn vừa rời tab kiểm tra. Đã quay lại bài test.';
  if (reason === 'background_new_tab') {
    message = 'Đã chặn mở tab mới trong lúc đang làm bài kiểm tra.';
  }

  await chrome.tabs.sendMessage(tabId, {
    action: 'exam_lock_violation',
    reason,
    message
  }).catch(() => {});
}

function getPrimaryExamLock() {
  let selected = null;
  for (const [windowId, lock] of examLockByWindow.entries()) {
    if (!selected || (lock.updatedAt || 0) > (selected.lock.updatedAt || 0)) {
      selected = { windowId, lock };
    }
  }
  return selected;
}

async function ensurePrimaryLockAvailable() {
  const primary = getPrimaryExamLock();
  if (!primary) return null;

  const tab = await chrome.tabs.get(primary.lock.tabId).catch(() => null);
  if (!tab || !isThayGiapUrl(tab.url || '')) {
    clearExamLockForWindow(primary.windowId);
    return null;
  }

  return primary;
}

async function enforceExamLockForActivatedTab(activeInfo) {
  const { tabId } = activeInfo || {};
  if (typeof tabId !== 'number') return;

  const primary = await ensurePrimaryLockAvailable();
  if (!primary) return;
  if (primary.lock.tabId === tabId) return;

  await chrome.tabs.update(primary.lock.tabId, { active: true }).catch(() => {});
  await chrome.windows.update(primary.windowId, { focused: true }).catch(() => {});
  await notifyExamLockViolation(primary.lock.tabId, 'background_tab_switch');
}

async function enforceExamLockForNewTab(tab) {
  if (!tab || typeof tab.id !== 'number') return;

  const primary = await ensurePrimaryLockAvailable();
  if (!primary) return;
  if (primary.lock.tabId === tab.id) return;

  await chrome.tabs.remove(tab.id).catch(() => {});
  await chrome.tabs.update(primary.lock.tabId, { active: true }).catch(() => {});
  await chrome.windows.update(primary.windowId, { focused: true }).catch(() => {});
  await notifyExamLockViolation(primary.lock.tabId, 'background_new_tab');
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

  // Grammar sentences (Thaygiap tests)
  if (data.promptText && typeof data.promptText === 'string' && data.promptText.split(' ').length > 2) {
    let cloze = data.promptText;
    const answer = data.correctAnswer || data.english || data.userInput;
    const verbHint = data.baseVerb ? `(${data.baseVerb})` : null;
    
    if (verbHint && cloze.includes(verbHint)) {
      cloze = cloze.replace(verbHint, `___ (${data.baseVerb})`);
    } else {
      cloze = `${data.promptText} [___]`;
    }

    await saveGrammarSentence({
      sentence: cloze,
      english: answer,
      vietnamese: data.vietnamese || '',
      source: 'thaygiap',
      isCorrect: data.isCorrect,
      note: context.lessonTitle || ''
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
  if (changeInfo.url && !isThayGiapUrl(changeInfo.url)) {
    clearExamLockForTab(tabId);
  }

  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('thaygiap.com')) {
    // Notify content script about page load
    chrome.tabs.sendMessage(tabId, { action: 'page_loaded', url: tab.url })
      .catch(() => {
        // Content script not yet ready, ignore
      });
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  enforceExamLockForActivatedTab(activeInfo).catch((err) => {
    console.error('[ThayGiap Tracker] exam lock activation error:', err);
  });
});

chrome.tabs.onCreated.addListener((tab) => {
  enforceExamLockForNewTab(tab).catch((err) => {
    console.error('[ThayGiap Tracker] exam lock tab create error:', err);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearExamLockForTab(tabId);
});

chrome.windows.onRemoved.addListener((windowId) => {
  clearExamLockForWindow(windowId);
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

// ============ Pomodoro Networking Block ============

async function enforcePomodoroBlock() {
  if (!isPomodoroRunning || isPomodoroBreak) return;
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url) {
        if (BLOCKED_SITES.some(site => tab.url.includes(site))) {
          chrome.tabs.remove(tab.id).catch(() => {});
        }
      }
    });
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (isPomodoroRunning && !isPomodoroBreak && tab && tab.url) {
    if (BLOCKED_SITES.some(site => tab.url.includes(site))) {
      chrome.tabs.remove(tabId).catch(() => {});
    }
  }
});
