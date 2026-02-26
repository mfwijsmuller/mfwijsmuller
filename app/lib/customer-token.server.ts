/**
 * customer-token.server.ts
 *
 * Validates a Customer Account API access token (JWT) and extracts the
 * Shopify Customer GID.
 *
 * Shopify issues customer account tokens as JWTs signed with RS256.
 * We verify them against Shopify's public JWKS endpoint.
 *
 * Docs:
 *   https://shopify.dev/docs/apps/build/customer-identity/authenticate-customer-account-sessions
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// Cache JWKS per shop so we don't hammer Shopify on every request
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(shop: string) {
  if (!jwksCache.has(shop)) {
    // JWKS URL for customer account tokens
    const url = new URL(
      `https://${shop}/.well-known/customer-account/jwks.json`,
    );
    jwksCache.set(shop, createRemoteJWKSet(url));
  }
  return jwksCache.get(shop)!;
}

export interface CustomerTokenPayload extends JWTPayload {
  /** Shopify Customer GID, e.g. "gid://shopify/Customer/123456789" */
  sub: string;
  dest: string; // shop domain
}

/**
 * Verify a Customer Account API bearer token and return the decoded payload.
 * Throws if the token is invalid or expired.
 *
 * @param token  Raw JWT from the `Authorization: Bearer <token>` header
 * @param shop   Shop domain, e.g. "my-store.myshopify.com"
 */
export async function verifyCustomerToken(
  token: string,
  shop: string,
): Promise<CustomerTokenPayload> {
  const JWKS = getJWKS(shop);

  const { payload } = await jwtVerify(token, JWKS, {
    algorithms: ["RS256"],
    // Audience is the app's client ID (API key)
    audience: process.env.SHOPIFY_API_KEY!,
  });

  const p = payload as CustomerTokenPayload;

  // Extra sanity check: the token's destination must match the expected shop
  if (!p.dest?.includes(shop.replace(".myshopify.com", ""))) {
    throw new Error("Token shop mismatch");
  }

  return p;
}

/**
 * Extract the raw bearer token from an Authorization header.
 * Returns null if missing / malformed.
 */
export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}
