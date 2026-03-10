import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AetherTest — Autonomous STLC Engine",
  description: "AI-powered software testing lifecycle engine",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
