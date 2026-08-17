"use client";

import { useEffect, useRef } from "react";
import { drawWorkingImage, type WorkingImage } from "@/lib/cv/image";
import type { Finger, Point } from "@/lib/types";

export interface Guide2D {
  id: number;
  p1: Point;
  p2: Point;
  /** Which nail this guide measures, when it belongs to the width flow. */
  finger?: Finger;
}

/** Mounts an offscreen canvas into the DOM for display + overlay drawing. */
export function CanvasHost({
  canvas,
  className,
}: {
  canvas: HTMLCanvasElement;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.appendChild(canvas);
    return () => {
      if (canvas.parentElement === host) host.removeChild(canvas);
    };
  }, [canvas]);
  return <div ref={hostRef} className={className} aria-hidden="true" />;
}

interface OverlayCanvasProps {
  canvas: HTMLCanvasElement;
  image: WorkingImage;
}

interface GuideOverlayProps extends OverlayCanvasProps {
  guides: Guide2D[];
  selectedId: number | null;
  /** When true, the next tap on the photo places a new guide. */
  placing: boolean;
  outOfRangeIds: number[];
  onGuidesChange: (guides: Guide2D[]) => void;
  onSelect: (id: number | null) => void;
  onPlaced: (point: Point) => void;
}

const PLUM = "#5C3A3A";
const ROSE = "#DDC0BF";
const ROSE_DEEP = "#C9A3A2";
const WARN = "#A0634E";
const CREAM = "#FAF6F2";

/**
 * Interactive width-guide editor: drag the endpoints or the middle of a
 * guide to adjust; tap a guide to select; tap empty space while "placing"
 * to drop a new guide. Draws on top of the frozen frame canvas.
 */
export function GuideOverlay({
  canvas,
  image,
  guides,
  selectedId,
  placing,
  outOfRangeIds,
  onGuidesChange,
  onSelect,
  onPlaced,
}: GuideOverlayProps) {
  const dragRef = useRef<{
    guideId: number;
    handle: "p1" | "p2" | "mid";
    offset: Point;
  } | null>(null);

  useEffect(() => {
    redraw(canvas, image, guides, selectedId, outOfRangeIds);
  }, [canvas, image, guides, selectedId, outOfRangeIds]);

  const toCanvasPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const hitHandle = (p: Point): { guideId: number; handle: "p1" | "p2" | "mid" } | null => {
    for (const g of guides) {
      const mid = { x: (g.p1.x + g.p2.x) / 2, y: (g.p1.y + g.p2.y) / 2 };
      if (dist(p, g.p1) < 18) return { guideId: g.id, handle: "p1" };
      if (dist(p, g.p2) < 18) return { guideId: g.id, handle: "p2" };
      if (dist(p, mid) < 16) return { guideId: g.id, handle: "mid" };
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = toCanvasPoint(e);
    const hit = hitHandle(p);
    if (hit) {
      const g = guides.find((x) => x.id === hit.guideId);
      if (!g) return;
      onSelect(hit.guideId);
      const base = hit.handle === "p1" ? g.p1 : hit.handle === "p2" ? g.p2 : mid(g);
      dragRef.current = { ...hit, offset: { x: p.x - base.x, y: p.y - base.y } };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (placing) {
      onPlaced(p);
      return;
    }
    onSelect(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toCanvasPoint(e);
    const next = guides.map((g) => {
      if (g.id !== drag.guideId) return g;
      const nx = p.x - drag.offset.x;
      const ny = p.y - drag.offset.y;
      const clamped = {
        x: Math.min(canvas.width - 2, Math.max(2, nx)),
        y: Math.min(canvas.height - 2, Math.max(2, ny)),
      };
      if (drag.handle === "p1") return { ...g, p1: clamped };
      if (drag.handle === "p2") return { ...g, p2: clamped };
      const dx = clamped.x - mid(g).x;
      const dy = clamped.y - mid(g).y;
      return {
        ...g,
        p1: { x: g.p1.x + dx, y: g.p1.y + dy },
        p2: { x: g.p2.x + dx, y: g.p2.y + dy },
      };
    });
    onGuidesChange(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <canvas
      className="block h-auto w-full touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label="Photo with nail width lines you can drag"
      role="img"
    />
  );
}

/** 4 draggable corner handles for manual card calibration. */
export function CornerOverlay({
  canvas,
  image,
  corners,
  onChange,
}: OverlayCanvasProps & {
  corners: Point[];
  onChange: (corners: Point[]) => void;
}) {
  const dragRef = useRef<{ index: number } | null>(null);

  useEffect(() => {
    redrawCorners(canvas, image, corners);
  }, [canvas, image, corners]);

  const toCanvasPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = toCanvasPoint(e);
    let best = -1;
    let bestD = 24;
    corners.forEach((c, i) => {
      const d = dist(p, c);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) {
      dragRef.current = { index: best };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toCanvasPoint(e);
    const next = corners.map((c, i) =>
      i === drag.index
        ? {
            x: Math.min(canvas.width - 4, Math.max(4, p.x)),
            y: Math.min(canvas.height - 4, Math.max(4, p.y)),
          }
        : c
    );
    onChange(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <canvas
      className="block h-auto w-full touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label="Drag the four corners to outline your card"
      role="img"
    />
  );
}

function mid(g: Guide2D): Point {
  return { x: (g.p1.x + g.p2.x) / 2, y: (g.p1.y + g.p2.y) / 2 };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function redraw(
  canvas: HTMLCanvasElement,
  image: WorkingImage,
  guides: Guide2D[],
  selectedId: number | null,
  outOfRangeIds: number[]
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawWorkingImage(canvas, image);
  ctx.lineWidth = Math.max(3, canvas.width / 260);
  ctx.font = `600 ${Math.max(13, canvas.width / 55)}px Geist, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const g of guides) {
    const selected = g.id === selectedId;
    const bad = outOfRangeIds.includes(g.id);
    ctx.strokeStyle = bad ? WARN : selected ? ROSE_DEEP : PLUM;
    ctx.setLineDash(selected || bad ? [] : [10, 7]);
    ctx.beginPath();
    ctx.moveTo(g.p1.x, g.p1.y);
    ctx.lineTo(g.p2.x, g.p2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // endpoint handles
    for (const p of [g.p1, g.p2]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, canvas.width / 85, 0, Math.PI * 2);
      ctx.fillStyle = bad ? WARN : selected ? ROSE_DEEP : ROSE;
      ctx.fill();
      ctx.strokeStyle = CREAM;
      ctx.lineWidth = Math.max(2, canvas.width / 350);
      ctx.stroke();
    }
    // number badge
    const m = mid(g);
    ctx.beginPath();
    ctx.arc(m.x, m.y, canvas.width / 50, 0, Math.PI * 2);
    ctx.fillStyle = PLUM;
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.fillText(String(g.id + 1), m.x, m.y + 1);
  }

  if (guides.length === 0 && !selectedId) {
    ctx.font = `500 ${Math.max(15, canvas.width / 50)}px Geist, system-ui, sans-serif`;
    ctx.fillStyle = PLUM;
    ctx.fillText("Tap a nail below, then tap your nail in the photo", canvas.width / 2, canvas.height / 2);
  }
}

function redrawCorners(
  canvas: HTMLCanvasElement,
  image: WorkingImage,
  corners: Point[]
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawWorkingImage(canvas, image);
  if (corners.length !== 4) return;
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = Math.max(3, canvas.width / 260);
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `600 ${Math.max(13, canvas.width / 60)}px Geist, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  corners.forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, canvas.width / 45, 0, Math.PI * 2);
    ctx.fillStyle = ROSE_DEEP;
    ctx.fill();
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = CREAM;
    ctx.fillText(String(i + 1), c.x, c.y + 1);
  });
}