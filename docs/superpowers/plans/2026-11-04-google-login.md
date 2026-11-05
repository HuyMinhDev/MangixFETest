# Google login implementation

User requests connecting the existing Google button to the provided Google client ID and POST `http://localhost:3069/api/auth/google` with `{ idToken }`. This extends the approved login UI to real authentication.

## Approach

Use Google's supported Identity Services button with popup callback. Avoid manually collecting tokens through OAuth Playground. Keep the provided public client ID in `GOOGLE_CLIENT_ID` and explicitly pass it from the server page to the client component; keep the backend origin in server-only `AUTH_API_URL`. No Google client secret is required in this frontend flow.

The backend code confirms `{ status: "success", data: { accessToken, refreshToken } }`. Next.js route handlers exchange the Google credential, set HttpOnly/SameSite cookies, and return no tokens to client JavaScript. Verify session through `/api/users/profile`; support refresh and logout via backend endpoints. Display a small signed-in state in the existing form area, not a new dashboard. Keep Apple/Facebook demo behavior.

## Tasks

- [x] Add server-side auth exchange/session/logout functions and meaningful native Node tests for failures, validation, cookie flags, and token redaction.
- [x] Add route handlers for Google POST, session GET and logout POST using these functions.
- [x] Add Google Identity Services client component and connect credential callback to the local Google route; handle loading, network/provider errors and backend rejection.
- [x] Restore authenticated UI on reload using verified backend profile; support sign out. Respect the remember checkbox for cookie persistence.
- [x] Document authorized JavaScript origins (`http://localhost`, `http://localhost:3000`), test users and the existing backend configuration. Keep client secrets out of the frontend.
- [x] Run auth tests, lint, TypeScript, production build and browser tests; report which parts need the user's Google consent to finish live validation.

## Verification

- 23 native Node integration tests passed, including rejection, timeouts, verified profiles, cookie redaction, persistence, refresh/logout and concurrent refresh.
- ESLint, TypeScript, production build and git diff --check passed.
- A production Next instance with an isolated HTTP backend and SDK callback fixture passed browser login, verified profile display, reload, logout/revocation, rejected-token notice, session/persistent cookies, and absence of browser token storage. This did not authenticate a real Google account.
- Real Google SDK loaded and real popup opened. Google currently rejects this client with invalid_client/no registered origin. Live Google consent/sign-in remains pending the account owner adding localhost origins in Google Cloud.
