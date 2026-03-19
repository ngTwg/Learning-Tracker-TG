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
    sessionCorrect: 0,
    sessionWrong: 0,
    lastURL: location.href,
    isTracking: true,
    adapter: null,
    initTimer: null,
    urlWatcherIntervalId: null,
    contentRefreshIntervalId: null,
    lastInitializedURL: '',
    lastInitializedAt: 0,
    isInitializing: false,
    observer: null,
    lessonOpenTime: null,
    badgeElement: null
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
      }
    } catch (err) {
      logError('Load settings error:', err);
    }
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

    state.context = {
      url,
      pageTitle,
      lessonTitle,
      sessionTitle,
      partType,
      currentItem,
      round
    };

    log('Context detected:', state.context);
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
      if (text === 'tiếp theo') return 'test';
    }

    // Check if vocab table exists with inputs
    const vocabInputs = document.querySelectorAll(getInputSelector());
    if (vocabInputs.length > 0) return 'vocab';

    // Check for textarea (essay)
    const textareas = document.querySelectorAll('textarea.quiz-answer, textarea[class*="answer"]');
    if (textareas.length > 0) return 'essay';

    // Check URL for hints
    if (/exam/i.test(url)) return 'practice';
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

  function setupVocabTracking() {
    // Find all answer inputs
    const inputs = document.querySelectorAll(getInputSelector());

    if (inputs.length === 0) {
      log('No vocab inputs found, will retry...');
      return;
    }

    log(`Found ${inputs.length} vocab inputs, setting up tracking...`);

    inputs.forEach((input, index) => {
      if (input.dataset.tgTracked) return;
      
      const inputId = input.id || `input-idx-${index}`;
      input.dataset.tgTracked = 'true';
      input.dataset.tgInputId = inputId; // Store ID on DOM element for easy access

      const vietnamese = extractVietnameseForInput(input);

      state.inputTrackers.set(inputId, {
        wrongCount: 0,
        correctCount: 0,
        lastValue: '',
        vietnamese: vietnamese,
        english: '',
        attempts: [],
        lastReportedStatusKey: '' // Prevent duplicate reporting
      });

      log(`Tracking input [${inputId}]: "${vietnamese}"`);

      let typingTimer;
      input.addEventListener('input', () => {
        clearTimeout(typingTimer);
        const tracker = state.inputTrackers.get(inputId);
        const value = input.value.trim();
        if (tracker && value.length > 0 && value !== tracker.lastValue) {
          tracker.lastValue = value;
          sendEvent('answer_attempt', { inputId, vietnamese, userInput: value, attemptNumber: tracker.attempts.length + 1 });
        }
        // Debounced validation check (some SPA validates as you type)
        typingTimer = setTimeout(() => { checkInputState(input); }, 750);
      });

      input.addEventListener('blur', () => setTimeout(() => checkInputState(input), 200));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Tab') setTimeout(() => checkInputState(input), 200);
      });
    });

    // Setup MutationObserver for dynamic class changes (correct/incorrect)
    setupClassObserver(inputs);
  }

  function extractVietnameseForInput(input) {
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

    return `Word #${Array.from(document.querySelectorAll(getInputSelector())).indexOf(input) + 1}`;
  }

  function checkInputState(input) {
    const inputId = input.id || input.dataset.tgInputId;
    const tracker = state.inputTrackers.get(inputId);
    if (!tracker) return;

    const value = input.value.trim();
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

    if (resultCorrect) {
      tracker.correctCount++;
      tracker.english = value;
      state.sessionCorrect++;
    } else {
      tracker.wrongCount++;
      state.sessionWrong++;
      if (correctAnswer) tracker.english = correctAnswer;
    }

    tracker.attempts.push({ value, isCorrect: resultCorrect, timestamp: Date.now() });

    sendEvent('answer_result', {
      inputId,
      vietnamese: tracker.vietnamese,
      english: tracker.english || correctAnswer || value, // Fallback to provided value
      correctAnswer: correctAnswer || '',
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
    if (input.classList.contains('incorrect')) return false;
    if (input.classList.contains('wrong')) return false;

    // PRIORITY 2: Explicit correct class
    if (input.classList.contains('correct')) return true;
    if (input.classList.contains('is-valid')) return true;

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
    const correctWrapper = input.closest('.correct, .success');
    if (correctWrapper) return true;

    return null; // Status not yet determined
  }

  function checkIsIncorrect(input) {
    // PRIORITY 1: Explicit class (most reliable - thaygiap adds .incorrect on wrong)
    if (input.classList.contains('incorrect')) return true;
    if (input.classList.contains('wrong')) return true;
    if (input.classList.contains('is-invalid')) return true;

    // PRIORITY 2: Explicit correct class means NOT incorrect  
    if (input.classList.contains('correct')) return false;
    if (input.classList.contains('is-valid')) return false;

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
    const incorrectWrapper = input.closest('.incorrect, .wrong, .has-error, .ant-form-item-has-error');
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
    const tableOrForm = document.querySelector('table, form, [class*="quiz"], [class*="exam"], main, .ant-layout-content');
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
              const newInputs = node.querySelectorAll ? 
                node.querySelectorAll(getInputSelector()) :
                [];
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
        const inputId = input.id || input.dataset.tgInputId;
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
      /tiếp theo/i,
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

      btn.addEventListener('click', () => {
        log(`Button clicked: "${btnText}"`);

        // Determine button type
        let buttonType = 'unknown';
        if (/kiểm tra/i.test(btnText)) buttonType = 'check';
        else if (/luyện tập/i.test(btnText)) buttonType = 'practice';
        else if (/làm lại/i.test(btnText)) buttonType = 'retry';
        else if (/tiếp theo/i.test(btnText)) buttonType = 'next';
        else if (/nộp bài/i.test(btnText)) buttonType = 'submit';
        else if (/lần\s+\d+/i.test(btnText)) {
          buttonType = 'round_switch';
        }

        sendEvent('submit_click', {
          buttonText: btnText,
          buttonType,
          sessionCorrect: state.sessionCorrect,
          sessionWrong: state.sessionWrong
        });

        // If it's a mode/round switch, update context and re-init
        if (['practice', 'check', 'round_switch', 'next', 'retry'].includes(buttonType)) {
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
      });
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
          state.lastURL = location.href;
          scheduleInitialize(350);
        }
      }, 500);
    });
  }

  // ============ Floating Badge ============

  function createBadge() {
    // Remove if exists
    const existing = document.getElementById('tg-tracker-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.id = 'tg-tracker-badge';
    badge.innerHTML = `
      <span class="tg-icon">📊</span>
      <span class="tg-label">Tracker</span>
      <span class="tg-stats">
        <span class="tg-correct" title="Đúng">✓ <span id="tg-correct-count">0</span></span>
        <span class="tg-wrong" title="Sai">✗ <span id="tg-wrong-count">0</span></span>
      </span>
    `;
    badge.title = 'ThayGiap Learning Tracker - Click để thu gọn';

    // Toggle minimize on click
    badge.addEventListener('click', () => {
      badge.classList.toggle('tg-minimized');
    });

    document.body.appendChild(badge);
    state.badgeElement = badge;
  }

  function updateBadge() {
    const correctEl = document.getElementById('tg-correct-count');
    const wrongEl = document.getElementById('tg-wrong-count');
    if (correctEl) correctEl.textContent = state.sessionCorrect;
    if (wrongEl) wrongEl.textContent = state.sessionWrong;
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
    state.inputTrackers.clear();
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
        log('Tracking setup complete!');
      } finally {
        state.isInitializing = false;
      }
    });
  }

  function waitForContent(callback, maxRetries = 10, retryCount = 0) {
    const hasInputs = document.querySelectorAll(getInputSelector()).length > 0;
    const hasButtons = document.querySelectorAll(getReadyButtonSelector()).length > 0;

    if (hasInputs || hasButtons || retryCount >= maxRetries) {
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
      sendResponse({ isTracking: state.isTracking });
    }

    if (message.action === 'settings_updated' && message.settings) {
      const oldState = state.isTracking;
      state.isTracking = message.settings.trackingEnabled !== false;
      if (oldState !== state.isTracking) {
        log('Tracking settings synced:', state.isTracking ? 'enabled' : 'disabled');
      }
      sendResponse({ ok: true });
    }

    return true;
  });

  // ============ Start ============

  // Only run on thaygiap.com
  if (location.hostname.includes('thaygiap.com')) {
    const adapter = getAdapter();
    log(`Content script loaded on ${location.hostname} (adapter: ${adapter.id})`);

    // Initial setup
    if (document.readyState === 'complete') {
      scheduleInitialize(0);
    } else {
      window.addEventListener('load', () => scheduleInitialize(0));
    }

    // Setup URL watcher for SPA navigation
    setupURLWatcher();

    // Re-check for new content periodically (Angular lazy loading)
    if (!state.contentRefreshIntervalId) {
      state.contentRefreshIntervalId = setInterval(() => {
        const currentInputCount = document.querySelectorAll('input[data-tg-tracked]').length;
        const totalInputs = document.querySelectorAll(getInputSelector()).length;

        if (totalInputs > currentInputCount) {
          log(`New inputs detected (${currentInputCount} → ${totalInputs}), updating tracking...`);
          setupVocabTracking();
        }
      }, 3000);
    }
  }

  // ============ Quick Add Feature (Alt+A) ============
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyA') {
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === 'INPUT' && activeEl.dataset.tgTracked) {
        e.preventDefault();
        const inputId = activeEl.dataset.tgInputId;
        const tracker = state.inputTrackers.get(inputId);
        if (tracker && tracker.vietnamese) {
          chrome.runtime.sendMessage({ action: 'add_to_review_list', vietnamese: tracker.vietnamese });
          showToast(`Đã thêm "${tracker.vietnamese}" vào Danh sách Ôn tập!`);
        }
      }
    }
  });

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed; bottom: 80px; right: 20px; background: #10b981; color: white;
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
