# Đăng nhập Facebook

## Cấu hình local

`.env.local` dùng các biến:

```env
FACEBOOK_APP_ID=1373146754718147
AUTH_API_URL=http://localhost:3069/api
```

`FACEBOOK_APP_ID` là ID công khai, được server truyền cho component đăng nhập. App Secret chỉ được cấu hình ở backend; không thêm vào frontend. Giữ `AUTH_API_URL` của môi trường backend bạn muốn dùng; thay biến thì khởi động lại Next.js.

Facebook chặn `FB.login` từ trang HTTP, kể cả khi SDK đã tải và popup có thể mở. Dừng server `npm run dev` hiện tại, rồi chạy:

```sh
npm run dev:https
```

Mở **https://localhost:3000**. Next.js dùng mkcert để tạo chứng chỉ local; lần đầu có thể tải mkcert và yêu cầu mật khẩu máy để cài chứng chỉ tin cậy. Thao tác trust certificate cần người dùng thực hiện trong máy của họ. Không dùng chứng chỉ local này cho production.

Trong Meta for Developers, cập nhật Website với **Site URL `https://localhost:3000/`**, bật **Login with the JavaScript SDK**, và cập nhật **Allowed Domains for the JavaScript SDK** cho website HTTPS tương ứng theo định dạng dashboard yêu cầu. Tài khoản thử nghiệm cần role được chấp nhận trong app nếu app đang Development.

Nếu dùng cả Google, thêm `https://localhost:3000` vào **Authorized JavaScript origins** của Google client. Origin HTTP và HTTPS là hai origin khác nhau.

`AUTH_API_URL=http://localhost:3069/api` có thể giữ nguyên cho backend local: request đến backend được gửi từ server Next.js, không phải từ trang HTTPS trong trình duyệt. Nếu backend chạy staging, dùng base URL staging hiện có. Không cần thay client ID/App ID khi chỉ đổi scheme của frontend.

Nếu cần dùng chứng chỉ có sẵn, Next.js hỗ trợ `--experimental-https-key <path>` và `--experimental-https-cert <path>` cùng với `--experimental-https`.

## Luồng đăng nhập

1. Trang tải SDK chính thức `https://connect.facebook.net/vi_VN/sdk.js` và khởi tạo app ID trên với phiên bản `v23.0`.
2. Bấm Facebook gọi `FB.login` trực tiếp trong sự kiện click để giữ quyền mở popup. Callback là function thường, không phải async function.
3. Chỉ yêu cầu `public_profile`. Khi người dùng đồng ý, callback gửi toàn bộ `authResponse.accessToken` đến `POST /api/auth/facebook` cùng origin với `{ accessToken, remember }`.
4. Route Next.js gửi đúng `{ accessToken }` đến `${AUTH_API_URL}/auth/facebook`. Backend phải kiểm tra token còn hiệu lực và thuộc đúng Facebook app, rồi trả envelope `status: success`, `statusCode: 200`, `data: { accessToken, refreshToken }` của Mangix.
5. Token Mangix được giữ trong cookie HttpOnly dùng chung với Google. Frontend chỉ báo đăng nhập thành công sau khi `/api/auth/session` xác nhận profile qua backend; hỗ trợ tên hiển thị với email null.
6. Tải lại trang, ghi nhớ đăng nhập, refresh phiên và đăng xuất tiếp tục dùng chung luồng hiện có. Đăng xuất Mangix không đăng xuất tài khoản Facebook của trình duyệt.

Khi hủy hoặc từ chối quyền, không gọi backend và hiện thông báo. Khi SDK bị chặn hoặc không khởi tạo được, nút không gửi request và có thông báo tải lại trang. Trong lúc chờ popup, nút **Hủy chờ Facebook** cho phép thử lại; callback đến muộn của lần đã hủy được bỏ qua. Backend 401 không tạo phiên thành công, không hiển thị token hoặc stack lỗi. Không ghi token vào log, localStorage hoặc sessionStorage.

## Kiểm tra

Chạy `npm test`, `npm run lint`, `npx tsc --noEmit` và `npm run build`. Bộ test kiểm tra chính xác body của Facebook, CSRF Origin, cookie, lỗi backend, token redaction và profile không có email. Kiểm tra SDK/callback bằng fixture không thay thế lần đăng nhập thật cần tài khoản có role trong Meta app.

Tài liệu SDK: [Facebook Login for Web](https://developers.facebook.com/docs/facebook-login/web/), [FB.login](https://developers.facebook.com/docs/javascript/reference/FB.login/).
