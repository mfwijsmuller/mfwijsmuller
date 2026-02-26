/**
 * webhooks.customers.redact.tsx
 *
 * POST /webhooks/customers/redact  (GDPR compliance topic)
 *
 * Shopify sends this 10 days after a customer requests account deletion,
 * or after the store requests bulk data deletion.
 *
 * We must delete any PII we hold for this customer.
 *
 * Our approach:
 *  - Quiz answers are stored as Shopify Customer metafields — Shopify
 *    redacts those when the customer record is deleted.
 *  - We call the Admin API to explicitly delete our metafields anyway,
 *    providing defence-in-depth.
 *  - We hold NO customer PII in our own DB.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

// GraphQL to fetch all metafields in our namespace for a customer
const GET_ZPD_METAFIELDS = `#graphql
  query GetZPDMetafields($customerId: ID!, $namespace: String!) {
    customer(id: $customerId) {
      metafields(namespace: $namespace, first: 50) {
        edges {
          node {
            id
          }
        }
      }
    }
  }
`;

// GraphQL to delete metafields by ID
const DELETE_METAFIELDS = `#graphql
  mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields {
        ownerId
        namespace
        key
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  const body = payload as {
    customer: { id: number };
    shop_domain: string;
  };

  const customerId = `gid://shopify/Customer/${body.customer.id}`;
  const namespace = "zpd";

  console.log(`[GDPR] ${topic} received for customer ${customerId} on ${shop}`);

  if (admin) {
    // 1. Fetch all ZPD metafield IDs
    const listResponse = await admin.graphql(GET_ZPD_METAFIELDS, {
      variables: { customerId, namespace },
    });

    const listJson = (await listResponse.json()) as {
      data?: {
        customer?: {
          metafields?: {
            edges: Array<{ node: { id: string } }>;
          };
        };
      };
    };

    const metafieldIds =
      listJson.data?.customer?.metafields?.edges.map(
        (e) => e.node.id,
      ) ?? [];

    if (metafieldIds.length > 0) {
      // 2. Delete them
      // metafieldsDelete accepts MetafieldIdentifierInput: { id }
      await admin.graphql(DELETE_METAFIELDS, {
        variables: {
          metafields: metafieldIds.map((id) => ({ id })),
        },
      });

      console.log(
        `[GDPR] Deleted ${metafieldIds.length} ZPD metafields for ${customerId}`,
      );
    }
  }

  return new Response(null, { status: 200 });
};
