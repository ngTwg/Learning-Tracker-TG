/**
 * Site Adapter Registry
 * ---------------------
 * Allows content tracking logic to be reused for multiple learning websites.
 * 
 * VERIFIED SELECTORS (from real DOM inspection):
 * - aria-label="Nhập đáp án" ✅ CONFIRMED on thaygiap.com/user/exam
 * - placeholder="Nhập đáp án" ⚠️ NOT VERIFIED (defensive fallback only)
 */
(function () {
  'use strict';

  var adapters = [
    {
      id: 'thaygiap',
      matches: function (hostname) {
        return /(^|\.)thaygiap\.com$/i.test(hostname);
      },
      selectors: {
        // ✅ Priority order based on VERIFIED attributes from real DOM:
        // 1. aria-label exact match (VERIFIED)
        // 2. aria-label partial match (fallback)
        // 3. placeholder (defensive fallback - NOT VERIFIED)
        // 4. id pattern (last resort)
        input: 'input[aria-label="Nhập đáp án"], input[aria-label*="đáp án"], input[placeholder*="Nhập đáp án"], input[id^="input-"]',
        button: 'button, .ant-btn, input[type="button"], input[type="submit"], a[class*="btn"]',
        scoreScope: '.ant-menu-item, [class*="sidebar"] *, [class*="list"] *, [class*="menu"] *',
        contentReadyButton: 'button, .ant-btn'
      }
    },
    {
      id: 'generic-learning',
      matches: function () {
        return true;
      },
      selectors: {
        input: 'input[placeholder*="answer" i], input[aria-label*="answer" i], input[type="text"]',
        button: 'button, input[type="button"], input[type="submit"]',
        scoreScope: '[class*="score" i], [class*="result" i], [class*="menu" i]',
        contentReadyButton: 'button, input[type="button"], input[type="submit"]'
      }
    }
  ];

  function getAdapter(hostname) {
    var i;
    for (i = 0; i < adapters.length; i++) {
      if (adapters[i].matches(hostname)) {
        return adapters[i];
      }
    }
    return adapters[adapters.length - 1];
  }

  // Validate and expose API
  if (typeof window !== 'undefined') {
    window.TG_SITE_ADAPTERS = {
      list: adapters,
      getAdapter: getAdapter,
      version: '1.0.1',
      loaded: true
    };
    console.log('[Site Adapters] Loaded successfully v1.0.1');
  }
})();
