import { MAX_CONTACT_HINT_LENGTH, MAX_TECH_NAME_LENGTH } from "./constants";

export interface SessionLink {
  sessionId: string;
  techName: string;
  contactHint?: string;
  href: string;
}

/** Encode UTF-8 string as URL-safe base64 (no padding). */
export function encodeParam(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode URL-safe base64 back to a UTF-8 string; null on garbage. */
export function decodeParam(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function sanitizeTechName(name: string): string {
  return name.trim().slice(0, MAX_TECH_NAME_LENGTH);
}

export function sanitizeContactHint(hint: string): string {
  return hint.trim().slice(0, MAX_CONTACT_HINT_LENGTH);
}

export function isValidSessionId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** Build a session link from tech details (client-side, no server state). */
export function buildSessionLink(
  techName: string,
  contactHint?: string
): SessionLink {
  const name = sanitizeTechName(techName);
  if (!name) throw new Error("tech name required");
  const sessionId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : generateFallbackId();
  const params = new URLSearchParams();
  params.set("t", encodeParam(name));
  if (contactHint) params.set("c", encodeParam(sanitizeContactHint(contactHint)));
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return {
    sessionId,
    techName: name,
    contactHint: contactHint ? sanitizeContactHint(contactHint) : undefined,
    href: `${base}/s/${sessionId}?${params.toString()}`,
  };
}

/** Parse a session URL's search params into tech details. */
export function parseSessionQuery(
  search: string | undefined,
  fallbackTechName: string
): { techName: string; contactHint?: string } {
  if (!search) return { techName: fallbackTechName };
  const params = new URLSearchParams(search);
  const name = decodeParam(params.get("t"));
  const hint = decodeParam(params.get("c"));
  return {
    techName: name && name.trim() ? sanitizeTechName(name) : fallbackTechName,
    contactHint: hint && hint.trim() ? sanitizeContactHint(hint) : undefined,
  };
}

function generateFallbackId(): string {
  const hex = () =>
    Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  return `${hex()}-${hex().slice(0, 4)}-${hex().slice(0, 4)}-${hex().slice(0, 4)}-${hex()}${hex().slice(0, 4)}`;
}
