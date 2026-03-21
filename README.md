# 📚 ThayGiap Learning Ecosystem (v1.3.0)

> Extension toàn diện hỗ trợ học tập, theo dõi tiến độ, phân tích dữ liệu và "game hóa" quá trình học trên hệ thống **Thầy Giáp ENGLISH** (thaygiap.com).

**Author:** Lê Ngọc Tường _HCMUS_DTV

Không chỉ là một tracker thông thường, ThayGiap Learning Ecosystem đem đến một **hệ sinh thái học tập chủ động**, tích hợp Gamification, Micro-learning, phân tích điểm yếu bằng dữ liệu (Skill Matrix) và các công cụ chống xao nhãng hiệu quả.

---

## 🌟 Bảng Tính Năng Hoàn Chỉnh (Comprehensive Features)

### 1. 🐉 Gamification & HUD Tương Tác (Hệ thống Thú ảo)

- **Thú Ảo (Mascot) thông minh**: Nuôi thú ảo trực tiếp trên HUD của trang web. Thú ảo sẽ tiến hóa kích thước, thay đổi hình dạng (🐣→🐱→🐯→🦄→🐉→🦁) và biểu lộ cảm xúc (vui, buồn, tức giận, tự hào) dựa trên độ chính xác và chuỗi đúng liên tiếp (streak) của bạn.
- **Hiệu ứng Milestone**: Khi đạt các mốc đúng liên tiếp (Streak 3, 5, 10...), Mascot sẽ thực hiện hiệu ứng nhảy múa (Bounce & Confetti) ngay trên màn hình để tán thưởng.
- **Vocab Dungeon RPG**: Game nhập vai ngay trong Menu Options! Đội quân Slime mang theo những từ vựng bạn hay sai nhất. Hãy "tấn công" chúng bằng cách gõ chính xác từ vựng dể bảo vệ máu (HP) của mình.
- **Goal Ring & Streak**: Theo dõi mục tiêu học tập hàng ngày bằng vòng tròn phần trăm (giống Apple Watch Rings).

### 2. 🧠 Phân Tích Thông Minh & Ứng Dụng AI

- **Skill Matrix (Ma Trận Kỹ Năng)**: Phân tích chéo dữ liệu để chỉ ra lỗ hổng cốt lõi. Giao diện này chỉ ra bạn yếu ở khâu **Chia dạng từ (Form)** hay yếu ở khâu **Hiểu nghĩa (Meaning)**.
- **AI Nhận Xét & Khuyên Dùng (AI Conclusion)**: AI sẽ đọc dữ liệu báo cáo lỗi sai của bạn, cung cấp những nhận xét sắc bén và gợi ý các nút bấm điều hướng (CTA) dẫn thẳng đến các bài luyện tập phù hợp.
- **Grammar Vault (Kho Ngữ Pháp)**: Khi bạn gõ sai 1 câu trong bài kiểm tra, hệ thống tự động lưu lại toàn bộ **ngữ cảnh của câu hoàn chỉnh** đó. Giúp bạn trải nghiệm ôn tập toàn bộ ngữ cảnh (contextual review) thay vì chỉ học từng từ vựng rải rác.
- **Weakness Map**: Biểu đồ phân loại tự động 4 nhóm lỗi gõ (Lỗi chính tả, lỗi thừa khoảng trắng, gõ sai từ hoàn toàn, lộn xộn).
- **Sentence Forge (Lò Rèn Câu)**: Trình tạo câu tự do. Nhập một từ khóa, viết thử 1 câu và gửi AI API (Groq/Gemini) chấm điểm cấu trúc ngữ pháp trực tiếp!

### 3. 🎯 Công Cụ Hỗ Trợ Làm Bài Kiểm Tra

- **Signal Word Highlighter ⚡**: Khi vào mode "Kiểm tra", hệ thống tự động quét trang web, tìm và bôi highlight màu vàng các "từ tín hiệu" (v.d: `already`, `yet`, `since`, `yesterday`...). Hover chuột dể xem luôn công thức rút ra từ loại từ tín hiệu đó!
- **Verb Lookup (Tra Động Từ Tốc Độ)**: Tích hợp ô tra cứu động từ bất quy tắc ngay trên giao diện nổi (HUD) để bạn tra mã, tránh thoát ra ngoài mở cửa sổ mới.
- **Exam Lock Mode**: "Khóa" trình duyệt khi đang thi. Nếu bạn cố tình bấm phím tắt mở Tab mới hoặc ấn sang URL bên ngoài, extension sẽ "hủy" lệnh, cảnh báo và lưu lại lịch sử "Vi phạm".

### 4. ⏱️ Focus & Quản Lý Cảm Hứng Học

- **Tích hợp Pomodoro (25 Phút/5 Phút)**: Bộ đếm chuẩn Pomodoro hiển thị trực tiếp.
- **Chặn Mạng Xã Hội Giờ Học**: Trong 25 phút Pomodoro mở, hệ thống **tự động chặn** các trang (Facebook, TikTok, Instagram, Reddit).
- **Màn Hình Social Toll-booth**: Dù không bật Pomodoro, khi bạn mở Facebook, extension sẽ rào lại bằng 1 Flashcard ôn tập (Từ vựng bốc ra từ Kho Từ Yếu). Trả lời trúng mới được lướt mạng!
- **Focus Mode**: Làm mờ toàn bộ giao diện thừa xung quanh (header, sidebar) chỉ để lại phần thân bài và ô điền từ để bạn tập trung cao độ.

### 5. 🌐 Micro-Learning & Immersion (Tắm Tiếng Anh)

- **Tab Mới Là Bài Giảng**: Thay thế màn hình "New Tab" mặc định của trình duyệt Chrome bằng thẻ Flashcard ứng dụng thuật toán lặp lại ngắt quãng (SM-2).
- **Tanglish Mode (Mới v1.3.0) 🌐**: Chế độ "Tắm Tiếng Anh" bị động. Khi bạn đọc báo mạng VN (VnExpress, Dân Trí, Tuổi Trẻ, Zing...), extension trích xuất các từ bạn **vừa học thuộc** và thay chúng thành "Tiếng Anh" vào thẳng nội dung bài báo. (Hover sẽ thấy lại Tiếng Việt gốc).

### 6. 📊 Quản Lý & Xuất Nhập Dữ Liệu

- **Tương thích Anki**: Nút xuất toàn bộ từ vựng ra file CSV chuẩn, bao gồm Front/Back/Tags để nạp (import) thẳng vào Anki. Tương tự, bạn cũng có thể Import file Anki CSV dể thêm từ vựng mới vào thaygiap.com tracker.
- Tự động thống kê Số lần đúng, Số lần sai, Tỉ lệ thành thạo (Mastery), Thời gian Last Seen từng từ.

---

## 📖 Hướng Dẫn Sử Dụng (User Guide)

### Cài Đặt Ban Đầu (Setup)

1. Truy cập `chrome://extensions/` trên Chrome/Edge/Brave.
2. Bật chế độ **Developer Mode** (Góc phải trên cùng).
3. Nhấn **"Load unpacked"**. Trỏ thư mục đến folder chứa file `manifest.json`.
4. Ghim biểu tượng thẻ sách 📚 lên thanh công cụ (Toolbar).
5. Chuột phải vào biểu tượng 📚 &rarr; Chọn **Tùy chọn (Options)** &rarr; Tab **Settings (Cài đặt)**.
   - Bật tính năng **Tanglish Mode**, **Signal Word Highlighter**.
   - Kéo xuống mục **Tích hợp AI**, nhập **API Key** (Lấy miễn phí tại console.groq.com hoặc aistudio.google.com). Chọn model bạn thích.

### Sử dụng HUD (Giao diện theo dõi nổi trên thaygiap.com)

- Khi bạn mở 1 bài tập, HUD sẽ xuất hiện bên tay phải (Cửa sổ mờ). Nó đếm Số câu đúng, sai và đo lường Tiến độ (Percentage).
- Nuôi Thú (Mascot): Hãy liên tục nhập đúng để streak tăng. Mascot sẽ đổi mặt thành mặt cười lớn, tăng kích cỡ. Phá chuỗi đúng 3/5/10 câu liên tục, mascot sẽ có hoạt ảnh (Bounce).
- Tra Động từ: Nhập vào ô Search trên HUD để tra dạng V2, V3 nhanh gọn mà không phải Google. Mọi lịch sử thao tác đều được hệ thống lẳng lặng ghi lại bên dưới.

### Làm bài & Theo dõi điểm yếu

- Khi bạn gỡ 1 từ đúng, từ đó cộng vào **Thành thạo**.
- Khi bạn gõ sai 1 câu, phần lý thuyết của câu đó bay vào **Grammar Vault** (để ôn lại theo dạng điền đục lỗ trong trang Cài Đặt). Lỗi sai chữ được đưa vào **Phân Tích Lỗi Sai (Weakness Map)** định dạng tự động (Bạn thừa dấu cách? Bạn chia sai ngôi động từ?).
- Cùng lúc đó, các "từ khó" (có rate sai >40%) tự động trở thành bài tập chặn cổng (Toll-booth) mỗi khi bạn vào Facebook sau này.

### Kiểm Tra & Focus

- Lúc vào thi (Exam), hãy bật công tắc **Exam Lock** trên HUD (Nút "Khóa kiểm tra"). Thanh màu cam hiện lên. Bạn sẽ không thể bấm phím tắt sang Tab khác, nếu cố gắng vi phạm, HUD sẽ tăng 1 "mạng" (Violations).
- Mở **Pomodoro**: Góc phải HUD có nút khởi động 25 phút. Nếu bấm khởi động, bạn sẽ tạm thời không thể truy cập YouTube / TikTok / Facebook.

### Chơi Game (Vocab Dungeon)

1. Trở ra Menu Cài Đặt chính (Click vào Extension 📚 &rarr; Bảng Điều Khiển).
2. Chuột sang Tab **Vocab Dungeon**.
3. Xem quái vật xuất hiện. Hệ thống ưu tiên chọn từ bạn gõ sai nhiều nhất gần đây. Nhập từ Tiếng Anh tương ứng với nghĩa Tiếng Việt trên đầu con quái vật để lấy điểm sát thương (Damage).

### Học Ngữ Pháp Chuyên Sâu (Lò Rèn Câu)

1. Ở bảng điều khiển (Options), sang Tab **Lò rèn Câu (Sentence Forge)**.
2. Chọn "Sinh cấu trúc mới". Viết lại 1 câu Tiếng Anh có chứa cụm từ đó.
3. Bấm Gửi để AI API sử dụng GPT/Gemini chấm lỗi sai trong cấu trúc bạn vừa ráp (rất tiện để tập viết Task 2).

### "Tắm" Tiếng Anh (Tanglish)

- Không cần làm gì cả. Khi đọc báo VnExpress, Dân Trí, Tuổi Trẻ,... nếu bạn vô tình bắt gặp một chữ màu cam gạch dưới, đấy chính là Tiếng Việt đã được dịch sang Tiếng Anh (dựa vào đúng tệp từ mà bạn đã học ở khóa thaygiap.com). Bạn hãy cố gắng hiểu cụm tiếng Anh đó trong dòng text tiếng Việt bình thường. Di chuột (Hover) dể xem nghĩa cũ.

---

## 🛠 Cách Quản Lý Dữ Liệu (Anki & Backups)

Tracker hoạt động Local Offline 100%, cực kỳ bảo mật (không đồng bộ qua server nào khác).

- **Backup Dữ Liệu**: Vào Options &rarr; Settings &rarr; **Export toàn bộ data (JSON)** để nén lịch sử. Khi sang máy mới, bạn kéo file đó vào chỗ Import để Restore.
- **Dùng Với Anki Deck**: Vào Settings &rarr; **Xuất từ vựng CSV Anki**. Bạn sẽ được 1 file CSV theo chuẩn (Front, Back, Tags). Hãy mở phần mềm Anki trên Desktop &rarr; Mở Deck của bạn &rarr; File &rarr; Import (Chọn ký tự phân đoạn là Dấu phẩy `,`). Mọi từ vựng bạn làm sai sẽ có mặt tại Anki trên điện thoại.

---

## 👨‍💻 Cấu Trúc Mã Nguồn Dành Cho Developer

```text
ThayGiap/
├── manifest.json          # File cấu hình Mv3 + Khai báo Host Permissions báo mạng (v1.3.0)
├── background.js          # Service Worker: Xử lý State, API Call, DB, Pomodoro Timers
├── content.js             # Content Script: Theo dõi bài tập thaygiap.com, Signal Word, HUD
├── content.css            # Stylesheet cho DOM Element injected, Anim Mascot & Signal tooltips
├── tanglish.js            # Content Script: Parse DOM các trang báo, thay thế văn bản Regex
├── social_blocker.js/.css # Content Script chặn Facebook/TikTok & Màn hình Toll-booth
├── popup/                 # Tùy chỉnh thu gọn (Click vào icon thanh công cụ)
├── options/               # Menu chính (Matrix, Dungeon, Vault, Settings, Weakness)
├── newtab/                # Màn hình New Tab tích hợp Flashcard HTML
└── utils/                 # Các tiện ích Database Local & Chuyển dạng Website Component
```

### Kiến Trúc Ghi Nhận Event (Angular SPA)

Hệ thống Angular của thaygiap.com không load lại trang. `content.js` sử dụng `MutationObserver` chuyên sâu để "lọc" các class framework sinh ra (v.d: `.incorrect`, `.correct`). Kết hợp Polling kiểm tra URI để làm mới Session khi học viên nhảy sang bài khác bằng Navigation Side-bar.

---

*© Cấu trúc và Mã nguồn do cộng đồng phát triển hướng tới "Game hóa việc học thuật" — Hữu ích bổ trợ cho người học Thầy Giáp ENGLISH.*
