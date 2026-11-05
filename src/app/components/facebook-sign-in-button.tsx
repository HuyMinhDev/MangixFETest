"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { FacebookIcon } from "./icons";

type FacebookLoginResponse = {
  authResponse?: { accessToken?: string };
  status?: string;
  error?: { message?: string };
};

type FacebookSdk = {
  init: (options: {
    appId: string;
    version: "v23.0";
    cookie: boolean;
    xfbml: boolean;
    autoLogAppEvents: boolean;
  }) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: { scope: "public_profile" },
  ) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

let initializedAppId: string | undefined;

export default function FacebookSignInButton({
  appId,
  disabled,
  onCredential,
  onNotice,
  onBusyChange,
}: {
  appId: string;
  disabled: boolean;
  onCredential: (accessToken: string) => Promise<void>;
  onNotice: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const loginInProgress = useRef(false);
  const attemptId = useRef(0);

  const initialize = useCallback(() => {
    if (!appId || !window.FB) return;
    try {
      if (initializedAppId !== appId) {
        window.FB.init({
          appId,
          version: "v23.0",
          cookie: false,
          xfbml: false,
          autoLogAppEvents: false,
        });
        initializedAppId = appId;
      }
      setReady(true);
    } catch {
      setFailed(true);
      onNotice(
        "Không thể khởi tạo Facebook. Vui lòng tải lại trang để thử lại.",
      );
    }
  }, [appId, onNotice]);

  useEffect(() => {
    window.fbAsyncInit = initialize;
    return () => {
      if (window.fbAsyncInit === initialize) delete window.fbAsyncInit;
      attemptId.current += 1;
    };
  }, [initialize]);

  function login() {
    if (!ready || !window.FB || disabled || loginInProgress.current) return;
    if (window.location.protocol !== "https:") {
      onNotice(
        "Facebook yêu cầu HTTPS. Hãy mở trang bằng HTTPS để tiếp tục đăng nhập.",
      );
      return;
    }
    const attempt = ++attemptId.current;
    let responseAccepted = false;
    loginInProgress.current = true;
    setPending(true);
    onBusyChange(true);
    onNotice("");

    function finish() {
      if (attempt !== attemptId.current) return;
      loginInProgress.current = false;
      setPending(false);
      onBusyChange(false);
    }

    try {
      // Keep this call synchronous with the click so browsers allow the popup.
      window.FB.login(
        (response) => {
          if (attempt !== attemptId.current || responseAccepted) return;
          responseAccepted = true;
          const token = response?.authResponse?.accessToken;
          if (typeof token !== "string" || !token.trim()) {
            onNotice(
              response?.error
                ? "Facebook chưa cho phép đăng nhập. Kiểm tra cấu hình ứng dụng và tài khoản thử nghiệm."
                : "Bạn đã hủy đăng nhập Facebook hoặc chưa cấp quyền truy cập.",
            );
            finish();
            return;
          }
          setPending(false);
          void onCredential(token).finally(finish);
        },
        { scope: "public_profile" },
      );
    } catch {
      onNotice(
        "Không mở được đăng nhập Facebook. Vui lòng cho phép cửa sổ bật lên và thử lại.",
      );
      finish();
    }
  }

  function cancelWaiting() {
    attemptId.current += 1;
    loginInProgress.current = false;
    setPending(false);
    onBusyChange(false);
    onNotice(
      "Đã dừng chờ đăng nhập Facebook. Bạn có thể đóng popup và thử lại.",
    );
  }

  const label = !appId
    ? "Facebook chưa được cấu hình"
    : failed
      ? "Không tải được Facebook. Kiểm tra kết nối và tải lại trang."
      : !ready
        ? "Đang tải Facebook…"
        : pending
          ? "Đang đăng nhập Facebook…"
          : "Đăng nhập bằng Facebook";

  return (
    <>
      {appId && (
        <Script
          id="facebook-javascript-sdk"
          src="https://connect.facebook.net/vi_VN/sdk.js"
          strategy="afterInteractive"
          onReady={initialize}
          onError={() => {
            setFailed(true);
            onNotice(
              "Không tải được Facebook. Kiểm tra kết nối và tải lại trang để thử lại.",
            );
          }}
        />
      )}
      <button
        className="social-button"
        type="button"
        aria-label={label}
        title={label}
        aria-busy={pending}
        disabled={disabled || !ready || failed || pending || !appId}
        onClick={login}
      >
        <FacebookIcon />
        <span>Facebook</span>
      </button>
      {pending && (
        <button
          className="text-button facebook-cancel"
          type="button"
          onClick={cancelWaiting}
        >
          Hủy chờ Facebook
        </button>
      )}
    </>
  );
}
