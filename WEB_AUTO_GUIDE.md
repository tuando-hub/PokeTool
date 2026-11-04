# PokeTool Web Auto Engine

Các API mới trong `web.js`: `autoScan`, `autoFill`, `autoClick`, `autoSelect`, `autoWait`.

```js
await Web.autoScan(wv, {frame:'all'});
await Web.autoFill(wv, 'email', email);
await Web.autoClick(wv, 'ログイン');
await Web.autoSelect(wv, 'SMS', {frame:'example.com'});
await Web.autoWait(wv, '確認', {timeout:15000});
```

- Inject vào main và iframe bằng WKUserScript `forMainFrameOnly=false`.
- Kết quả trả `{status,origin,selector,items}`; nếu nhiều phần tử khớp trả `AMBIGUOUS`, không thao tác bừa.
- Trường password/OTP và dữ liệu xác thực nhạy cảm phải nhập thủ công.
- `autoScan` là công cụ chẩn đoán, không tự ghi log hàng loạt.
- Iframe bị chặn injection, shadow DOM đóng, CAPTCHA có thể không hỗ trợ.
- Các mode cũ giữ nguyên logic.
