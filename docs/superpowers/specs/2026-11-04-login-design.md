# Thiết kế giao diện đăng nhập

Trạng thái: người dùng đã duyệt ngày 2026-11-04 và yêu cầu triển khai.

## Mục tiêu và phạm vi

Thay trang mặc định Next.js tại `/` bằng giao diện đăng nhập tiếng Việt đẹp, dễ sử dụng, thích ứng điện thoại và máy tính. Có ba lựa chọn Google, Apple và Facebook. Hiểu yêu cầu “appstore” là Apple ID; đây là giả định cần người dùng xác nhận khi duyệt.

Phạm vi hiện tại là frontend. Dự án chưa có backend, tài khoản ứng dụng OAuth hay phiên đăng nhập. Nút đăng nhập không được giả vờ xác thực thành công; khi chưa kết nối dịch vụ, hiển thị thông báo rõ ràng ngay trong form. Không lưu hoặc ghi log mật khẩu.

## Các hướng đã cân nhắc

1. **Hai cột, nền sáng, xanh ngọc đậm — đề xuất:** đủ không gian cho phần minh họa và form, tạo cảm giác chỉn chu mà vẫn ưu tiên việc đăng nhập. Cần thu gọn trên mobile.
2. **Form tối giản chính giữa:** nhanh, tập trung, nhưng ít bản sắc hơn.
3. **Nền tối:** nổi bật, nhưng chưa có nhận diện thương hiệu hoặc yêu cầu dark mode để làm cơ sở lựa chọn.

Người dùng đã duyệt hướng hai cột nền sáng, xanh ngọc đậm và Apple ID.

## Bố cục và phong cách

- Desktop: màn hình hai cột với khoảng trắng rộng. Bên trái là tên tạm `Mangix`, lời chào và hình khối trang trí tạo bằng CSS/SVG; bên phải là form rộng tối đa khoảng 400px.
- Nền trắng ngà, chữ than đậm, điểm nhấn xanh ngọc đậm; bo góc vừa phải, đường viền nhẹ, bóng đổ tiết chế.
- Font Geist hiện có; không thêm thư viện hoặc ảnh phụ thuộc bên ngoài.
- Mobile: một cột, thương hiệu gọn ở đầu, ẩn phần trang trí lớn, form chiếm chiều rộng khả dụng. Không cuộn ngang ở 320px.

```text
Máy tính
┌────────────────────────┬────────────────────────┐
│ Mangix                 │ Chào mừng trở lại      │
│                        │ Đăng nhập để tiếp tục  │
│ Một nơi để bắt đầu     │ [Google] [Apple] [FB]  │
│ những điều tuyệt vời.  │ ── hoặc dùng email ──  │
│                        │ Email                  │
│ Hình khối minh họa     │ Mật khẩu          [👁] │
│                        │ [ ] Ghi nhớ  Quên MK?  │
│                        │ [     Đăng nhập      ] │
│                        │ Chưa có tài khoản?     │
└────────────────────────┴────────────────────────┘
```

## Thành phần và tương tác

- Tiêu đề và mô tả tiếng Việt; ba nút mạng xã hội có logo và tên truy cập đầy đủ, luôn phân biệt rõ từng nhà cung cấp.
- Trường email và mật khẩu có label, autocomplete phù hợp, báo lỗi khi thiếu dữ liệu hoặc email sai định dạng. Nút mắt chuyển ẩn/hiện mật khẩu và cập nhật nhãn truy cập.
- Checkbox ghi nhớ trạng thái trong form; không triển khai lưu phiên khi chưa có backend.
- Submit hợp lệ và ba nút mạng xã hội hiện thông báo dịch vụ chưa được kết nối, không gửi dữ liệu đi đâu.
- Quên mật khẩu và đăng ký mở thông tin hướng dẫn ngay trong trang về việc chức năng chưa được kết nối; không dùng liên kết giả hoặc dẫn đến trang 404.
- Hỗ trợ bàn phím, focus rõ, lỗi và thông báo được đọc bởi trình đọc màn hình; tôn trọng reduced motion.

## Cách triển khai và kiểm tra

- Giữ Next.js App Router và cấu trúc hiện có. Đọc tài liệu Next.js đóng gói trong `node_modules/next/dist/docs/` trước khi sửa code.
- Trang server chứa bố cục; component client riêng cho trạng thái form và thao tác. CSS nằm trong cấu trúc style hiện có, cập nhật metadata và ngôn ngữ trang sang tiếng Việt.
- Kiểm tra lint, TypeScript và production build; xem giao diện desktop/mobile và kiểm tra tương tác form khi công cụ trình duyệt khả dụng.
- Tích hợp OAuth thực tế là bước tiếp theo sau khi có cấu hình và backend được chọn.
