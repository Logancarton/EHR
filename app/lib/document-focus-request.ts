/**
 * "Open this document, at this passage" — held briefly for a Documents surface
 * that is not mounted yet.
 *
 * Navigation announces the document as it opens the chart, usually before the
 * Documents surface exists to hear the event. The document then showed only if it
 * happened to be the newest, and the AI search terms meant to be highlighted were
 * lost. Dispatchers record the request here as well; a surface that mounts shortly
 * afterwards takes it. A much later mount does not reopen stale work.
 */
export type DocumentFocusRequest = {
  patientId: string;
  documentId: string;
  documentVersionNumber?: number;
  documentSearchTerms?: string[];
};

const TTL_MS = 15_000;
const requests = new Map<string, DocumentFocusRequest & { at: number }>();

export function rememberDocumentFocus(request: DocumentFocusRequest, now: number = Date.now()): void {
  requests.set(request.patientId, { ...request, at: now });
}

/**
 * The pending request for this patient, if recent. Reading does not clear it: a
 * development remount runs the mount effect twice, and the second run must still
 * see it. The surface forgets it once the selection has actually been applied.
 */
export function peekDocumentFocus(patientId: string, now: number = Date.now()): DocumentFocusRequest | null {
  const request = requests.get(patientId);
  if (!request) return null;
  if (now - request.at > TTL_MS) {
    requests.delete(patientId);
    return null;
  }
  const { at: _at, ...focus } = request;
  return focus;
}

/** The request has been applied (or heard live), so a later mount does not repeat it. */
export function forgetDocumentFocus(patientId: string): void {
  requests.delete(patientId);
}
