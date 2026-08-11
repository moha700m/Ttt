import crypto from "node:crypto";

export function sha256(data: Buffer | string) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function createCapabilityToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return sha256(token);
}

export function safeFilename(filename: string) {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.slice(-120) || "document";
}

export function requireAdmin(request: Request) {
  const token = request.headers.get("x-admin-token");
  const expected = process.env.ADMIN_SESSION_SECRET || "test-admin-token";
  if (!token || token !== expected) throw new Error("ADMIN_UNAUTHORIZED");
}
