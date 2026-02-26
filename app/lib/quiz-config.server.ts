/**
 * quiz-config.server.ts
 *
 * Read and write per-store quiz configuration from the database.
 * The `questions` column is stored as a JSON string.
 */

import { db } from "~/db.server";

// ---------------------------------------------------------------------------
// Types (also used by the extension via the API response)
// ---------------------------------------------------------------------------
export interface QuizOption {
  label: string;
  value: string;
}

export interface QuizQuestion {
  id: string;
  key: string; // metafield key
  type: "single_line_text_field" | "list.single_line_text_field";
  question: string;
  options: string[];
  multiSelect?: boolean;
}

export interface QuizConfigData {
  id: string;
  shop: string;
  enabled: boolean;
  questions: QuizQuestion[];
  consentText: string;
  namespace: string;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the quiz config for a shop, or null if not found. */
export async function getQuizConfig(shop: string): Promise<QuizConfigData | null> {
  const row = await db.quizConfig.findUnique({ where: { shop } });
  if (!row) return null;

  return {
    ...row,
    questions: parseQuestions(row.questions),
  };
}

/** Upsert the quiz config (called by the quiz builder route). */
export async function saveQuizConfig(
  shop: string,
  data: Partial<Pick<QuizConfigData, "enabled" | "questions" | "consentText" | "namespace">>,
): Promise<QuizConfigData> {
  const patch: Record<string, unknown> = {};
  if (data.enabled !== undefined) patch.enabled = data.enabled;
  if (data.consentText !== undefined) patch.consentText = data.consentText;
  if (data.namespace !== undefined) patch.namespace = data.namespace;
  if (data.questions !== undefined) patch.questions = JSON.stringify(data.questions);

  const row = await db.quizConfig.upsert({
    where: { shop },
    create: { shop, ...patch },
    update: patch,
  });

  return { ...row, questions: parseQuestions(row.questions) };
}

function parseQuestions(raw: string): QuizQuestion[] {
  try {
    return JSON.parse(raw) as QuizQuestion[];
  } catch {
    return [];
  }
}
