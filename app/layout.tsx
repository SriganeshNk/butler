import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Butler",
  description: "A private two-person chat with rich link unfurls."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
