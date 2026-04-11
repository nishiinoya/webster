import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Webster",
  description: "A Photoshop-like web image editor."
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
