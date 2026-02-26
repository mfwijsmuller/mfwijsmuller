/**
 * api.quiz-status.tsx
 *
 * GET /api/quiz-status?shop=<shop>
 *
 * Called by the customer account extension on mount to determine whether
 * the current customer has already completed the quiz (so we can skip it).
 *
 * Same auth flow as api.quiz-submit: verifies the customer account token.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { unauthenticated } from "~/shopify.server";
import { isQuizCompleted } from "~/lib/metafields.server";
import { getQuizConfig } from "~/lib/quiz-config.server";
import { verifyCustomerToken, extractBearerToken } from "~/lib/customer-token.server";
import { checkRateLimit, getClientIp } from "~/lib/rate-limit.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://*.myshopify.com",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Rate limit by IP
  const ip = getClientIp(request);
  if (!checkRateLimit(`quiz-status:${ip}`, { limit: 30, windowSeconds: 60 })) {
    return json({ error: "Too many requests" }, { status: 429, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    return json({ error: "Missing shop parameter" }, { status: 400, headers: CORS_HEADERS });
  }

  // Verify customer token
  const token = extractBearerToken(request);
  if (!token) {
    return json({ error: "Missing authorization" }, { status: 401, headers: CORS_HEADERS });
  }

  let customerId: string;
  try {
    const payload = await verifyCustomerToken(token, shop);
    customerId = payload.sub;
  } catch {
    return json({ error: "Invalid token" }, { status: 401, headers: CORS_HEADERS });
  }

  // Load config (to get namespace + enabled flag + questions for the extension)
  const config = await getQuizConfig(shop);
  if (!config) {
    return json({ enabled: false, completed: false, questions: [] }, { headers: CORS_HEADERS });
  }

  if (!config.enabled) {
    return json({ enabled: false, completed: false, questions: [] }, { headers: CORS_HEADERS });
  }

  // Check completion via Admin API
  let completed = false;
  try {
    const { graphql } = await unauthenticated.admin(shop);
    completed = await isQuizCompleted(graphql, customerId, config.namespace);
  } catch (err) {
    console.error("[quiz-status] admin API error:", err);
    // Fail open — show the quiz rather than block the customer
  }

  return json(
    {
      enabled: true,
      completed,
      // Return the questions so the extension can render them without an extra round-trip
      questions: config.questions,
      consentText: config.consentText,
    },
    { headers: CORS_HEADERS },
  );
}
