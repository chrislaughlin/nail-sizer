import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MeasurementFlow from "@/components/flow/measurement-flow";
import { isValidSessionId, parseSessionQuery } from "@/lib/session";

interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: SessionPageProps): Promise<Metadata> {
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) return { title: "Nail Sizer" };
  const sp = await searchParams;
  const { techName } = parseSessionQuery(
    sp.t ? String(sp.t) : undefined,
    "your nail tech"
  );
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
  const { techName, contactHint } = parseSessionQuery(
    sp.t ? String(sp.t) : undefined,
    "your nail tech"
  );
  return (
    <MeasurementFlow
      sessionId={sessionId}
      techName={techName}
      contactHint={contactHint}
    />
  );
}