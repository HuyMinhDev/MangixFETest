# Facebook login implementation

User explicitly requests connecting the approved Facebook button using App ID 1373146754718147 and POST /api/auth/facebook with { accessToken }. Keep the current layout and shared Mangix session behavior.

- [x] Add regression tests first for the Facebook backend exchange, exact request body, validation, Origin rejection, upstream rejection/outage, token redaction and remember cookies.
- [x] Reuse existing social exchange/cookie helpers and add a thin Next route /api/auth/facebook; keep Google compatibility and existing session/refresh/logout.
- [x] Load the official Facebook JavaScript SDK (v23.0 as requested) without App Secret. Initialize once, call FB.login directly in the click handler with public_profile, forward the full access token, and report cancellation or SDK/backend errors without false success or credential logs.
- [x] Share the existing credential exchange UI handler to avoid duplicate Google/Facebook state logic; obtain display information from the verified backend profile. Facebook email may be null.
- [x] Add FACEBOOK_APP_ID to example and local environment without changing AUTH_API_URL; document local Meta settings and the backend requirement to verify the token for the same app.
- [x] Run native auth tests, lint, TypeScript, build, independent review and browser integration scenarios. Verify actual SDK rendering/popup as available, and explicitly distinguish fixture checks from real account sign-in.

## Verification evidence

- TDD: Facebook exchange test failed on missing handler, then all 8 Facebook API scenarios passed after implementation. Full suite: 31 tests passed.
- Browser regression first failed on missing pending-login recovery, then passed after manual cancel with stale/duplicate callback guards.
- Production Next with an isolated backend and SDK fixture passed App ID/version/scope, cancel/config error/blocked popup, manual cancel plus late callback, exact Facebook exchange, verified profile, reload, logout/revocation, backend rejection, HttpOnly/Secure/SameSite and remember-cookie checks. These checks do not use a real Facebook account.
- Real Facebook SDK loaded and a trusted click opened www.facebook.com; real account consent was not performed.
- Blocking the real SDK produced a notice and disabled Facebook without sending credentials; reloading restored the SDK. Responsive checks passed at 320/390/768/1024/1440px and desktop/mobile screenshots were inspected.
- Lint, TypeScript, production build and git diff --check passed. Independent review found no remaining substantive issues.

## HTTPS correction

User reported Facebook SDK refusing FB.login on HTTP. The previous real-popup check did not verify completed authentication and was insufficient to establish HTTP support. Added an HTTP protocol guard before SDK/busy state, `npm run dev:https` pinned to port 3000 using Next's bundled CLI HTTPS support, certificate ignore entry and corrected Meta/Google setup instructions. Browser regression failed before guard and passed after it. A separate HTTPS Next instance using a temporary certificate (without installing an OS trust root) passed full Facebook callback/session/logout fixture checks. All 31 native tests, lint, TypeScript, build and independent review passed. The user's running HTTP dev server is preserved; the developer must stop it and run the HTTPS command, accepting any local certificate trust prompt themselves.
