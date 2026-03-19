# 📚 ThayGiap Learning Tracker - Chrome Extension

> Theo dõi quá trình học và làm bài trên hệ thống **Thầy Giáp ENGLISH** (thaygiap.com)

## ✨ Tính năng

### 🔍 Theo dõi tự động
- **Từ vựng**: Ghi nhận mỗi lần nhập đáp án, đúng/sai, số lần sai trước khi đúng
- **Kiểm tra**: Theo dõi điểm số, lần thử (Lần 1-4)
- **Luyện tập**: Ghi nhận tiến độ luyện tập từng bài/buổi
- **Nút bấm**: Theo dõi Kiểm tra, Làm lại, Tiếp theo, Luyện tập

### 📊 Thống kê chi tiết
- **Popup**: Xem nhanh thống kê hôm nay (đúng/sai/accuracy)
- **Quick Actions**: Ôn 10 từ khó, tự học offline, mở bài gần nhất, bật/tắt thông báo
- **Dashboard**: Tổng quan, biểu đồ 7 ngày, mức thành thạo từ vựng
- **Bảng từ vựng**: Tìm kiếm, lọc, sắp xếp theo nhiều tiêu chí
- **Lịch sử**: Timeline chi tiết từng sự kiện
- **Mục tiêu học tập**: Goal theo ngày/tuần + streak
- **Weakness Map**: Phân tích nhóm lỗi nhập phổ biến

### 📤 Quản lý dữ liệu
- Export JSON (toàn bộ dữ liệu)
- Export CSV (bảng từ vựng)
- Export/Import Anki CSV (Front/Back/Tags/IPA)
- Xóa dữ liệu

## 🚀 Cài đặt

### Cách 1: Load từ thư mục (Developer Mode)

1. Mở Chrome → `chrome://extensions/`
2. Bật **Developer mode** (góc phải trên)
3. Click **"Load unpacked"**
4. Chọn thư mục `ThayGiap/` (thư mục chứa `manifest.json`)
5. Extension sẽ xuất hiện trên thanh toolbar

### Cách 2: Pack và cài
1. Trên trang `chrome://extensions/`, click **"Pack extension"**
2. Chọn thư mục `ThayGiap/`
3. Chrome sẽ tạo file `.crx` → kéo thả vào Chrome để cài

## 📁 Cấu trúc thư mục

```
ThayGiap/
├── manifest.json          # Config extension (Manifest V3)
├── background.js          # Service Worker - xử lý & lưu data
├── content.js             # Content Script - inject vào thaygiap.com
├── content.css            # CSS cho floating badge
├── popup/
│   ├── popup.html         # Popup UI (quick stats)
│   ├── popup.css          # Popup dark theme
│   └── popup.js           # 
├── options/
│   ├── options.html       # Dashboard đầy đủ
│   ├── options.css        # Dashboard styles
│   └── options.js         # Dashboard logic (5 tabs)
├── utils/
│   └── storage.js         # Storage helpers
│   └── site-adapters.js   # Adapter registry for multi-site tracking
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # File này
```

## 🔧 Cách hoạt động

### 1. Content Script (`content.js`)
- Chạy trên `thaygiap.com/*`
- Phát hiện context: bài nào, buổi nào, luyện tập hay kiểm tra
- Theo dõi input vocab: mỗi lần gõ, mỗi lần blur
- Phát hiện đúng/sai qua CSS class (`.correct` / `.incorrect`)
- Lấy đáp án đúng từ text "Đáp án: [word]"
- Theo dõi nút Kiểm tra, Làm lại, Tiếp theo
- MutationObserver cho dynamic DOM (Angular SPA)
- URL polling cho SPA navigation
- Floating badge hiển thị realtime (✓ đúng / ✗ sai)

### 2. Background Service Worker (`background.js`)
- Nhận events từ content script
- Lưu vào `chrome.storage.local`
- Tính toán vocab summary (mastery level, streak, avg attempts)
- Tính session summary (per lesson/part)
- Phục vụ data cho popup & options
- Context menu thêm nhanh từ vào danh sách ôn tập

### 3. Data Model
```
Events → raw log (mỗi lần nhập, click, mở bài)
VocabSummary → tổng hợp per từ (đúng/sai/streak/mastery)
SessionSummary → tổng hợp per bài/buổi (correct/wrong/scores)
```

**Mastery Levels:**
| Level | Điều kiện |
|-------|-----------|
| Mới | Chưa trả lời đúng lần nào |
| Đang học | Đã đúng nhưng streak < 2 |
| Ôn tập | Streak đúng ≥  2 |
| Thành thạo | Streak đúng ≥ 3 + trung bình ≤ 1.2 lần sai |

## ⚠️ Lưu ý cho Developer

### DOM Selectors cần verify
Trang thaygiap.com dùng **Angular + Ant Design**. Các selector đã xác nhận:
- Input vocab: `input[placeholder*="Nhập đáp án"]` hoặc `input[id^="input-"]`
- Đúng: class `correct` trên input (viền xanh)
- Sai: class `incorrect` trên input (viền đỏ) + text "Đáp án: ..." xuất hiện
- Buttons: `button`, `.ant-btn` với text regex match

### Edge Cases
- **SPA Navigation**: URL thay đổi không reload → polling mỗi 1s
- **Dynamic Content**: Angular lazy render → `waitForContent()` retry 10 lần
- **MutationObserver**: Bắt class change khi Angular update DOM
- **Multiple Tabs**: Mỗi tab content script riêng, dữ liệu shared qua storage

## 📄 License
MIT - Free to use and modify.
