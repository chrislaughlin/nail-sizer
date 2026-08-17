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

  it("rejects valid base64url that is not valid UTF-8 (no mojibake)", () => {
    // "abc" is well-formed base64url but decodes to bytes 0x69 0xB7 — an
    // invalid UTF-8 sequence. The fatal decoder must fall back to null, not
    // return a U+FFFD replacement string that passes the truthiness checks.
    expect(decodeParam("abc")).toBeNull();
    expect(decodeParam("xyz-_-")).toBeNull();
    expect(parseSessionQuery("t=abc", "fb").techName).toBe("fb");
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

describe("QA-1 regression: page call-site shape (full query string, never the bare value)", () => {
  // The session page (app/s/[sessionId]/page.tsx) builds its query string
  // from raw searchParams — t and c — and passes THAT to parseSessionQuery,
  // never the bare encoded value (which decoded to nothing and fell back to
  // "your nail tech"). Pin the exact call-site shape here so the page-side
  // contract cannot silently regress again.
  function pageQueryString(
    sp: Record<string, string | undefined>
  ): string | undefined {
    const qs = new URLSearchParams();
    for (const key of ["t", "c"] as const) {
      const value = sp[key];
      if (value !== undefined) qs.set(key, String(value));
    }
    const out = qs.toString();
    return out || undefined;
  }

  const PAGE_FALLBACK = "your nail tech";

  it("decodes tech name AND contact from a query built at the page call-site shape", () => {
    const sp = { t: encodeParam("Maya"), c: encodeParam("IG @maya.nails") };
    const parsed = parseSessionQuery(pageQueryString(sp), PAGE_FALLBACK);
    expect(parsed.techName).toBe("Maya");
    expect(parsed.contactHint).toBe("IG @maya.nails");
  });

  it("decodes t even when c is absent (c must never block the name)", () => {
    const parsed = parseSessionQuery(
      pageQueryString({ t: encodeParam("Maya") }),
      PAGE_FALLBACK
    );
    expect(parsed.techName).toBe("Maya");
    expect(parsed.contactHint).toBeUndefined();
  });

  it("regression: the BARE encoded value (pre-fix behavior) decodes to nothing — the query string is required", () => {
    const bare = encodeParam("Maya");
    // Pre-fix call site: parseSessionQuery(sp.t) — the bare value, not a
    // query string. URLSearchParams treats it as a stray empty param.
    expect(parseSessionQuery(bare, PAGE_FALLBACK).techName).toBe(PAGE_FALLBACK);
    // Post-fix call site: the value goes through a real query string.
    expect(parseSessionQuery(`t=${bare}`, PAGE_FALLBACK).techName).toBe("Maya");
  });

  it("fatal-decoder garbage and absent params fall back cleanly", () => {
    for (const sp of [
      { t: "abc" }, // well-formed base64url, invalid UTF-8 -> fatal decode
      { t: "%21%21%21" },
      { c: "xyz" },
      {},
    ]) {
      const parsed = parseSessionQuery(pageQueryString(sp), PAGE_FALLBACK);
      expect(parsed.techName).toBe(PAGE_FALLBACK);
      expect(parsed.contactHint).toBeUndefined();
    }
  });
});

describe("isValidSessionId gating (page guard, untouched by QA-1 fix)", () => {
  it("accepts canonical UUID shapes, case-insensitively", () => {
    expect(isValidSessionId("8f14e45f-ceea-4671-9e3a-0f1a2b3c4d5e")).toBe(true);
    expect(isValidSessionId("8F14E45F-CEEA-4671-9E3A-0F1A2B3C4D5E")).toBe(true);
  });

  it("rejects non-UUID garbage", () => {
    for (const id of [
      "",
      "abc",
      "not-a-uuid",
      "8f14e45f-ceea-4671-9e3a-0f1a2b3c4d5eX", // extra char
      "8f14e45fceea46719e3a0f1a2b3c4d5e", // no dashes
    ]) {
      expect(isValidSessionId(id)).toBe(false);
    }
  });
});