# 🚀 ThayGiap Learning Ecosystem (v1.5.2)

> **"Solid-State" UI Edition** — Hệ sinh thái học tập tiếng Anh toàn diện, tích hợp AI, Gamification và cơ chế chống xao nhãng đột phá.

[![Version](https://img.shields.io/badge/version-1.5.2-blue.svg)](./manifest.json)
[![Author](https://img.shields.io/badge/author-Lê%20Ngọc%20Tường-orange.svg)](https://github.com/ngTwg)
[![Framework](https://img.shields.io/badge/core-Vanilla%20JS-yellow.svg)]()
[![Status](https://img.shields.io/badge/status-Stable%20Release-green.svg)]()

---

## 🌟 Tổng Quan (Overview)

ThayGiap Learning Ecosystem không chỉ là một công cụ theo dõi, mà là một **trợ lý học tập thông minh** giúp bạn biến mọi hoạt động duyệt web thành cơ hội tiếp thu kiến thức. Dự án được thiết kế dựa trên các nguyên lý khoa học não bộ (Spaced Repetition) và phương pháp học thụ động (Passive Learning).

---

## 🔥 Tính Năng Đột Phá (Core Features)

### 1. 🔊 Pronunciation & IPA (Mới!)
*   **Tự động nhận diện:** Ngay khi bạn nhập từ vựng, hệ thống sẽ tự động hiển thị phiên âm **IPA (International Phonetic Alphabet)**.
*   **Âm thanh chuẩn (Audio):** Nghe phát âm trực tiếp từ người bản xứ thông qua tích hợp API từ điển miễn phí.
*   **Giao diện Tooltip:** Hiển thị loại từ (noun, verb...), nghĩa và ví dụ ngay bên dưới ô nhập liệu với hiệu ứng mượt mà.

### 2. ✨ Omni-Catcher 3.0
*   **Bắt mọi nơi:** Bôi đen bất kỳ cụm từ nào trên MỌI trang web (VnExpress, Facebook, YouTube, Netflix...) để gọi AI giải thích.
*   **AI Smart Explanation:** AI sẽ tóm tắt Nghĩa, Loại từ và cung cấp 1 ví dụ thực tế chỉ trong 1 giây.
*   **Lưu nhanh:** Nút "Lưu vào ThayGiap" giúp bạn đưa từ vựng vào kho ôn tập mà không cần chuyển Tab.

### 3. 🚧 Social Toll-booth (Vé Cầu Đường)
*   **Chống xao nhãng:** Muốn vào Facebook/Youtube? Bạn phải trả phí bằng "Kiến thức".
*   **Cơ chế linh hoạt:** Cho phép lướt web tự do trong X phút, sau đó yêu cầu trả lời đúng 3-10 từ vựng để tiếp tục.
*   **Cài đặt:** Tùy chỉnh danh sách trang web bị chặn, độ khó và thời gian hồi (Cool-down).

### 4. 📰 Tanglish Mode (Tắm Tiếng Anh)
*   **Học thụ động:** Tự động chèn/thay thế các từ bạn đang học vào nội dung các trang báo mạng Việt Nam.
*   **Ghi nhớ tự nhiên:** Giúp não bộ làm quen với từ vựng trong ngữ cảnh thực tế của tiếng mẹ đẻ.

### 5. 🧪 AI Grammar Vault & Quiz
*   **Chỉnh sửa ngữ pháp:** Lưu trữ các câu sai và sử dụng AI để giải thích lỗi sai chi tiết.
*   **AI Quiz Generator:** Tự động tạo bài tập điền từ theo 12 thì tiếng Anh (Tenses) dựa trên trình độ cá nhân.
*   **Signal Words:** Tự động Highlight các dấu hiệu nhận biết thì (since, yet, tomorrow...) để hỗ trợ làm bài.

### 6. 🎮 Vocab Dungeon (Game Hóa)
*   **Tiêu diệt quái vật:** Ôn tập từ vựng thông qua Mini-game RPG. Thành tích trong game tỉ lệ thuận với khả năng ghi nhớ từ của bạn.

---

## 🛠️ Cấu Trúc Dự Án (Architecture)

```text
ThayGiap/
├── manifest.json          # Cấu hình Chrome Mv3 + Quyền truy cập
├── background.js          # Trung tâm xử lý AI, Storage & Sync
├── content.js             # Logic xử lý tại hệ thống thaygiap.com
├── omni_catcher.js        # Module bắt từ vựng toàn cầu (Global Scraper)
├── social_blocker.js      # Logic chặn và kiểm tra Toll-booth
├── tanglish.js            # Module chèn tiếng Anh vào báo chí
├── popup/                 # Giao diện icon thanh công cụ (Quick Settings)
├── options/               # Bảng điều khiển trung tâm (Dashboard SPA)
├── newtab/                # Flashcard học tập mỗi khi mở Tab mới
└── utils/                 # Các tiện ích Storage, Site-Adapters...
```

---

## 🚀 Hướng Dẫn Cài Đặt (Installation)

Hiện tại extension được phân phối dưới dạng mã nguồn mở để tối ưu quyền riêng tư 100% Offline (Local Data). Để cài đặt:

1.  **Tải xuống:** Tải hoặc Clone repository này về máy tính của bạn.
2.  **Mở Chrome:** Truy cập đường dẫn `chrome://extensions/`.
3.  **Chế độ nhà phát triển:** Bật công tắc **"Developer mode"** ở góc trên bên phải.
4.  **Tải tệp:** Nhấn vào nút **"Load unpacked"** (Tải tiện ích đã giải nén).
5.  **Chọn thư mục:** Tìm đến thư mục `ThayGiap` vừa tải về và chọn `Open`.
6.  **Ghim biểu tượng:** Nhấn vào biểu tượng mảnh ghép trên Chrome và ghim (Pin) **ThayGiap Learning Tracker** để sử dụng.

---

## 🔐 Bảo Mật & AI Key
*   Mọi dữ liệu học tập đều được lưu trữ **cục bộ (Local Storage)** trên trình duyệt của bạn, không gửi về server ngoài.
*   Để sử dụng tính năng AI, bạn cần cung cấp API Key (Gemini hoặc OpenAI) trong phần **Cài đặt AI** của Extension. Google Gemini Pro hiện có gói miễn phí rất tốt cho việc học tập.

---

## 👨‍💻 Tác Giả & Liên Hệ

*   **Tác giả:** Lê Ngọc Tường (HCMUS_DTV)
*   **Telegram:** [@AstroMindquiz](https://t.me/AstroMindquiz)
*   **Gmail:** <lengoctuong2005@gmail.com>
*   **Facebook:** [Lê Ngọc Tường](https://www.facebook.com/ngtu.ong14.11)
*   **Bản quyền:** © 2026 - Phát triển cho cộng đồng tự học tiếng Anh chủ động.

---
*Chúc bạn có hành trình chinh phục tiếng Anh thật thú vị cùng ThayGiap Learning Ecosystem!*
