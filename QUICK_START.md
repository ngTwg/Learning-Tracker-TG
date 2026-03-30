# ⚡ QUICK START - Test Extension Fix

## 🚀 3 Bước Nhanh (2 phút)

### 1️⃣ Reload Extension
```
chrome://extensions/ → Tìm "ThayGiap" → Click Reload (⟳)
```

### 2️⃣ Test Nhanh
```
1. Mở: https://thaygiap.com/user/exam
2. F12 → Console → Paste:

console.log('✅ Loaded:', window.TG_SITE_ADAPTERS?.loaded);
console.log('📊 Inputs:', document.querySelectorAll('input[aria-label="Nhập đáp án"]').length);
```

**Kết quả mong đợi:**
```
✅ Loaded: true
📊 Inputs: 40
```

### 3️⃣ Test Thực Tế
```
1. Điền 3 từ đúng, 2 từ sai
2. Click "Kiểm tra"
3. Xem HUD góc phải: "3 đúng / 2 sai"
```

---

## ✅ Nếu thành công

→ **Bug đã fix!** Extension hoạt động bình thường.

---

## ❌ Nếu thất bại

### Loaded: undefined
→ File không load. Check Console có lỗi JavaScript không.

### Inputs: 0
→ Selector sai. Chạy:
```javascript
const inp = document.querySelector('input[type="text"]');
console.log('aria-label:', inp?.getAttribute('aria-label'));
```

### HUD không cập nhật
→ Tracking không hoạt động. Chạy full test:
```
Copy test_fix_verification.js → Paste vào Console
```

---

## 📚 Chi tiết

- **Full Guide**: `TESTING_GUIDE.md`
- **Test Script**: `test_fix_verification.js`
- **Summary**: `IMPLEMENTATION_SUMMARY.md`

---

**Thời gian**: 2 phút  
**Yêu cầu**: Chrome, Extension đã cài, Trang thaygiap.com
