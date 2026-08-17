import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MeasurementFlow from "@/components/flow/measurement-flow";
import { isValidSessionId, parseSessionQuery } from "@/lib/session";

interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type SessionSearchParams = { [key: string]: string | string[] | undefined };

function sessionQueryString(sp: SessionSearchParams): string | undefined {
  const qs = new URLSearchParams();
  for (const key of ["t", "c"] as const) {
    const value = sp[key];
    if (value !== undefined) qs.set(key, String(value));
  }
  const out = qs.toString();
  return out || undefined;
}

function sessionDetails(sp: SessionSearchParams): {
  techName: string;
  contactHint?: string;
} {
  return parseSessionQuery(sessionQueryString(sp), "your nail tech");
}

export async function generateMetadata({
  params,
  searchParams,
}: SessionPageProps): Promise<Metadata> {
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) return { title: "Nail Sizer" };
  const sp = await searchParams;
  const { techName } = sessionDetails(sp);
  const title = `Size your nails for ${techName} 💅`;
  return {
    title,
    description: `Measure your nails for ${techName} in a few minutes — just a bank card, no app to install.`,
  };
}

export default async function SessionPage({
  params,
  searchParams,
}: SessionPageProps) {
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) notFound();
  const sp = await searchParams;
  const { techName, contactHint } = sessionDetails(sp);
  return (
    <MeasurementFlow
      sessionId={sessionId}
      techName={techName}
      contactHint={contactHint}
    />
  );
}