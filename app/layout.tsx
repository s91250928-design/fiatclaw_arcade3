import type { Metadata } from "next";
import { SolanaProvider } from "@/components/SolanaProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "FiatClaw Arcade",
  description: "On-chain cyberpunk claw machine on Solana",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#09090B",
          color: "#EDEEF2",
          fontFamily: "Inter, system-ui, sans-serif",
          minHeight: "100vh",
          maxWidth: "100vw",
          overflowX: "hidden",
        }}
      >
        <SolanaProvider>{children}</SolanaProvider>
      </body>
    </html>
  );
}
