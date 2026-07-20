import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";
const SITE_TITLE = "興櫃雷達｜獨立衍生版";
const SITE_DESCRIPTION =
  "獨立整理臺灣興櫃市場報價、公開排行、IPO 時程、事件進度與公司資訊。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s｜${SITE_TITLE}` },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/og.png", width: 1536, height: 1024 }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
