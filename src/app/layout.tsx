import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HR AI — Your AI HR Officer for Philippine SMEs",
  description:
    "Use chat, voice, and file uploads to manage employees, generate HR documents, prepare payroll summaries, and organize HR operations in one AI-powered workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
