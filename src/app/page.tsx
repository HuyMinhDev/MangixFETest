import LoginForm from "./components/login-form";
import Link from "next/link";
import { BrandMark, GlobeIcon, SparkleIcon } from "./components/icons";

function ConnectionIllustration() {
  return (
    <div className="connection-art" aria-hidden="true">
      <div className="art-orbit art-orbit-one" />
      <div className="art-orbit art-orbit-two" />
      <div className="art-orb" />
      <div className="art-platform art-platform-back" />
      <div className="art-platform art-platform-front" />
      <div className="connection-card">
        <div className="card-topline">
          <BrandMark />
          <span className="card-dots">
            <i />
            <i />
            <i />
          </span>
        </div>
        <span className="card-caption">MỘT TÀI KHOẢN</span>
        <div className="card-title">Vô vàn khả năng.</div>
        <div className="card-bottomline">
          <span className="card-avatar">m.</span>
          <span className="card-line" />
          <span className="card-connected">
            <span /> Đã kết nối
          </span>
        </div>
      </div>
      <div className="art-spark art-spark-one">
        <SparkleIcon />
      </div>
      <div className="art-spark art-spark-two">
        <SparkleIcon />
      </div>
      <div className="art-dot art-dot-one" />
      <div className="art-dot art-dot-two" />
      <div className="connection-pill">
        <span className="pill-check">✓</span> Mọi kết nối, một nơi.
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="login-page">
      <section
        className="brand-panel"
        aria-label="Mangix — Kết nối và khám phá"
      >
        <Link className="brand" href="/" aria-label="Mangix — Trang chủ">
          <BrandMark />
          <span>
            mangix<span className="brand-period">.</span>
          </span>
        </Link>
        <div className="brand-story">
          <div className="story-eyebrow">
            <span /> KHÔNG GIAN CỦA BẠN
          </div>
          <h2>
            Khởi đầu nhỏ.
            <br />
            Khả năng <span>vô hạn.</span>
          </h2>
          <p>
            Kết nối với những điều bạn yêu thích.
            <br />
            Hành trình mới bắt đầu từ đây.
          </p>
        </div>
        <ConnectionIllustration />
        <div className="brand-panel-footer">
          <span className="footer-line" />
          <p>Một tài khoản. Nhiều kết nối.</p>
          <span className="panel-page-number">01 / 01</span>
        </div>
      </section>
      <section className="form-panel" aria-labelledby="login-heading">
        <header className="form-panel-header">
          <Link
            className="brand mobile-brand"
            href="/"
            aria-label="Mangix — Trang chủ"
          >
            <BrandMark />
            <span>
              mangix<span className="brand-period">.</span>
            </span>
          </Link>
          <div className="language-label">
            <GlobeIcon />
            <span>Tiếng Việt</span>
            <span className="language-dot" />
          </div>
        </header>
        <div className="form-panel-content">
          <LoginForm
            googleClientId={process.env.GOOGLE_CLIENT_ID ?? ""}
            facebookAppId={process.env.FACEBOOK_APP_ID ?? ""}
          />
        </div>
        <footer className="page-footer">
          <span>© Mangix. All rights reserved.</span>
          <span>
            Được tạo nên để kết nối <span className="footer-asterisk">✳</span>
          </span>
        </footer>
      </section>
    </main>
  );
}
