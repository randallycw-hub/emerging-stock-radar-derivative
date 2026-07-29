import type { Metadata } from "next";
import BondDetailClient from "../BondDetailClient";

export const metadata: Metadata = {
  title: "可轉債契約詳細資料",
  description: "查閱正式發布快照中的可轉債發行條件與契約欄位。",
};

export default async function BondDetailPage({ params }: { params: Promise<{ bondCode: string }> }) {
  const { bondCode } = await params;
  return <BondDetailClient bondCode={decodeURIComponent(bondCode)} />;
}
