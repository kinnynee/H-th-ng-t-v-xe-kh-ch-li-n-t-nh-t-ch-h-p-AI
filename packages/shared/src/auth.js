import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const TOKEN_ISSUER = "bus-ai-ticketing";
const TOKEN_AUDIENCE = "bus-ai-api";
const DEVELOPMENT_SECRET = "local-development-secret-change-before-production";

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  const isProduction = process.env.NODE_ENV === "production";
  if (secret && Buffer.byteLength(secret) >= 32 && (!isProduction || secret !== DEVELOPMENT_SECRET)) return secret;
  if (isProduction) {
    throw new Error("AUTH_SECRET must be a unique value of at least 32 bytes in production.");
  }
  return DEVELOPMENT_SECRET;
}

/** Fails fast at service startup when production authentication is misconfigured. */
export function assertAuthConfiguration() {
  authSecret();
}

function sign(value) {
  return createHmac("sha256", authSecret()).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new AuthError("Password must contain at least 8 characters.", 400);
  }
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derivedKey).toString("base64url")}`;
}

export async function verifyPassword(password, storedPassword) {
  if (typeof password !== "string" || typeof storedPassword !== "string") return false;
  const [algorithm, salt, expected] = storedPassword.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return safeEqual(password, storedPassword);
  const derivedKey = await scrypt(password, salt, 64);
  return safeEqual(Buffer.from(derivedKey).toString("base64url"), expected);
}

export function isPasswordHash(value) {
  return typeof value === "string" && value.startsWith("scrypt$");
}

export function issueAccessToken(user, { expiresInSeconds = 60 * 60 * 8 } = {}) {
  if (!user?.id || !user?.role) throw new Error("Cannot issue a token without user id and role.");
  const now = Math.floor(Date.now() / 1_000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: user.id,
    role: user.role,
    email: user.email ?? "",
    iss: TOKEN_ISSUER,
    aud: TOKEN_AUDIENCE,
    iat: now,
    exp: now + expiresInSeconds
  });
  const signed = `${header}.${payload}`;
  return `${signed}.${sign(signed)}`;
}

export function getBearerToken(headers) {
  const authorization = typeof headers?.get === "function"
    ? headers.get("authorization")
    : headers?.authorization;
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization ?? "").trim());
  return match?.[1] ?? null;
}

export function authenticate(headers) {
  const token = getBearerToken(headers);
  if (!token) throw new AuthError("Authentication is required.");
  const [header, payload, signature, ...rest] = token.split(".");
  if (!header || !payload || !signature || rest.length || !safeEqual(sign(`${header}.${payload}`), signature)) {
    throw new AuthError("Invalid access token.");
  }

  let claims;
  try {
    claims = decode(payload);
  } catch {
    throw new AuthError("Invalid access token.");
  }
  const now = Math.floor(Date.now() / 1_000);
  if (
    !claims.sub ||
    !claims.role ||
    claims.iss !== TOKEN_ISSUER ||
    claims.aud !== TOKEN_AUDIENCE ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= now
  ) {
    throw new AuthError("Access token has expired or is invalid.");
  }
  return { id: claims.sub, role: claims.role, email: claims.email ?? "" };
}

export function authorize(user, roles) {
  if (!user) throw new AuthError("Authentication is required.");
  if (!roles.includes(user.role)) throw new AuthError("You do not have permission for this action.", 403);
  return user;
}
