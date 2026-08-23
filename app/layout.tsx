import type { Metadata } from "next";
import { Be_Vietnam_Pro, Lora } from "next/font/google";
import "./globals.css";

const sans = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const serif = Lora({
  variable: "--font-serif",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "Đăng nhập | Ms Ngân English",
  description: "Không gian quản lý lớp học và hành trình học tiếng Anh.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className={`${sans.variable} ${serif.variable}`}>{children}</body>
    </html>
  );
}
