import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
// 자체 호스팅. CDN을 쓰면 9/7~9/11 무중단 조건에 외부 의존이 하나 늘어난다.
// dynamic-subset은 쓰이는 글자만 받아 한글 폰트 용량 문제를 피한다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "페이체크 — 급여명세서, 제대로 받고 있나요?",
  description:
    "한국에서 일하는 외국인 근로자의 급여명세서를 2026년 법정 기준과 대조해 잘못 떼인 금액을 찾습니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
