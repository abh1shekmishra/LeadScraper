import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeadScraper — RedHut Studios",
  description: "AI-powered lead generation for RedHut Studios",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ height: '100%' }}>
      <body style={{ height: '100%', margin: 0 }} className="text-slate-100 antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}
