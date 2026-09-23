import type { Metadata } from "next";
import AppChrome from "./components/AppChrome";
import AuthSessionGate from "./components/auth/AuthSessionGate";
import "./globals.css";
import "./ui-system.css";
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
import "./zen-home.css";
import "./dashboard-preview.css";
import "./dashboard-shell.css";
import "./care-completion.css";
import "./tool-navigation.css";
import "./google-calendar.css";
import "./intake-workspace.css";
import "./open-workspace-launcher.css";
import "./communication-companion.css";
import "./labs-companion.css";
import "./companion-tool-scope.css";

import { WorkspaceNavigationProvider } from "./lib/workspace-navigation-context";

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
            listed alphabetically (uppercase first) for the v2 API.
            next/font/google doesn't support this font's variable icon axes
            (FILL/GRAD/opsz/wght) or the CSS2 API's custom axis-tuple syntax,
            so it can't replace this manual link; `display=block` is
            deliberate too — it avoids rendering literal fallback text (e.g.
            "add") where an icon glyph belongs while the font loads. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:FILL,GRAD,opsz,wght@0..1,-50..200,20..48,100..700&display=block"
        />
      </head>
      <body>
        <AuthSessionGate>
          <WorkspaceNavigationProvider>
            {/* Every ordinary route gets the workspace chrome; a design preview
                renders its own shell instead. See AppChrome. */}
            <AppChrome />
            {children}
          </WorkspaceNavigationProvider>
        </AuthSessionGate>
      </body>
    </html>
  );
}
