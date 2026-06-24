import type { SearchResult } from "../../src/services/search";
import type { ProcurementExtraction } from "../../src/services/extractionSchema";
import {
  listDocuments,
  getDocument,
  uploadDocument,
  askDocument,
} from "./serverFns";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DocSummary {
  id:                   string;
  filename:             string;
  extractionConfidence: number | null;
  createdAt:            string;
}

export interface DocDetail extends DocSummary {
  rawText:   string;
  extracted: ProcurementExtraction | null;
}

export interface IngestResponse {
  documentId:    string;
  chunkCount:    number;
  confidence:    number;
  missingFields: string[];
  extracted:     ProcurementExtraction;
}

export interface AskResponse {
  answer:  string;
  sources: SearchResult[];
}

// ── Client API ───────────────────────────────────────────────────────────────
// Thin wrappers over server functions. No fetch / hardcoded base URL — the Start
// plugin handles the client→server RPC transport. The casts bridge the server
// functions' inferred return types to the UI-facing interfaces above.

export const api = {
  listDocuments: () => listDocuments() as Promise<DocSummary[]>,

  getDocument: (id: string) => getDocument({ data: id }) as Promise<DocDetail>,

  uploadDocument: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return uploadDocument({ data: form }) as Promise<IngestResponse>;
  },

  ask: (documentId: string, question: string) =>
    askDocument({ data: { documentId, question } }) as Promise<AskResponse>,
};
