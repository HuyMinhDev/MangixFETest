"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import FacebookSignInButton, {
  logoutFacebook,
} from "./facebook-sign-in-button";
import GoogleSignInButton, { logoutGoogle } from "./google-sign-in-button";
import {
  AppleIcon,
  ArrowRightIcon,
  CloseIcon,
  EyeIcon,
  LockIcon,
} from "./icons";

type SessionUser = { email: string | null; displayName: string | null };
const providers = [{ name: "Apple", Icon: AppleIcon }];

async function getSession(signal?: AbortSignal): Promise<SessionUser | null> {
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    signal,
  });
  if (response.status === 401) return null;
  if (!response.ok)
    throw new Error("Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.");
  const data = await response.json();
  if (data.authenticated !== true || !data.user) return null;
  return data.user;
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  if (response.status === 401)
    return "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.";
  return typeof body?.message === "string" ? body.message : fallback;
}

export default function LoginForm({
  googleClientId,
  facebookAppId,
}: {
  googleClientId: string;
  facebookAppId: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const remember = useRef(false);
  const signingIn = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    getSession(controller.signal)
      .then((sessionUser) => {
        if (!controller.signal.aborted) setUser(sessionUser);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setNotice(
            "Không thể kiểm tra phiên hiện tại. Vui lòng thử đăng nhập lại.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, []);

  const exchangeCredential = useCallback(
    async (provider: "google" | "facebook", credential: string) => {
      if (signingIn.current) return;
      signingIn.current = true;
      setBusy(true);
      setNotice("");
      try {
        const response = await fetch(`/api/auth/${provider}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [provider === "google" ? "idToken" : "accessToken"]: credential,
            remember: remember.current,
          }),
        });
        if (!response.ok)
          throw new Error(
            await readError(
              response,
              `Đăng nhập ${provider === "google" ? "Google" : "Facebook"} không thành công. Vui lòng thử lại.`,
            ),
          );
        const sessionUser = await getSession();
        if (!sessionUser)
          throw new Error(
            "Không thể xác nhận phiên đăng nhập. Vui lòng thử lại.",
          );
        setUser(sessionUser);
      } catch (error) {
        setNotice(
          error instanceof Error && error.message !== "Failed to fetch"
            ? error.message
            : "Không thể kết nối máy chủ. Vui lòng thử lại.",
        );
      } finally {
        signingIn.current = false;
        setBusy(false);
      }
    },
    [],
  );

  const handleGoogleCredential = useCallback(
    (credential: string) => exchangeCredential("google", credential),
    [exchangeCredential],
  );
  const handleFacebookCredential = useCallback(
    (credential: string) => exchangeCredential("facebook", credential),
    [exchangeCredential],
  );

  async function handleLogout() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          await readError(response, "Chưa thể đăng xuất. Vui lòng thử lại."),
        );
      await Promise.all([logoutGoogle(user?.email ?? null), logoutFacebook()]);
      setUser(null);
      remember.current = false;
      setNotice("Bạn đã đăng xuất thành công.");
    } catch (error) {
      setNotice(
        error instanceof Error && error.message !== "Failed to fetch"
          ? error.message
          : "Không thể kết nối máy chủ. Vui lòng thử lại.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(
      "Đăng nhập bằng email chưa được kết nối. Bạn có thể tiếp tục bằng Google hoặc Facebook.",
    );
  }

  const noticeElement = (
    <div
      className="form-notice"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {notice && (
        <>
          <p>{notice}</p>
          <button
            type="button"
            aria-label="Đóng thông báo"
            onClick={() => setNotice("")}
          >
            <CloseIcon />
          </button>
        </>
      )}
    </div>
  );

  if (user) {
    return (
      <div className="login-form-wrapper authenticated-panel">
        <div className="auth-success-icon" aria-hidden="true">
          ✓
        </div>
        <p className="form-eyebrow">KẾT NỐI THÀNH CÔNG</p>
        <h1 className="form-heading" id="login-heading">
          Chào bạn{user.displayName ? `, ${user.displayName}` : ""}!
        </h1>
        <p className="form-description">Bạn đã đăng nhập vào Mangix.</p>
        {user.email && <p className="auth-user-email">{user.email}</p>}
        <button
          type="button"
          className="submit-button auth-logout"
          onClick={handleLogout}
          disabled={busy}
        >
          {busy ? "Đang đăng xuất…" : "Đăng xuất"}
          <ArrowRightIcon />
        </button>
        {noticeElement}
      </div>
    );
  }

  return (
    <div className="login-form-wrapper" aria-busy={busy || checking}>
      <p className="form-eyebrow">MỘT KHỞI ĐẦU MỚI</p>
      <h1 className="form-heading" id="login-heading">
        Chào mừng trở lại!
      </h1>
      <p className="form-description">
        Đăng nhập để tiếp tục những điều tuyệt vời đang chờ bạn.
      </p>
      <div className="social-buttons">
        <GoogleSignInButton
          clientId={googleClientId}
          disabled={busy || checking}
          onCredential={handleGoogleCredential}
        />
        {providers.map(({ name, Icon }) => (
          <button
            className="social-button"
            type="button"
            key={name}
            aria-label={`Đăng nhập bằng ${name}`}
            disabled={busy}
            onClick={() =>
              setNotice(
                `Đăng nhập bằng ${name} chưa được kết nối. Vui lòng quay lại sau.`,
              )
            }
          >
            <Icon />
            <span>{name}</span>
          </button>
        ))}
        <FacebookSignInButton
          appId={facebookAppId}
          disabled={busy || checking}
          onCredential={handleFacebookCredential}
          onNotice={setNotice}
          onBusyChange={setBusy}
        />
      </div>
      {(checking || busy) && (
        <p className="auth-progress" role="status">
          {busy
            ? "Đang xác thực với máy chủ…"
            : "Đang kiểm tra phiên đăng nhập…"}
        </p>
      )}
      <div className="form-divider">
        <span>hoặc đăng nhập bằng email</span>
      </div>
      <form className="login-form" onSubmit={handleSubmit}>
        <div className="field-group">
          <label className="field-label" htmlFor="email">
            Địa chỉ email
          </label>
          <div className="input-wrap">
            <svg
              className="input-icon"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <path d="m4 7 8 6 8-6" />
            </svg>
            <input
              className="field-input"
              id="email"
              type="email"
              autoComplete="email"
              placeholder="ban@example.com"
              required
            />
          </div>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="password">
            Mật khẩu
          </label>
          <div className="input-wrap">
            <LockIcon className="input-icon" />
            <input
              className="field-input"
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Nhập mật khẩu của bạn"
              required
            />
            <button
              className="password-toggle"
              type="button"
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              aria-pressed={showPassword}
              aria-controls="password"
              onClick={() => setShowPassword((visible) => !visible)}
            >
              <EyeIcon hidden={!showPassword} />
            </button>
          </div>
        </div>
        <div className="form-options">
          <label className="remember-label">
            <input
              type="checkbox"
              name="remember"
              defaultChecked={false}
              onChange={(event) => {
                remember.current = event.target.checked;
              }}
            />
            <span>Ghi nhớ đăng nhập</span>
          </label>
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setNotice(
                "Khôi phục mật khẩu chưa được kết nối. Vui lòng quay lại sau.",
              )
            }
          >
            Quên mật khẩu?
          </button>
        </div>
        <button className="submit-button" type="submit" disabled={busy}>
          <span>Đăng nhập</span>
          <ArrowRightIcon />
        </button>
      </form>
      {noticeElement}
      <p className="signup-prompt">
        Chưa có tài khoản?{" "}
        <button
          className="text-button"
          type="button"
          onClick={() =>
            setNotice(
              "Đăng ký tài khoản chưa được kết nối. Bạn có thể tạo tài khoản bằng Google hoặc Facebook.",
            )
          }
        >
          Đăng ký ngay <span aria-hidden="true">↗</span>
        </button>
      </p>
      <p className="form-security">
        <LockIcon /> Kết nối của bạn bắt đầu từ đây.
      </p>
    </div>
  );
}
