import type { Metadata } from "next";
import Homepage from "./Homepage";

export const metadata: Metadata = {
  title: "興債資訊觀測站",
  description: "以官方公開資料整理興櫃公司、可轉債與上市櫃進度的只讀研究入口。",
  alternates: { canonical: "/" },
};

export default function Home() {
  return <Homepage />;
}
