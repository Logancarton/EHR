"use client";

import { useEffect, useState } from "react";
import GlobalDocumentsWorkspace from "./global/GlobalDocumentsWorkspace";
import GlobalLabsWorkspace from "./global/GlobalLabsWorkspace";
import {
  practiceQueueApi,
  type PracticeDocumentQueueRow,
  type PracticeLabQueueRow,
} from "../lib/practice-queue-api";
import {
  WORKSPACE_DOCUMENT_WORKFLOW_UPDATED_EVENT,
  WORKSPACE_SIDEBAR_BADGES_EVENT,
  dispatchWorkspaceEvent,
  subscribeWorkspaceEvent,
} from "../lib/workspace-events";
import { useWorkspaceNavigation } from "../lib/workspace-navigation-context";

type QueueModule = "labs" | "documents";

function title(module: QueueModule) {
  return module === "labs" ? "Labs" : "Documents";
}

export default function PracticeQueueWorkspaceShell() {
  const { activeModule, closeGlobalModule } = useWorkspaceNavigation();
  const queueModule = activeModule === "labs" || activeModule === "documents" ? (activeModule as QueueModule) : null;

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
      dispatchWorkspaceEvent(WORKSPACE_SIDEBAR_BADGES_EVENT, {
        labs: rows.filter((row) => !row.acknowledgedAt).length,
      });
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
      dispatchWorkspaceEvent(WORKSPACE_SIDEBAR_BADGES_EVENT, {
        documents: rows.filter(
          (row) => row.workflowStatus === "received" || row.workflowStatus === "needs_review",
        ).length,
      });
    } catch (cause) {
      setDocumentError(cause instanceof Error ? cause.message : "Unable to load document queue");
    } finally {
      setDocumentLoading(false);
    }
  }

  useEffect(() => {
    void loadLabs();
    void loadDocuments();

    const unsubWorkflow = subscribeWorkspaceEvent(
      WORKSPACE_DOCUMENT_WORKFLOW_UPDATED_EVENT,
      () => {
        void loadDocuments();
      },
    );

    return () => {
      unsubWorkflow();
    };
  }, []);

  useEffect(() => {
    if (queueModule === "labs") void loadLabs();
    if (queueModule === "documents") void loadDocuments();
  }, [queueModule]);

  if (!queueModule) return null;

  return (
    <section
      className="global-module-shell practice-queue-shell"
      data-active-module={queueModule}
      aria-label={`${title(queueModule)} practice queue`}
    >
      <header className="global-module-header">
        <div>
          <span className="eyebrow">Authoritative Practice Queue</span>
          <h1>{title(queueModule)}</h1>
        </div>
        <button
          type="button"
          className="global-module-close"
          onClick={closeGlobalModule}
          aria-label={`Close ${title(queueModule)} workspace`}
        >
          ×
        </button>
      </header>
      <div className="global-module-content">
        {queueModule === "labs" ? (
          <GlobalLabsWorkspace
            rows={labRows}
            loading={labLoading}
            error={labError}
            onRefresh={() => void loadLabs()}
          />
        ) : (
          <GlobalDocumentsWorkspace
            rows={documentRows}
            loading={documentLoading}
            error={documentError}
            onRefresh={() => void loadDocuments()}
          />
        )}
      </div>
    </section>
  );
}
