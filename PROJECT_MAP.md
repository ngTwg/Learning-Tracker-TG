# ️ PROJECT MAP
> Auto-generated: 2026-03-23 | Updated: 2026-03-23

## Tech Stack
- Language: JavaScript, HTML, CSS
- Framework: Chrome Extension (Manifest V3)
- Database: Chrome Local Storage
- Auth: N/A
- UI Library: Vanilla CSS (with Light/Dark Theme System)
- Package Manager: N/A
- Other: OpenAI / Gemini API Integration

## Directory Structure
icons/ → Extension icons
newtab/ → Custom new tab page for the extension
options/ → Extension options/settings page
popup/ → Extension popup interface
utils/ → Utility scripts (storage, site adapters)

## Key Files
manifest.json → Extension configuration and permissions
background.js → Service worker handling messages, events, Pomodoro, AI requests, and data sync
content.js → Main content script running on thaygiap.com, tracks inputs, scores, lessons, and implements exam locks/UI overlays
content.css → Styles for content script UI elements
social_blocker.js → Script for blocking distracting sites
social_blocker.css → Styling for the blocked site overlay
tanglish.js → Script for injecting Tanglish features on news websites
CHANGELOG.md → Record of recent changes (currently noting a v2.0 UI overhaul)
README.md → Project documentation

## Module Dependency Graph
content.js → uses → utils/storage.js, utils/site-adapters.js, background.js (via runtime messaging)
background.js → uses → utils/storage.js, External AI APIs (OpenAI/Gemini/OpenRouter)
popup.js / options.js / newtab.js → uses → utils/storage.js, background.js

## Database Models
ai_usage → chrome.storage.local → date, requests, tokensIn, tokensOut, tokensTotal
settings → chrome.storage.local → trackingEnabled, examLockEnabled, aiProvider, aiKey, etc.
events/vocab_summaries/grammar_sentences → chrome.storage.local → managed by utils/storage.js

## API Endpoints
[POST] https://api.openai.com/v1/chat/completions → background.js (requestAiText) → OpenAI integration
[POST] https://generativelanguage.googleapis.com/v1beta/models/... → background.js (requestAiText) → Google Gemini integration
[POST] https://openrouter.ai/api/v1/chat/completions → background.js (requestAiText) → OpenRouter integration

## Architecture Patterns
- Request flow: content.js captures DOM events (clicks, inputs, answer results) and sends messages to background.js. background.js processes the data and saves it to chrome.storage.local.
- Error handling pattern: standard try/catch blocks with console error logging. AI requests throw specific error messages returned to the UI.
- State management: chrome.storage.local acts as the single source of truth. Temporary states (like exam locks, Pomodoro) are maintained in memory in background.js and content.js.

## Recent Changes
| Date | Files | What Changed | Reason |
|------|-------|--------------|--------|
| 2026-03-23 | PROJECT_MAP.md | Generated PROJECT_MAP.md | Initializing project map per rules |
