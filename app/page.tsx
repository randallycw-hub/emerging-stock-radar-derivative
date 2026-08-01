import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "可轉債與興櫃盤後資訊",
  description: "整理可轉債、興櫃盤後資料與 IPO 公開行程。",
  alternates: { canonical: "/" },
};

export default function Home() {
  redirect("/market-site/index.html");
}
