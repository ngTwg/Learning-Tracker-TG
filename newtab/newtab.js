document.addEventListener('DOMContentLoaded', async () => {
  await loadTheme();
  setupThemeToggle();
  initClock();
  initBackground();

  document.getElementById('btn-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  const reviewWords = await fetchReviewWords();
  if (!reviewWords || reviewWords.length === 0) {
    showEmptyState();
  } else {
    // Pick a random word from the review list
    const word = reviewWords[Math.floor(Math.random() * reviewWords.length)];
    showFlashcard(word);
  }
});

// Theme Management
async function loadTheme() {
  try {
    const result = await chrome.storage.local.get(['theme']);
    const theme = result.theme || 'dark';
    applyTheme(theme);
  } catch (err) {
    console.error('Error loading theme:', err);
  }
}

function applyTheme(theme) {
  const body = document.body;
  const themeBtn = document.getElementById('btn-theme');

  if (theme === 'light') {
    body.classList.add('light-theme');
    if (themeBtn) themeBtn.textContent = '☀️';
  } else {
    body.classList.remove('light-theme');
    if (themeBtn) themeBtn.textContent = '🌙';
  }
}

async function toggleTheme() {
  try {
    const result = await chrome.storage.local.get(['theme']);
    const currentTheme = result.theme || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    await chrome.storage.local.set({ theme: newTheme });
    applyTheme(newTheme);
  } catch (err) {
    console.error('Error toggling theme:', err);
  }
}

function setupThemeToggle() {
  const btnTheme = document.getElementById('btn-theme');
  if (btnTheme) {
    btnTheme.addEventListener('click', toggleTheme);
  }
}

function initClock() {
  const clockEl = document.getElementById('clock');
  const greetingEl = document.getElementById('greeting');

  const update = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    clockEl.textContent = `${h}:${m}`;

    let greeting = 'Chào buổi tối';
    const hour = now.getHours();
    if (hour >= 5 && hour < 12) greeting = 'Chào buổi sáng';
    else if (hour >= 12 && hour < 18) greeting = 'Chào buổi chiều';

    greetingEl.textContent = `${greeting}, hãy dành một giây để ôn bài nhé!`;
  };

  update();
  setInterval(update, 60000);
}

function initBackground() {
  const bg = document.getElementById('bg-layer');
  // Load a random image
  const imgUrl = `https://picsum.photos/1920/1080?random=${Math.random()}`;
  bg.style.backgroundImage = `url('${imgUrl}')`;
}

async function fetchReviewWords() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'get_review_list' }, res => {
      resolve(res?.data || []);
    });
  });
}

function showEmptyState() {
  document.getElementById('card-loading').style.display = 'none';
  document.getElementById('card-empty').style.display = 'flex';
  document.getElementById('card-flashcard').style.display = 'none';
}

function showFlashcard(wordObj) {
  document.getElementById('card-loading').style.display = 'none';
  document.getElementById('card-empty').style.display = 'none';

  const flashcardEl = document.getElementById('card-flashcard');
  flashcardEl.style.display = 'flex';

  const vnEl = document.getElementById('word-vietnamese');
  const inputEl = document.getElementById('word-input');
  const fbMsg = document.getElementById('feedback-msg');
  const btnSkip = document.getElementById('btn-skip');
  const btnSubmit = document.getElementById('btn-submit');

  vnEl.textContent = wordObj.vietnamese || '???';
  inputEl.value = '';
  inputEl.focus();
  fbMsg.textContent = '';
  fbMsg.className = 'feedback-msg';

  btnSkip.onclick = () => {
    // Skip review -> just hide card
    document.getElementById('card-container').style.opacity = '0';
    setTimeout(() => { document.getElementById('card-container').style.display = 'none'; }, 300);
  };

  const submitAnswer = () => {
    const typed = inputEl.value.trim().toLowerCase();
    if (!typed) return;

    const correctAnswers = (wordObj.english || '').split('/').map(s => s.trim().toLowerCase());
    const isCorrect = correctAnswers.includes(typed);

    if (isCorrect) {
      inputEl.style.borderColor = 'var(--accent-green)';
      fbMsg.textContent = 'Chính xác! Cố gắng phát huy nhé.';
      fbMsg.className = 'feedback-msg correct';

      // Update stats in background
      chrome.runtime.sendMessage({
        action: 'update_vocab',
        word: wordObj.english,
        vietnamese: wordObj.vietnamese,
        isCorrect: true
      });

      setTimeout(() => {
        document.getElementById('card-container').style.opacity = '0';
        setTimeout(() => { document.getElementById('card-container').style.display = 'none'; }, 500);
      }, 1000);
    } else {
      inputEl.style.borderColor = 'var(--accent-red)';
      fbMsg.textContent = `Sai rồi. Đáp án: ${wordObj.english}`;
      fbMsg.className = 'feedback-msg wrong';
      inputEl.classList.remove('shake');
      void inputEl.offsetWidth;
      inputEl.classList.add('shake');

      // Update stats
      chrome.runtime.sendMessage({
        action: 'update_vocab',
        word: wordObj.english,
        vietnamese: wordObj.vietnamese,
        isCorrect: false
      });

      // Give them a chance to try again or skip
    }
  };

  btnSubmit.onclick = submitAnswer;
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAnswer();
  });
}
