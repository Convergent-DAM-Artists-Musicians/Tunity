import { notFound } from "next/navigation";
import { Preview } from "./preview";
export default async function Page({ searchParams }: {
  searchParams: Promise<{ sample?: string | string[] }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { sample } = await searchParams;
  const initialSample = typeof sample === "string" && ["05-verified", "09-verified"].includes(sample) ? sample : "05-verified";
  return <Preview key={initialSample} initialSample={initialSample} />;
}
