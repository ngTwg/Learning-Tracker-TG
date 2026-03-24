// omni_catcher.js - v3.0 (Architecture fix: no double listeners, clean drag)
(function () {
  if (window.__omniCatcherV3) return;
  window.__omniCatcherV3 = true;

  /* ─── SVGs ─────────────────────────────────────── */
  const I_SPARK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1m-1.636 6.364l-.707-.707M12 21v-1m-6.364-1.636l.707-.707M3 12h1m1.636-6.364l.707.707"/></svg>`;
  const I_X    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
  const I_SAVE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;

  /* ─── State ─────────────────────────────────────── */
  let selText = '';      // văn bản đang được bôi đen
  let selVX   = 0;       // viewport X giữa selection
  let selVY   = 0;       // viewport Y dưới selection
  let floatEl = null;    // nút ✨ nổi
  let cardEl  = null;    // popup card

  /* ─── Lắng nghe sự kiện toàn trang ─────────────── */
  document.addEventListener('mouseup',   onDocMouseUp);
  document.addEventListener('mousedown', onDocMouseDown);

  function onDocMouseUp(e) {
    // Bỏ qua click bên trong card / button nổi
    if (insideOmni(e.target)) return;

    setTimeout(() => {
      const sel  = window.getSelection();
      const text = sel ? sel.toString().trim() : '';

      destroyFloat();

      if (text.length >= 2 && text.length <= 500) {
        try {
          const rng  = sel.getRangeAt(0);
          const rect = rng.getBoundingClientRect();
          selText = text;
          selVX   = rect.left + rect.width / 2;
          selVY   = rect.bottom;
          createFloat();
        } catch (_) {}
      }
    }, 20);
  }

  function onDocMouseDown(e) {
    if (insideOmni(e.target)) return;
    destroyFloat();
  }

  function insideOmni(target) {
    return target && (
      target.closest && (
        target.closest('[data-omni-card]') ||
        target.closest('[data-omni-float]')
      )
    );
  }

  /* ─── Nút nổi ✨ ────────────────────────────────── */
  function createFloat() {
    floatEl = document.createElement('button');
    floatEl.setAttribute('data-omni-float', '1');
    floatEl.title = 'AI giải thích từ được chọn';
    floatEl.innerHTML = I_SPARK;

    // Định vị fixed theo viewport
    let x = selVX - 18;
    let y = selVY + 8;
    x = Math.max(8, Math.min(x, window.innerWidth - 44));
    if (y + 44 > window.innerHeight - 8) y = selVY - 50;

    Object.assign(floatEl.style, {
      position: 'fixed',
      left:     x + 'px',
      top:      y + 'px',
      zIndex:   '2147483647'
    });

    floatEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCard();
    });

    document.body.appendChild(floatEl);
  }

  function destroyFloat() {
    if (floatEl) { floatEl.remove(); floatEl = null; }
  }

  /* ─── Popup Card ────────────────────────────────── */
  function openCard() {
    destroyFloat();
    if (!selText) return;

    const display = selText.length > 65
      ? selText.slice(0, 65) + '…'
      : selText;

    // Nếu card đã mở → chỉ cập nhật khu vực nội dung, giữ nguyên vị trí
    if (cardEl) {
      updateCardBody(display);
      fetchAI(selText);
      return;
    }

    // Tạo card mới
    cardEl = document.createElement('div');
    cardEl.setAttribute('data-omni-card', '1');

    // Tính vị trí (fixed viewport)
    const W = 340;
    let cx = selVX - W / 2;
    let cy = selVY + 14;
    cx = Math.max(10, Math.min(cx, window.innerWidth  - W - 10));
    if (cy + 280 > window.innerHeight - 10) cy = selVY - 295;
    cy = Math.max(10, cy);

    // Set vị trí fixed trực tiếp (không dùng cssText để tránh bị override)
    cardEl.style.position = 'fixed';
    cardEl.style.left     = cx + 'px';
    cardEl.style.top      = cy + 'px';
    cardEl.style.zIndex   = '2147483647';

    // Lắp nội dung HTML cơ bản (1 lần duy nhất, không gọi lại)
    cardEl.innerHTML = buildCardHTML(display);
    document.body.appendChild(cardEl);

    // Bind events (1 lần duy nhất, dùng querySelector trực tiếp trên cardEl)
    cardEl.querySelector('.oc-close').addEventListener('click', destroyCard);
    cardEl.querySelector('.oc-save').addEventListener('click', () => saveWord(selText));

    // Setup drag trên header (1 lần duy nhất)
    setupDrag(cardEl, cardEl.querySelector('.oc-header'));

    // Gọi AI
    fetchAI(selText);
  }

  function destroyCard() {
    if (cardEl) { cardEl.remove(); cardEl = null; }
  }

  // Chỉ cập nhật phần body khi card đã tồn tại (không rebuild toàn bộ HTML)
  function updateCardBody(display) {
    const selectedEl = cardEl.querySelector('.oc-selected');
    const bodyEl     = cardEl.querySelector('.oc-body');
    if (selectedEl) selectedEl.textContent = '"' + display + '"';
    if (bodyEl)     bodyEl.innerHTML = loadingHTML();
  }

  function buildCardHTML(display) {
    return `
<div class="oc-header">
  <div class="oc-title">${I_SPARK}<span>Omni-Catcher</span></div>
  <button class="oc-close" title="Đóng">${I_X}</button>
</div>
<div class="oc-selected">"${escHtml(display)}"</div>
<div class="oc-body" id="oc-body">${loadingHTML()}</div>
<div class="oc-footer">
  <button class="oc-save">${I_SAVE} Lưu vào ThayGiap</button>
</div>`;
  }

  function loadingHTML() {
    return `<div class="oc-loading"><div class="oc-spin"></div><span>AI đang phân tích…</span></div>`;
  }

  /* ─── Drag (delta-based, tuyệt đối không bị jump) ── */
  function setupDrag(card, handle) {
    if (!handle) return;
    handle.style.cursor = 'grab';

    let active = false;
    let mx0 = 0, my0 = 0;   // mouse start
    let cx0 = 0, cy0 = 0;   // card start (left/top)

    function onDown(e) {
      // Chỉ drag khi nhấn chuột trái vào header (không phải nút)
      if (e.button !== 0) return;
      if (e.target.closest('button')) return;

      e.preventDefault();
      e.stopPropagation();

      active = true;
      mx0 = e.clientX;
      my0 = e.clientY;

      // Đọc vị trí fixed hiện tại (parseInt an toàn)
      cx0 = parseFloat(card.style.left) || 0;
      cy0 = parseFloat(card.style.top)  || 0;

      handle.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      window.addEventListener('mousemove', onMove, { capture: true });
      window.addEventListener('mouseup',   onUp,   { capture: true });
    }

    function onMove(e) {
      if (!active) return;

      const dx = e.clientX - mx0;
      const dy = e.clientY - my0;

      let nx = cx0 + dx;
      let ny = cy0 + dy;

      // Clamp trong màn hình
      nx = Math.max(0, Math.min(nx, window.innerWidth  - card.offsetWidth));
      ny = Math.max(0, Math.min(ny, window.innerHeight - card.offsetHeight));

      card.style.left = nx + 'px';
      card.style.top  = ny + 'px';
    }

    function onUp() {
      active = false;
      handle.style.cursor = 'grab';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove, { capture: true });
      window.removeEventListener('mouseup',   onUp,   { capture: true });
    }

    handle.addEventListener('mousedown', onDown);
  }

  /* ─── AI Request ────────────────────────────────── */
  function fetchAI(text) {
    // Luôn lấy phần tử body từ cardEl trực tiếp (không dùng getElementById)
    const bodyEl = cardEl ? cardEl.querySelector('.oc-body') : null;
    if (!bodyEl) return;
    bodyEl.innerHTML = loadingHTML();

    const prompt =
      `Bạn là trợ lý tiếng Anh. Người dùng bôi đen: "${text}"\n` +
      `Hãy giải thích NGẮN GỌN:\n` +
      `1. **Nghĩa:** (Tiếng Việt + phiên âm IPA nếu là từ đơn)\n` +
      `2. **Loại từ/Cấu trúc:** (noun/verb/adj/phrase...)\n` +
      `3. **Ví dụ:** (1 câu tiếng Anh + dịch nghĩa)\n` +
      `Trả lời siêu ngắn gọn, không giải thích lý thuyết dài dòng.`;

    chrome.runtime.sendMessage(
      { action: 'ask_ai', aiType: 'grammar_gen', wordOrContext: prompt },
      (res) => {
        // Lấy lại bodyEl (card có thể đã đóng)
        const el = cardEl ? cardEl.querySelector('.oc-body') : null;
        if (!el) return;

        if (chrome.runtime.lastError) {
          el.innerHTML = errHTML('Runtime error: ' + chrome.runtime.lastError.message);
          return;
        }
        if (!res) {
          el.innerHTML = errHTML('Không nhận được phản hồi — Background script bị sleep?');
          return;
        }
        if (res.ok && (res.data || res.result)) {
          el.innerHTML = mdToHtml(res.data || res.result);
        } else {
          const msg = res.error || 'Lỗi không xác định';
          if (msg.includes('not configured') || msg.includes('API key') || msg.includes('provider')) {
            el.innerHTML = errHTML('Chưa cài API Key. Vào <b>Options → Cài đặt AI</b>.');
          } else {
            el.innerHTML = errHTML(msg);
          }
        }
      }
    );
  }

  /* ─── Lưu từ vào Review List ────────────────────── */
  function saveWord(text) {
    chrome.runtime.sendMessage({ action: 'add_to_review_list', vietnamese: text }, () => {
      const btn = cardEl ? cardEl.querySelector('.oc-save') : null;
      if (btn) {
        btn.textContent = '✅ Đã lưu!';
        btn.style.background = '#10b981';
        setTimeout(() => destroyCard(), 1500);
      }
    });
  }

  /* ─── HTML Helpers ──────────────────────────────── */
  function errHTML(msg) {
    return `<p class="oc-err">⚠ ${msg}</p>`;
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function mdToHtml(raw) {
    if (!raw) return '';
    // Xóa code block
    raw = raw.replace(/```[\s\S]*?```/g, '').trim();
    return raw.split('\n').map(line => {
      line = line.trim();
      if (!line) return '<br>';
      // Inline: bold, italic, code
      const fmt = s => s
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/`([^`]+)`/g, '<code class="oc-code">$1</code>');

      if (/^#{1,3}\s/.test(line))
        return `<p class="oc-h">${fmt(line.replace(/^#+\s/,''))}</p>`;
      const num = line.match(/^(\d+)\.\s+(.*)/);
      if (num)
        return `<p class="oc-row"><b class="oc-n">${num[1]}.</b><span>${fmt(num[2])}</span></p>`;
      if (/^[-*+]\s/.test(line))
        return `<p class="oc-row"><b class="oc-b">•</b><span>${fmt(line.slice(2))}</span></p>`;
      return `<p class="oc-p">${fmt(line)}</p>`;
    }).join('');
  }

})();
