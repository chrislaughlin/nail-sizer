"use client";

interface PoseProps {
  caption: string;
  className?: string;
}

const stroke = "#5C3A3A";
const fillRose = "#DDC0BF";
const fillRoseLight = "#EBD6D4";
const fillCream = "#FAF6F2";

/** Top-down: flat hand + card beside it (calibration / width poses). */
export function PoseHandAndCard({ caption, className }: PoseProps) {
  return (
    <figure className={className}>
      <svg
        viewBox="0 0 260 150"
        role="img"
        aria-label="A flat hand with a card beside it, seen from above"
        className="w-full"
      >
        {/* card */}
        <rect
          x="150"
          y="30"
          width="95"
          height="60"
          rx="8"
          fill={fillRoseLight}
          stroke={stroke}
          strokeWidth="2.5"
        />
        <line x1="162" y1="50" x2="205" y2="50" stroke={stroke} strokeWidth="2" strokeDasharray="4 4" />
        <line x1="162" y1="62" x2="195" y2="62" stroke={stroke} strokeWidth="2" strokeDasharray="4 4" />
        <circle cx="176" cy="76" r="5" fill="none" stroke={stroke} strokeWidth="2" />
        {/* hand: palm + 5 fingers up */}
        <g stroke={stroke} strokeWidth="2.5" fill={fillCream}>
          <rect x="46" y="62" width="80" height="64" rx="26" />
          <rect x="34" y="14" width="20" height="56" rx="10" />
          <rect x="60" y="6" width="20" height="64" rx="10" />
          <rect x="86" y="6" width="20" height="64" rx="10" />
          <rect x="112" y="20" width="20" height="52" rx="10" />
        </g>
        <g fill={fillRose} stroke={stroke} strokeWidth="2">
          <ellipse cx="44" cy="16" rx="9" ry="8" />
          <ellipse cx="70" cy="8" rx="9" ry="8" />
          <ellipse cx="96" cy="8" rx="9" ry="8" />
          <ellipse cx="122" cy="22" rx="9" ry="8" />
        </g>
      </svg>
      <figcaption className="mt-2 text-center text-sm text-plum-soft">
        {caption}
      </figcaption>
    </figure>
  );
}

/** Top-down: flat hand with visible nails. */
export function PoseWidthHand({ caption, className }: PoseProps) {
  return (
    <figure className={className}>
      <svg
        viewBox="0 0 260 170"
        role="img"
        aria-label="A flat hand with nails facing the camera, seen from above"
        className="w-full"
      >
        <g stroke={stroke} strokeWidth="2.5" fill={fillCream}>
          <rect x="80" y="78" width="96" height="70" rx="30" />
          <rect x="62" y="22" width="24" height="64" rx="12" />
          <rect x="92" y="14" width="24" height="72" rx="12" />
          <rect x="122" y="14" width="24" height="72" rx="12" />
          <rect x="152" y="30" width="24" height="58" rx="12" />
        </g>
        {/* nails (rose tips) */}
        <g fill={fillRose} stroke={stroke} strokeWidth="2">
          <ellipse cx="74" cy="24" rx="11" ry="10" />
          <ellipse cx="104" cy="16" rx="11" ry="10" />
          <ellipse cx="134" cy="16" rx="11" ry="10" />
          <ellipse cx="164" cy="32" rx="11" ry="10" />
          <ellipse cx="128" cy="70" rx="13" ry="11" />
        </g>
      </svg>
      <figcaption className="mt-2 text-center text-sm text-plum-soft">
        {caption}
      </figcaption>
    </figure>
  );
}

/** End-on: curled fingers pointing at the camera. */
export function PoseEndOn({ caption, className }: PoseProps) {
  return (
    <figure className={className}>
      <svg
        viewBox="0 0 260 170"
        role="img"
        aria-label="A loose fist seen from the fingertips, with the free edges of the nails facing the camera"
        className="w-full"
      >
        {/* forearm */}
        <path
          d="M70 160 L80 104 Q86 78 104 78 L168 78 Q186 78 192 104 L202 160 Z"
          fill={fillCream}
          stroke={stroke}
          strokeWidth="2.5"
        />
        {/* fingertip circles with nail arcs */}
        <g fill={fillCream} stroke={stroke} strokeWidth="2.5">
          <circle cx="92" cy="66" r="20" />
          <circle cx="124" cy="52" r="22" />
          <circle cx="156" cy="52" r="22" />
          <circle cx="184" cy="66" r="20" />
        </g>
        {/* nail free edges (arcs at the top of each fingertip) */}
        <g fill="none" stroke={fillRose} strokeWidth="5" strokeLinecap="round">
          <path d="M82 58 A20 20 0 0 1 102 58" />
          <path d="M112 42 A22 22 0 0 1 136 42" />
          <path d="M144 42 A22 22 0 0 1 168 42" />
          <path d="M174 58 A20 20 0 0 1 194 58" />
        </g>
      </svg>
      <figcaption className="mt-2 text-center text-sm text-plum-soft">
        {caption}
      </figcaption>
    </figure>
  );
}