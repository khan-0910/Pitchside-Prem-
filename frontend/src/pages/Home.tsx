import { lazy, Suspense } from "react";

import { SiteFooter } from "@/components/layout/SiteFooter";
import { Hero } from "@/features/home/Hero";
import { LedBoards } from "@/features/home/LedBoards";
import { Tunnel } from "@/features/home/Tunnel";

const Journey = lazy(() => import("@/features/home/Journey"));

export default function Home() {
  return (
    <main>
      <Hero />
      <Tunnel />
      <LedBoards />
      <Suspense fallback={<div className="min-h-dvh" />}>
        <Journey />
      </Suspense>
      <SiteFooter className="bg-[#0f1512] px-5 py-6 text-white/75 sm:px-[5.5vw]" />
    </main>
  );
}
