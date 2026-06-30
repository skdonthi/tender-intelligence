import Anthropic from "@anthropic-ai/sdk";

// Shared lazy Anthropic client. Construct on first use so a missing key fails at
// the point of use with a clear message, not at import time. Used by the
// extractor, RAG answering, and lot-relevance scoring.
let _anthropic: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set — required for Claude calls");
    }
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}
