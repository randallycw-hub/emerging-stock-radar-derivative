import type { Metadata } from "next";
import Dashboard from "../Dashboard";

export const metadata: Metadata = {
  title: "上市櫃公開進度",
  description: "依官方送件、審議、核准、競拍與買賣日公告整理公司進度，不代表投資建議。",
  alternates: { canonical: "/radar" },
};

export default function RadarPage() {
  return <Dashboard initialTab="radar" />;
}
