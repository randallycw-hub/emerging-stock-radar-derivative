import type { Metadata } from "next";
import Dashboard from "../Dashboard";

export const metadata: Metadata = {
  title: "可轉債契約資料",
  description: "可轉債官方發行條件、契約事件與來源發布狀態。",
  alternates: { canonical: "/bonds" },
};

export default function BondsPage() {
  return <Dashboard initialTab="bonds" />;
}
