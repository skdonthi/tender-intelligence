#!/usr/bin/env tsx
// Temporary: generate scripts/fixtures/eval-set.json from live TED notices.
// Ground-truth labels come from TED's structured eForms metadata (search API);
// documentText is the parsed PDF rendition — so the eval measures the PDF
// extractor against the EU's own structured data, no hand-labeling required.
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pdf from "pdf-parse";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PUBS = [
  { pub: "481765-2026", desc: "Lithuania – surveillance equipment (CPV 35)" },
  { pub: "480823-2026", desc: "Hungary – equipment (CPV 35)" },
  { pub: "480576-2026", desc: "Poland – fire-brigade rescue vehicle, volunteer buyer" },
  { pub: "483191-2026", desc: "Greece – thermal imaging cameras, 3 lots" },
  { pub: "482980-2026", desc: "Romania – military hospital maintenance framework" },
];

function pickLang(map: Record<string, string | string[]> | undefined): string | null {
  if (!map) return null;
  for (const lang of ["deu", "eng"]) {
    const v = map[lang];
    if (v) return Array.isArray(v) ? v[0] : v;
  }
  const first = Object.values(map)[0];
  return first ? (Array.isArray(first) ? first[0] : first) : null;
}

const cases = [];
for (const { pub, desc } of PUBS) {
  const search = await fetch("https://api.ted.europa.eu/v3/notices/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `publication-number=${pub}`,
      fields: ["publication-number", "buyer-name", "deadline-receipt-tender-date-lot", "procedure-type", "links"],
      limit: 1,
    }),
  });
  const notice = (await search.json()).notices[0];

  const pdfUrl = notice.links.pdf.DEU ?? notice.links.pdf.ENG ?? Object.values(notice.links.pdf)[0];
  const pdfRes = await fetch(pdfUrl as string);
  const parsed = await pdf(Buffer.from(await pdfRes.arrayBuffer()));

  const expected: Record<string, unknown> = {
    referenceNumber: notice["publication-number"],
    procedureType: notice["procedure-type"] ?? null,
    "contractingAuthority.name": pickLang(notice["buyer-name"]),
  };
  const deadline: string | undefined = notice["deadline-receipt-tender-date-lot"]?.[0];
  if (deadline) expected["deadlineSubmission"] = deadline.slice(0, 10);

  cases.push({ id: `ted-${pub}`, description: desc, documentText: parsed.text, expected });
  console.log(`${pub}: ${parsed.text.length} chars, ${Object.keys(expected).length} labeled fields`);
}

mkdirSync(join(__dirname, "fixtures"), { recursive: true });
writeFileSync(join(__dirname, "fixtures", "eval-set.json"), JSON.stringify(cases, null, 2));
console.log(`\nWrote ${cases.length} cases to scripts/fixtures/eval-set.json`);
process.exit(0);
