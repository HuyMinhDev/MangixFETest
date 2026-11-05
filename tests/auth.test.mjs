import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { googleLogin, getSession, logout } from "../src/lib/server/auth.ts";
import * as auth from "../src/lib/server/auth.ts";

// Contract scenarios: exchange/redaction/cookies, validation and origin guards,
// upstream rejection/outage, verified profiles, refresh rotation, logout revocation.
const origin = "http://localhost:3000";
const jwt = (seconds = 3600) =>
  `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds })).toString("base64url")}.signature`;
const envelope = (data) => ({
  status: "success",
  statusCode: 200,
  message: "OK",
  data,
});
const mutation = (path, body = {}, headers = {}) =>
  new Request(`${origin}${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const session = (cookie = "") =>
  new Request(`${origin}/api/auth/session`, { headers: { Cookie: cookie } });
const cookieHeader = (response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

async function backend(t, respond) {
  const calls = [];
  const server = createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    const call = {
      method: request.method,
      path: request.url,
      headers: request.headers,
      body: text ? JSON.parse(text) : null,
    };
    calls.push(call);
    const result = await respond(call, calls.length);
    if (result === "disconnect") return request.socket.destroy();
    if (result === "hang-body") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.flushHeaders();
      return;
    }
    response.writeHead(result.status ?? 200, {
      "Content-Type": "application/json",
    });
    response.end(JSON.stringify(result.body ?? envelope(result.data)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const previous = process.env.AUTH_API_URL;
  process.env.AUTH_API_URL = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    if (previous === undefined) delete process.env.AUTH_API_URL;
    else process.env.AUTH_API_URL = previous;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return calls;
}

test("Google exchange sends only idToken and stores HttpOnly session cookies without exposing tokens", async (t) => {
  const accessToken = jwt();
  const refreshToken = jwt(86400);
  const calls = await backend(t, () => ({
    data: { accessToken, refreshToken },
  }));
  const response = await googleLogin(
    mutation("/api/auth/google", {
      idToken: "google-credential",
      remember: false,
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: true });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(calls.length, 1);
  assert.deepEqual(
    { method: calls[0].method, path: calls[0].path, body: calls[0].body },
    {
      method: "POST",
      path: "/api/auth/google",
      body: { idToken: "google-credential" },
    },
  );
  const cookies = response.headers.getSetCookie();
  for (const name of ["mangix_access_token", "mangix_refresh_token"]) {
    const cookie = cookies.find((value) => value.startsWith(`${name}=`));
    assert.ok(cookie);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//i);
    assert.doesNotMatch(cookie, /Max-Age=/i);
  }
});

test("missing, whitespace, malformed, and non-string Google tokens never reach the backend", async (t) => {
  const calls = await backend(t, () => ({ data: {} }));
  for (const body of [{}, { idToken: "   " }, { idToken: 123 }, null]) {
    const response = await googleLogin(mutation("/api/auth/google", body));
    assert.equal(response.status, 400);
    assert.equal(response.headers.getSetCookie().length, 0);
  }
  const malformed = new Request(`${origin}/api/auth/google`, {
    method: "POST",
    headers: { Origin: origin },
    body: "{",
  });
  assert.equal((await googleLogin(malformed)).status, 400);
  assert.equal(calls.length, 0);
});

test("login and logout reject missing or foreign Origin before calling the backend", async (t) => {
  const calls = await backend(t, () => ({ data: {} }));
  for (const handler of [googleLogin, logout]) {
    for (const value of ["https://attacker.example", "null", ""]) {
      const request = mutation(
        "/api/auth/google",
        { idToken: "secret" },
        { Origin: value },
      );
      if (!value) request.headers.delete("Origin");
      assert.equal((await handler(request)).status, 403);
    }
  }
  assert.equal(calls.length, 0);
});

test("backend authentication failure is normalized without raw tokens, stack, or cookies", async (t) => {
  await backend(t, () => ({
    status: 401,
    body: {
      message: "stack secret-google-token",
      accessToken: "secret-access",
    },
  }));
  const response = await googleLogin(
    mutation("/api/auth/google", { idToken: "secret-google-token" }),
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.getSetCookie().length, 0);
  const body = await response.text();
  assert.doesNotMatch(body, /secret|stack/);
  assert.ok(JSON.parse(body).error);
});

test("backend outage returns 503 without creating cookies or reporting authentication", async (t) => {
  await backend(t, () => "disconnect");
  const response = await googleLogin(
    mutation("/api/auth/google", { idToken: "credential" }),
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.getSetCookie().length, 0);
  assert.notEqual((await response.json()).authenticated, true);
});

test("malformed backend success never creates a session", async (t) => {
  await backend(t, () => ({ data: { accessToken: "access-without-refresh" } }));
  const response = await googleLogin(
    mutation("/api/auth/google", { idToken: "credential" }),
  );
  assert.equal(response.status, 502);
  assert.equal(response.headers.getSetCookie().length, 0);
});

test("remember me adds Secure persistent cookies bounded by backend JWT expiration", async (t) => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  t.after(() => {
    process.env.NODE_ENV = previous;
  });
  await backend(t, () => ({
    data: { accessToken: jwt(120), refreshToken: jwt(300) },
  }));
  const response = await googleLogin(
    mutation("/api/auth/google", { idToken: "credential", remember: true }),
  );
  assert.equal(response.status, 200);
  for (const value of response.headers.getSetCookie()) {
    assert.match(value, /; Secure/);
    assert.match(value, /; HttpOnly/);
    const maxAge = Number(value.match(/Max-Age=(\d+)/)?.[1]);
    assert.ok(
      maxAge > 0 &&
        maxAge <= (value.startsWith("mangix_access_token=") ? 120 : 300),
    );
  }
});

test("session without cookies is anonymous and does not call backend", async (t) => {
  const calls = await backend(t, () => ({ data: {} }));
  const response = await getSession(session());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { authenticated: false });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(calls.length, 0);
});

test("cookie presence alone does not authenticate a user", async (t) => {
  const calls = await backend(t, () => ({
    status: 401,
    body: { message: "invalid token" },
  }));
  const response = await getSession(
    session("mangix_access_token=forged-cookie"),
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { authenticated: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/users/profile");
  assert.equal(calls[0].headers.authorization, "Bearer forged-cookie");
});

test("session returns only a profile verified by the backend", async (t) => {
  const calls = await backend(t, () => ({
    data: {
      id: "user-id",
      email: "person@example.com",
      display_name: "Person",
      password_hash: "private",
      provider_id: "private",
    },
  }));
  const response = await getSession(
    session("mangix_access_token=verified-token"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authenticated: true,
    user: { email: "person@example.com", displayName: "Person" },
  });
  assert.equal(calls[0].method, "GET");
  assert.equal(response.headers.getSetCookie().length, 0);
});

test("profile outage preserves existing cookies and reports 503", async (t) => {
  const calls = await backend(t, () => "disconnect");
  const response = await getSession(
    session("mangix_access_token=access; mangix_refresh_token=refresh"),
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.getSetCookie().length, 0);
  assert.notEqual((await response.json()).authenticated, true);
  assert.equal(calls.length, 1);
});

test("expired access refreshes tokens and verifies the new access token before authentication", async (t) => {
  const accessToken = jwt(60);
  const refreshToken = jwt(600);
  const calls = await backend(t, (call) => {
    if (call.path === "/api/auth/refresh")
      return { data: { accessToken, refreshToken } };
    if (call.headers.authorization === "Bearer expired")
      return { status: 401, body: {} };
    return {
      data: {
        id: "person",
        email: "verified@example.com",
        display_name: "Verified",
      },
    };
  });
  const response = await getSession(
    session(
      "mangix_access_token=expired; mangix_refresh_token=old-refresh; mangix_remember=1",
    ),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authenticated: true,
    user: { email: "verified@example.com", displayName: "Verified" },
  });
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/users/profile", "/api/auth/refresh", "/api/users/profile"],
  );
  assert.equal(calls[1].method, "POST");
  assert.deepEqual(calls[1].body, { refreshToken: "old-refresh" });
  assert.equal(calls[2].headers.authorization, `Bearer ${accessToken}`);
  const cookies = response.headers.getSetCookie();
  assert.ok(
    cookies.some((value) =>
      value.startsWith(`mangix_access_token=${accessToken};`),
    ),
  );
  assert.ok(
    cookies.some((value) =>
      value.startsWith(`mangix_refresh_token=${refreshToken};`),
    ),
  );
  for (const value of cookies) assert.match(value, /Max-Age=/);
});

test("refresh can restore a session after the shorter-lived access cookie expires", async (t) => {
  const calls = await backend(t, (call) =>
    call.path === "/api/auth/refresh"
      ? { data: { accessToken: jwt(), refreshToken: jwt(600) } }
      : { data: { id: "person", email: null, display_name: null } },
  );
  const response = await getSession(
    session("mangix_refresh_token=remaining-refresh"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authenticated: true,
    user: { email: null, displayName: null },
  });
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/auth/refresh", "/api/users/profile"],
  );
  const access = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("mangix_access_token="));
  assert.doesNotMatch(access, /Max-Age=/);
});

test("refresh rejection clears stale cookies and returns anonymous", async (t) => {
  await backend(t, () => ({ status: 401, body: {} }));
  const response = await getSession(session("mangix_refresh_token=revoked"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { authenticated: false });
  assert.equal(response.headers.getSetCookie().length, 3);
  for (const value of response.headers.getSetCookie())
    assert.match(value, /Max-Age=0/);
});

test("refresh outage does not delete cookies or claim authentication", async (t) => {
  await backend(t, () => "disconnect");
  const response = await getSession(
    session("mangix_refresh_token=still-valid"),
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.getSetCookie().length, 0);
  assert.notEqual((await response.json()).authenticated, true);
});

test("new token pair alone does not authenticate when the retried profile is rejected", async (t) => {
  await backend(t, (call) =>
    call.path === "/api/auth/refresh"
      ? { data: { accessToken: jwt(), refreshToken: jwt(600) } }
      : { status: 401, body: {} },
  );
  const response = await getSession(session("mangix_refresh_token=refresh"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test("logout revokes the backend refresh token before clearing all cookies", async (t) => {
  const calls = await backend(t, () => ({ data: null }));
  const response = await logout(
    mutation("/api/auth/logout", undefined, {
      Cookie:
        "mangix_access_token=access; mangix_refresh_token=refresh; mangix_remember=1",
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false });
  assert.deepEqual(
    { method: calls[0].method, path: calls[0].path, body: calls[0].body },
    {
      method: "POST",
      path: "/api/auth/logout",
      body: { refreshToken: "refresh" },
    },
  );
  assert.equal(response.headers.getSetCookie().length, 3);
  for (const value of response.headers.getSetCookie()) {
    assert.match(value, /Max-Age=0/);
    assert.match(value, /HttpOnly/);
    assert.match(value, /SameSite=Lax/);
  }
});

test("logout outage preserves cookies and reports that revocation failed", async (t) => {
  await backend(t, () => "disconnect");
  const response = await logout(
    mutation(
      "/api/auth/logout",
      {},
      { Cookie: "mangix_refresh_token=refresh" },
    ),
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.getSetCookie().length, 0);
  assert.ok((await response.json()).error);
});

test("already-invalid refresh token can be cleared on logout", async (t) => {
  await backend(t, () => ({ status: 401, body: {} }));
  const response = await logout(
    mutation(
      "/api/auth/logout",
      {},
      { Cookie: "mangix_refresh_token=revoked" },
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.getSetCookie().length, 3);
});

test("backend-issued token cookie encoding survives a subsequent session request", async (t) => {
  const issued = {
    accessToken: "access+with/special=characters",
    refreshToken: "refresh+with/special=characters",
  };
  const calls = await backend(t, (call) =>
    call.path === "/api/auth/google"
      ? { data: issued }
      : {
          data: {
            id: "person",
            email: "person@example.com",
            display_name: null,
          },
        },
  );
  const exchange = await googleLogin(
    mutation("/api/auth/google", { idToken: "credential" }),
  );
  const response = await getSession(session(cookieHeader(exchange)));
  assert.equal(response.status, 200);
  assert.equal(calls[1].headers.authorization, `Bearer ${issued.accessToken}`);
});

test("logout accepts an empty POST body when no refresh cookie remains", async (t) => {
  const calls = await backend(t, () => ({ data: null }));
  const response = await logout(
    new Request(`${origin}/api/auth/logout`, {
      method: "POST",
      headers: { Origin: origin },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 0);
  assert.equal(response.headers.getSetCookie().length, 3);
});

test(
  "a backend response that stalls after headers times out as unavailable",
  { timeout: 15000 },
  async (t) => {
    await backend(t, () => "hang-body");
    const response = await googleLogin(
      mutation("/api/auth/google", { idToken: "credential" }),
    );
    assert.equal(response.status, 503);
    assert.equal(response.headers.getSetCookie().length, 0);
  },
);

test("concurrent and immediately trailing session requests share a single refresh rotation", async (t) => {
  let rotations = 0;
  await backend(t, (call) => {
    if (call.path === "/api/auth/refresh") {
      rotations += 1;
      return rotations === 1
        ? { data: { accessToken: jwt(), refreshToken: jwt(600) } }
        : { status: 401, body: {} };
    }
    return {
      data: {
        id: "person",
        email: "person@example.com",
        display_name: "Person",
      },
    };
  });
  const cookie = "mangix_refresh_token=concurrent-rotation-token";
  const responses = await Promise.all([
    getSession(session(cookie)),
    getSession(session(cookie)),
  ]);
  responses.push(await getSession(session(cookie)));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal((await response.json()).authenticated, true);
    for (const name of ["mangix_access_token", "mangix_refresh_token"]) {
      const value = response.headers
        .getSetCookie()
        .find((entry) => entry.startsWith(`${name}=`));
      assert.ok(value);
      assert.doesNotMatch(value, /Max-Age=0/);
    }
  }
  assert.equal(rotations, 1);
});

test("Facebook exchange sends only accessToken and keeps Mangix tokens in HttpOnly cookies", async (t) => {
  assert.equal(
    typeof auth.facebookLogin,
    "function",
    "Facebook login handler is implemented",
  );
  const pair = { accessToken: jwt(), refreshToken: jwt(86400) };
  const calls = await backend(t, () => ({ data: pair }));
  const response = await auth.facebookLogin(
    mutation("/api/auth/facebook", {
      accessToken: "facebook-credential",
      remember: false,
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: true });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(calls.length, 1);
  assert.deepEqual(
    { method: calls[0].method, path: calls[0].path, body: calls[0].body },
    {
      method: "POST",
      path: "/api/auth/facebook",
      body: { accessToken: "facebook-credential" },
    },
  );
  for (const name of ["mangix_access_token", "mangix_refresh_token"]) {
    const value = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith(`${name}=`));
    assert.ok(value);
    assert.match(value, /HttpOnly/);
    assert.match(value, /SameSite=Lax/);
    assert.doesNotMatch(value, /Max-Age=/);
  }
});

test("Facebook missing, whitespace, non-string and malformed credentials never reach backend", async (t) => {
  const calls = await backend(t, () => ({ data: {} }));
  for (const body of [
    {},
    { accessToken: " " },
    { accessToken: 123 },
    { idToken: "wrong-provider" },
    null,
  ]) {
    const response = await auth.facebookLogin(
      mutation("/api/auth/facebook", body),
    );
    assert.equal(response.status, 400);
    assert.equal(response.headers.getSetCookie().length, 0);
  }
  const malformed = new Request(`${origin}/api/auth/facebook`, {
    method: "POST",
    headers: { Origin: origin },
    body: "{",
  });
  assert.equal((await auth.facebookLogin(malformed)).status, 400);
  assert.equal(calls.length, 0);
});

test("Facebook missing or foreign Origin cannot establish a session", async (t) => {
  const calls = await backend(t, () => ({ data: {} }));
  for (const value of ["https://other.example", "null", ""]) {
    const request = mutation(
      "/api/auth/facebook",
      { accessToken: "facebook-credential" },
      { Origin: value },
    );
    if (!value) request.headers.delete("Origin");
    const response = await auth.facebookLogin(request);
    assert.equal(response.status, 403);
    assert.equal(response.headers.getSetCookie().length, 0);
  }
  assert.equal(calls.length, 0);
});

test("Facebook invalid backend token is rejected without exposing credential or backend stack", async (t) => {
  await backend(t, () => ({
    status: 401,
    body: {
      message: "private-facebook-credential stack",
      accessToken: "private-backend-token",
    },
  }));
  const response = await auth.facebookLogin(
    mutation("/api/auth/facebook", {
      accessToken: "private-facebook-credential",
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.getSetCookie().length, 0);
  assert.doesNotMatch(await response.text(), /private-|stack/);
});

test("Facebook backend outage never reports success or changes cookies", async (t) => {
  await backend(t, () => "disconnect");
  const response = await auth.facebookLogin(
    mutation("/api/auth/facebook", { accessToken: "facebook-credential" }),
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.getSetCookie().length, 0);
  assert.notEqual((await response.json()).authenticated, true);
});

test("Facebook remember option reuses Secure persistent Mangix session cookies", async (t) => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });
  await backend(t, () => ({
    data: { accessToken: jwt(120), refreshToken: jwt(300) },
  }));
  const response = await auth.facebookLogin(
    mutation("/api/auth/facebook", {
      accessToken: "facebook-credential",
      remember: true,
    }),
  );
  assert.equal(response.status, 200);
  for (const value of response.headers.getSetCookie()) {
    assert.match(value, /; Secure/);
    assert.match(value, /; HttpOnly/);
    const age = Number(value.match(/Max-Age=(\d+)/)?.[1]);
    assert.ok(
      age > 0 && age <= (value.startsWith("mangix_access_token=") ? 120 : 300),
    );
  }
});

test("Facebook malformed backend success cannot create an authenticated session", async (t) => {
  await backend(t, () => ({ data: { accessToken: "without-refresh" } }));
  const response = await auth.facebookLogin(
    mutation("/api/auth/facebook", { accessToken: "facebook-credential" }),
  );
  assert.equal(response.status, 502);
  assert.equal(response.headers.getSetCookie().length, 0);
});

test("Facebook login can verify a backend profile without email", async (t) => {
  await backend(t, (call) =>
    call.path === "/api/auth/facebook"
      ? { data: { accessToken: jwt(), refreshToken: jwt(86400) } }
      : {
          data: {
            id: "facebook-user",
            email: null,
            display_name: "Facebook User",
          },
        },
  );
  const login = await auth.facebookLogin(
    mutation("/api/auth/facebook", { accessToken: "facebook-credential" }),
  );
  const response = await getSession(session(cookieHeader(login)));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authenticated: true,
    user: { email: null, displayName: "Facebook User" },
  });
});
