/**
 * Site Adapter Registry
 * ---------------------
 * Allows content tracking logic to be reused for multiple learning websites.
 */
(function() {
  'use strict';

  const adapters = [
    {
      id: 'thaygiap',
      matches(hostname) {
        return /(^|\.)thaygiap\.com$/i.test(hostname);
      },
      selectors: {
        input: 'input[placeholder*="Nhập đáp án"], input[aria-label*="Nhập đáp án"], input[id^="input-"]',
        button: 'button, .ant-btn, input[type="button"], input[type="submit"], a[class*="btn"]',
        scoreScope: '.ant-menu-item, [class*="sidebar"] *, [class*="list"] *, [class*="menu"] *',
        contentReadyButton: 'button, .ant-btn'
      }
    },
    {
      id: 'generic-learning',
      matches() {
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
    return adapters.find(adapter => adapter.matches(hostname)) || adapters[adapters.length - 1];
  }

  window.TG_SITE_ADAPTERS = {
    list: adapters,
    getAdapter
  };
})();
