"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { GoogleIcon } from "./icons";

type GoogleCredential = { credential: string };
type GoogleIdentity = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredential) => void;
    ux_mode: "popup";
    auto_select: boolean;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: {
      type: "standard";
      theme: "outline";
      size: "large";
      text: "signin_with";
      shape: "rectangular";
      width: number;
      locale: "vi";
    },
  ) => void;
  disableAutoSelect: () => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

export function disableGoogleAutoSelect() {
  window.google?.accounts.id.disableAutoSelect();
}

export default function GoogleSignInButton({
  clientId,
  disabled,
  onCredential,
}: {
  clientId: string;
  disabled: boolean;
  onCredential: (idToken: string) => Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = container.current;
    const identity = window.google?.accounts.id;
    if (!ready || !clientId || !element || !identity) return;

    if (!initialized.current) {
      identity.initialize({
        client_id: clientId,
        ux_mode: "popup",
        auto_select: false,
        callback: ({ credential }) => {
          if (typeof credential === "string" && credential) {
            void onCredential(credential);
          }
        },
      });
      initialized.current = true;
    }

    let renderedWidth = 0;
    const render = () => {
      const width = Math.min(
        400,
        Math.floor(element.getBoundingClientRect().width),
      );
      if (!width || width === renderedWidth) return;
      renderedWidth = width;
      element.replaceChildren();
      identity.renderButton(element, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        width,
        locale: "vi",
      });
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready, clientId, onCredential]);

  return (
    <div className="google-signin" aria-busy={disabled}>
      {clientId && (
        <Script
          id="google-identity-services"
          src="https://accounts.google.com/gsi/client?hl=vi"
          strategy="afterInteractive"
          onReady={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      )}
      {(!ready || failed || !clientId) && (
        <button
          className="social-button google-placeholder"
          type="button"
          disabled
        >
          <GoogleIcon />
          <span>
            {failed
              ? "Google chưa sẵn sàng"
              : clientId
                ? "Đang tải Google…"
                : "Google chưa được cấu hình"}
          </span>
        </button>
      )}
      <div
        className="google-button-container"
        ref={container}
        inert={disabled || failed || !clientId}
        hidden={!ready || failed || !clientId}
      />
      {failed && (
        <p className="google-load-error" role="status">
          Không tải được Google. Kiểm tra kết nối và tải lại trang để thử lại.
        </p>
      )}
    </div>
  );
}
