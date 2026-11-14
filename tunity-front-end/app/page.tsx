"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function LandingPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/workspace"); }, [router]);
  return <main className="account-center" role="status">Opening your band workspace…</main>;
}
