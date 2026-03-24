#  ThayGiap Learning Ecosystem (v1.4.0)

> Extension toàn diện hỗ trợ học tập, theo dõi tiến độ, phân tích dữ liệu và "game hóa" quá trình học trên hệ thống **Thầy Giáp ENGLISH** (thaygiap.com).

**Author:** Lê Ngọc Tường _HCMUS_DTV

Không chỉ là một tracker thông thường, ThayGiap Learning Ecosystem đem đến một **hệ sinh thái học tập chủ động**, tích hợp Gamification, Micro-learning, phân tích điểm yếu bằng dữ liệu và các công cụ chống xao nhãng hiệu quả.

---

##  Hướng Dẫn Sử Dụng Từng Chức Năng (Features & Guide)

### 1. ️ Bật/Tắt Extension Nhanh (Master Power Toggle)

- **Tính năng**: Một nút nguồn `⏻` nằm ngay trên đầu cửa sổ Popup (nhấn vào biểu tượng extension nhỏ trên thanh công cụ).
- **Cách dùng**: Nhấp vào nút nguồn để bật/tắt toàn bộ tính năng của Extension (Bao gồm HUD, theo dõi bài tập, Vé cầu đường Toll-booth, v.v.). Khi TẮT, nút sẽ có màu Đỏ và hiện thông báo nhắc nhở tạm ngưng hoạt động.

### 2.  Vé Cầu Đường (Social Toll-booth Blocker)

- **Tính năng**: Rào chắn "chống xao nhãng" bắt ép bạn ôn tập từ vựng mỗi khi vào các trang web giải trí. Thay vì cấm hoàn toàn, hệ thống sẽ chờ bạn lướt web xong một khoảng thời gian nhất định rồi mới hiện bài kiểm tra. Trả lời đúng từ vựng bạn mới được lướt tiếp.
- **Cách thiết lập (Trong phần `Cài đặt` của bảng điều khiển chính)**:
  - **Thêm trang web tùy chọn**: Nhập tên miền (domain) của bất kỳ trang web nào (VD: `facebook.com`, `youtube.com`, `tiktok.com`, `netflix.com`...) vào ô Text và bấm **"Thêm"**.
  - **Xóa trang web**: Bấm nút `×` bên cạnh tên miền trong danh sách để hủy áp dụng Toll-booth cho trang đó.
  - **Số từ kiểm tra**: Chọn mức độ khó bằng cách chọn sẽ bị hỏi `3`, `5`, `7`, hoặc `10 từ` mỗi lần chặn.
  - **Thời gian xem tự do**: Cấu hình thời gian được sử dụng mạng xã hội trước khi bị hỏi bài (`5 phút`, `10 phút`, `15 phút`, `20 phút`, `30 phút`).
  - **Bỏ qua (Skip)**: Có thể bật tùy chọn cho phép hiện nút "Bỏ qua" (Nếu bấm bỏ qua sẽ chỉ được thêm 1 phút tự do ngắn hạn).
  - Bấm **Lưu Settings** để áp dụng và có thể thử nghiệm ngay bằng nút **"Thử Toll-booth ngay"**.

### 3.  Gamification (Thú ảo & HUD Tương Tác)

- **Tính năng**: Nuôi 1 "pet ảo" ngay trên góc màn hình thaygiap.com. Nhập câu trả lời đúng thú sẽ tăng trưởng.
- **Cách dùng**: Tự động hoạt động khi bạn vào học trên thaygiap.com. Thú ảo sẽ qua các cấp độ tiến hóa (→→→→→). Đạt chuỗi câu đúng (Streak) liên tiếp sẽ kích hoạt hiệu ứng chúc mừng (Confetti nhảy múa)!

### 4. ️ Ôn tập qua màn hình Tab Mới (New Tab Micro-learning)

- **Tính năng**: Biến mỗi lần bạn mở tab trống mới (`Ctrl+T` / `Cmd+T`) thành một Flashcard ghi nhớ từ. Extension áp dụng vòng lặp Spaced Repetition (Thuật toán SM-2) để tự động ném ra các từ bạn đang chuẩn bị quên!
- **Cách dùng**: Cài đặt extension xong -> Mở Chrome -> Nhấn Dấu `+` tạo tab mới. Bạn sẽ thấy 1 từ vựng, bắt buộc gõ nghĩa tiếng anh hoặc xem đáp án. Tính năng này giúp tận dụng thời gian chết vô thức mở trình duyệt.

### 5.  Chế Độ Tắm Tiếng Anh (Tanglish Mode)

- **Tính năng**: Hệ thống trích xuất các từ vựng bạn vừa học thuộc và tự động điền/thay thế đan xen vào nội dung khi bạn đọc báo mạng VN (VnExpress, Dân Trí, Tuổi Trẻ,...).
- **Cách dùng**: Vào phần Cài đặt của extension, đảm bảo "Tanglish Mode" đang được bật. Di chuột lên các cụm từ màu cam gạch dưới trên các trang báo để xem lại bản gốc tiếng Việt.

### 6.  Tính Năng AI (Tích hợp Trí Tuệ Nhân Tạo)

- **Phân tích điểm yếu**: Gợi ý dựa trên lỗi sai của bạn. AI cho lời khuyên thực tế (AI Conclusion).
- **Lò rèn câu (Sentence Forge)**: Công cụ cho phép tự viết câu Tiếng Anh và nhờ AI dùng API chấm điểm chỉ ra lỗi sai.
- **Quản lý hạn mức (Daily Usage)**: Tích hợp thanh theo dõi tiến độ sử dụng AI trong ngày (Giới hạn Requests và Tokens) để đảm bảo không vượt quá quota miễn phí của provider.
- **Cách thiết lập**: Vào Settings -> Mục **API Trí Tuệ Nhân Tạo**. Chọn **Gemini (Khuyên dùng)** hoặc **OpenAI**. Nhập `API Key` và Lưu.

### 7.  Grammar Vault - Kho Ngữ Pháp & AI Quiz

- **Tính năng**: Lưu trữ các câu làm sai ngữ pháp trên hệ thống.
- ** AI Grammar Quiz (Nâng cấp)**: Chế độ tự động tạo bài tập từ AI dựa trên các thì tiếng Anh em chọn.
  - **Tùy biến cao**: Lựa chọn cụ thể trong 12 thì (Tương lai hoàn thành tiếp diễn, Quá khứ đơn, ...), hoặc "Lộn xộn" để tăng thử thách.
  - **Fill-in-the-blanks**: AI tự động tạo câu có verb trong ngoặc `(V_infinitive)` để bạn điền vào.
  - **Badge Tên Thì**: Mỗi thẻ câu hỏi hiển thị rõ tên thì (ví dụ: ` Thì Tương lai Đơn`) để người học dễ nhận diện.
  - **Phản hồi chi tiết**: Khi kiểm tra đáp án, AI sẽ hiển thị:
    -  Lời giải chính xác với màu nổi bật.
    -  Nghĩa của câu bằng tiếng Việt.
    -  Dấu hiệu nhận biết thông minh (Signal words) của thì đó.
    -  "Khắc sâu": Giải thích vì sao phải dùng cấu trúc đó trong ngữ cảnh này.
- **Cách dùng**: Mở Bảng điều khiển lớn -> Tab "Kho Ngữ Pháp".

### 8.  Vocab Dungeon RPG (Trò Chơi Ôn Tập)

- **Tính năng**: Mini game dọn quái vật Slime bằng cách gõ chính xác các từ vựng khó nhất trong kho từ vựng.
- **Cách dùng**: Mở bảng điều khiển lớn -> Chuyển sang thẻ "Vocab Dungeon". Tham gia tiêu diệt quái vật bảo vệ HP máu.

### 9.  Signal Word Highlighter & Verb Lookup

- **Signal Word**: Trong bài kiểm tra, những từ khóa như (already, since, just...) tự động highlight vàng. Nhấn hover để xem nhắc nhở ngữ pháp.
- **Tra động từ**: Icon kính lúp nhỏ góc màn hình, nhấp vào đễ gõ tra cứu nhanh Verb 1 2 3 bất quy tắc.

### 10.  Quản Lý Data & Export Ra Anki

- Mọi data lưu `100% Offline Local` (Bảo vệ tính riêng tư).
- Trích xuất: Tại Tab Settings, bạn có thể **Export JSON** hoặc **Xuất Anki CSV**. Trích xuất thẻ từ vựng Anki cho phép đồng bộ dữ liệu những từ bạn vừa làm sai trên máy tính sang điện thoại dễ dàng! Nhập file CSV vào Deck Anki Desktop.

---

## ‍ Cấu Trúc Mã Nguồn Extension Dành Cho Developer

```text
ThayGiap/
├── manifest.json          # File cấu hình Mv3 + Khai báo Host Permissions (all_urls)
├── background.js          # Service Worker: Xử lý State tổng, AI API calling, Token tracking
├── content.js             # Content Script: Đoán DOM bài tập thaygiap.com, Signal Word, HUD, Mascot
├── content.css            # Stylesheet DOM Injected, Anim Mascot
├── tanglish.js            # Content Script: Parse DOM các trang báo, thay thế regex
├── social_blocker.js/.css # Content Script: Màn hình Toll-booth, xử lý Timer & Logic Prompt
├── popup/                 # Tùy chỉnh nhanh (Giao diện Icon Toolbar)
├── options/               # Menu Dashboard SPA chính (Cài đặt, Matrix, Dungeon, Kéo thả List)
├── newtab/                # Màn hình Tab mới Flashcard HTML (SM-2 Algorithm)
└── utils/                 # Các Module nhỏ: Storage, Regex Tools, Export Handlers
```

### Kiến Trúc Lắng Nghe DOM (Angular)

Hệ thống của thaygiap.com dùng Client Router (không reset trang). Extension `content.js` dùng `MutationObserver` chuyên sâu bắt lỗi dựa theo CSS class sinh ra (`.incorrect`, `.correct`) và theo dõi URI để update session trực tiếp.

---

*© Cấu trúc và Mã nguồn do cộng đồng phát triển hướng tới "Game hóa việc học thuật" — Hữu ích bổ trợ, không can thiệp nội dung web.*

### Liên hệ & Hỗ trợ (Contact)

- **Telegram**: @AstroMindquiz
- **Gmail**: <lengoctuong2005@gmail.com>
- **Facebook**: <https://www.facebook.com/ngtu.ong14.11>
- **Copyright**: ©Lê Ngọc Tường_HCMUS_23DTV
