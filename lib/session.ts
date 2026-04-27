import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

const SESSION_COOKIE = "tasker_session";
const SESSION_TTL_DAYS = 30;

export interface SessionPayload {
  userId: string;
  email: string;
  role: "admin" | "manager" | "lead" | "dev";
  name: string;
  // jose's standard claims
  iat?: number;
  exp?: number;
}

function secretKey() {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

export async function signSession(payload: Omit<SessionPayload, "iat" | "exp">): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .setSubject(payload.userId)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: Omit<SessionPayload, "iat" | "exp">) {
  const token = await signSession(payload);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  cookies().delete(SESSION_COOKIE);
}

/**
 * Read the current session from cookies. Returns null if missing or invalid.
 * Use this in server components and route handlers.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return await verifySession(token);
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
