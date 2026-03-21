/**
 * ThayGiap Learning Tracker - Content Script
 * ============================================
 * Runs on thaygiap.com pages. Detects lesson context, tracks input attempts,
 * monitors correct/incorrect answers, and sends events to background.
 * 
 * DOM Analysis (from live inspection):
 * - Vocab table: 4 columns (Vietnamese | English | Vietnamese | English)
 * - Input fields: input with placeholder "Nhập đáp án", ID pattern "input-X-Y"
 * - Correct: class "correct" on input, green border/background
 * - Incorrect: class "incorrect" on input, red border + shows "Đáp án: [word]" below
 * - Buttons: "Luyện tập", "Kiểm tra", "Làm lại", "Tiếp theo"
 * - Tabs: "Lần 1", "Lần 2", "Lần 3", "Lần 4" (for test rounds)
 * - Framework: Angular + Ant Design
 */

(function() {
  'use strict';

  // ============ State ============
  const state = {
    context: null,
    inputTrackers: new Map(), // inputId -> { wrongCount, lastValue, vietnamese }
    sessionWordStats: new Map(), // vietnamese -> { wrong, correct }
    answeredInputIds: new Set(),
    errorBuckets: { spelling: 0, form: 0, spacing: 0, meaning: 0 },
    lastErrorLabel: '',
    sessionCorrect: 0,
    sessionWrong: 0,
    totalInputs: 0,
    dueReviewCount: 0,
    goalDailyAttempt: 0,
    todayAttempts: 0,
    goalProgressPct: 0,
    selectorWarning: false,
    focusMode: false,
    hudAutoMinimizeEnabled: true,
    hudAutoMinimizeTimerId: null,
    examLockEnabled: true,
    examFullscreenEnabled: true,
    examLockActive: false,
    examViolationCount: 0,
    examFullscreenExitCount: 0,
    examFullscreenExitTimes: [],
    examGuardBound: false,
    windowOpenPatched: false,
    originalWindowOpen: typeof window.open === 'function' ? window.open.bind(window) : null,
    lastExamViolationAt: 0,
    lastExamViolationReason: '',
    visibilityHiddenAt: 0,
    isFullscreenActive: !!document.fullscreenElement,
    suppressFullscreenExitRecord: false,
    lastFullscreenRequestAt: 0,
    lastFullscreenHintAt: 0,
    lastURL: location.href,
    isTracking: true,
    adapter: null,
    initTimer: null,
    urlWatcherIntervalId: null,
    contentRefreshIntervalId: null,
    hudTickIntervalId: null,
    dashboardRefreshIntervalId: null,
    lastDashboardFetchAt: 0,
    lastInitializedURL: '',
    lastInitializedAt: 0,
    isInitializing: false,
    observer: null,
    lessonOpenTime: null,
    badgeElement: null,
    lastFocusedInputId: '',
    examDraftAnswers: new Map(),
    verbLookupOpen: false
  };

  // ============ Logging ============
  const LOG_PREFIX = '[ThayGiap Tracker]';
  
  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function logError(...args) {
    console.error(LOG_PREFIX, ...args);
  }

  function getAdapter() {
    if (state.adapter) return state.adapter;
    const registry = window.TG_SITE_ADAPTERS;
    if (registry && typeof registry.getAdapter === 'function') {
      state.adapter = registry.getAdapter(location.hostname);
    } else {
      state.adapter = {
        id: 'fallback',
        selectors: {
          input: 'input[placeholder*="Nhập đáp án"], input[aria-label*="Nhập đáp án"], input[id^="input-"]',
          button: 'button, .ant-btn, input[type="button"], input[type="submit"], a[class*="btn"]',
          scoreScope: '.ant-menu-item, [class*="sidebar"] *, [class*="list"] *, [class*="menu"] *',
          contentReadyButton: 'button, .ant-btn'
        }
      };
    }
    return state.adapter;
  }

  function getInputSelector() {
    return getAdapter().selectors.input;
  }

  function getButtonSelector() {
    return getAdapter().selectors.button;
  }

  function getScoreScopeSelector() {
    return getAdapter().selectors.scoreScope;
  }

  function getReadyButtonSelector() {
    return getAdapter().selectors.contentReadyButton || getButtonSelector();
  }

  async function loadTrackingSettings() {
    try {
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'get_settings' }, resolve);
      });
      if (res?.ok && res?.data) {
        state.isTracking = res.data.trackingEnabled !== false;
        state.examLockEnabled = res.data.examLockEnabled !== false;
        state.examFullscreenEnabled = res.data.examFullscreenEnabled !== false;
        state.hudAutoMinimizeEnabled = res.data.hudAutoMinimizeEnabled !== false;
        syncExamLockState('settings_loaded');
      }
    } catch (err) {
      logError('Load settings error:', err);
    }
  }

  function normalizeText(v) {
    return String(v || '')
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/[_\s]+/g, ' ')
      .trim();
  }

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

  const irregularVerbIndex = (() => {
    const index = new Map();
    IRREGULAR_VERBS.forEach((entry) => {
      [entry.base, entry.past, entry.participle]
        .join('/')
        .split(/[\/,]/)
        .map(part => part.trim().toLowerCase())
        .filter(Boolean)
        .forEach((form) => {
          index.set(form, entry);
        });
    });
    return index;
  })();

  function normalizeInlineText(v) {
    return String(v || '')
      .replace(/\s+/g, ' ')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  function slugifySnippet(v, max = 80) {
    return normalizeInlineText(v)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max);
  }

  function isElementVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function hasClassToken(el, token) {
    if (!el?.classList) return false;
    const lower = token.toLowerCase();
    return Array.from(el.classList).some((cls) => String(cls || '').toLowerCase() === lower);
  }

  function closestWithClassToken(el, tokens = []) {
    const lookup = tokens.map(token => token.toLowerCase());
    let node = el;
    while (node) {
      if (node.classList && Array.from(node.classList).some((cls) => lookup.includes(String(cls || '').toLowerCase()))) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function buildRawInputSelector() {
    return Array.from(new Set([
      getInputSelector(),
      'input[type="text"]',
      'input:not([type])'
    ]))
      .filter(Boolean)
      .join(', ');
  }

  function isLikelyNonAnswerInput(input) {
    const meta = [
      input?.name,
      input?.id,
      input?.placeholder,
      input?.autocomplete,
      input?.getAttribute?.('aria-label'),
      input?.getAttribute?.('inputmode')
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return /\b(email|e-mail|password|search|tìm kiếm|username|phone|otp|login|đăng nhập)\b/.test(meta);
  }

  function getClosestMainArea(input) {
    return input?.closest?.('main, [role="main"], .ant-layout-content, .ant-layout, form, section, article') || document.body;
  }

  function getLocalContextText(input) {
    const containers = [
      input?.parentElement,
      input?.closest?.('label, td, p, li, div, form, section, article'),
      getClosestMainArea(input)
    ].filter(Boolean);

    return normalizeInlineText(
      containers
        .map(node => node?.textContent || '')
        .filter(Boolean)
        .join(' ')
        .slice(0, 500)
    );
  }

  function isTrackableAnswerInput(input) {
    if (!input || !isElementVisible(input) || input.disabled || input.readOnly) return false;
    if (input.closest?.('#tg-tracker-badge')) return false;
    if (isLikelyNonAnswerInput(input)) return false;

    const tag = String(input.tagName || '').toLowerCase();
    const type = String(input.type || '').toLowerCase();
    if (tag !== 'input') return false;
    if (type && !['text', 'search'].includes(type)) return false;

    const meta = [
      input.placeholder,
      input.getAttribute('aria-label'),
      input.id,
      input.name
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (/nhập đáp án|answer|đáp án/.test(meta)) return true;
    if (input.id && /^input[-_]/i.test(input.id)) return true;

    const url = location.href.toLowerCase();
    const contextText = getLocalContextText(input).toLowerCase();

    if (/\/user\/exam\b/i.test(url)) {
      if (input.closest('.exam-container, [role="main"], main, .ant-layout-content, [class*="exam"]')) return true;
      return /_{2,}|\([^)]+\)|câu\s+\d+|nộp bài|tiếp|trước|present perfect|hiện tại hoàn thành/i.test(contextText);
    }

    if (/\/lesson|\/practice|luyện tập/.test(url)) {
      return !!input.closest('table, form, main, [role="main"], .ant-layout-content');
    }

    return false;
  }

  function getTrackableInputs(root = document) {
    const selector = buildRawInputSelector();
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    const candidates = Array.from(scope.querySelectorAll(selector));
    return Array.from(new Set(candidates)).filter(isTrackableAnswerInput);
  }

  function detectQuestionProgress() {
    const candidates = document.querySelectorAll('button, span, div, p, h1, h2, h3, strong');
    for (const node of candidates) {
      const text = normalizeInlineText(node.textContent);
      const match = text.match(/câu\s*(\d+)\s*\/\s*(\d+)/i);
      if (match) {
        return {
          current: Number(match[1]) || null,
          total: Number(match[2]) || null,
          label: match[0]
        };
      }
    }

    const fallback = normalizeInlineText((document.body?.innerText || '').slice(0, 4000));
    const match = fallback.match(/câu\s*(\d+)\s*\/\s*(\d+)/i);
    if (match) {
      return {
        current: Number(match[1]) || null,
        total: Number(match[2]) || null,
        label: match[0]
      };
    }

    return { current: null, total: null, label: '' };
  }

  function findQuestionContainer(input) {
    let node = input?.parentElement;
    let best = null;

    while (node && node !== document.body) {
      const text = normalizeInlineText(node.textContent);
      const inputCount = node.querySelectorAll ? getTrackableInputs(node).length : 0;
      const looksLikeQuestion = /_{2,}|\([^)]+\)|\?|câu\s+\d+/i.test(text);
      const textLen = text.length;
      if (looksLikeQuestion && textLen >= 12 && textLen <= 280 && inputCount <= 4) {
        best = node;
        break;
      }
      if (!best && textLen >= 12 && textLen <= 180 && inputCount <= 2) {
        best = node;
      }
      node = node.parentElement;
    }

    return best || input?.parentElement || null;
  }

  function extractBaseVerb(text) {
    const matches = Array.from(String(text || '').matchAll(/\(([^()]+)\)/g));
    if (matches.length === 0) return '';
    const raw = matches[matches.length - 1][1]
      .replace(/\bnot\b/gi, ' ')
      .trim()
      .split(/\s+/)
      .pop();
    return String(raw || '').toLowerCase().replace(/[^a-z-]/g, '');
  }

  function extractQuestionMetaForInput(input, index = 0) {
    const container = findQuestionContainer(input);
    const promptText = normalizeInlineText(container?.textContent || getLocalContextText(input) || '');
    const groupRoot = container || input?.parentElement || document.body;
    const siblingInputs = getTrackableInputs(groupRoot);
    const blankIndex = Math.max(1, siblingInputs.indexOf(input) + 1 || index + 1);
    const progress = detectQuestionProgress();
    return {
      promptText,
      baseVerb: extractBaseVerb(promptText),
      blankIndex,
      blankCount: Math.max(1, siblingInputs.length || 1),
      questionIndex: progress.current,
      questionTotal: progress.total,
      questionLabel: progress.label
    };
  }

  function buildInputTrackingId(input, index, meta = {}) {
    const baseId = (input?.id || input?.name || '').trim();
    const questionKey = meta.questionIndex ? `q${meta.questionIndex}` : 'qx';
    const blankKey = `b${meta.blankIndex || index + 1}`;
    const promptKey = slugifySnippet(meta.promptText || '');

    if (state.context?.partType === 'test') {
      return ['exam', questionKey, promptKey || baseId || 'blank', blankKey].filter(Boolean).join('|');
    }

    if (baseId) return baseId;

    return [
      state.context?.partType || 'unknown',
      slugifySnippet(state.context?.currentItem || '') || 'item',
      promptKey || 'input',
      blankKey
    ].join('|');
  }

  function rememberFocusedInput(inputId) {
    if (inputId) state.lastFocusedInputId = inputId;
  }

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

  function getSuggestedVerbFromInput(input) {
    if (!input) return '';
    const tracker = state.inputTrackers.get(input.dataset.tgInputId || '');
    return tracker?.baseVerb || extractQuestionMetaForInput(input).baseVerb || '';
  }

  function upsertExamDraftAnswer(input, tracker, reason = 'input') {
    if (state.context?.partType !== 'test' || !input) return;
    const inputId = input.dataset.tgInputId || tracker?.inputId;
    if (!inputId) return;
    const meta = tracker?.meta || extractQuestionMetaForInput(input);

    state.examDraftAnswers.set(inputId, {
      inputId,
      questionIndex: meta.questionIndex || null,
      questionTotal: meta.questionTotal || null,
      questionLabel: meta.questionLabel || '',
      promptText: meta.promptText || tracker?.vietnamese || '',
      baseVerb: meta.baseVerb || tracker?.baseVerb || '',
      blankIndex: meta.blankIndex || 1,
      blankCount: meta.blankCount || 1,
      typedValue: String(input.value || '').trim(),
      currentItem: state.context?.currentItem || '',
      lessonTitle: state.context?.lessonTitle || '',
      updatedAt: Date.now(),
      reason
    });
  }

  function collectExamDraftAnswers() {
    return Array.from(state.examDraftAnswers.values()).sort((a, b) => {
      if ((a.questionIndex || 0) !== (b.questionIndex || 0)) {
        return (a.questionIndex || 0) - (b.questionIndex || 0);
      }
      return (a.blankIndex || 0) - (b.blankIndex || 0);
    });
  }

  function snapshotCurrentVisibleAnswers(reason = 'snapshot') {
    getTrackableInputs().forEach((input) => {
      const tracker = state.inputTrackers.get(input.dataset.tgInputId || '');
      upsertExamDraftAnswer(input, tracker, reason);
    });
    return collectExamDraftAnswers();
  }

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
        else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  function classifyError(userInput, correctAnswer) {
    const typed = normalizeText(userInput);
    const correct = normalizeText(correctAnswer);
    if (!typed || !correct) return { key: 'meaning', label: 'Nhầm nghĩa/khác' };

    if (typed.replace(/\s+/g, '') === correct.replace(/\s+/g, '') && typed !== correct) {
      return { key: 'spacing', label: 'Thiếu/Thừa khoảng trắng' };
    }

    const distance = levenshtein(typed, correct);
    if (distance <= 1 || (distance <= 2 && Math.max(typed.length, correct.length) >= 6)) {
      return { key: 'spelling', label: 'Sai chính tả' };
    }

    const stem = s => s.replace(/(ing|ed|es|s)$/i, '');
    if (stem(typed) === stem(correct) && typed !== correct) {
      return { key: 'form', label: 'Sai dạng từ' };
    }

    return { key: 'meaning', label: 'Nhầm nghĩa/khác' };
  }

  function formatDuration(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function formatETA(remainingItems) {
    if (!remainingItems || remainingItems <= 0) return 'ETA 00:00';
    const elapsed = state.lessonOpenTime ? (Date.now() - state.lessonOpenTime) : 0;
    const answered = state.answeredInputIds.size;
    if (!answered || elapsed <= 0) return 'ETA --:--';
    const avgPerItem = elapsed / answered;
    return `ETA ${formatDuration(avgPerItem * remainingItems)}`;
  }

  function getActiveTrackedInput() {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT' && activeEl.dataset.tgTracked) {
      rememberFocusedInput(activeEl.dataset.tgInputId);
      return activeEl;
    }
    if (state.lastFocusedInputId) {
      return document.querySelector(`input[data-tg-input-id="${CSS.escape(state.lastFocusedInputId)}"]`);
    }
    return null;
  }

  function updateSessionWordStat(vietnamese, isCorrect) {
    if (!vietnamese) return;
    const key = vietnamese.trim();
    const existing = state.sessionWordStats.get(key) || { wrong: 0, correct: 0 };
    if (isCorrect) existing.correct++;
    else existing.wrong++;
    state.sessionWordStats.set(key, existing);
  }

  function getTopWeakWords(limit = 3) {
    return Array.from(state.sessionWordStats.entries())
      .map(([word, stat]) => ({ word, wrong: stat.wrong || 0 }))
      .filter(item => item.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong)
      .slice(0, limit);
  }

  function showSessionSummaryToast() {
    const total = state.sessionCorrect + state.sessionWrong;
    if (total === 0) return;
    const accuracy = Math.round((state.sessionCorrect / total) * 100);
    const weak = getTopWeakWords(3);
    const weakText = weak.length > 0
      ? ` | Yếu: ${weak.map(w => `${w.word} (${w.wrong})`).join(', ')}`
      : '';
    const fullscreenExitText = state.examFullscreenExitCount > 0
      ? ` | Thoát FS: ${state.examFullscreenExitCount} (${getRecentFullscreenExitText(2)})`
      : '';
    showToast(`Tóm tắt phiên: ${state.sessionCorrect} đúng / ${state.sessionWrong} sai (${accuracy}%)${weakText}${fullscreenExitText}`);
  }

  function updateSelectorWarningState() {
    const hasInputs = getTrackableInputs().length > 0;
    const hintText = (document.body?.innerText || '').slice(0, 4000);
    const likelyLearningView = /bài tập|luyện tập|kiểm tra|đáp án/i.test(hintText) || /exam|lesson/i.test(location.href);
    state.selectorWarning = !hasInputs && likelyLearningView;
  }

  function isFullscreenAvailable() {
    const root = document.documentElement;
    return !!(document.fullscreenEnabled && root && typeof root.requestFullscreen === 'function');
  }

  function isCurrentlyFullscreen() {
    return !!document.fullscreenElement;
  }

  function formatClockTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function getLastFullscreenExitText() {
    if (state.examFullscreenExitTimes.length === 0) return '-';
    return formatClockTime(state.examFullscreenExitTimes[state.examFullscreenExitTimes.length - 1]);
  }

  function getRecentFullscreenExitText(limit = 3) {
    if (state.examFullscreenExitTimes.length === 0) return 'chưa có';
    return state.examFullscreenExitTimes
      .slice(-limit)
      .map(ts => formatClockTime(ts))
      .join(', ');
  }

  function showFullscreenHint(message) {
    const now = Date.now();
    if ((now - state.lastFullscreenHintAt) < 4500) return;
    state.lastFullscreenHintAt = now;
    showToast(message);
  }

  async function requestExamFullscreen(source = 'auto') {
    if (!state.examFullscreenEnabled || !isExamTestActive()) return false;
    if (isCurrentlyFullscreen()) return true;
    if (!isFullscreenAvailable()) {
      if (source === 'manual') {
        showToast('Trình duyệt không hỗ trợ toàn màn hình cho trang này.');
      }
      return false;
    }

    const now = Date.now();
    if (source !== 'manual' && (now - state.lastFullscreenRequestAt) < 1200) {
      return false;
    }
    state.lastFullscreenRequestAt = now;

    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      state.isFullscreenActive = true;
      updateBadge();
      return true;
    } catch (err) {
      if (source === 'manual') {
        showToast('Không thể bật toàn màn hình. Hãy thử thao tác lại.');
      }
      return false;
    }
  }

  function ensureExamFullscreen(reason = 'auto') {
    if (!isExamTestActive() || !state.examFullscreenEnabled) return;
    requestExamFullscreen(reason).then((entered) => {
      if (!entered && reason !== 'manual') {
        showFullscreenHint('Đang kiểm tra: bấm "Toàn màn hình" trên HUD để tiếp tục.');
      }
    }).catch(() => {});
  }

  function handleFullscreenExitDetected() {
    const exitedAt = Date.now();
    const exitedAtText = formatClockTime(exitedAt);
    state.examFullscreenExitCount += 1;
    state.examFullscreenExitTimes.push(exitedAt);
    if (state.examFullscreenExitTimes.length > 40) {
      state.examFullscreenExitTimes.shift();
    }

    sendEvent('exam_fullscreen_exit', {
      exitCount: state.examFullscreenExitCount,
      exitedAt,
      exitedAtText,
      recentExitTimes: getRecentFullscreenExitText(5)
    });

    registerExamViolation('fullscreen_exit', { showToastNotice: false });
    updateBadge();

    const shouldResume = window.confirm(
      `Bạn vừa thoát toàn màn hình lúc ${exitedAtText}.\n` +
      `Tổng số lần thoát: ${state.examFullscreenExitCount}.\n` +
      `Các mốc gần nhất: ${getRecentFullscreenExitText(3)}.\n\n` +
      'Nhấn OK để vào lại toàn màn hình.'
    );

    if (shouldResume) {
      setTimeout(() => {
        requestExamFullscreen('manual');
      }, 0);
    } else {
      showToast(`Đã lưu lần thoát #${state.examFullscreenExitCount} lúc ${exitedAtText}`);
    }
  }

  function isExamLockRunning() {
    return !!(state.examLockEnabled && state.examLockActive);
  }

  function isExamTestActive() {
    return !!state.examLockActive;
  }

  function syncExamLockState(reason = '') {
    try {
      chrome.runtime.sendMessage({
        action: 'exam_lock_update',
        active: isExamLockRunning(),
        reason,
        context: state.context,
        violations: state.examViolationCount
      }, () => {
        if (chrome.runtime.lastError) {
          // Background can be asleep/restarting, ignore sync errors.
        }
      });
    } catch (err) {
      logError('syncExamLockState error:', err);
    }
  }

  function refreshExamLockFromContext() {
    const inTestMode = state.context?.partType === 'test';
    const wasActive = state.examLockActive;
    state.examLockActive = inTestMode;

    if (!wasActive && inTestMode) {
      state.examViolationCount = 0;
      state.examFullscreenExitCount = 0;
      state.examFullscreenExitTimes = [];
    }
    if (wasActive && !inTestMode) {
      state.visibilityHiddenAt = 0;
      state.suppressFullscreenExitRecord = isCurrentlyFullscreen();
    }

    syncExamLockState('context_changed');
    ensureExamFullscreen('auto');
    updateBadge();
  }

  function violationMessageByReason(reason) {
    switch (reason) {
      case 'blocked_shortcut':
        return 'Đang kiểm tra: đã chặn phím tắt mở/chuyển tab.';
      case 'blocked_link_navigation':
        return 'Đang kiểm tra: không thể mở trang khác.';
      case 'blocked_window_open':
        return 'Đang kiểm tra: không thể mở tab mới.';
      case 'background_tab_switch':
        return 'Bạn vừa rời tab kiểm tra. Đã tự quay lại bài test.';
      case 'background_new_tab':
        return 'Đã chặn mở tab mới trong lúc kiểm tra.';
      case 'visibility_hidden':
        return 'Phát hiện rời cửa sổ/tab trong lúc kiểm tra.';
      case 'fullscreen_exit':
        return 'Bạn vừa thoát toàn màn hình khi đang kiểm tra.';
      default:
        return 'Vi phạm chế độ khóa kiểm tra.';
    }
  }

  function registerExamViolation(reason, options = {}) {
    if (!isExamLockRunning()) return;

    const now = Date.now();
    if (state.lastExamViolationReason === reason && (now - state.lastExamViolationAt) < 700) {
      return;
    }
    state.lastExamViolationReason = reason;
    state.lastExamViolationAt = now;
    state.examViolationCount += 1;

    sendEvent('exam_lock_violation', {
      reason,
      violationCount: state.examViolationCount
    });

    syncExamLockState('violation');
    updateBadge();

    if (options.showToastNotice !== false) {
      showToast(options.message || violationMessageByReason(reason));
    }
  }

  function isBlockedExamShortcut(e) {
    if (e.key === 'F6') return true;

    if (!(e.ctrlKey || e.metaKey)) return false;
    const key = String(e.key || '').toLowerCase();

    if (key === 't' || key === 'n' || key === 'l' || key === 'w') return true;
    if (key === 'tab') return true;
    if (/^[1-9]$/.test(key)) return true;

    return false;
  }

  function setupExamLockGuards() {
    if (state.examGuardBound) return;
    state.examGuardBound = true;

    document.addEventListener('keydown', (e) => {
      if (!isExamLockRunning()) return;
      if (!isBlockedExamShortcut(e)) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      registerExamViolation('blocked_shortcut');
    }, true);

    const handleAnchorBlock = (e) => {
      if (!isExamLockRunning()) return;
      if (!(e.target instanceof Element)) return;
      const anchor = e.target.closest('a[href]');
      if (!anchor) return;

      const hrefRaw = (anchor.getAttribute('href') || '').trim();
      if (!hrefRaw || hrefRaw.startsWith('#') || /^javascript:/i.test(hrefRaw)) return;

      let nextUrl;
      try {
        nextUrl = new URL(anchor.href, location.href);
      } catch (_err) {
        return;
      }

      const sameDoc = nextUrl.origin === location.origin
        && nextUrl.pathname === location.pathname
        && nextUrl.search === location.search;

      const isThayGiapDomain = /(^|\.)thaygiap\.com$/i.test(nextUrl.hostname);
      const opensNewTab = anchor.target === '_blank' || e.ctrlKey || e.metaKey || e.button === 1;
      const shouldBlock = opensNewTab || !sameDoc || !isThayGiapDomain;

      if (!shouldBlock) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      registerExamViolation('blocked_link_navigation');
    };

    document.addEventListener('click', handleAnchorBlock, true);
    document.addEventListener('auxclick', handleAnchorBlock, true);

    if (!state.windowOpenPatched && typeof state.originalWindowOpen === 'function') {
      window.open = function(...args) {
        if (isExamLockRunning()) {
          registerExamViolation('blocked_window_open');
          return null;
        }
        return state.originalWindowOpen(...args);
      };
      state.windowOpenPatched = true;
    }

    document.addEventListener('visibilitychange', () => {
      if (!isExamLockRunning()) return;

      if (document.hidden) {
        state.visibilityHiddenAt = Date.now();
        return;
      }

      if (state.visibilityHiddenAt > 0) {
        registerExamViolation('visibility_hidden');
        state.visibilityHiddenAt = 0;
      }
    });

    document.addEventListener('fullscreenchange', () => {
      const nowFullscreen = isCurrentlyFullscreen();
      const wasFullscreen = state.isFullscreenActive;
      state.isFullscreenActive = nowFullscreen;

      if (wasFullscreen && !nowFullscreen) {
        if (state.suppressFullscreenExitRecord) {
          state.suppressFullscreenExitRecord = false;
          updateBadge();
          return;
        }

        if (isExamTestActive() && state.examFullscreenEnabled) {
          handleFullscreenExitDetected();
        }
      }

      updateBadge();
    });
  }

  function openOptionsWithPreset(preset) {
    chrome.runtime.sendMessage({
      action: 'update_settings',
      settings: { quickActionPreset: preset }
    }, () => {
      const url = chrome.runtime.getURL('options/options.html#review-quick');
      window.open(url, '_blank');
    });
  }

  function addCurrentWordToReview(label = 'Đã thêm vào ôn tập') {
    const activeEl = getActiveTrackedInput();
    if (!activeEl) {
      showToast('Hãy đặt con trỏ vào ô trả lời để dùng thao tác này.');
      return;
    }

    const inputId = activeEl.dataset.tgInputId;
    const tracker = state.inputTrackers.get(inputId);
    if (!tracker?.vietnamese) {
      showToast('Không xác định được từ hiện tại.');
      return;
    }

    chrome.runtime.sendMessage({ action: 'add_to_review_list', vietnamese: tracker.vietnamese });
    showToast(`${label}: "${tracker.vietnamese}"`);
    refreshHudExternalData(true);
  }

  function pronounceCurrentWord() {
    const activeEl = getActiveTrackedInput();
    if (!activeEl) {
      showToast('Không có từ để phát âm.');
      return;
    }

    const inputId = activeEl.dataset.tgInputId;
    const tracker = state.inputTrackers.get(inputId);
    const answer = extractCorrectAnswer(activeEl) || tracker?.english || activeEl.value || '';
    if (!answer) {
      showToast('Chưa có đáp án mẫu để phát âm.');
      return;
    }

    if (!window.speechSynthesis) {
      showToast('Trình duyệt không hỗ trợ phát âm.');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.lang = 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function showHintForCurrentInput() {
    const activeEl = getActiveTrackedInput();
    if (!activeEl) {
      showToast('Đặt con trỏ vào ô trả lời để xem gợi ý.');
      return;
    }

    const inputId = activeEl.dataset.tgInputId;
    const tracker = state.inputTrackers.get(inputId);
    const answer = normalizeText(extractCorrectAnswer(activeEl) || tracker?.english || '');
    if (!answer) {
      showToast('Chưa có gợi ý cho từ này.');
      return;
    }

    const hint = answer
      .split('')
      .map((c, i) => (i === 0 || c === ' ' ? c : '_'))
      .join('');
    showToast(`Gợi ý: ${hint}`);
  }

  function toggleFocusMode() {
    state.focusMode = !state.focusMode;
    document.body.classList.toggle('tg-focus-mode', state.focusMode);
    showToast(state.focusMode ? 'Đã bật Focus Mode' : 'Đã tắt Focus Mode');
    updateBadge();
  }

  async function refreshHudExternalData(force = false) {
    const now = Date.now();
    if (!force && (now - state.lastDashboardFetchAt) < 15000) return;
    state.lastDashboardFetchAt = now;

    try {
      const [settingsRes, todayRes, reviewRes] = await Promise.all([
        new Promise((resolve) => chrome.runtime.sendMessage({ action: 'get_settings' }, resolve)),
        new Promise((resolve) => chrome.runtime.sendMessage({ action: 'get_today_stats' }, resolve)),
        new Promise((resolve) => chrome.runtime.sendMessage({ action: 'get_review_list' }, resolve))
      ]);

      const settings = settingsRes?.ok ? (settingsRes.data || {}) : {};
      const today = todayRes?.ok ? (todayRes.data || {}) : {};
      const review = reviewRes?.ok ? (reviewRes.data || []) : [];

      state.goalDailyAttempt = Number(settings.dailyAttemptGoal || 0);
      state.todayAttempts = Number(today.totalAttempts || 0);
      state.dueReviewCount = Number(review.length || 0);
      state.hudAutoMinimizeEnabled = settings.hudAutoMinimizeEnabled !== false;
      state.goalProgressPct = state.goalDailyAttempt > 0
        ? Math.min(100, Math.round((state.todayAttempts / state.goalDailyAttempt) * 100))
        : 0;
    } catch (err) {
      logError('refreshHudExternalData error:', err);
    }

    updateBadge();
  }

  // ============ Send Message to Background ============
  function sendEvent(type, data = {}) {
    if (!state.isTracking) return;

    const payload = {
      type,
      context: state.context,
      data,
      timestamp: Date.now()
    };

    try {
      chrome.runtime.sendMessage({ action: 'log_event', payload }, (response) => {
        if (chrome.runtime.lastError) {
          logError('Send event error:', chrome.runtime.lastError.message);
        }
      });
    } catch (err) {
      logError('Send event exception:', err);
    }

    // Pulse badge animation
    pulseBadge();
    if (type === 'answer_result' || type === 'lesson_open') {
      refreshHudExternalData(false);
    }
  }

  // ============ Context Detection ============

  function detectContext() {
    const url = location.href;
    const pageTitle = document.title || '';

    // Lesson title - from top header
    const lessonTitle = extractLessonTitle();

    // Session title - "Bài tập về nhà - Buổi X" or "Bài tập trên lớp"
    const sessionTitle = extractSessionTitle();

    // Part type
    const partType = detectPartType();

    // Current active item in sidebar
    const currentItem = detectCurrentItem();

    // Current round for test mode
    const round = detectRound();
    const questionProgress = detectQuestionProgress();

    state.context = {
      url,
      pageTitle,
      lessonTitle,
      sessionTitle,
      partType,
      currentItem,
      round,
      questionIndex: questionProgress.current,
      questionTotal: questionProgress.total,
      questionLabel: questionProgress.label
    };

    refreshExamLockFromContext();
    log('Context detected:', state.context);
    updateBadge();
    return state.context;
  }

  function extractLessonTitle() {
    // Look for main heading with lesson info
    // Pattern: "Bài X - Title"
    const headings = document.querySelectorAll('h1, h2, h3, .lesson-title, .ant-page-header-heading-title');
    for (const h of headings) {
      const text = h.textContent.trim();
      if (/bài\s+\d+/i.test(text)) {
        return text;
      }
    }

    // Fallback: check page title or any prominent text
    const titleEl = document.querySelector('[class*="title"], [class*="header"]');
    if (titleEl) {
      const text = titleEl.textContent.trim();
      if (text.length > 5 && text.length < 200) return text;
    }

    // Last resort: document title
    const docTitle = document.title || '';
    return docTitle.replace(' - Thầy Giáp ENGLISH', '').trim();
  }

  function extractSessionTitle() {
    // Look for "📚 Bài tập về nhà - Buổi X" or similar
    const allText = document.body ? document.body.innerText : '';
    const match = allText.match(/(📚\s*)?Bài tập (về nhà|trên lớp)\s*-?\s*Buổi\s*\d+/i);
    if (match) return match[0].trim();

    // Look in sidebar
    const sidebarItems = document.querySelectorAll('.ant-menu-item, [class*="sidebar"], [class*="menu"]');
    for (const item of sidebarItems) {
      const text = item.textContent.trim();
      if (/buổi\s+\d+/i.test(text)) return text;
    }

    return '';
  }

  function detectPartType() {
    const url = location.href;
    const activeTab = document.querySelector('.ant-tabs-tab-active, [class*="active-tab"], .active');
    const activeText = activeTab ? activeTab.textContent.trim().toLowerCase() : '';

    if (/\/user\/exam\b/i.test(url)) return 'test';

    // Check active tab/button text
    if (/kiểm tra/i.test(activeText)) return 'test';
    if (/luyện tập/i.test(activeText)) return 'practice';

    // Check if we see test-mode indicators
    const hasRoundTabs = document.querySelectorAll('[class*="tab"]');
    for (const tab of hasRoundTabs) {
      if (/lần\s+\d+/i.test(tab.textContent)) return 'test';
    }

    // Check visible header buttons
    const buttons = document.querySelectorAll('button, .ant-btn, [class*="btn"]');
    for (const btn of buttons) {
      const text = btn.textContent.trim().toLowerCase();
      if (/kiểm tra/.test(text) && btn.classList.contains('ant-btn-primary')) return 'test';
      if (text === 'tiếp theo' || text === 'nộp bài' || text === 'trước') return 'test';
    }

    // Check if vocab table exists with inputs
    const vocabInputs = getTrackableInputs();
    if (vocabInputs.length > 0) return 'vocab';

    // Check for textarea (essay)
    const textareas = document.querySelectorAll('textarea.quiz-answer, textarea[class*="answer"]');
    if (textareas.length > 0) return 'essay';

    // Check URL for hints
    if (/exam/i.test(url)) return 'test';
    if (/lesson/i.test(url)) return 'practice';

    return 'unknown';
  }

  function detectCurrentItem() {
    // Look for active item in sidebar list
    const activeItems = document.querySelectorAll('.ant-menu-item-selected, .ant-menu-item-active, [class*="active"], [class*="selected"]');
    for (const item of activeItems) {
      const text = item.textContent.trim();
      if (/vocab|bài\s+\d+|unit/i.test(text)) return text;
    }

    // Check sidebar items with highlight/bold
    const sidebarLinks = document.querySelectorAll('a[href*="exam"], .side-menu-item, [class*="list-item"]');
    for (const link of sidebarLinks) {
      if (link.classList.contains('active') || link.getAttribute('aria-selected') === 'true') {
        return link.textContent.trim();
      }
    }

    const questionProgress = detectQuestionProgress();
    if (questionProgress.label) return questionProgress.label;

    return '';
  }

  function detectRound() {
    // Look for active round tab: "Lần 1", "Lần 2", etc.
    const tabs = document.querySelectorAll('.ant-tabs-tab, [class*="tab"], button');
    for (const tab of tabs) {
      const text = tab.textContent.trim();
      const match = text.match(/lần\s+(\d+)/i);
      if (match && (tab.classList.contains('ant-tabs-tab-active') || 
                    tab.classList.contains('active') ||
                    tab.getAttribute('aria-selected') === 'true')) {
        return parseInt(match[1]);
      }
    }
    return null;
  }

  // ============ Vocab Input Tracking ============

  function resetVisibleInputTracking() {
    document.querySelectorAll('input[data-tg-tracked="true"]').forEach((input) => {
      delete input.dataset.tgTracked;
      delete input.dataset.tgInputId;
    });
    state.inputTrackers.clear();
    state.answeredInputIds.clear();
    state.lastFocusedInputId = '';
  }

  function setupVocabTracking() {
    // Find all answer inputs
    const inputs = getTrackableInputs();
    state.totalInputs = inputs.length;
    updateSelectorWarningState();
    updateBadge();

    if (inputs.length === 0) {
      log('No vocab inputs found, will retry...');
      return;
    }

    log(`Found ${inputs.length} vocab inputs, setting up tracking...`);

    inputs.forEach((input, index) => {
      if (input.dataset.tgTracked) return;

      const meta = extractQuestionMetaForInput(input, index);
      const inputId = buildInputTrackingId(input, index, meta);
      input.dataset.tgTracked = 'true';
      input.dataset.tgInputId = inputId;

      const vietnamese = extractVietnameseForInput(input, meta, index);

      state.inputTrackers.set(inputId, {
        inputId,
        wrongCount: 0,
        correctCount: 0,
        lastValue: '',
        vietnamese,
        english: '',
        attempts: [],
        lastReportedStatusKey: '',
        baseVerb: meta.baseVerb || '',
        meta
      });

      log(`Tracking input [${inputId}]: "${vietnamese}"`);

      let typingTimer;
      input.addEventListener('focus', () => rememberFocusedInput(inputId));
      input.addEventListener('click', () => rememberFocusedInput(inputId));
      input.addEventListener('input', () => {
        clearTimeout(typingTimer);
        const tracker = state.inputTrackers.get(inputId);
        const value = input.value.trim();
        rememberFocusedInput(inputId);
        upsertExamDraftAnswer(input, tracker, 'input');
        if (tracker && value.length > 0 && value !== tracker.lastValue) {
          tracker.lastValue = value;
          sendEvent('answer_attempt', {
            inputId,
            vietnamese,
            promptText: tracker.meta?.promptText || '',
            baseVerb: tracker.baseVerb || '',
            questionIndex: tracker.meta?.questionIndex || null,
            questionTotal: tracker.meta?.questionTotal || null,
            blankIndex: tracker.meta?.blankIndex || 1,
            userInput: value,
            attemptNumber: tracker.attempts.length + 1
          });
        }
        // Debounced validation check (some SPA validates as you type)
        typingTimer = setTimeout(() => { checkInputState(input); }, 750);
      });

      input.addEventListener('blur', () => {
        upsertExamDraftAnswer(input, state.inputTrackers.get(inputId), 'blur');
        setTimeout(() => checkInputState(input), 200);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Tab') setTimeout(() => checkInputState(input), 200);
      });

      if (input.value && input.value.trim()) {
        upsertExamDraftAnswer(input, state.inputTrackers.get(inputId), 'existing_value');
      }
    });

    // Setup MutationObserver for dynamic class changes (correct/incorrect)
    setupClassObserver(inputs);
  }

  function extractVietnameseForInput(input, meta = null, index = 0) {
    if (state.context?.partType === 'test' && meta?.promptText) {
      return meta.questionIndex
        ? `Câu ${meta.questionIndex}${meta.questionTotal ? `/${meta.questionTotal}` : ''} - ${meta.promptText}`
        : meta.promptText;
    }

    // Strategy 1: Previous TD cell in same row 
    const cell = input.closest('td');
    if (cell) {
      const row = cell.closest('tr');
      if (row) {
        const cells = Array.from(row.children);
        const cellIndex = cells.indexOf(cell);
        if (cellIndex > 0) {
          const viCell = cells[cellIndex - 1];
          if (viCell) {
            const text = viCell.textContent.trim();
            if (text && text.length > 0 && text !== 'Vietnamese' && text !== 'English') {
              return text;
            }
          }
        }
      }
    }

    // Strategy 2: Previous sibling element
    const prevEl = input.previousElementSibling;
    if (prevEl) {
      const text = prevEl.textContent.trim();
      if (text && text.length > 1) return text;
    }

    // Strategy 3: Label associated
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return label.textContent.trim();
    }

    // Strategy 4: Aria-label
    const ariaLabel = input.getAttribute('aria-label');
    if (ariaLabel && ariaLabel !== 'Nhập đáp án') return ariaLabel;

    return `Word #${Array.from(getTrackableInputs()).indexOf(input) + 1 || index + 1}`;
  }

  function checkInputState(input) {
    const inputId = input.dataset.tgInputId || input.id;
    const tracker = state.inputTrackers.get(inputId);
    if (!tracker) return;

    const value = input.value.trim();
    upsertExamDraftAnswer(input, tracker, 'state_check');
    if (!value) return;

    const isCorrect = checkIsCorrect(input);
    const isIncorrect = checkIsIncorrect(input);
    const correctAnswer = extractCorrectAnswer(input);

    if (!isCorrect && !isIncorrect) return;

    const resultCorrect = isCorrect === true;
    const resultStatus = resultCorrect ? 'correct' : 'incorrect';
    const reportKey = `${resultStatus}_${value}`;
    
    // TRÁNH RECORD NHIỀU LẦN CÙNG THÁI CHO CÙNG ĐÁP ÁN (VD USER NHẬP "abc" SAI -> TRẢ VỀ 1 LẦN)
    if (tracker.lastReportedStatusKey === reportKey) return;
    tracker.lastReportedStatusKey = reportKey;
    state.answeredInputIds.add(inputId);

    if (resultCorrect) {
      tracker.correctCount++;
      tracker.english = value;
      state.sessionCorrect++;
      updateSessionWordStat(tracker.vietnamese, true);
    } else {
      tracker.wrongCount++;
      state.sessionWrong++;
      if (correctAnswer) tracker.english = correctAnswer;
      updateSessionWordStat(tracker.vietnamese, false);
      const classified = classifyError(value, correctAnswer || tracker.english || '');
      state.errorBuckets[classified.key] = (state.errorBuckets[classified.key] || 0) + 1;
      state.lastErrorLabel = classified.label;
    }

    tracker.attempts.push({ value, isCorrect: resultCorrect, timestamp: Date.now() });

    sendEvent('answer_result', {
      inputId,
      vietnamese: tracker.vietnamese,
      english: tracker.english || correctAnswer || value, // Fallback to provided value
      correctAnswer: correctAnswer || '',
      promptText: tracker.meta?.promptText || '',
      baseVerb: tracker.baseVerb || '',
      questionIndex: tracker.meta?.questionIndex || null,
      questionTotal: tracker.meta?.questionTotal || null,
      blankIndex: tracker.meta?.blankIndex || 1,
      userInput: value,
      isCorrect: resultCorrect,
      wrongCount: tracker.wrongCount,
      correctCount: tracker.correctCount,
      attemptNumber: tracker.attempts.length
    });

    updateBadge();
  }

  function checkIsCorrect(input) {
    // PRIORITY 1: Explicit incorrect class = NEVER correct (override everything)
    // thaygiap.com uses: ng-valid ng-dirty INCORRECT ng-touched
    if (hasClassToken(input, 'incorrect')) return false;
    if (hasClassToken(input, 'wrong')) return false;
    if (input.getAttribute('aria-invalid') === 'true') return false;

    // PRIORITY 2: Explicit correct class
    if (hasClassToken(input, 'correct')) return true;
    if (hasClassToken(input, 'is-valid')) return true;

    // PRIORITY 3: Color-based (green border = rgb(59,195,113))
    const styles = window.getComputedStyle(input);
    const borderColor = styles.borderColor;
    const bgColor = styles.backgroundColor;

    if (borderColor) {
      const match = borderColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const r = parseInt(match[1]), g = parseInt(match[2]), b = parseInt(match[3]);
        // Green: thaygiap uses rgb(59, 195, 113)
        if (g > 150 && g > r * 1.5 && g > b) return true;
        // Red: rgb(250,82,82) = definitely NOT correct
        if (r > 200 && r > g * 2 && r > b * 2) return false;
      }
    }

    // PRIORITY 4: parent class (but NOT using [class*="valid"] which matches ng-valid on wrong answers!)
    const correctWrapper = closestWithClassToken(input, ['correct', 'success']);
    if (correctWrapper) return true;

    return null; // Status not yet determined
  }

  function checkIsIncorrect(input) {
    // PRIORITY 1: Explicit class (most reliable - thaygiap adds .incorrect on wrong)
    if (hasClassToken(input, 'incorrect')) return true;
    if (hasClassToken(input, 'wrong')) return true;
    if (hasClassToken(input, 'is-invalid')) return true;
    if (input.getAttribute('aria-invalid') === 'true') return true;

    // PRIORITY 2: Explicit correct class means NOT incorrect  
    if (hasClassToken(input, 'correct')) return false;
    if (hasClassToken(input, 'is-valid')) return false;

    // PRIORITY 3: Color-based (red border = rgb(250,82,82))
    const styles = window.getComputedStyle(input);
    const borderColor = styles.borderColor;

    if (borderColor) {
      const match = borderColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const r = parseInt(match[1]), g = parseInt(match[2]), b = parseInt(match[3]);
        // Red: thaygiap uses rgb(250,82,82)
        if (r > 200 && r > g * 2 && r > b * 2) return true;
        // Green: definitely NOT incorrect  
        if (g > 150 && g > r * 1.5) return false;
      }
    }

    // PRIORITY 4: Check if correct answer hint text appeared = 100% wrong
    const correctAnswerText = extractCorrectAnswer(input);
    if (correctAnswerText && correctAnswerText.length > 0) return true;

    // PRIORITY 5: Parent class check (avoid ng-valid false positive!)
    const incorrectWrapper = closestWithClassToken(input, ['incorrect', 'wrong', 'has-error', 'ant-form-item-has-error']);
    if (incorrectWrapper) return true;

    return null; // Status not yet determined
  }

  function extractCorrectAnswer(input) {
    // Look for "Đáp án: [word]" text near the input
    // It appears right after/below the input when answer is wrong

    // Strategy 1: Next sibling with "Đáp án" text
    let sibling = input.nextElementSibling;
    while (sibling) {
      const text = sibling.textContent.trim();
      const match = text.match(/đáp án:\s*(.+)/i);
      if (match) return match[1].trim();
      sibling = sibling.nextElementSibling;
    }

    // Strategy 2: Parent's children after input
    const parent = input.parentElement;
    if (parent) {
      const children = Array.from(parent.children);
      const inputIndex = children.indexOf(input);
      for (let i = inputIndex + 1; i < children.length; i++) {
        const text = children[i].textContent.trim();
        const match = text.match(/đáp án:\s*(.+)/i);
        if (match) return match[1].trim();
      }

      // Check parent's text nodes
      const allText = parent.textContent;
      const fullMatch = allText.match(/đáp án:\s*(\w+)/i);
      if (fullMatch) return fullMatch[1].trim();
    }

    // Strategy 3: Look in TD cell
    const cell = input.closest('td');
    if (cell) {
      const text = cell.textContent;
      const match = text.match(/đáp án:\s*(.+?)(?:\s|$)/i);
      if (match) return match[1].trim();
    }

    return '';
  }

  // ============ MutationObserver for Class Changes ============

  function setupClassObserver(inputs) {
    if (state.observer) {
      state.observer.disconnect();
    }

    // Observe the entire form/table for class changes
    const tableOrForm = document.querySelector('table, form, [class*="quiz"], [class*="exam"], main, [role="main"], .ant-layout-content');
    if (!tableOrForm) return;

    state.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && (mutation.attributeName === 'class' || mutation.attributeName === 'style')) {
          const target = mutation.target;
          // Check target or children since framework might add class to input's parent wrapper
          if (target.tagName === 'INPUT' && target.dataset.tgTracked) {
            checkInputState(target);
          } else if (target.querySelectorAll) {
            const trackedInputs = target.querySelectorAll('input[data-tg-tracked="true"]');
            trackedInputs.forEach(inp => checkInputState(inp));
          }
        }

        // Watch for new nodes (dynamic content)
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if new inputs were added
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const newInputs = node.matches?.(buildRawInputSelector())
                ? [node]
                : getTrackableInputs(node);
              if (newInputs.length > 0) {
                log('New inputs detected, re-setting up tracking...');
                setTimeout(setupVocabTracking, 300);
              }

              // Check for "Đáp án:" text appearing inside the new node
              if (node.textContent && /đáp án:/i.test(node.textContent)) {
                handleCorrectAnswerAppeared(node);
                // Also trigger check for inputs near the newly added text
                if (node.parentElement) {
                   const nearbyInputs = node.parentElement.querySelectorAll('input[data-tg-tracked="true"]');
                   nearbyInputs.forEach(inp => checkInputState(inp));
                }
              }
            }
          }
        }
      }
    });

    state.observer.observe(tableOrForm, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['class', 'style']
    });

    log('MutationObserver set up');
  }

  function handleCorrectAnswerAppeared(node) {
    const text = node.textContent.trim();
    const match = text.match(/đáp án:\s*(.+)/i);
    if (!match) return;

    const correctWord = match[1].trim();

    // Find the nearest input to associate this answer with
    const parent = node.parentElement;
    if (parent) {
      const input = parent.querySelector('input[data-tg-tracked]');
      if (input) {
        const inputId = input.dataset.tgInputId || input.id;
        const tracker = state.inputTrackers.get(inputId);
        if (tracker) {
          tracker.english = correctWord;
          log(`Correct answer detected for "${tracker.vietnamese}": ${correctWord}`);
          checkInputState(input);
        }
      }
    }
  }

  // ============ Button Tracking ============

  function setupButtonTracking() {
    // Find all relevant buttons
    const allButtons = document.querySelectorAll(getButtonSelector());
    
    const relevantPatterns = [
      /kiểm tra/i,
      /luyện tập/i,
      /làm lại/i,
      /trước/i,
      /tiếp/i,
      /nộp bài/i,
      /submit/i,
      /lần\s+\d+/i
    ];

    allButtons.forEach((btn) => {
      if (btn.dataset.tgButtonTracked) return;

      const btnText = (btn.textContent || btn.value || '').trim();
      const isRelevant = relevantPatterns.some(pattern => pattern.test(btnText));

      if (!isRelevant) return;

      btn.dataset.tgButtonTracked = 'true';

      btn.addEventListener('click', (e) => {
        log(`Button clicked: "${btnText}"`);

        // Determine button type
        let buttonType = 'unknown';
        if (/kiểm tra/i.test(btnText)) buttonType = 'check';
        else if (/luyện tập/i.test(btnText)) buttonType = 'practice';
        else if (/làm lại/i.test(btnText)) buttonType = 'retry';
        else if (/trước/i.test(btnText)) buttonType = 'previous';
        else if (/tiếp/i.test(btnText)) buttonType = 'next';
        else if (/nộp bài|submit/i.test(btnText)) buttonType = 'submit';
        else if (/lần\s+\d+/i.test(btnText)) {
          buttonType = 'round_switch';
        }

        const answersSnapshot = snapshotCurrentVisibleAnswers(`button_${buttonType}`);
        const progress = detectQuestionProgress();

        sendEvent('submit_click', {
          buttonText: btnText,
          buttonType,
          questionIndex: progress.current,
          questionTotal: progress.total,
          answersSnapshot,
          sessionCorrect: state.sessionCorrect,
          sessionWrong: state.sessionWrong
        });

        // If it's a mode/round switch, update context and re-init
        if (['practice', 'check', 'round_switch', 'next', 'previous', 'retry'].includes(buttonType)) {
          // Reset session counters for retry
          if (buttonType === 'retry') {
            state.sessionCorrect = 0;
            state.sessionWrong = 0;
            state.inputTrackers.forEach(tracker => {
              tracker.wrongCount = 0;
              tracker.correctCount = 0;
              tracker.attempts = [];
              tracker.lastValue = '';
            });
          }

          resetVisibleInputTracking();

          // Re-detect context after click
          setTimeout(() => {
            detectContext();
            sendEvent('mode_switch', {
              newMode: buttonType,
              buttonText: btnText
            });

            // Re-setup input tracking for new content
            setTimeout(() => {
              setupVocabTracking();
              setupButtonTracking();
              detectScores();
            }, 1000);
          }, 500);
        }
      }, true); // Use capture phase to ensure it runs before framework routing
    });
  }

  // ============ Score Detection ============

  function detectScores() {
    // Look for score patterns in sidebar: "0. Vocab Unit 1_Lần 1 8đ"
    const sidebarItems = document.querySelectorAll(getScoreScopeSelector());
    
    sidebarItems.forEach(item => {
      const text = item.textContent.trim();
      const scoreMatch = text.match(/(\d+)\s*đ\b/i);
      if (scoreMatch) {
        const score = parseInt(scoreMatch[1]);
        const itemName = text.replace(/\d+\s*đ/i, '').trim();

        sendEvent('score_detected', {
          score,
          maxScore: 10, // Assumed max
          label: itemName,
          rawText: text
        });
      }
    });
  }

  // ============ URL Change Detection (SPA) ============

  function setupURLWatcher() {
    if (state.urlWatcherIntervalId) return;

    // Poll for URL changes (SPA navigation)
    state.urlWatcherIntervalId = setInterval(() => {
      if (location.href !== state.lastURL) {
        log(`URL changed: ${state.lastURL} → ${location.href}`);
        showSessionSummaryToast();
        if (isExamTestActive()) {
          state.suppressFullscreenExitRecord = isCurrentlyFullscreen();
          state.examLockActive = false;
          syncExamLockState('url_changed');
        }
        
        // Send lesson close for old URL
        sendEvent('lesson_close', {
          previousURL: state.lastURL,
          timeSpentMs: state.lessonOpenTime ? Date.now() - state.lessonOpenTime : 0
        });

        state.lastURL = location.href;
        
        // Re-initialize for new page
        scheduleInitialize(900);
      }
    }, 1000);

    // Also listen for popstate (back/forward)
    window.addEventListener('popstate', () => {
      setTimeout(() => {
        if (location.href !== state.lastURL) {
          showSessionSummaryToast();
          if (isExamTestActive()) {
            state.suppressFullscreenExitRecord = isCurrentlyFullscreen();
            state.examLockActive = false;
            syncExamLockState('history_nav');
          }
          state.lastURL = location.href;
          scheduleInitialize(350);
        }
      }, 500);
    });
  }

  function escapeHtmlText(value) {
    const div = document.createElement('div');
    div.textContent = String(value || '');
    return div.innerHTML;
  }

  function renderVerbLookupResult(term = '') {
    const badge = state.badgeElement || document.getElementById('tg-tracker-badge');
    if (!badge) return;

    const resultEl = badge.querySelector('#tg-verb-result');
    const inputEl = badge.querySelector('#tg-verb-input');
    if (!resultEl || !inputEl) return;

    const verb = String(term || inputEl.value || '').trim().toLowerCase();
    if (!verb) {
      resultEl.innerHTML = 'Đặt con trỏ vào ô điền hoặc nhập động từ để tra nhanh.';
      return;
    }

    const lookup = lookupIrregularVerb(verb);
    if (!lookup) {
      resultEl.innerHTML = 'Không tìm thấy động từ phù hợp.';
      return;
    }

    const sourceLabel = lookup.irregular
      ? 'Bất quy tắc'
      : 'Không thấy trong bảng BTQ, nhiều khả năng là động từ có quy tắc';

    resultEl.innerHTML = `
      <div class="tg-verb-result-title">${escapeHtmlText(lookup.base)}</div>
      <div class="tg-verb-result-row">V2: <strong>${escapeHtmlText(lookup.past)}</strong></div>
      <div class="tg-verb-result-row">V3: <strong>${escapeHtmlText(lookup.participle)}</strong></div>
      <div class="tg-verb-result-note">${escapeHtmlText(sourceLabel)}</div>
    `;
  }

  function fillVerbLookupFromCurrentInput(showNotice = true) {
    const badge = state.badgeElement || document.getElementById('tg-tracker-badge');
    if (!badge) return '';

    const inputEl = badge.querySelector('#tg-verb-input');
    if (!inputEl) return '';

    const activeInput = getActiveTrackedInput();
    const detectedVerb = getSuggestedVerbFromInput(activeInput);
    if (!detectedVerb) {
      if (showNotice) showToast('Không tìm thấy động từ gốc ở ô hiện tại.');
      renderVerbLookupResult(inputEl.value || '');
      return '';
    }

    inputEl.value = detectedVerb;
    renderVerbLookupResult(detectedVerb);
    return detectedVerb;
  }

  function toggleVerbLookupPanel(forceOpen) {
    const badge = state.badgeElement || document.getElementById('tg-tracker-badge');
    if (!badge) return;

    const panel = badge.querySelector('#tg-verb-panel');
    const inputEl = badge.querySelector('#tg-verb-input');
    if (!panel || !inputEl) return;

    state.verbLookupOpen = typeof forceOpen === 'boolean' ? forceOpen : !state.verbLookupOpen;
    panel.hidden = !state.verbLookupOpen;

    if (state.verbLookupOpen) {
      badge.classList.remove('tg-minimized');
      clearTimeout(state.hudAutoMinimizeTimerId);
      fillVerbLookupFromCurrentInput(false);
      if (!inputEl.value) renderVerbLookupResult('');
      setTimeout(() => inputEl.focus(), 0);
      return;
    }

    scheduleHudAutoMinimize();
  }

  function scheduleHudAutoMinimize() {
    clearTimeout(state.hudAutoMinimizeTimerId);
    if (!state.hudAutoMinimizeEnabled || state.verbLookupOpen) return;

    const badge = state.badgeElement || document.getElementById('tg-tracker-badge');
    if (!badge) return;

    state.hudAutoMinimizeTimerId = setTimeout(() => {
      if (state.verbLookupOpen) return;
      badge.classList.add('tg-minimized');
    }, 2200);
  }

  // ============ Floating Badge ============

  function createBadge() {
    // Remove if exists
    const existing = document.getElementById('tg-tracker-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.id = 'tg-tracker-badge';
    badge.innerHTML = `
      <div class="tg-hud-header" id="tg-hud-toggle">
        <span class="tg-title">TG HUD</span>
        <button class="tg-mini-btn" id="tg-btn-minimize" title="Thu gọn">—</button>
      </div>
      <div class="tg-hud-body">
        <div class="tg-hud-row tg-context">
          <span id="tg-lesson-title" class="tg-lesson">Đang phân tích bài...</span>
          <span id="tg-part-round" class="tg-pill">-</span>
        </div>

        <div class="tg-hud-row tg-lock-row">
          <span id="tg-exam-lock-status" class="tg-lock-pill is-off">Khóa kiểm tra: Tắt</span>
          <span id="tg-exam-lock-violations" class="tg-lock-count">Vi phạm: 0</span>
        </div>
        <div class="tg-hud-row tg-lock-row tg-fullscreen-row">
          <span id="tg-fullscreen-status" class="tg-lock-pill is-off">Toàn màn hình: Tắt</span>
          <span id="tg-fullscreen-exits" class="tg-lock-count">Thoát FS: 0</span>
        </div>

        <div class="tg-hud-row tg-progress-head">
          <span id="tg-progress-text">0/0</span>
          <span id="tg-eta-text">ETA --:--</span>
        </div>
        <div class="tg-progress-bar">
          <div id="tg-progress-fill" class="tg-progress-fill"></div>
        </div>

        <div class="tg-hud-row tg-stats">
          <span class="tg-correct" title="Đúng">✓ <span id="tg-correct-count">0</span></span>
          <span class="tg-wrong" title="Sai">✗ <span id="tg-wrong-count">0</span></span>
          <span class="tg-neutral">🎯 <span id="tg-accuracy">0%</span></span>
          <span class="tg-neutral">⏱ <span id="tg-elapsed">00:00</span></span>
        </div>

        <div class="tg-hud-row tg-goal-row">
          <div id="tg-goal-ring" class="tg-goal-ring"><span id="tg-goal-ring-text">0%</span></div>
          <div class="tg-goal-info">
            <div>Mục tiêu ngày</div>
            <div id="tg-goal-text" class="tg-goal-sub">0 / 0</div>
          </div>
          <div class="tg-due-box">
            <div>Đến hạn ôn</div>
            <div id="tg-due-count" class="tg-goal-sub">0 từ</div>
          </div>
        </div>

        <div class="tg-hud-row tg-errors">
          <span class="tg-error-chip">📝 <span id="tg-err-spelling">0</span></span>
          <span class="tg-error-chip">🔤 <span id="tg-err-form">0</span></span>
          <span class="tg-error-chip">␣ <span id="tg-err-spacing">0</span></span>
          <span class="tg-error-chip">❓ <span id="tg-err-meaning">0</span></span>
        </div>
        <div id="tg-last-error" class="tg-last-error"></div>

        <div class="tg-hud-row tg-actions">
          <button class="tg-action-btn" id="tg-btn-add-review">+ Ôn tập</button>
          <button class="tg-action-btn" id="tg-btn-mark-hard">★ Khó</button>
          <button class="tg-action-btn" id="tg-btn-quick5">Ôn nhanh 5</button>
          <button class="tg-action-btn" id="tg-btn-review-3m">Ôn 3 phút</button>
          <button class="tg-action-btn" id="tg-btn-irregular">ĐTBTQ</button>
          <button class="tg-action-btn" id="tg-btn-fullscreen">Toàn màn hình</button>
          <button class="tg-action-btn" id="tg-btn-focus">Focus: Tắt</button>
        </div>

        <div id="tg-verb-panel" class="tg-verb-panel" hidden>
          <div class="tg-verb-head">
            <span>Tra cứu động từ</span>
            <button class="tg-mini-btn" id="tg-btn-verb-current" title="Lấy động từ từ câu hiện tại">↺</button>
          </div>
          <input id="tg-verb-input" class="tg-verb-input" type="text" placeholder="Ví dụ: write, written, gave">
          <div id="tg-verb-result" class="tg-verb-result">Đặt con trỏ vào ô điền hoặc nhập động từ để tra nhanh.</div>
        </div>

        <div id="tg-selector-warning" class="tg-selector-warning" style="display:none;">
          ⚠️ Có thể selector đã thay đổi, tracking có thể thiếu dữ liệu.
        </div>
      </div>
    `;
    badge.title = 'ThayGiap Learning HUD';

    document.body.appendChild(badge);
    state.badgeElement = badge;

    const toggle = badge.querySelector('#tg-hud-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        clearTimeout(state.hudAutoMinimizeTimerId);
        const willMinimize = !badge.classList.contains('tg-minimized');
        badge.classList.toggle('tg-minimized');
        if (willMinimize) {
          state.verbLookupOpen = false;
          badge.querySelector('#tg-verb-panel')?.setAttribute('hidden', 'hidden');
        }
      });
    }

    badge.querySelector('#tg-btn-add-review')?.addEventListener('click', () => addCurrentWordToReview('Đã thêm vào ôn tập'));
    badge.querySelector('#tg-btn-mark-hard')?.addEventListener('click', () => addCurrentWordToReview('Đã đánh dấu khó'));
    badge.querySelector('#tg-btn-quick5')?.addEventListener('click', () => openOptionsWithPreset('review-hard5'));
    badge.querySelector('#tg-btn-review-3m')?.addEventListener('click', () => openOptionsWithPreset('review-due-3m'));
    badge.querySelector('#tg-btn-irregular')?.addEventListener('click', () => toggleVerbLookupPanel());
    badge.querySelector('#tg-btn-verb-current')?.addEventListener('click', () => fillVerbLookupFromCurrentInput(true));
    badge.querySelector('#tg-verb-input')?.addEventListener('input', (e) => {
      renderVerbLookupResult(e.target.value);
    });
    badge.querySelector('#tg-btn-fullscreen')?.addEventListener('click', () => requestExamFullscreen('manual'));
    badge.querySelector('#tg-btn-focus')?.addEventListener('click', () => toggleFocusMode());

    if (!state.hudTickIntervalId) {
      state.hudTickIntervalId = setInterval(() => updateBadge(), 1000);
    }
    if (!state.dashboardRefreshIntervalId) {
      state.dashboardRefreshIntervalId = setInterval(() => refreshHudExternalData(false), 20000);
    }

    refreshHudExternalData(true);
    updateBadge();
    scheduleHudAutoMinimize();
  }

  function updateBadge() {
    const badge = state.badgeElement || document.getElementById('tg-tracker-badge');
    if (!badge) return;

    const correctEl = badge.querySelector('#tg-correct-count');
    const wrongEl = badge.querySelector('#tg-wrong-count');
    const accuracyEl = badge.querySelector('#tg-accuracy');
    const lessonEl = badge.querySelector('#tg-lesson-title');
    const partRoundEl = badge.querySelector('#tg-part-round');
    const progressTextEl = badge.querySelector('#tg-progress-text');
    const progressFillEl = badge.querySelector('#tg-progress-fill');
    const etaEl = badge.querySelector('#tg-eta-text');
    const elapsedEl = badge.querySelector('#tg-elapsed');
    const dueEl = badge.querySelector('#tg-due-count');
    const errSpellingEl = badge.querySelector('#tg-err-spelling');
    const errFormEl = badge.querySelector('#tg-err-form');
    const errSpacingEl = badge.querySelector('#tg-err-spacing');
    const errMeaningEl = badge.querySelector('#tg-err-meaning');
    const lastErrorEl = badge.querySelector('#tg-last-error');
    const focusBtnEl = badge.querySelector('#tg-btn-focus');
    const selectorWarnEl = badge.querySelector('#tg-selector-warning');
    const goalRingEl = badge.querySelector('#tg-goal-ring');
    const goalRingTextEl = badge.querySelector('#tg-goal-ring-text');
    const goalTextEl = badge.querySelector('#tg-goal-text');
    const examLockStatusEl = badge.querySelector('#tg-exam-lock-status');
    const examLockCountEl = badge.querySelector('#tg-exam-lock-violations');
    const fullscreenStatusEl = badge.querySelector('#tg-fullscreen-status');
    const fullscreenExitsEl = badge.querySelector('#tg-fullscreen-exits');
    const fullscreenBtnEl = badge.querySelector('#tg-btn-fullscreen');
    const irregularBtnEl = badge.querySelector('#tg-btn-irregular');

    const total = state.sessionCorrect + state.sessionWrong;
    const accuracy = total > 0 ? Math.round((state.sessionCorrect / total) * 100) : 0;
    const estimatedExamTotal = state.context?.partType === 'test' && state.context?.questionTotal
      ? Math.max(state.totalInputs, state.inputTrackers.size) * state.context.questionTotal
      : Math.max(state.totalInputs, state.inputTrackers.size);
    const completed = state.context?.partType === 'test'
      ? collectExamDraftAnswers().filter(item => item.typedValue).length
      : state.answeredInputIds.size;
    const totalInputs = state.context?.partType === 'test'
      ? Math.max(estimatedExamTotal, completed, state.totalInputs)
      : Math.max(state.totalInputs, state.inputTrackers.size);
    const remaining = Math.max(0, totalInputs - completed);

    if (correctEl) correctEl.textContent = state.sessionCorrect;
    if (wrongEl) wrongEl.textContent = state.sessionWrong;
    if (accuracyEl) accuracyEl.textContent = `${accuracy}%`;

    if (lessonEl) {
      lessonEl.textContent = state.context?.lessonTitle || state.context?.sessionTitle || 'Bài học hiện tại';
    }
    if (partRoundEl) {
      const partLabelMap = { practice: 'Luyện tập', test: 'Kiểm tra', vocab: 'Từ vựng', essay: 'Viết', unknown: 'Khác' };
      const partLabel = partLabelMap[state.context?.partType || 'unknown'] || 'Khác';
      const roundLabel = state.context?.round ? `Lần ${state.context.round}` : '';
      const questionLabel = state.context?.questionIndex
        ? `Câu ${state.context.questionIndex}${state.context.questionTotal ? `/${state.context.questionTotal}` : ''}`
        : '';
      partRoundEl.textContent = [partLabel, roundLabel, questionLabel].filter(Boolean).join(' • ') || '-';
    }

    if (examLockStatusEl) {
      const inTestMode = state.context?.partType === 'test';
      let lockText = 'Khóa kiểm tra: Tắt';
      if (state.examLockEnabled && inTestMode) lockText = 'Khóa kiểm tra: Bật';
      else if (state.examLockEnabled && !inTestMode) lockText = 'Khóa kiểm tra: Chờ test';
      else if (!state.examLockEnabled && inTestMode) lockText = 'Khóa kiểm tra: Tắt (cài đặt)';
      examLockStatusEl.textContent = lockText;
      examLockStatusEl.classList.toggle('is-active', isExamLockRunning());
      examLockStatusEl.classList.toggle('is-off', !isExamLockRunning());
    }

    if (examLockCountEl) {
      examLockCountEl.textContent = `Vi phạm: ${state.examViolationCount || 0}`;
    }

    if (fullscreenStatusEl) {
      let fsText = 'Toàn màn hình: Tắt';
      if (!state.examFullscreenEnabled) fsText = 'Toàn màn hình: Tắt (cài đặt)';
      else if (!isExamTestActive()) fsText = 'Toàn màn hình: Chờ test';
      else if (isCurrentlyFullscreen()) fsText = 'Toàn màn hình: Đang bật';
      else fsText = 'Toàn màn hình: Đã thoát';

      fullscreenStatusEl.textContent = fsText;
      fullscreenStatusEl.classList.toggle('is-active', state.examFullscreenEnabled && isExamTestActive() && isCurrentlyFullscreen());
      fullscreenStatusEl.classList.toggle('is-off', !state.examFullscreenEnabled || !isCurrentlyFullscreen());
    }

    if (fullscreenExitsEl) {
      const exits = state.examFullscreenExitCount || 0;
      const last = getLastFullscreenExitText();
      fullscreenExitsEl.textContent = `Thoát FS: ${exits}`;
      fullscreenExitsEl.title = exits > 0 ? `Lần gần nhất: ${last}` : 'Chưa có lần thoát toàn màn hình';
    }

    if (fullscreenBtnEl) {
      const canUse = state.examFullscreenEnabled && isExamTestActive();
      fullscreenBtnEl.style.opacity = canUse ? '1' : '0.5';
      fullscreenBtnEl.title = canUse
        ? 'Bật lại toàn màn hình'
        : 'Chỉ dùng khi đang kiểm tra và đã bật setting fullscreen';
    }

    if (irregularBtnEl) {
      irregularBtnEl.textContent = state.verbLookupOpen ? 'ĐTBTQ: Bật' : 'ĐTBTQ';
    }

    if (progressTextEl) progressTextEl.textContent = `${completed}/${totalInputs || 0}`;
    if (progressFillEl) {
      const pct = totalInputs > 0 ? Math.min(100, Math.round((completed / totalInputs) * 100)) : 0;
      progressFillEl.style.width = `${pct}%`;
    }
    if (etaEl) etaEl.textContent = formatETA(remaining);
    if (elapsedEl) elapsedEl.textContent = formatDuration(state.lessonOpenTime ? (Date.now() - state.lessonOpenTime) : 0);

    if (dueEl) dueEl.textContent = `${state.dueReviewCount || 0} từ`;

    if (errSpellingEl) errSpellingEl.textContent = state.errorBuckets.spelling || 0;
    if (errFormEl) errFormEl.textContent = state.errorBuckets.form || 0;
    if (errSpacingEl) errSpacingEl.textContent = state.errorBuckets.spacing || 0;
    if (errMeaningEl) errMeaningEl.textContent = state.errorBuckets.meaning || 0;
    if (lastErrorEl) {
      if (!state.isTracking) lastErrorEl.textContent = 'Tracking đang tắt.';
      else lastErrorEl.textContent = state.lastErrorLabel ? `Lỗi gần nhất: ${state.lastErrorLabel}` : '';
    }

    if (focusBtnEl) {
      focusBtnEl.textContent = `Focus: ${state.focusMode ? 'Bật' : 'Tắt'}`;
    }

    if (selectorWarnEl) {
      selectorWarnEl.style.display = state.selectorWarning ? '' : 'none';
    }

    if (goalRingEl && goalRingTextEl && goalTextEl) {
      const pct = Math.max(0, Math.min(100, state.goalProgressPct || 0));
      goalRingEl.style.background = `conic-gradient(#34d399 ${pct * 3.6}deg, rgba(255,255,255,0.12) 0deg)`;
      goalRingTextEl.textContent = `${pct}%`;
      goalTextEl.textContent = `${state.todayAttempts || 0} / ${state.goalDailyAttempt || 0}`;
    }

    badge.style.opacity = state.isTracking ? '1' : '0.65';
  }

  function pulseBadge() {
    if (state.badgeElement) {
      state.badgeElement.classList.add('tg-pulse');
      setTimeout(() => {
        state.badgeElement.classList.remove('tg-pulse');
      }, 600);
    }
  }

  // ============ Initialization ============

  function scheduleInitialize(delayMs = 0) {
    if (state.initTimer) clearTimeout(state.initTimer);
    state.initTimer = setTimeout(() => {
      initializeTracking();
    }, delayMs);
  }

  async function initializeTracking() {
    if (state.isInitializing) return;
    if (location.href === state.lastInitializedURL && (Date.now() - state.lastInitializedAt) < 1200) {
      return;
    }

    state.isInitializing = true;
    log('Initializing tracking for:', location.href);

    await loadTrackingSettings();

    // Reset session state for new page
    state.sessionCorrect = 0;
    state.sessionWrong = 0;
    state.sessionWordStats.clear();
    state.answeredInputIds.clear();
    state.errorBuckets = { spelling: 0, form: 0, spacing: 0, meaning: 0 };
    state.lastErrorLabel = '';
    state.selectorWarning = false;
    state.examViolationCount = 0;
    state.examFullscreenExitCount = 0;
    state.examFullscreenExitTimes = [];
    state.visibilityHiddenAt = 0;
    state.isFullscreenActive = isCurrentlyFullscreen();
    state.suppressFullscreenExitRecord = false;
    state.totalInputs = 0;
    state.inputTrackers.clear();
    state.lastFocusedInputId = '';
    state.examDraftAnswers.clear();
    state.verbLookupOpen = false;
    state.lessonOpenTime = Date.now();
    state.lastInitializedURL = location.href;
    state.lastInitializedAt = Date.now();

    // Detect context
    detectContext();

    // Send lesson_open event
    sendEvent('lesson_open', {
      url: location.href,
      loadTime: Date.now()
    });

    // Wait for Angular to render, then setup tracking
    waitForContent(() => {
      try {
        setupVocabTracking();
        setupButtonTracking();
        detectScores();
        createBadge();
        updateBadge();
        refreshHudExternalData(true);
        log('Tracking setup complete!');
      } finally {
        state.isInitializing = false;
      }
    });
  }

  function waitForContent(callback, maxRetries = 10, retryCount = 0) {
    const hasInputs = getTrackableInputs().length > 0;
    const hasButtons = document.querySelectorAll(getReadyButtonSelector()).length > 0;

    if (hasInputs || hasButtons || retryCount >= maxRetries) {
      updateSelectorWarningState();
      callback();
    } else {
      log(`Waiting for content... (attempt ${retryCount + 1}/${maxRetries})`);
      setTimeout(() => waitForContent(callback, maxRetries, retryCount + 1), 500);
    }
  }

  // ============ Listen for Background Messages ============

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'page_loaded') {
      log('Page loaded notification from background');
      scheduleInitialize(350);
    }

    if (message.action === 'get_current_state') {
      sendResponse({
        context: state.context,
        sessionCorrect: state.sessionCorrect,
        sessionWrong: state.sessionWrong,
        inputCount: state.inputTrackers.size,
        isTracking: state.isTracking
      });
    }

    if (message.action === 'toggle_tracking') {
      state.isTracking = !state.isTracking;
      log('Tracking', state.isTracking ? 'enabled' : 'disabled');
      chrome.runtime.sendMessage({
        action: 'update_settings',
        settings: { trackingEnabled: state.isTracking }
      });
      updateBadge();
      sendResponse({ isTracking: state.isTracking });
    }

    if (message.action === 'settings_updated' && message.settings) {
      const oldState = state.isTracking;
      const oldFullscreenState = state.examFullscreenEnabled;
      const oldHudAutoMinimize = state.hudAutoMinimizeEnabled;
      state.isTracking = message.settings.trackingEnabled !== false;
      state.examLockEnabled = message.settings.examLockEnabled !== false;
      state.examFullscreenEnabled = message.settings.examFullscreenEnabled !== false;
      state.hudAutoMinimizeEnabled = message.settings.hudAutoMinimizeEnabled !== false;
      if (oldState !== state.isTracking) {
        log('Tracking settings synced:', state.isTracking ? 'enabled' : 'disabled');
      }
      if (!oldFullscreenState && state.examFullscreenEnabled) {
        ensureExamFullscreen('auto');
      }
      if (!oldHudAutoMinimize && state.hudAutoMinimizeEnabled) {
        scheduleHudAutoMinimize();
      }
      if (oldHudAutoMinimize && !state.hudAutoMinimizeEnabled) {
        clearTimeout(state.hudAutoMinimizeTimerId);
      }
      syncExamLockState('settings_updated');
      updateBadge();
      sendResponse({ ok: true });
    }

    if (message.action === 'exam_lock_violation') {
      const reason = message.reason || 'background_tab_switch';
      registerExamViolation(reason, { message: message.message });
      sendResponse({ ok: true });
    }

    return true;
  });

  // ============ Start ============

  // Only run on thaygiap.com
  if (location.hostname.includes('thaygiap.com')) {
    const adapter = getAdapter();
    log(`Content script loaded on ${location.hostname} (adapter: ${adapter.id})`);
    setupExamLockGuards();

    // Initial setup
    if (document.readyState === 'complete') {
      scheduleInitialize(0);
    } else {
      window.addEventListener('load', () => scheduleInitialize(0));
    }

    // Setup URL watcher for SPA navigation
    setupURLWatcher();
    window.addEventListener('beforeunload', () => {
      showSessionSummaryToast();
      state.suppressFullscreenExitRecord = isCurrentlyFullscreen();
      state.examLockActive = false;
      syncExamLockState('beforeunload');
    });

    // Re-check for new content periodically (Angular lazy loading)
    if (!state.contentRefreshIntervalId) {
      state.contentRefreshIntervalId = setInterval(() => {
        const currentInputCount = document.querySelectorAll('input[data-tg-tracked]').length;
        const totalInputs = getTrackableInputs().length;
        const partType = detectPartType();
        const round = detectRound();
        const questionProgress = detectQuestionProgress();

        if (
          !state.context ||
          partType !== state.context.partType ||
          round !== state.context.round ||
          questionProgress.current !== state.context.questionIndex ||
          questionProgress.total !== state.context.questionTotal
        ) {
          resetVisibleInputTracking();
          state.context = {
            ...(state.context || {}),
            url: location.href,
            partType,
            round,
            questionIndex: questionProgress.current,
            questionTotal: questionProgress.total,
            questionLabel: questionProgress.label
          };
          refreshExamLockFromContext();
        }

        state.totalInputs = totalInputs;
        updateSelectorWarningState();

        if (totalInputs > currentInputCount) {
          log(`New inputs detected (${currentInputCount} → ${totalInputs}), updating tracking...`);
          setupVocabTracking();
        }
        updateBadge();
      }, 3000);
    }
  }

  // ============ Hotkeys ============
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;

    if (e.code === 'KeyA' || e.code === 'KeyR') {
      e.preventDefault();
      addCurrentWordToReview('Đã thêm vào ôn tập');
      return;
    }

    if (e.code === 'KeyH') {
      e.preventDefault();
      showHintForCurrentInput();
      return;
    }

    if (e.code === 'KeyS') {
      e.preventDefault();
      pronounceCurrentWord();
      return;
    }

    if (e.code === 'KeyF') {
      e.preventDefault();
      toggleFocusMode();
      return;
    }

    if (e.code === 'KeyV') {
      e.preventDefault();
      toggleVerbLookupPanel(true);
      fillVerbLookupFromCurrentInput(true);
      return;
    }

    if (e.code === 'KeyQ') {
      e.preventDefault();
      openOptionsWithPreset('review-hard5');
    }
  });

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    const hud = document.getElementById('tg-tracker-badge');
    const verbPanelOpen = !!hud?.querySelector('#tg-verb-panel:not([hidden])');
    const offsetBottom = hud
      ? (hud.classList.contains('tg-minimized') ? '76px' : (verbPanelOpen ? '470px' : '390px'))
      : '80px';
    toast.style.cssText = `
      position: fixed; bottom: ${offsetBottom}; right: 20px; background: #10b981; color: white;
      padding: 12px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999999; font-family: sans-serif; font-size: 14px; transition: opacity 0.3s;
      font-weight: 600;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

})();
