import { z } from "zod";
import { getAnthropic } from "./llm";

/**
 * Per-lot relevance scoring — mirrors Patterno HIT's "X von Y Losen relevant".
 *
 * Deliberately an LLM judge over the FULL lot content, not embedding cosine
 * similarity. Their product's stated differentiator is "full-text content
 * assessment rather than vector similarity alone, minimizing false positives" —
 * a buyer's profile and a tender lot can share vocabulary without being a real
 * fit (and vice versa), which a similarity score misjudges but a reader doesn't.
 */

export interface LotInput {
  lotNumber: string;
  title: string;
  description?: string | null;
}

export interface LotRelevance {
  lotNumber: string;
  title: string;
  relevant: boolean;
  /** 0–1 confidence that this lot fits the profile. */
  score: number;
  reason: string;
}

export interface RelevanceResult {
  profile: string;
  relevantCount: number;
  totalCount: number;
  lots: LotRelevance[];
}

const RelevanceSchema = z.object({
  lots: z.array(
    z.object({
      lotNumber: z.string(),
      relevant: z.boolean(),
      score: z.number(),
      reason: z.string(),
    })
  ),
});

const RELEVANCE_TOOL = {
  name: "report_lot_relevance",
  description:
    "Report, for each procurement lot, whether it is relevant to the buyer's search profile.",
  input_schema: {
    type: "object",
    properties: {
      lots: {
        type: "array",
        items: {
          type: "object",
          properties: {
            lotNumber: { type: "string", description: "The lot number, copied exactly from the input" },
            relevant: { type: "boolean", description: "True only if a supplier matching the profile would realistically bid" },
            score: { type: "number", description: "0–1 confidence of relevance" },
            reason: { type: "string", description: "One sentence justifying the decision" },
          },
          required: ["lotNumber", "relevant", "score", "reason"],
        },
      },
    },
    required: ["lots"],
  },
};

export async function scoreLotRelevance(
  profile: string,
  lots: LotInput[]
): Promise<RelevanceResult> {
  if (!profile.trim()) throw new Error("a search profile is required");
  if (lots.length === 0) {
    return { profile, relevantCount: 0, totalCount: 0, lots: [] };
  }

  const lotsText = lots
    .map((l) => `Lot ${l.lotNumber}: ${l.title}${l.description ? `\n${l.description}` : ""}`)
    .join("\n\n");

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools: [RELEVANCE_TOOL as never],
    tool_choice: { type: "tool", name: "report_lot_relevance" },
    system: `You match public-procurement lots to a buyer's search profile.
Assess the FULL content of each lot against the profile and judge genuine fit —
not keyword overlap. Mark a lot relevant only if a supplier matching the profile
would realistically bid on it. Give a 0–1 confidence score and a one-sentence reason.`,
    messages: [
      {
        role: "user",
        content: `Search profile:\n${profile}\n\n---\n\nLots:\n${lotsText}`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Relevance model did not return scores");
  }

  const parsed = RelevanceSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error("Relevance model returned an unexpected shape");
  }

  const titleByNumber = new Map(lots.map((l) => [l.lotNumber, l.title]));
  const scored: LotRelevance[] = parsed.data.lots.map((r) => ({
    lotNumber: r.lotNumber,
    title: titleByNumber.get(r.lotNumber) ?? r.lotNumber,
    relevant: r.relevant,
    score: Math.max(0, Math.min(1, r.score)),
    reason: r.reason,
  }));

  return {
    profile,
    totalCount: scored.length,
    relevantCount: scored.filter((s) => s.relevant).length,
    lots: scored,
  };
}
