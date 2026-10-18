import { createHmac, timingSafeEqual } from "crypto";

// Single-user password gate. Set MAX_PASSWORD to require a login; when it's
// unset (local development) everything is open.

export const SESSION_COOKIE = "max_session";

export function sessionToken(password: string) {
  return createHmac("sha256", password).update("max-session-v1").digest("hex");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPassword(attempt: string) {
  const password = process.env.MAX_PASSWORD;
  return !password || safeEqual(attempt, password);
}

export function isAuthed(req: Request) {
  const password = process.env.MAX_PASSWORD;
  if (!password) return true;
  const cookie = req.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return Boolean(cookie) && safeEqual(cookie!, sessionToken(password));
}

export const unauthorized = () => Response.json({ error: "Please log in" }, { status: 401 });
