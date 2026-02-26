/**
 * webhooks.app.uninstalled.tsx
 *
 * POST /webhooks/app/uninstalled
 *
 * Called by Shopify when the merchant uninstalls the app.
 * We clean up per-store data that is no longer needed.
 * Sessions are cleaned up automatically by the session storage adapter.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } =
    await authenticate.webhook(request);

  console.log(`[webhook] ${topic} received for ${shop}`);

  // Delete app-owned merchant data for this shop.
  // Customer metafields in Shopify are NOT deleted here — the merchant owns
  // that data; GDPR redaction handles individual customer data separately.
  await Promise.allSettled([
    db.quizConfig.deleteMany({ where: { shop } }),
    db.quizStats.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);

  return new Response(null, { status: 200 });
};
