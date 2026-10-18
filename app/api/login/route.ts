import { checkPassword, SESSION_COOKIE, sessionToken } from "@/lib/max/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== "string" || !checkPassword(password)) {
    return Response.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = Response.json({ ok: true });
  if (process.env.MAX_PASSWORD) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.headers.set(
      "Set-Cookie",
      `${SESSION_COOKIE}=${sessionToken(process.env.MAX_PASSWORD)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`,
    );
  }
  return res;
}
