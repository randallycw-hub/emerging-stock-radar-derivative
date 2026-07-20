import type { Metadata } from "next";
import Dashboard from "../Dashboard";

export const metadata: Metadata = {
  title: "IPO 公開時程",
  description: "整理官方上市上櫃申請、審議、競拍、承銷定價及股票上市或上櫃買賣日期。",
  alternates: { canonical: "/ipo" },
};

export default function IpoPage() {
  return <Dashboard initialTab="ipo" />;
}
