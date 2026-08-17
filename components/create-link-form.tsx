"use client";

import { useMemo, useState } from "react";
import {
  MAX_CONTACT_HINT_LENGTH,
  MAX_TECH_NAME_LENGTH,
} from "@/lib/constants";
import { buildSessionLink, type SessionLink } from "@/lib/session";

export default function CreateLinkForm() {
  const [name, setName] = useState("");
  const [hint, setHint] = useState("");
  const [link, setLink] = useState<SessionLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [touched, setTouched] = useState(false);

  const nameError =
    touched && !name.trim() ? "Add your business name to create a link." : null;

  const canCreate = name.trim().length > 0;

  const previewTitle = useMemo(() => {
    const n = name.trim().slice(0, MAX_TECH_NAME_LENGTH);
    return n ? `Size your nails for ${n} 💅` : "Nail Sizer";
  }, [name]);

  const createLink = () => {
    setTouched(true);
    if (!name.trim()) return;
    setLink(buildSessionLink(name, hint));
    setCopied(false);
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for browsers without the clipboard API.
      const ta = document.createElement("textarea");
      ta.value = link.href;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // Nothing more we can do — the link is shown below for manual copy.
      }
      ta.remove();
    }
  };

  const shareLink = async () => {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: previewTitle,
          text: `Size your nails for ${link.techName} in a few minutes — no app needed 💅`,
          url: link.href,
        });
        return;
      } catch {
        // Fall through to copy.
      }
    }
    await copyLink();
  };

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          createLink();
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold text-plum">Your business name</span>
          <input
            type="text"
            value={name}
            maxLength={MAX_TECH_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="e.g. Luna Press-Ons"
            className="min-h-12 rounded-2xl border-2 border-plum/20 bg-white px-4 text-plum outline-none focus:border-plum"
            aria-describedby={nameError ? "name-error" : undefined}
          />
          <span className="text-xs text-plum-soft">
            {name.length}/{MAX_TECH_NAME_LENGTH} characters — appears on the
            customer&apos;s welcome screen and chart
          </span>
          {nameError && (
            <span id="name-error" className="text-sm font-medium text-[#A0634E]">
              {nameError}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-semibold text-plum">
            Contact hint <span className="font-normal text-plum-soft">(optional)</span>
          </span>
          <input
            type="text"
            value={hint}
            maxLength={MAX_CONTACT_HINT_LENGTH}
            onChange={(e) => setHint(e.target.value)}
            placeholder="e.g. text me the chart at +1-555-0100"
            className="min-h-12 rounded-2xl border-2 border-plum/20 bg-white px-4 text-plum outline-none focus:border-plum"
          />
          <span className="text-xs text-plum-soft">
            Shown to the customer as &quot;text me the chart at…&quot;
          </span>
        </label>

        <button
          type="submit"
          disabled={!canCreate}
          className="min-h-13 rounded-full bg-plum px-8 py-4 text-lg font-semibold text-cream transition hover:bg-plum-soft disabled:opacity-40"
        >
          Create link →
        </button>
      </form>

      {/* Link preview */}
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-3xl bg-white shadow-sm"
      >
        <div className="bg-gradient-to-r from-rose via-peach to-lilac px-6 py-8 text-center">
          <p className="font-display text-2xl text-plum">Nail Sizer</p>
          <p className="mt-1 text-lg font-semibold text-plum">{previewTitle}</p>
          <p className="mt-1 text-sm text-plum">
            A quick at-home fit check for your press-ons
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          <span className="text-xs text-plum-soft">
            This is how your link looks when it&apos;s shared
          </span>
          <span className="rounded-full bg-rose/50 px-3 py-1 text-xs font-semibold text-plum">
            💅
          </span>
        </div>
      </div>

      {link && (
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="font-semibold text-plum">Your session link</p>
          <p className="mt-1 break-all rounded-xl bg-cream-deep px-3 py-2 text-xs text-plum-soft">
            {link.href}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={copyLink}
              className="min-h-12 rounded-full bg-plum px-4 py-3 text-sm font-semibold text-cream hover:bg-plum-soft"
            >
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={shareLink}
              className="min-h-12 rounded-full border-2 border-plum/25 px-4 py-3 text-sm font-semibold text-plum"
            >
              Share…
            </button>
          </div>
          <p className="mt-3 text-xs text-plum-soft">
            Send it in WhatsApp, Instagram, or email. The link carries an
            anonymous session id — nothing is stored on our side.
          </p>
        </div>
      )}
    </div>
  );
}