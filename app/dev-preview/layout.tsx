import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  PreviewBanner,
  PreviewFooter,
  PreviewHeader,
} from "./_components/PreviewUi.tsx";
import { isPreviewDevelopmentRuntime } from "../../lib/preview/runtime.ts";
import "./preview.css";

export const metadata: Metadata = {
  title: "開發預覽",
  description: "興債觀測網本機開發預覽",
  robots: { index: false, follow: false },
};

export default function DevPreviewLayout({ children }: { children: ReactNode }) {
  if (!isPreviewDevelopmentRuntime()) notFound();

  return (
    <div className="preview-root">
      <PreviewHeader />
      <main className="preview-main">
        <PreviewBanner />
        {children}
      </main>
      <PreviewFooter />
    </div>
  );
}
