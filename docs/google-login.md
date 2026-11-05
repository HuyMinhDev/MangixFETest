# Đăng nhập Google trên Mangix

## Chạy local

1. Sao chép `.env.example` thành `.env.local` nếu chưa có. `GOOGLE_CLIENT_ID` là OAuth Web client ID công khai; `AUTH_API_URL` là URL backend, mặc định `http://localhost:3069/api`.
2. Chạy backend ở cổng 3069. Backend phải cấu hình cùng Google client ID để kiểm tra audience của ID token.
3. Chạy `npm run dev`, mở `http://localhost:3000`.
4. Bấm **Tiếp tục với Google**, chọn tài khoản và xác nhận trong cửa sổ Google. Ứng dụng gửi ID token thẳng đến backend qua route Next.js; không cần sao chép token hoặc dùng OAuth Playground.

Nếu thay biến môi trường, khởi động lại Next.js. Không đưa client secret vào `.env.example`, props, mã frontend hoặc biến `NEXT_PUBLIC_*`.

## Cấu hình Google Auth Platform

Trong **Clients → Mangix Web → Authorized JavaScript origins**, thêm:

```text
http://localhost
http://localhost:3000
```

Thêm origin tương ứng nếu frontend dùng cổng khác; production dùng origin HTTPS của website. Nếu Google yêu cầu tài khoản thử nghiệm khi app ở trạng thái Testing, thêm email trong **Audience → Test users**. Thao tác cấu hình Google Cloud và chọn tài khoản cần chủ tài khoản thực hiện.

Khi test cùng Facebook, chạy `npm run dev:https`, mở `https://localhost:3000` và thêm chính `https://localhost:3000` vào danh sách origins của Google. Facebook yêu cầu HTTPS; xem [hướng dẫn HTTPS local](facebook-login.md).

Luồng hiện tại dùng Google Identity Services với popup và callback JavaScript, nên không cần redirect URI của OAuth Playground hoặc client secret. Client secret cũ bị lộ vẫn cần được thu hồi trong Google Cloud bởi người quản lý dự án.

Tham khảo: [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) và [Google sign-in button](https://developers.google.com/identity/gsi/web/guides/display-button).

## Luồng và trạng thái phiên

- SDK chính thức `https://accounts.google.com/gsi/client` trả ID token cho callback sau khi người dùng đồng ý.
- Browser gọi `POST /api/auth/google` cùng origin với `{ idToken, remember }`.
- Next.js gọi backend `POST ${AUTH_API_URL}/auth/google` với `{ idToken }`. Backend kiểm tra chữ ký/audience/expiry với Google và trả `data.accessToken`, `data.refreshToken`.
- Next.js giữ token phiên trong cookie HttpOnly, SameSite=Lax và Secure ở production; không trả token trong JSON, ghi log hoặc lưu trong localStorage. Mặc định cookie theo phiên trình duyệt; chọn **Ghi nhớ đăng nhập** mới tạo cookie có thời hạn.
- `GET /api/auth/session` xác minh phiên bằng backend `/users/profile`; refresh token được dùng khi access token hết hạn. Thông tin hiển thị lấy từ backend, không tin vào payload Google do browser tự giải mã.
- `POST /api/auth/logout` thu hồi refresh token tại backend và xóa cookie. Request thay đổi trạng thái yêu cầu Origin cùng website.
- Facebook đã được nối API dùng cùng phiên Mangix; xem [hướng dẫn Facebook](facebook-login.md). Apple và đăng nhập email vẫn là giao diện minh họa, chưa kết nối API.

Các request cùng làm mới một refresh token được gộp trong một tiến trình Next.js; kết quả được dùng lại trong 2 giây và bộ nhớ đệm giới hạn 100 mục. Khi triển khai nhiều replica, cần phối hợp rotation tại backend hoặc qua cơ chế dùng chung giữa các replica trước khi rollout.

Kiểm tra Google thực tế ngày 2026-11-04: SDK và popup đã mở được; Google trả `invalid_client: no registered origin`. Cần hoàn tất mục **Authorized JavaScript origins** phía trên trước khi đăng nhập bằng tài khoản thật.

## Kiểm tra

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Tests dùng backend HTTP cục bộ biệt lập để kiểm tra hợp đồng, cookie, lỗi và refresh/logout; chúng không đăng nhập vào tài khoản Google thật. Luồng Google thực tế vẫn cần người dùng đồng ý trong popup.
