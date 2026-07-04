import crypto from "node:crypto";

const tokens = new Map();
const TOKEN_TTL_MS = 30 * 60_000;

function configuredPin() {
  return process.env.HUD_CONTROL_PIN || "";
}

export function controlStatus() {
  return {
    enabled: configuredPin().length > 0,
    ttlMs: TOKEN_TTL_MS
  };
}

export function unlockControl(pin) {
  if (!configuredPin()) {
    return { ok: false, reason: "pin_not_configured" };
  }

  if (String(pin || "") !== configuredPin()) {
    return { ok: false, reason: "invalid_pin" };
  }

  const token = crypto.randomBytes(24).toString("hex");
  tokens.set(token, Date.now() + TOKEN_TTL_MS);

  return {
    ok: true,
    token,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString()
  };
}

export function lockControl(token) {
  if (token) tokens.delete(token);
  return { ok: true };
}

export function isControlTokenValid(token) {
  if (!token) return false;

  const expiresAt = tokens.get(token);
  if (!expiresAt) return false;

  if (Date.now() > expiresAt) {
    tokens.delete(token);
    return false;
  }

  return true;
}

export function requireControl(req, res, next) {
  if (!configuredPin()) {
    res.status(403).json({ error: "pin_not_configured" });
    return;
  }

  if (!isControlTokenValid(req.get("X-HUD-Control-Token"))) {
    res.status(401).json({ error: "locked" });
    return;
  }

  next();
}
