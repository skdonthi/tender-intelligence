/**
 * Structure-aware chunking for procurement documents.
 *
 * Naive chunking (fixed token windows) destroys the hierarchy of legal docs:
 * sections, clauses, annexes, and tables carry meaning through their position.
 *
 * Strategy:
 * 1. Split on section headings (Roman numerals, numbered clauses, ALL CAPS headers)
 * 2. Keep chunks within a target token range with overlap
 * 3. Prepend a section breadcrumb to each chunk so the model has context
 *
 * This is a key architectural decision worth explaining in interviews.
 */

const TARGET_CHUNK_TOKENS = 400;   // ~300 words
const OVERLAP_TOKENS = 80;         // ~60 words
const AVG_CHARS_PER_TOKEN = 4;

const SECTION_PATTERNS = [
  // EU TED / Official Journal section headings
  /^(Section [IVX]+[.:]\s+.+)$/im,
  // Numbered clauses: "1.", "1.1", "2.3.1"
  /^(\d+(?:\.\d+)*\.?\s{1,3}[A-ZÄÖÜ].+)$/m,
  // ALL CAPS headings (≥4 words)
  /^([A-ZÄÖÜ][A-ZÄÖÜ\s\-\/]{15,})$/m,
  // Annex / Appendix markers
  /^(Annex|Appendix|Anlage|Annexe)\s+[A-Z0-9]/im,
];

export interface Chunk {
  index: number;
  content: string;
  /** Section title if detected — prepended to chunk for context */
  sectionBreadcrumb: string | null;
}

export function chunkDocument(rawText: string): Chunk[] {
  const lines = rawText.split("\n");
  const sections: Array<{ heading: string | null; lines: string[] }> = [];
  let currentSection: { heading: string | null; lines: string[] } = {
    heading: null,
    lines: [],
  };

  for (const line of lines) {
    const isHeading = SECTION_PATTERNS.some((p) => p.test(line.trim()));
    if (isHeading && currentSection.lines.join("").trim().length > 0) {
      sections.push(currentSection);
      currentSection = { heading: line.trim(), lines: [] };
    } else if (isHeading) {
      currentSection.heading = line.trim();
    } else {
      currentSection.lines.push(line);
    }
  }
  if (currentSection.lines.length > 0) sections.push(currentSection);

  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const sectionText = section.lines.join("\n").trim();
    if (!sectionText) continue;

    const maxChars = TARGET_CHUNK_TOKENS * AVG_CHARS_PER_TOKEN;
    const overlapChars = OVERLAP_TOKENS * AVG_CHARS_PER_TOKEN;

    if (sectionText.length <= maxChars) {
      // Section fits in a single chunk
      chunks.push({
        index: chunkIndex++,
        sectionBreadcrumb: section.heading,
        content: section.heading
          ? `[${section.heading}]\n\n${sectionText}`
          : sectionText,
      });
    } else {
      // Split long section with overlap aligned to word boundaries
      let start = 0;
      while (start < sectionText.length) {
        let end = Math.min(start + maxChars, sectionText.length);
        
        // Find natural word boundary for the end of the slice
        if (end < sectionText.length) {
          end = findBoundary(sectionText, end, "left");
        }

        const slice = sectionText.slice(start, end).trim();
        if (slice) {
          chunks.push({
            index: chunkIndex++,
            sectionBreadcrumb: section.heading,
            content: section.heading
              ? `[${section.heading}]\n\n${slice}`
              : slice,
          });
        }

        if (end >= sectionText.length) break;

        // Shift start back by overlap and find next word boundary
        let nextStart = end - overlapChars;
        nextStart = findBoundary(sectionText, nextStart, "right");

        // Prevent infinite loops if boundaries don't progress
        if (nextStart <= start) {
          start = end;
        } else {
          start = nextStart;
        }
      }
    }
  }

  return chunks;
}

/**
 * Searches for a nearby whitespace character to avoid cutting words in half.
 */
function findBoundary(text: string, index: number, direction: "left" | "right"): number {
  if (index <= 0) return 0;
  if (index >= text.length) return text.length;

  const searchWindow = 40; // lookahead/lookbehind threshold

  if (direction === "left") {
    let curr = index;
    const min = Math.max(0, index - searchWindow);
    while (curr > min) {
      if (/\s/.test(text[curr])) {
        return curr + 1; // slice after space
      }
      curr--;
    }
  } else {
    let curr = index;
    const max = Math.min(text.length, index + searchWindow);
    while (curr < max) {
      if (/\s/.test(text[curr])) {
        return curr; // slice at space
      }
      curr++;
    }
  }

  return index;
}

/** Rough token estimate — good enough for chunking decisions */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
}
