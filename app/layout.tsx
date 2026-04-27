import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tasker — AppyCodes",
  description: "AppyCodes internal task management platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
