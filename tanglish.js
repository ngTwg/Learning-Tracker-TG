/**
 * ThayGiap - Tanglish Text Replacement Script
 * =============================================
 * Runs on Vietnamese news sites (VnExpress, Zing, Tuoi Tre, Dan Tri)
 * Replaces high-frequency Vietnamese words/phrases with English equivalents
 * so learners practice passive recognition while reading normal Vietnamese content.
 * 
 * Each replaced word shows a tooltip with the original Vietnamese on hover.
 */

(function () {
  'use strict';

  // ── Settings check ────────────────────────────────────────────────────
  chrome.storage.local.get(['tg_settings', 'tg_tanglish_enabled'], (data) => {
    const settings = data.tg_settings || {};
    const enabled = data.tg_tanglish_enabled !== false && settings.tanglishEnabled !== false;
    if (!enabled) return;

    // Load learned vocab from storage to replace those words specifically
    chrome.storage.local.get(['tg_vocab_summary'], (vocabData) => {
      const summaries = vocabData.tg_vocab_summary || {};
      // Build map: vietnamese.toLowerCase() → english
      const learnedWords = {};
      Object.values(summaries).forEach(s => {
        if (s.vietnamese && s.english && s.mastery !== 'new') {
          learnedWords[s.vietnamese.toLowerCase().trim()] = s.english.trim();
        }
      });

      runTanglish(learnedWords);
    });
  });

  // ── Core Tanglish replacement logic ──────────────────────────────────

  // Hardcoded popular vocabulary mappings (viết → English)
  const STATIC_MAP = {
    // Thì tiếng Anh phổ biến trong bài thi ThayGiap
    'đã': 'already',
    'sẽ': 'will',
    'đang': 'is/are doing',
    'thường': 'usually',
    'luôn': 'always',
    'chưa bao giờ': 'never',
    'vừa mới': 'just',
    'gần đây': 'recently',
    
    // High-frequency common words
    'tuy nhiên': 'however',
    'vì vậy': 'therefore',
    'ngoài ra': 'moreover',
    'ví dụ': 'for example',
    'theo': 'according to',
    'quan trọng': 'important',
    'cần thiết': 'necessary',
    'phát triển': 'develop',
    'tăng': 'increase',
    'giảm': 'decrease',
    'chính phủ': 'government',
    'kinh tế': 'economy/economic',
    'công nghệ': 'technology',
    'môi trường': 'environment',
    'giáo dục': 'education',
    'y tế': 'healthcare',
    'doanh nghiệp': 'enterprise',
    'người dùng': 'user',
    'thị trường': 'market',
    'đầu tư': 'invest',
    'chiến lược': 'strategy',
    'hiệu quả': 'effective',
    'chất lượng': 'quality',
    'an toàn': 'safe/safety',
    'khó khăn': 'difficulty',
    'cơ hội': 'opportunity',
    'thách thức': 'challenge',
    'giải pháp': 'solution',
    'mục tiêu': 'goal/target',
    'kết quả': 'result',
    'thành công': 'success',
    'thất bại': 'failure',
    'hợp tác': 'cooperate',
    'toàn cầu': 'global',
    'quốc tế': 'international',
    'địa phương': 'local',
    'chính sách': 'policy',
    'pháp luật': 'law/legal',
    'quy định': 'regulation',
    'báo cáo': 'report',
    'nghiên cứu': 'research',
    'thông tin': 'information',
    'dữ liệu': 'data',
    'hệ thống': 'system',
    'nền tảng': 'platform',
    'người tiêu dùng': 'consumer',
    'cộng đồng': 'community',
    'xã hội': 'society',
  };

  function runTanglish(learnedWords) {
    // Merge static + learned maps (learned words take priority)
    const wordMap = { ...STATIC_MAP, ...learnedWords };
    
    // Sort by phrase length (longest first to avoid partial matches)
    const phrases = Object.entries(wordMap)
      .filter(([viet, eng]) => viet.length >= 3 && eng)
      .sort((a, b) => b[0].length - a[0].length);

    // Target article content areas only (avoid menus, footers, ads)
    const contentSelectors = [
      'article', '.article-body', '.article__body',
      '.content-detail', '.post-content', '.article-content',
      '.content-body', '.fck_detail', '.content-main p',
      'main p', '.description', '.article-description'
    ];

    const contentAreas = [];
    for (const sel of contentSelectors) {
      const els = document.querySelectorAll(sel);
      els.forEach(el => {
        if (!el.closest('#tg-tracker-badge') && !contentAreas.includes(el)) {
          contentAreas.push(el);
        }
      });
    }

    if (contentAreas.length === 0) return;

    // Walk text nodes inside content areas
    contentAreas.forEach(area => {
      if (area.dataset.tgTanglishDone) return;
      area.dataset.tgTanglishDone = 'true';
      
      processNode(area, phrases, 0);
    });

    // Show info toast
    showTanglishToast();
  }

  function processNode(root, phrases, depth) {
    if (depth > 8) return; // Prevent infinite recursion
    
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (['SCRIPT', 'STYLE', 'A', 'BUTTON', 'INPUT', 'TEXTAREA', 'NOSCRIPT'].includes(tag)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.classList.contains('tg-tanglish-word')) return NodeFilter.FILTER_REJECT;
        if (parent.closest('.tg-tanglish-word')) return NodeFilter.FILTER_REJECT;
        return node.textContent.trim().length > 5 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);

    for (const textNode of nodes) {
      let content = textNode.textContent;
      let changed = false;

      for (const [viet, eng] of phrases) {
        // Case-insensitive match with word boundary approximation
        const regex = new RegExp(`(^|[\\s,.!?;:"'()])${escapeRegex(viet)}([\\s,.!?;:"')\\n]|$)`, 'gi');
        if (regex.test(content)) {
          content = content.replace(regex, (match, before, after) => {
            return `${before}<span class="tg-tanglish-word" data-viet="${escapeAttr(viet)}">${escapeHtml(eng)}</span>${after}`;
          });
          changed = true;
        }
      }

      if (changed) {
        const span = document.createElement('span');
        span.innerHTML = content;
        textNode.parentNode?.replaceChild(span, textNode);
      }
    }
  }

  function showTanglishToast() {
    const existing = document.getElementById('tg-tanglish-toast');
    if (existing) return;

    const toast = document.createElement('div');
    toast.id = 'tg-tanglish-toast';
    toast.style.cssText = `
      position: fixed; bottom: 80px; right: 16px; z-index: 99998;
      background: rgba(15,23,42,0.95); color: #38bdf8;
      border: 1px solid rgba(56,189,248,0.4); border-radius: 10px;
      padding: 10px 16px; font-size: 13px; font-family: 'Segoe UI', sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4); cursor: pointer;
      animation: tgSlideIn 0.3s ease;
      backdrop-filter: blur(10px);
    `;
    toast.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:16px;"></span>
        <div>
          <div style="font-weight:700;">Tanglish Mode đang bật</div>
          <div style="color:#94a3b8;font-size:11px;">Từ vựng đã học được highlight. Hover để xem tiếng Việt.</div>
        </div>
        <span style="color:#475569;margin-left:8px;cursor:pointer;" id="tg-tanglish-close"></span>
      </div>
    `;
    document.body.appendChild(toast);
    document.getElementById('tg-tanglish-close')?.addEventListener('click', () => toast.remove());
    setTimeout(() => toast.remove(), 8000);
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

})();
