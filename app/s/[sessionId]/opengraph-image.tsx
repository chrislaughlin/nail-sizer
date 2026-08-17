import { ImageResponse } from "next/og";

export const alt = "Nail Sizer — measure your nails from home";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PLUM = "#5C3A3A";
const CREAM = "#FAF6F2";

/** Gradient preview card for session-link previews (per tech-link design). */
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #DDC0BF 0%, #F3CFC3 46%, #D9CFE8 100%)",
          color: PLUM,
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: 1,
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <span
            style={{
              width: 46,
              height: 92,
              borderRadius: 23,
              background: CREAM,
              marginRight: 18,
            }}
          />
          <span>Nail Sizer</span>
        </div>
        <div style={{ fontSize: 44, marginTop: 28, display: "flex", gap: 14 }}>
          <span>Size your nails</span>
          <span style={{ fontSize: 48 }}>💅</span>
        </div>
        <div
          style={{
            fontSize: 26,
            marginTop: 22,
            color: "#7C5A5A",
            maxWidth: 760,
            textAlign: "center",
          }}
        >
          A bank card, your phone camera, and a chart in millimetres for your
          nail tech
        </div>
      </div>
    ),
    size
  );
}