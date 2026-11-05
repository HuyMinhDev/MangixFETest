const ACCESS_COOKIE = "mangix_access_token";
const REFRESH_COOKIE = "mangix_refresh_token";
const REMEMBER_COOKIE = "mangix_remember";
const MAX_PERSISTENCE_SECONDS = 30 * 24 * 60 * 60;

type Tokens = { accessToken: string; refreshToken: string };
const pendingRefreshes = new Map<string, Promise<Tokens>>();
const MAX_PENDING_REFRESHES = 100;
const REFRESH_REUSE_MS = 2_000;

class AuthError extends Error {
  status: number;

  constructor(status: number) {
    super("Authentication service request failed");
    this.status = status;
  }
}

function json(body: object, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function cookie(name: string, value: string, maxAge?: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}${maxAge === undefined ? "" : `; Max-Age=${maxAge}`}`;
}

function sameOrigin(request: Request): boolean {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function upstream(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const base = process.env.AUTH_API_URL?.replace(/\/+$/, "");
  if (!base) throw new AuthError(503);
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new AuthError(503));
      controller.abort();
    }, 10_000);
  });
  const operation = (async () => {
    const result = await fetch(`${base}${path}`, {
      ...options,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!result.ok) {
      await result.body?.cancel();
      throw new AuthError(
        result.status === 401 || result.status === 403
          ? 401
          : result.status >= 500
            ? 503
            : 502,
      );
    }
    let body: unknown;
    try {
      body = await result.json();
    } catch {
      throw new AuthError(controller.signal.aborted ? 503 : 502);
    }
    if (!object(body) || body.status !== "success" || body.statusCode !== 200)
      throw new AuthError(502);
    return body.data;
  })();
  try {
    return await Promise.race([operation, deadline]);
  } catch (error) {
    throw error instanceof AuthError ? error : new AuthError(503);
  } finally {
    clearTimeout(timeout);
  }
}

function post(body: object): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function tokens(value: unknown): Tokens {
  if (
    !object(value) ||
    typeof value.accessToken !== "string" ||
    !value.accessToken.trim() ||
    typeof value.refreshToken !== "string" ||
    !value.refreshToken.trim()
  ) {
    throw new AuthError(502);
  }
  return { accessToken: value.accessToken, refreshToken: value.refreshToken };
}

async function refreshTokens(refreshToken: string): Promise<Tokens> {
  const key = `${process.env.AUTH_API_URL}\n${refreshToken}`;
  const existing = pendingRefreshes.get(key);
  if (existing) return existing;
  if (pendingRefreshes.size >= MAX_PENDING_REFRESHES) throw new AuthError(503);

  // Sharing rotation prevents a second request from revoking the freshly
  // installed browser session. Retain completed results only for a brief grace
  // period for requests already sent with the old cookie. This is process-local;
  // multi-instance deployments need equivalent coordination in the backend.
  const operation = upstream("/auth/refresh", post({ refreshToken }))
    .then(tokens)
    .then(
      (pair) => {
        const cleanup = setTimeout(() => {
          if (pendingRefreshes.get(key) === operation)
            pendingRefreshes.delete(key);
        }, REFRESH_REUSE_MS);
        cleanup.unref();
        return pair;
      },
      (error: unknown) => {
        if (pendingRefreshes.get(key) === operation)
          pendingRefreshes.delete(key);
        throw error;
      },
    );
  pendingRefreshes.set(key, operation);
  return operation;
}

// Read only backend-issued JWT expiration after a successful exchange. This does
// not verify identity; the backend verifies every session through /users/profile.
function persistence(token: string): number | undefined {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp))
      return undefined;
    return Math.max(
      0,
      Math.min(
        MAX_PERSISTENCE_SECONDS,
        Math.floor(payload.exp - Date.now() / 1000),
      ),
    );
  } catch {
    return undefined;
  }
}

function setTokens(
  response: Response,
  pair: Tokens,
  remember: boolean,
): Response {
  const refreshAge = remember ? persistence(pair.refreshToken) : undefined;
  response.headers.append(
    "Set-Cookie",
    cookie(
      ACCESS_COOKIE,
      pair.accessToken,
      remember ? persistence(pair.accessToken) : undefined,
    ),
  );
  response.headers.append(
    "Set-Cookie",
    cookie(REFRESH_COOKIE, pair.refreshToken, refreshAge),
  );
  if (remember)
    response.headers.append(
      "Set-Cookie",
      cookie(REMEMBER_COOKIE, "1", refreshAge),
    );
  else response.headers.append("Set-Cookie", cookie(REMEMBER_COOKIE, "", 0));
  return response;
}

function failure(error: unknown): Response {
  const status = error instanceof AuthError ? error.status : 503;
  return json(
    {
      error:
        status === 401
          ? "Authentication failed. Please sign in again."
          : "The authentication service is unavailable. Please try again.",
    },
    status,
  );
}

async function socialLogin(
  request: Request,
  provider: "google" | "facebook",
): Promise<Response> {
  if (!sameOrigin(request))
    return json({ error: "Request origin is not allowed." }, 403);
  const credentialKey = provider === "google" ? "idToken" : "accessToken";
  const invalidCredential = () =>
    json(
      {
        error: `A ${provider === "google" ? "Google ID" : "Facebook access"} token is required.`,
      },
      400,
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidCredential();
  }
  if (!object(body)) return invalidCredential();
  const credential = body[credentialKey];
  if (typeof credential !== "string" || !credential.trim())
    return invalidCredential();
  try {
    const pair = tokens(
      await upstream(
        `/auth/${provider}`,
        post({ [credentialKey]: credential }),
      ),
    );
    return setTokens(
      json({ authenticated: true }),
      pair,
      body.remember === true,
    );
  } catch (error) {
    return failure(error);
  }
}

export function googleLogin(request: Request): Promise<Response> {
  return socialLogin(request, "google");
}

export function facebookLogin(request: Request): Promise<Response> {
  return socialLogin(request, "facebook");
}

function readCookies(request: Request): Map<string, string> {
  const values = new Map<string, string>();
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    try {
      values.set(
        part.slice(0, separator).trim(),
        decodeURIComponent(part.slice(separator + 1).trim()),
      );
    } catch {
      // An invalid cookie encoding cannot establish an authenticated session.
    }
  }
  return values;
}

function clearCookies(response: Response): Response {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, REMEMBER_COOKIE]) {
    response.headers.append("Set-Cookie", cookie(name, "", 0));
  }
  return response;
}

async function profile(
  accessToken: string,
): Promise<{ email: string | null; displayName: string | null }> {
  const user = await upstream("/users/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (
    !object(user) ||
    (typeof user.id !== "string" && typeof user.id !== "number") ||
    (typeof user.email !== "string" && user.email !== null) ||
    (typeof user.display_name !== "string" && user.display_name !== null)
  ) {
    throw new AuthError(502);
  }
  return { email: user.email, displayName: user.display_name };
}

export async function getSession(request: Request): Promise<Response> {
  const cookies = readCookies(request);
  const accessToken = cookies.get(ACCESS_COOKIE);
  const refreshToken = cookies.get(REFRESH_COOKIE);
  const remember = cookies.get(REMEMBER_COOKIE) === "1";
  if (!accessToken && !refreshToken) return json({ authenticated: false }, 401);
  let rotated: Tokens | undefined;
  try {
    if (accessToken) {
      try {
        return json({ authenticated: true, user: await profile(accessToken) });
      } catch (error) {
        if (!(error instanceof AuthError) || error.status !== 401) throw error;
      }
    }
    if (!refreshToken) return clearCookies(json({ authenticated: false }, 401));
    rotated = await refreshTokens(refreshToken);
    const user = await profile(rotated.accessToken);
    return setTokens(json({ authenticated: true, user }), rotated, remember);
  } catch (error) {
    if (error instanceof AuthError && error.status === 401)
      return clearCookies(json({ authenticated: false }, 401));
    const response = failure(error);
    // The backend may already have revoked the old refresh token. Keep the
    // rotated pair even when the following profile request is temporarily down.
    return rotated ? setTokens(response, rotated, remember) : response;
  }
}

export async function logout(request: Request): Promise<Response> {
  if (!sameOrigin(request))
    return json({ error: "Request origin is not allowed." }, 403);
  const refreshToken = readCookies(request).get(REFRESH_COOKIE);
  if (refreshToken) {
    try {
      await upstream("/auth/logout", post({ refreshToken }));
    } catch (error) {
      if (!(error instanceof AuthError) || error.status !== 401)
        return failure(error);
    }
  }
  return clearCookies(json({ authenticated: false }));
}
