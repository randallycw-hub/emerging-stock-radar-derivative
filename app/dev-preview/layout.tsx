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

const previewThemeScript = `
  (() => {
    const root = document.currentScript?.parentElement;
    if (!root) return;
    try {
      if (window.localStorage.getItem("xingzhai-preview-theme") === "a") {
        root.dataset.previewTheme = "a";
      }
    } catch {
      root.dataset.previewTheme = "b";
    }
  })();
`;

export const metadata: Metadata = {
  title: "開發預覽",
  description: "興債觀測網本機開發預覽",
  robots: { index: false, follow: false },
};

export default function DevPreviewLayout({ children }: { children: ReactNode }) {
  if (!isPreviewDevelopmentRuntime()) notFound();

  return (
    <div
      className="preview-root"
      data-preview-theme="b"
      suppressHydrationWarning
    >
      <script dangerouslySetInnerHTML={{ __html: previewThemeScript }} />
      <PreviewHeader />
      <main className="preview-main">
        <PreviewBanner />
        {children}
      </main>
      <PreviewFooter />
    </div>
  );
}
