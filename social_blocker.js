// ThayGiap Social Blocker

(async function() {
  const UNLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes of free browsing
  const TOLL_WORDS_COUNT = 3;

  function isUnlocked() {
    const unlockUntil = localStorage.getItem('tg_social_unlock_until');
    return unlockUntil && Number(unlockUntil) > Date.now();
  }

  function grantUnlock() {
    localStorage.setItem('tg_social_unlock_until', Date.now() + UNLOCK_DURATION_MS);
    const root = document.getElementById('tg-social-blocker-root');
    if (root) root.remove();
  }

  function startBlockerChallenge() {
    // Ask background for 3 words
    chrome.runtime.sendMessage({ action: 'get_review_list' }, async (res) => {
      let pool = res?.data || [];
      if (pool.length < TOLL_WORDS_COUNT) {
        // Fallback to weakness or basic random if not enough due reviews
        const weakRes = await new Promise(r => chrome.runtime.sendMessage({ action: 'get_vocab_summaries' }, r));
        const weakArr = Object.values(weakRes?.data || {}).filter(w => w.english && w.vietnamese);
        pool = pool.concat(weakArr);
      }
      
      if (pool.length === 0) {
        // Nothing to practice, just grant access
        grantUnlock();
        return;
      }

      // Pick random 3 words
      const words = [];
      pool = pool.sort(() => 0.5 - Math.random());
      for (const w of pool) {
        if (!words.find(existing => existing.english === w.english)) {
          words.push(w);
        }
        if (words.length >= TOLL_WORDS_COUNT) break;
      }

      if (words.length === 0) {
        grantUnlock();
        return;
      }

      buildUI(words);
    });
  }

  function checkLockStatus() {
    if (!isUnlocked() && !document.getElementById('tg-social-blocker-root')) {
      startBlockerChallenge();
    }
  }

  // Initial Check
  checkLockStatus();
  
  // Interrupter: Re-check every 30 seconds to catch doom-scrolling
  setInterval(checkLockStatus, 30000);

  function buildUI(words) {
    let currentIdx = 0;

    const blocker = document.createElement('div');
    blocker.id = 'tg-social-blocker-root';

    const card = document.createElement('div');
    card.className = 'tg-blocker-card';

    const header = document.createElement('div');
    header.className = 'tg-blocker-header';
    header.innerHTML = `🛑 Phí Cầu Đường <span style="text-transform:capitalize;">${location.hostname.replace('www.', '')}</span>`;

    const subtitle = document.createElement('div');
    subtitle.className = 'tg-blocker-subtitle';
    subtitle.textContent = `Vượt qua ${words.length} từ vựng để lướt web tiếp nhé!`;

    const vocabCard = document.createElement('div');
    vocabCard.className = 'tg-vocab-card';

    const promptText = document.createElement('div');
    promptText.className = 'tg-vocab-prompt';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tg-vocab-input';
    input.placeholder = 'Nhập từ tiếng Anh...';
    input.autocomplete = 'off';

    const submitBtn = document.createElement('button');
    submitBtn.className = 'tg-vocab-submit';
    submitBtn.textContent = 'Kiểm tra';

    const progressContainer = document.createElement('div');
    progressContainer.className = 'tg-vocab-progress';

    for (let i = 0; i < words.length; i++) {
        const p = document.createElement('div');
        p.className = 'tg-progress-dot' + (i === 0 ? ' active' : '');
        p.id = 'tg-dot-' + i;
        progressContainer.appendChild(p);
    }

    vocabCard.appendChild(promptText);
    card.appendChild(header);
    card.appendChild(subtitle);
    card.appendChild(vocabCard);
    card.appendChild(input);
    card.appendChild(submitBtn);
    card.appendChild(progressContainer);

    blocker.appendChild(card);

    if (document.body) {
      document.body.appendChild(blocker);
    } else {
      document.documentElement.appendChild(blocker);
    }

    function renderWord() {
      promptText.textContent = words[currentIdx].vietnamese;
      input.value = '';
      input.focus();
    }

    function checkAnswer() {
      const typed = input.value.trim().toLowerCase();
      const expected = (words[currentIdx].english || '').trim().toLowerCase();

      if (typed === expected) {
        // Correct
        const dot = document.getElementById('tg-dot-' + currentIdx);
        if (dot) {
          dot.classList.remove('active');
          dot.classList.add('done');
        }

        currentIdx++;

        if (currentIdx >= words.length) {
          // Success!
          input.disabled = true;
          input.classList.add('tg-correct');
          submitBtn.textContent = 'Tuyệt vời! Đang mở khóa...';
          submitBtn.style.background = '#10b981';
          setTimeout(() => {
            grantUnlock();
          }, 1000);
        } else {
          // Next word
          const nextDot = document.getElementById('tg-dot-' + currentIdx);
          if (nextDot) nextDot.classList.add('active');
          renderWord();
        }
      } else {
        // Wrong
        input.classList.remove('tg-wrong');
        void input.offsetWidth; // trigger reflow
        input.classList.add('tg-wrong');
        input.value = '';
        input.placeholder = `Sai rồi. Đáp án: ${expected}`;
      }
    }

    submitBtn.addEventListener('click', checkAnswer);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') checkAnswer();
    });

    renderWord();
  }

})();
