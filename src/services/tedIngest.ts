import { like } from "drizzle-orm";
import { db } from "../db/client";
import { documents } from "../db/schema";
import { ingestDocument } from "./ingest";

/**
 * TED (Tenders Electronic Daily) live-ingest adapter.
 *
 * Pulls recent above-threshold notices from the official EU Publications
 * Office Search API (no API key required for search) and feeds each notice's
 * PDF through the existing ingest pipeline unchanged. Defence & security
 * procurement (Directive 2009/81/EC) must be published on TED, so CPV
 * division 35* gives a live defence corpus from a fully public, licensed,
 * schema-versioned source.
 *
 * Tiering note: this is a Tier-1 source adapter — official API, structured
 * eForms data, per-notice PDF renditions in 24 languages. Portal scraping
 * (Tier 2) would sit behind the same interface with provenance + quarantine.
 */

const TED_SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search";
// Same guard as uploads: notices are cheap, but each ingest runs paid
// LLM + embedding calls, so both count and size are bounded.
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const FILENAME_PREFIX = "TED-";

export interface TedPullOptions {
  /** CPV expert-query expression; `35*` = defence & security division. */
  cpv?: string;
  /** How far back to search. */
  daysBack?: number;
  /** How many new notices to ingest this call. */
  limit?: number;
}

export interface TedPullResult {
  /** Total notices matching the query window on TED. */
  totalMatching: number;
  /** Notices ingested this call. */
  ingested: {
    publicationNumber: string;
    documentId: string;
    title: string;
    confidence: number;
  }[];
  /** Notices skipped because they were ingested on a previous pull. */
  skippedExisting: number;
}

// TED returns language-keyed maps (ISO 639-3) for most display fields.
type LangMap = Record<string, string | string[]>;

interface TedNotice {
  "publication-number": string;
  "notice-title"?: LangMap;
  "buyer-name"?: LangMap;
  "deadline-receipt-tender-date-lot"?: string[];
  links?: { pdf?: Record<string, string>; html?: Record<string, string> };
}

/** Pick German, then English, then any available language from a TED map. */
function pickLang(map: LangMap | Record<string, string> | undefined): string | null {
  if (!map) return null;
  for (const lang of ["deu", "DEU", "eng", "ENG"]) {
    const v = map[lang];
    if (v) return Array.isArray(v) ? v[0] : v;
  }
  const first = Object.values(map)[0];
  return first ? (Array.isArray(first) ? first[0] : first) : null;
}

async function searchTed(cpv: string, daysBack: number, pageSize: number): Promise<{ total: number; notices: TedNotice[] }> {
  const since = new Date(Date.now() - daysBack * 86_400_000)
    .toISOString().slice(0, 10).replaceAll("-", "");

  const res = await fetch(TED_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `classification-cpv IN (${cpv}) AND publication-date>=${since} SORT BY publication-date DESC`,
      fields: ["publication-number", "notice-title", "buyer-name", "deadline-receipt-tender-date-lot"],
      limit: pageSize,
    }),
  });
  if (!res.ok) {
    throw new Error(`TED search failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as { totalNoticeCount?: number; notices?: TedNotice[] };
  return { total: body.totalNoticeCount ?? 0, notices: body.notices ?? [] };
}

async function fetchNoticePdf(notice: TedNotice): Promise<Buffer> {
  const url = pickLang(notice.links?.pdf);
  if (!url) throw new Error(`notice ${notice["publication-number"]} has no PDF rendition`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PDF fetch failed: HTTP ${res.status} for ${url}`);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error(`notice PDF exceeds ${MAX_PDF_BYTES / 1024 / 1024} MB cap`);
  }
  return Buffer.from(bytes);
}

/**
 * Search TED and ingest up to `limit` notices not already in the database.
 * Sequential on purpose: bounds concurrent LLM spend and stays polite to
 * the Publications Office CDN.
 */
export async function ingestFromTed(options: TedPullOptions = {}): Promise<TedPullResult> {
  const { cpv = "35*", daysBack = 7, limit = 3 } = options;

  // Over-fetch so already-ingested notices don't starve the pull.
  const { total, notices } = await searchTed(cpv, daysBack, Math.min(limit * 5, 50));

  // Dedupe against previous pulls by the TED-<publication-number> filename prefix.
  const existing = await db
    .select({ filename: documents.filename })
    .from(documents)
    .where(like(documents.filename, `${FILENAME_PREFIX}%`));
  const seen = new Set(
    existing.map((r) => r.filename.slice(FILENAME_PREFIX.length).split(" ")[0])
  );

  const fresh = notices.filter((n) => !seen.has(n["publication-number"]));
  const skippedExisting = notices.length - fresh.length;

  const ingested: TedPullResult["ingested"] = [];
  for (const notice of fresh.slice(0, limit)) {
    const pub = notice["publication-number"];
    const title = pickLang(notice["notice-title"]) ?? pickLang(notice["buyer-name"]) ?? "Untitled notice";
    const pdf = await fetchNoticePdf(notice);
    const filename = `${FILENAME_PREFIX}${pub} ${title.slice(0, 60)}.pdf`;
    const result = await ingestDocument(pdf, filename);
    ingested.push({
      publicationNumber: pub,
      documentId: result.documentId,
      title,
      confidence: result.extraction.confidence,
    });
  }

  return { totalMatching: total, ingested, skippedExisting };
}
