"use client";

import { useEffect, useState } from "react";
import GlobalDocumentsWorkspace from "./global/GlobalDocumentsWorkspace";
import GlobalLabsWorkspace from "./global/GlobalLabsWorkspace";
import {
  practiceQueueApi,
  type PracticeDocumentQueueRow,
  type PracticeLabQueueRow,
} from "../lib/practice-queue-api";

type QueueModule = "labs" | "documents";

function title(module: QueueModule) {
  return module === "labs" ? "Labs" : "Documents";
}

export default function PracticeQueueWorkspaceShell() {
  const [activeModule, setActiveModule] = useState<QueueModule | null>(null);
  const [labRows, setLabRows] = useState<PracticeLabQueueRow[]>([]);
  const [documentRows, setDocumentRows] = useState<PracticeDocumentQueueRow[]>([]);
  const [labLoading, setLabLoading] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [labError, setLabError] = useState("");
  const [documentError, setDocumentError] = useState("");

  async function loadLabs() {
    setLabLoading(true);
    setLabError("");
    try {
      const rows = await practiceQueueApi.labs();
      setLabRows(rows);
      window.dispatchEvent(new CustomEvent("ehr-sidebar-badges", {
        detail: { labs: rows.filter((row) => !row.acknowledgedAt).length },
      }));
    } catch (cause) {
      setLabError(cause instanceof Error ? cause.message : "Unable to load lab queue");
    } finally {
      setLabLoading(false);
    }
  }

  async function loadDocuments() {
    setDocumentLoading(true);
    setDocumentError("");
    try {
      const rows = await practiceQueueApi.documents();
      setDocumentRows(rows);
    } catch (cause) {
      setDocumentError(cause instanceof Error ? cause.message : "Unable to load document queue");
    } finally {
      setDocumentLoading(false);
    }
  }

  useEffect(() => {
    void loadLabs();
    void loadDocuments();

    function handleSwitch(event: Event) {
      const view = (event as CustomEvent<{ view?: string }>).detail?.view;
      if (view === "labs" || view === "documents") {
        setActiveModule(view);
        if (view === "labs") void loadLabs();
        else void loadDocuments();
        return;
      }
      setActiveModule(null);
    }

    function handleClose() {
      setActiveModule(null);
    }

    window.addEventListener("ehr-switch-view", handleSwitch);
    window.addEventListener("ehr-global-module-close", handleClose);
    return () => {
      window.removeEventListener("ehr-switch-view", handleSwitch);
      window.removeEventListener("ehr-global-module-close", handleClose);
    };
  }, []);

  if (!activeModule) return null;

  return (
    <section className="global-module-shell practice-queue-shell" data-active-module={activeModule} aria-label={`${title(activeModule)} practice queue`}>
      <header className="global-module-header">
        <div>
          <span className="eyebrow">Authoritative Practice Queue</span>
          <h1>{title(activeModule)}</h1>
        </div>
        <button
          type="button"
          className="global-module-close"
          onClick={() => {
            setActiveModule(null);
            window.dispatchEvent(new CustomEvent("ehr-global-module-close"));
            window.dispatchEvent(new CustomEvent("ehr-sidebar-clear-active"));
          }}
          aria-label={`Close ${title(activeModule)} workspace`}
        >
          ×
        </button>
      </header>
      <div className="global-module-content">
        {activeModule === "labs" ? (
          <GlobalLabsWorkspace rows={labRows} loading={labLoading} error={labError} onRefresh={() => void loadLabs()} />
        ) : (
          <GlobalDocumentsWorkspace rows={documentRows} loading={documentLoading} error={documentError} onRefresh={() => void loadDocuments()} />
        )}
      </div>
    </section>
  );
}
