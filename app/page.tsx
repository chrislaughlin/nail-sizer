import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-6 py-16 text-center">
      <span className="rounded-full bg-rose/60 px-4 py-1.5 text-sm font-semibold text-plum">
        For custom press-on nail makers
      </span>
      <h1 className="mt-6 font-display text-5xl leading-tight text-plum sm:text-6xl">
        Press-ons that fit,
        <br />
        without the back-and-forth
      </h1>
      <p className="mt-5 max-w-xl text-lg text-plum-soft">
        Send your customer a link. They measure their nails with a bank card
        and their phone camera — you get a chart with every nail in
        millimetres, ready to build from.
      </p>
      <Link
        href="/create"
        className="mt-8 rounded-full bg-plum px-10 py-4 text-lg font-semibold text-cream transition hover:bg-plum-soft"
      >
        Create your link →
      </Link>

      <div className="mt-16 grid w-full gap-4 text-left sm:grid-cols-3">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-3xl" aria-hidden="true">💳</p>
          <h2 className="mt-3 font-display text-xl text-plum">A card is the ruler</h2>
          <p className="mt-2 text-sm text-plum-soft">
            The app measures against the bank or ID card in the photo — no
            rulers, no guesswork, no mail-in kits.
          </p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-3xl" aria-hidden="true">📸</p>
          <h2 className="mt-3 font-display text-xl text-plum">Guided, not automatic</h2>
          <p className="mt-2 text-sm text-plum-soft">
            Every line your customer confirms themselves, and every number
            they can double-check before it&apos;s shared.
          </p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-3xl" aria-hidden="true">🔒</p>
          <h2 className="mt-3 font-display text-xl text-plum">Private by design</h2>
          <p className="mt-2 text-sm text-plum-soft">
            Photos are measured on the customer&apos;s phone and never
            uploaded. The chart they share carries no photos.
          </p>
        </div>
      </div>

      <p className="mt-14 max-w-lg text-sm text-plum-soft">
        Nail Sizer helps you and your customer measure — your experience still
        does the fitting. Widths are chord measurements at the widest point of
        the nail bed; sizes differ by brand, so share millimetres.
      </p>
    </main>
  );
}