/**
 * lib/session — opaque session links, tech-param encoding safety.
 *
 * Acceptance-critical: opaque id; tech name/contact encode → decode round
 * trip (28-char name cap); malformed/missing params handled; untrusted input
 * never lands raw in the link (base64url only).
 */
import { describe, expect, it } from "vitest";
import {
  MAX_CONTACT_HINT_LENGTH,
  MAX_TECH_NAME_LENGTH,
} from "../lib/constants";
import {
  buildSessionLink,
  decodeParam,
  encodeParam,
  isValidSessionId,
  parseSessionQuery,
  sanitizeContactHint,
  sanitizeTechName,
} from "../lib/session";

const ATTACK_NAME = 'Maya <img src=x onerror=alert(1)> & "quoted" ?#✓ 油';

describe("encodeParam / decodeParam", () => {
  it("round-trips arbitrary UTF-8 (accents, emoji, quotes, spaces)", () => {
    const samples = [
      "Maya",
      "Maya — Nails & More",
      "🧴 nail oil ✓",
      'O\'Brien "the nail guy"',
      ATTACK_NAME,
    ];
    for (const s of samples) {
      expect(decodeParam(encodeParam(s))).toBe(s);
    }
  });

  it("emits only URL-safe base64url characters and no padding", () => {
    const enc = encodeParam(ATTACK_NAME);
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(enc).not.toMatch(/[+/=]/);
  });

  it("returns null for missing or malformed input", () => {
    expect(decodeParam(null)).toBeNull();
    expect(decodeParam(undefined)).toBeNull();
    expect(decodeParam("")).toBeNull();
    expect(decodeParam("%21%21%21")).toBeNull();
    expect(decodeParam("!")).toBeNull();
  });

  it("never throws on garbage input", () => {
    for (const g of ["%%%", "abc", "a", "====", "!!!!", "xyz-_-"]) {
      expect(() => decodeParam(g)).not.toThrow();
    }
  });
});

describe("sanitization caps", () => {
  it("trims and caps the tech name at 28 chars", () => {
    expect(sanitizeTechName("  Maya  ")).toBe("Maya");
    expect(sanitizeTechName("a".repeat(40))).toHaveLength(MAX_TECH_NAME_LENGTH);
  });

  it("trims and caps the contact hint at 80 chars", () => {
    expect(sanitizeContactHint("  IG @maya  ")).toBe("IG @maya");
    expect(sanitizeContactHint("h".repeat(100))).toHaveLength(MAX_CONTACT_HINT_LENGTH);
  });
});

describe("buildSessionLink", () => {
  it("requires a non-blank tech name", () => {
    expect(() => buildSessionLink("")).toThrow(/tech name required/);
    expect(() => buildSessionLink("   ")).toThrow(/tech name required/);
  });

  it("generates an opaque UUID-shaped id and a shareable href", () => {
    const link = buildSessionLink("Maya");
    expect(isValidSessionId(link.sessionId)).toBe(true);
    expect(link.href).toMatch(/^\/s\/[0-9a-f-]{36}\?t=/);
  });

  it("contains no raw user content in the href", () => {
    const link = buildSessionLink(ATTACK_NAME, "call me <script>alert(1)</script>");
    // Encoded params only — the raw name/hint (tags, quotes, '?', '#') must
    // never appear verbatim in the URL ('&' is the URLSearchParams separator).
    expect(link.href).not.toContain("<");
    expect(link.href).not.toContain("script");
    expect(link.href).not.toContain("alert");
    expect(link.href).not.toContain("#");
    expect(link.href).not.toContain("'");
    expect(link.href).not.toContain(ATTACK_NAME);
  });

  it("round-trips through parseSessionQuery (encode → decode is lossless)", () => {
    const link = buildSessionLink("Maya", "IG @maya");
    const parsed = parseSessionQuery(new URL(link.href, "http://x").search, "fallback");
    expect(parsed.techName).toBe("Maya");
    expect(parsed.contactHint).toBe("IG @maya");
  });

  it("caps over-long names in the link and round-trip", () => {
    const link = buildSessionLink("a".repeat(40));
    const parsed = parseSessionQuery(new URL(link.href, "http://x").search, "fallback");
    expect(parsed.techName).toHaveLength(MAX_TECH_NAME_LENGTH);
  });
});

describe("parseSessionQuery", () => {
  it("falls back when params are missing", () => {
    expect(parseSessionQuery(undefined, "fb")).toEqual({ techName: "fb" });
    expect(parseSessionQuery("", "fb")).toEqual({ techName: "fb" });
    expect(parseSessionQuery("c=abc", "fb").techName).toBe("fb");
  });

  it("falls back on malformed encoded names", () => {
    expect(parseSessionQuery("t=%21%21%21", "fb").techName).toBe("fb");
    expect(parseSessionQuery("t=!!!", "fb").techName).toBe("fb");
  });

  it("drops blank contact hints", () => {
    expect(parseSessionQuery("t=" + encodeParam("Maya") + "&c=" + encodeParam("   "), "fb").contactHint).toBeUndefined();
    expect(parseSessionQuery("t=" + encodeParam("Maya"), "fb").contactHint).toBeUndefined();
  });

  it("sanitizes decoded values before returning them", () => {
    const parsed = parseSessionQuery("t=" + encodeParam("  Maya  "), "fb");
    expect(parsed.techName).toBe("Maya");
  });
});