import type { Metadata } from "next";
import "./globals.css";
import "./command-bar.css";

export const metadata: Metadata = {
  title: "EHR Workspace",
  description: "AI-infused, workspace-first electronic health record prototype",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
