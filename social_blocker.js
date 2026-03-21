// ThayGiap Social Toll-booth Blocker v2.0
// Hỗ trợ YouTube, Facebook, Spotify, TikTok, Instagram, Reddit
// Có timer, cài đặt số từ, cho phép bỏ qua

(async function () {
  // ─── Defaults ───────────────────────────────────────────────────────────────
  const DEFAULT_TOLL_WORDS   = 5;   // số từ mặc định
  const DEFAULT_INTERVAL_MIN = 15;  // phút tự do mặc định

  // ─── Load settings từ chrome.storage ────────────────────────────────────────
  let settings = {};
  try {
    const res = await new Promise(r => chrome.storage.local.get('tollboothSettings', r));
    settings = res.tollboothSettings || {};
  } catch (_) {}

  const TOLL_WORDS_COUNT = settings.wordCount || DEFAULT_TOLL_WORDS;
  const INTERVAL_MS      = (settings.intervalMin || DEFAULT_INTERVAL_MIN) * 60 * 1000;
  const ALLOW_SKIP       = settings.allowSkip !== false; // default true

  // ─── Check xem platform hiện tại có được bật không ──────────────────────────
  const hostname = location.hostname.replace('www.', '');

  let domains = settings.customDomains;
  if (!domains) {
    // Migration fallback
    const platforms = settings.platforms || { facebook: true, youtube: true };
    domains = Object.keys(platforms).filter(p => platforms[p]).map(p => p + '.com');
  }

  const isMatched = domains.some(domain => hostname.includes(domain));
  if (!isMatched) return; // Không nằm trong danh sách toll-booth → bỏ qua

  const platformKey = hostname;

  // ─── Extension master switch ─────────────────────────────────────────────────
  const extState = await new Promise(r => chrome.storage.local.get('extensionEnabled', r));
  if (extState.extensionEnabled === false) return;

  // ─── Timer-based unlock (instead of always-block at first load) ──────────────
  // Key lưu thời điểm "lần cuối vào trang này" + "đến hạn kiểm tra lúc"
  const SESSION_KEY = `tg_toll_session_${platformKey || hostname}`;
  const UNLOCK_KEY  = `tg_toll_unlock_${platformKey || hostname}`;

  function getSessionData() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }
  function setSessionData(data) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  function isCurrentlyUnlocked() {
    const unlockUntil = localStorage.getItem(UNLOCK_KEY);
    return unlockUntil && Number(unlockUntil) > Date.now();
  }

  function grantUnlock() {
    localStorage.setItem(UNLOCK_KEY, Date.now() + INTERVAL_MS);
    const root = document.getElementById('tg-social-blocker-root');
    if (root) root.remove();
    // Reset session timer
    setSessionData({ startedAt: Date.now(), checkDue: Date.now() + INTERVAL_MS });
  }

  function skipToll() {
    const root = document.getElementById('tg-social-blocker-root');
    if (root) root.remove();
    // Grant short unlock (1 minute) on skip
    localStorage.setItem(UNLOCK_KEY, Date.now() + 60 * 1000);
  }

  // ─── Init session tracking ────────────────────────────────────────────────────
  let session = getSessionData();
  if (!session) {
    // Lần đầu vào trang này trong session này
    session = { startedAt: Date.now(), checkDue: Date.now() + INTERVAL_MS };
    setSessionData(session);
  }

  // ─── Main check function ──────────────────────────────────────────────────────
  function checkToll() {
    if (document.getElementById('tg-social-blocker-root')) return; // already shown

    // Nếu đang trong unlock period → skip
    if (isCurrentlyUnlocked()) return;

    // Nếu chưa đến hạn kiểm tra → skip
    const now = Date.now();
    const current = getSessionData();
    if (current && now < current.checkDue) return;

    // Đến hạn → hiện toll-booth
    startBlockerChallenge();
  }

  // ─── Chạy check khi load và định kỳ ──────────────────────────────────────────
  // Chờ trang load xong mới check
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(checkToll, 2000));
  } else {
    setTimeout(checkToll, 2000);
  }

  // Check lại định kỳ mỗi 60 giây (để bắt doom-scroll)
  setInterval(() => {
    const s = getSessionData();
    if (s && Date.now() >= s.checkDue && !isCurrentlyUnlocked()) {
      checkToll();
    }
  }, 60000);

  // ─── Fetch words & build UI ────────────────────────────────────────────────────
  function startBlockerChallenge() {
    chrome.runtime.sendMessage({ action: 'get_review_list' }, async (res) => {
      let pool = res?.data || [];
      if (pool.length < TOLL_WORDS_COUNT) {
        const weakRes = await new Promise(r =>
          chrome.runtime.sendMessage({ action: 'get_vocab_summaries' }, r)
        );
        const weakArr = Object.values(weakRes?.data || {}).filter(w => w.english && w.vietnamese);
        pool = pool.concat(weakArr);
      }

      if (pool.length === 0) {
        grantUnlock();
        return;
      }

      // Deduplicate & shuffle
      const seen = new Set();
      const words = [];
      pool.sort(() => 0.5 - Math.random());
      for (const w of pool) {
        const key = (w.english || '').toLowerCase();
        if (!seen.has(key) && w.english && w.vietnamese) {
          seen.add(key);
          words.push(w);
        }
        if (words.length >= TOLL_WORDS_COUNT) break;
      }

      if (words.length === 0) { grantUnlock(); return; }
      buildUI(words);
    });
  }

  // ─── Build blocker UI ──────────────────────────────────────────────────────────
  function buildUI(words) {
    let currentIdx = 0;
    let totalTimeSec = 30; // countdown for "skip"

    // Platform label
    let platformLabel = hostname;
    const labels = [
      { key: 'facebook', label: '📘 Facebook' },
      { key: 'youtube', label: '▶️ YouTube' },
      { key: 'spotify', label: '🎵 Spotify' },
      { key: 'tiktok', label: '🎪 TikTok' },
      { key: 'instagram', label: '📸 Instagram' },
      { key: 'reddit', label: '🤖 Reddit' }
    ];
    for (const l of labels) {
      if (hostname.includes(l.key)) { platformLabel = l.label; break; }
    }

    const blocker = document.createElement('div');
    blocker.id = 'tg-social-blocker-root';

    const card = document.createElement('div');
    card.className = 'tg-blocker-card';

    // Header
    const header = document.createElement('div');
    header.className = 'tg-blocker-header';
    header.innerHTML = `🛑 Vé Cầu Đường <span style="font-size:16px; opacity:0.85;">${platformLabel}</span>`;

    // Subtitle with timer countdown
    const subtitle = document.createElement('div');
    subtitle.className = 'tg-blocker-subtitle';
    subtitle.textContent = `Vượt qua ${words.length} từ vựng để tiếp tục lướt web!`;

    // Timer bar showing "time spent"
    const timerBarWrap = document.createElement('div');
    timerBarWrap.className = 'tg-timer-bar-wrap';
    const timerBar = document.createElement('div');
    timerBar.className = 'tg-timer-bar';
    timerBar.style.width = '100%';
    timerBarWrap.appendChild(timerBar);

    // Vocab card
    const vocabCard = document.createElement('div');
    vocabCard.className = 'tg-vocab-card';
    const promptText = document.createElement('div');
    promptText.className = 'tg-vocab-prompt';

    const progressContainer = document.createElement('div');
    progressContainer.className = 'tg-vocab-progress';
    for (let i = 0; i < words.length; i++) {
      const p = document.createElement('div');
      p.className = 'tg-progress-dot' + (i === 0 ? ' active' : '');
      p.id = 'tg-dot-' + i;
      progressContainer.appendChild(p);
    }

    vocabCard.appendChild(promptText);

    // Input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tg-vocab-input';
    input.placeholder = 'Nhập từ tiếng Anh...';
    input.autocomplete = 'off';

    const submitBtn = document.createElement('button');
    submitBtn.className = 'tg-vocab-submit';
    submitBtn.textContent = '✓ Kiểm tra';

    // Skip button (optional)
    let skipBtn = null;
    if (ALLOW_SKIP) {
      skipBtn = document.createElement('button');
      skipBtn.className = 'tg-skip-btn';
      skipBtn.textContent = '⏭ Bỏ qua (có thể ảnh hưởng streak)';
      skipBtn.addEventListener('click', () => {
        skipToll();
      });
    }

    // Assemble card
    card.appendChild(header);
    card.appendChild(subtitle);
    card.appendChild(timerBarWrap);
    card.appendChild(vocabCard);
    card.appendChild(input);
    card.appendChild(submitBtn);
    card.appendChild(progressContainer);
    if (skipBtn) card.appendChild(skipBtn);

    blocker.appendChild(card);

    if (document.body) {
      document.body.appendChild(blocker);
    } else {
      document.documentElement.appendChild(blocker);
    }

    // ─── Countdown animation for timer bar ──────────────────────────────────────
    let secsLeft = totalTimeSec;
    const barTick = setInterval(() => {
      secsLeft--;
      const pct = Math.max(0, (secsLeft / totalTimeSec) * 100);
      timerBar.style.width = pct + '%';
      if (secsLeft <= 0) clearInterval(barTick);
    }, 1000);

    // ─── Render & answer logic ───────────────────────────────────────────────────
    function renderWord() {
      promptText.innerHTML = `
        <div style="font-size:13px; color:#64748b; margin-bottom:8px; text-transform:uppercase; letter-spacing:1px;">Câu ${currentIdx + 1} / ${words.length}</div>
        <div style="font-size:22px; font-weight:700; color:#f8fafc;">${escapeText(words[currentIdx].vietnamese)}</div>
        <div style="font-size:13px; color:#64748b; margin-top:8px;">Nhập: tiếng Anh</div>
      `;
      input.value = '';
      input.placeholder = 'Nhập từ tiếng Anh...';
      input.classList.remove('tg-wrong', 'tg-correct');
      input.focus();
    }

    function checkAnswer() {
      const typed   = input.value.trim().toLowerCase().replace(/[^a-z\s'-]/g, '');
      const expected = (words[currentIdx].english || '').trim().toLowerCase().replace(/\(.*?\)/g, '').trim();

      if (typed === expected || expected.split('/').map(s=>s.trim()).includes(typed)) {
        const dot = document.getElementById('tg-dot-' + currentIdx);
        if (dot) { dot.classList.remove('active'); dot.classList.add('done'); }
        currentIdx++;
        if (currentIdx >= words.length) {
          clearInterval(barTick);
          input.disabled = true;
          input.classList.add('tg-correct');
          submitBtn.textContent = '🎉 Xuất sắc! Đang mở khóa...';
          submitBtn.style.background = '#10b981';
          setTimeout(() => grantUnlock(), 900);
        } else {
          const nextDot = document.getElementById('tg-dot-' + currentIdx);
          if (nextDot) nextDot.classList.add('active');
          renderWord();
        }
      } else {
        input.classList.remove('tg-wrong');
        void input.offsetWidth;
        input.classList.add('tg-wrong');
        input.value = '';
        input.placeholder = `❌ Sai! Đáp án: ${expected}`;
      }
    }

    submitBtn.addEventListener('click', checkAnswer);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') checkAnswer(); });
    renderWord();
  }

  function escapeText(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

})();
