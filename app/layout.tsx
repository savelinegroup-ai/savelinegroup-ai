import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Max — AI Manager",
  description: "Max keeps your team's work organized, prioritized, and moving.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
