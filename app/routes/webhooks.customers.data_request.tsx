/**
 * webhooks.customers.data_request.tsx
 *
 * POST /webhooks/customers/data_request  (GDPR compliance topic)
 *
 * Shopify sends this when a customer requests a copy of their data.
 * We must respond with what data we hold. In our case:
 *  - We do NOT store customer PII in our DB (only aggregate stats)
 *  - All quiz answers are stored as metafields on the Shopify customer record
 *    (Shopify owns and exports that data natively)
 *
 * Best practice: log the request, then reply that data is held only as
 * Shopify metafields (which Shopify exports via the Data Export tool).
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[GDPR] ${topic} received`, {
    shop,
    // payload contains { shop_id, shop_domain, customer: { id, email, phone }, ... }
    customerId: (payload as { customer?: { id: number } })?.customer?.id,
  });

  // Our app stores NO customer PII in our own database.
  // All quiz answers are stored as Shopify Customer metafields.
  // Shopify's native data export covers those automatically.
  //
  // If you add PII to your own DB in the future, export it here and
  // email it to the customer within the required timeframe.

  return new Response(null, { status: 200 });
};
