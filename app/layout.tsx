import type { Metadata } from "next";
import DynamicSidebar from "./components/DynamicSidebar";
import FloatingPaneController from "./components/FloatingPaneController";
import ScrollExperienceManager from "./components/ScrollExperienceManager";
import TabPointerController from "./components/TabPointerController";
import WorkspaceStateManager from "./components/WorkspaceStateManager";
import WorkspaceWindowManager from "./components/WorkspaceWindowManager";
import "./globals.css";
import "./command-bar.css";
import "./sidebar.css";
import "./workspace-split.css";
import "./scrollbars.css";
import "./window-manager.css";

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
        <WorkspaceWindowManager />
        <WorkspaceStateManager />
        <ScrollExperienceManager />
        <TabPointerController />
        {children}
      </body>
    </html>
  );
}
