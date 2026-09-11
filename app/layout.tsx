import type { Metadata } from "next";
import AuthSessionGate from "./components/auth/AuthSessionGate";
import CurrentUserMenu from "./components/auth/CurrentUserMenu";
import DynamicSidebar from "./components/DynamicSidebar";
import FloatingPaneController from "./components/FloatingPaneController";
import GlobalWorkspaceShell from "./components/GlobalWorkspaceShell";
import OmniboxPlannerBridge from "./components/OmniboxPlannerBridge";
import PracticeQueueWorkspaceShell from "./components/PracticeQueueWorkspaceShell";
import ScrollExperienceManager from "./components/ScrollExperienceManager";
import TabPointerController from "./components/TabPointerController";
import WorkspaceNavigationHistory from "./components/WorkspaceNavigationHistory";
import WorkspaceStateManager from "./components/WorkspaceStateManager";
import WorkspaceWindowManager from "./components/WorkspaceWindowManager";
import "./globals.css";
import "./auth.css";
import "./role-aware.css";
import "./command-bar.css";
import "./omnibox-planner.css";
import "./sidebar.css";
import "./workspace-split.css";
import "./scrollbars.css";
import "./window-manager.css";
import "./global-workspaces.css";
import "./practice-queues.css";
import "./prescription-operations.css";
import "./patient-documents.css";
import "./encounter-note.css";

export const metadata: Metadata = {
  title: "Clinical Bond",
  description: "AI-infused, workspace-first electronic health record for psychiatric practice",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* The icon font is loaded here rather than with an @import in
            globals.css: only the first @import in that file survives the CSS
            pipeline, so the second one silently never loaded. Axes must be
            listed alphabetically (uppercase first) for the v2 API. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:FILL,GRAD,opsz,wght@0..1,-50..200,20..48,100..700&display=block"
        />
      </head>
      <body>
        <AuthSessionGate>
          <DynamicSidebar />
          <FloatingPaneController />
          <WorkspaceWindowManager />
          <WorkspaceStateManager />
          <WorkspaceNavigationHistory />
          <GlobalWorkspaceShell />
          <PracticeQueueWorkspaceShell />
          <ScrollExperienceManager />
          <TabPointerController />
          <CurrentUserMenu />
          <OmniboxPlannerBridge />
          {children}
        </AuthSessionGate>
      </body>
    </html>
  );
}
