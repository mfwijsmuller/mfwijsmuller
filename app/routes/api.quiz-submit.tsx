/**
 * api.quiz-submit.tsx
 *
 * POST /api/quiz-submit
 *
 * Called by the customer account extension after the customer completes the quiz.
 *
 * Security flow:
 *   1. Extension sends Authorization: Bearer <customerAccountToken>
 *   2. We verify the JWT against Shopify's JWKS (RS256)
 *   3. Extract customerId (sub claim) = GID
 *   4. Look up the shop from the JWT's `dest` claim
 *   5. Load the offline Admin session for that shop
 *   6. Write metafields via Admin GraphQL
 *
 * This endpoint is NOT embedded-authenticated (no admin session).
 * It is a public API that validates the customer-side token itself.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { unauthenticated } from "~/shopify.server";
import { saveQuizAnswers, type QuizAnswers } from "~/lib/metafields.server";
import { getQuizConfig } from "~/lib/quiz-config.server";
import { verifyCustomerToken, extractBearerToken } from "~/lib/customer-token.server";
import { checkRateLimit, getClientIp } from "~/lib/rate-limit.server";
import { db } from "~/db.server";
import { z } from "zod";

// ---------------------------------------------------------------------------
// CORS — allow requests from *.myshopify.com customer account origins
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://*.myshopify.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

// Answer value schema — strings or arrays of strings, max length bounded
const AnswerSchema = z.union([
  z.string().max(500),
  z.array(z.string().max(200)).max(20),
]);

const SubmitBodySchema = z.object({
  shop: z.string().min(3).max(253), // e.g. "my-store.myshopify.com"
  answers: z.record(z.string().regex(/^[a-z_]{1,64}$/), AnswerSchema),
});

export async function action({ request }: ActionFunctionArgs) {
  // ── Handle CORS preflight ───────────────────────────────────────────────
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
  }

  // ── Rate limiting ────────────────────────────────────────────────────────
  const ip = getClientIp(request);
  if (!checkRateLimit(`quiz-submit:${ip}`, { limit: 5, windowSeconds: 60 })) {
    return json({ error: "Too many requests" }, { status: 429, headers: CORS_HEADERS });
  }

  // ── Extract & verify customer token ─────────────────────────────────────
  const token = extractBearerToken(request);
  if (!token) {
    return json({ error: "Missing authorization token" }, { status: 401, headers: CORS_HEADERS });
  }

  // Parse body first to get the shop domain for JWKS lookup
  let body: z.infer<typeof SubmitBodySchema>;
  try {
    const raw = await request.json();
    body = SubmitBodySchema.parse(raw);
  } catch {
    return json({ error: "Invalid request body" }, { status: 400, headers: CORS_HEADERS });
  }

  let customerId: string;
  try {
    // verifyCustomerToken fetches Shopify's public JWKS and validates the RS256 JWT.
    // The `sub` claim contains the customer GID.
    const payload = await verifyCustomerToken(token, body.shop);
    customerId = payload.sub; // "gid://shopify/Customer/<id>"
  } catch (err) {
    console.error("[quiz-submit] token verification failed:", err);
    return json({ error: "Invalid or expired token" }, { status: 401, headers: CORS_HEADERS });
  }

  // ── Load quiz config for the shop ───────────────────────────────────────
  const config = await getQuizConfig(body.shop);
  if (!config || !config.enabled) {
    return json({ error: "Quiz is not enabled for this store" }, { status: 403, headers: CORS_HEADERS });
  }

  // ── Validate that only known question keys are in the answers ────────────
  const allowedKeys = new Set(config.questions.map((q) => q.key));
  const filteredAnswers: QuizAnswers = {};
  for (const [key, value] of Object.entries(body.answers)) {
    if (allowedKeys.has(key)) {
      filteredAnswers[key] = value as string | string[];
    }
  }

  // ── Fetch an offline Admin session for this shop ─────────────────────────
  // `unauthenticated.admin` loads the stored offline token without requiring
  // an embedded admin request — safe for backend-only operations.
  let graphql: Awaited<ReturnType<typeof unauthenticated.admin>>["graphql"];
  try {
    const { graphql: gql } = await unauthenticated.admin(body.shop);
    graphql = gql;
  } catch {
    return json({ error: "Shop not found or app not installed" }, { status: 404, headers: CORS_HEADERS });
  }

  // ── Write metafields ────────────────────────────────────────────────────
  const { ok, errors } = await saveQuizAnswers(
    graphql,
    customerId,
    filteredAnswers,
    config.namespace,
  );

  if (!ok) {
    console.error("[quiz-submit] metafieldsSet errors:", errors);
    return json({ error: "Failed to save answers", details: errors }, { status: 500, headers: CORS_HEADERS });
  }

  // ── Bump aggregate stats (no PII) ───────────────────────────────────────
  await db.quizStats.upsert({
    where: { shop: body.shop },
    create: { shop: body.shop, totalCompleted: 1 },
    update: { totalCompleted: { increment: 1 } },
  });

  return json({ ok: true }, { status: 200, headers: CORS_HEADERS });
}

// Loader not needed — this is a POST-only endpoint
export const loader = () =>
  json({ error: "Not found" }, { status: 404 });
