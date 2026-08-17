/**
 * app/s/[sessionId]/page — QA-1 regression: the page must pass a FULL
 * query string (t AND c) into parseSessionQuery, never the bare encoded
 * value, so the tech name decodes and the contact hint reaches
 * MeasurementFlow instead of silently falling back to "your nail tech".
 *
 * Drives the REAL page module (generateMetadata + SessionPage) in the
 * node env with only next/navigation and MeasurementFlow mocked — a
 * DOM-less react-dom/server harness that exercises the page's actual
 * call sites (sessionQueryString -> parseSessionQuery) end to end.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { encodeParam } from "../lib/session";
import SessionPage, { generateMetadata } from "../app/s/[sessionId]/page";

const SESSION_ID = "8f14e45f-ceea-4671-9e3a-0f1a2b3c4d5e";

/** Captures the props MeasurementFlow receives from the page. */
const flowRender = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
/** Real notFound() throws NEXT_HTTP_ERROR_FALLBACK; mirror that. */
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK");
  })
);

vi.mock("next/navigation", () => ({ notFound }));

vi.mock("@/components/flow/measurement-flow", async () => {
  const { createElement } = await import("react");
  return {
    default: (props: Record<string, unknown>) => {
      flowRender.props.push(props);
      return createElement("div", {
        "data-testid": "measurement-flow",
        "data-tech": String(props.techName ?? ""),
        "data-contact": String(props.contactHint ?? ""),
      });
    },
  };
});

type SP = Record<string, string | undefined>;

function sp(values: SP): { searchParams: Promise<SP> } {
  return { searchParams: Promise.resolve(values) };
}

describe("generateMetadata (server call site)", () => {
  it("decodes the tech name from the t param into the page title", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ sessionId: SESSION_ID }),
      ...sp({ t: encodeParam("Maya — Nails & More") }),
    });
    expect(meta.title).toBe("Size your nails for Maya — Nails & More 💅");
  });

  it("falls back to 'your nail tech' when t is fatal-decoder garbage or absent", async () => {
    for (const searchParams of [
      { t: "abc" }, // well-formed base64url, invalid UTF-8 -> fatal decode -> null
      { t: "%21%21%21" },
      {},
      { c: encodeParam("IG @maya") },
    ]) {
      const meta = await generateMetadata({
        params: Promise.resolve({ sessionId: SESSION_ID }),
        searchParams: Promise.resolve(searchParams),
      });
      expect(meta.title).toBe("Size your nails for your nail tech 💅");
    }
  });

  it("keeps isValidSessionId gating: invalid id gets the generic title", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ sessionId: "not-a-uuid" }),
      ...sp({ t: encodeParam("Maya") }),
    });
    expect(meta.title).toBe("Nail Sizer");
  });
});

describe("SessionPage render (server call site)", () => {
  beforeEach(() => {
    flowRender.props.length = 0;
    notFound.mockClear();
  });

  async function renderPage(searchParams: SP): Promise<string> {
    const element = await SessionPage({
      params: Promise.resolve({ sessionId: SESSION_ID }),
      searchParams: Promise.resolve(searchParams),
    });
    return renderToString(element);
  }

  it("decodes tech name AND contact from the query string and passes both to MeasurementFlow", async () => {
    const html = await renderPage({
      t: encodeParam("Maya"),
      c: encodeParam("IG @maya.nails"),
    });
    expect(html).toContain('data-testid="measurement-flow"');
    expect(html).toContain('data-tech="Maya"');
    expect(html).toContain('data-contact="IG @maya.nails"');
    expect(flowRender.props).toEqual([
      { sessionId: SESSION_ID, techName: "Maya", contactHint: "IG @maya.nails" },
    ]);
  });

  it("falls back to 'your nail tech' with no contactHint on garbage params", async () => {
    const html = await renderPage({ t: "abc", c: "xyz-_-" });
    expect(html).toContain('data-tech="your nail tech"');
    expect(html).toContain('data-contact=""');
    expect(flowRender.props[0].techName).toBe("your nail tech");
    expect(flowRender.props[0].contactHint).toBeUndefined();
  });

  it("falls back cleanly when search params are absent entirely", async () => {
    const html = await renderPage({});
    expect(html).toContain('data-tech="your nail tech"');
    expect(flowRender.props[0]).toEqual({
      sessionId: SESSION_ID,
      techName: "your nail tech",
      contactHint: undefined,
    });
    expect(flowRender.props[0].contactHint).toBeUndefined();
  });

  it("keeps isValidSessionId gating: invalid id calls notFound and never renders the flow", async () => {
    await expect(
      SessionPage({
        params: Promise.resolve({ sessionId: "nope" }),
        searchParams: Promise.resolve({ t: encodeParam("Maya") }),
      })
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(flowRender.props).toHaveLength(0);
  });
});