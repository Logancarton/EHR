import type { Metadata } from "next";
import DynamicSidebar from "./components/DynamicSidebar";
import FloatingPaneController from "./components/FloatingPaneController";
import TabPointerController from "./components/TabPointerController";
import "./globals.css";
import "./command-bar.css";
import "./sidebar.css";
import "./workspace-split.css";

export const metadata: Metadata = {
  title: "EHR Workspace",
  description: "AI-infused, workspace-first electronic health record prototype",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <DynamicSidebar />
        <FloatingPaneController />
        <TabPointerController />
        {children}
      </body>
    </html>
  );
}
