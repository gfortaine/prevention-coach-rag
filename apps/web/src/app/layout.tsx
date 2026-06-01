import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coach AXA Prevention - MVP RAG securite routiere",
  description:
    "Prototype standalone de coach prevention routiere avec RAG, scoring risque et orchestration multi-agents.",
  icons: {
    icon: "/logo-axa.svg",
    shortcut: "/logo-axa.svg",
    apple: "/logo-axa-prevention.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
