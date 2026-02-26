/**
 * auth.$.tsx
 *
 * Catch-all route that handles all Shopify OAuth flows.
 * @shopify/shopify-app-remix manages the redirect dance automatically.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};
