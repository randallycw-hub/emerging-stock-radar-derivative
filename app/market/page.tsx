import type { Metadata } from "next";
import Dashboard from "../Dashboard";

export const metadata: Metadata = {
  title: "資料來源建置狀態",
  description: "興債觀測網的官方資料來源建置狀態；目前不提供市場行情。",
  alternates: { canonical: "/market" },
};

export default function MarketPage() {
  return <Dashboard initialTab="market" />;
}
