import type { Metadata } from "next";
import CreateLinkForm from "@/components/create-link-form";

export const metadata: Metadata = {
  title: "Create your link",
  description:
    "Create a session link for your customer — they measure their nails and send you the chart.",
};

export default function CreatePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-12">
      <div className="mb-8 text-center">
        <span className="font-display text-3xl text-plum">Nail Sizer</span>
        <h1 className="mt-4 font-display text-4xl text-plum">
          Make a sizing link
        </h1>
        <p className="mt-2 text-plum-soft">
          One link per customer. They open it on their phone, measure their
          nails, and send the chart back to you.
        </p>
      </div>
      <CreateLinkForm />
    </main>
  );
}