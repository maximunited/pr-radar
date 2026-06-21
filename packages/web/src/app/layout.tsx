import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PR Radar",
  description: "Open PR dashboard for medik8s and OpenShift",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}
