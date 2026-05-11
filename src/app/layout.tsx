import type { Metadata, Viewport } from "next";
import "./globals.scss";

export const metadata: Metadata = {
  title: "AI Navigation",
  description: "把骑行路线 JSON 转成高德地图预览和骑行分享链接。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
