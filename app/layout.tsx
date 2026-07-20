import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";
const SITE_TITLE = "興債觀測網";
const SITE_DESCRIPTION = "興櫃公司、可轉債與上市櫃進度資訊";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s｜${SITE_TITLE}` },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_TITLE,
    locale: "zh_TW",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
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
