/**
 * webhooks.shop.redact.tsx
 *
 * POST /webhooks/shop/redact  (GDPR compliance topic)
 *
 * Shopify sends this 90 days after a shop is uninstalled.
 * We must delete all merchant and customer data for this shop.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  console.log(`[GDPR] ${topic} received for ${shop} — deleting all merchant data`);

  // Delete all our own records for this shop.
  // Customer metafields live on Shopify's side and are managed by Shopify.
  await Promise.allSettled([
    db.quizConfig.deleteMany({ where: { shop } }),
    db.quizStats.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);

  return new Response(null, { status: 200 });
};
