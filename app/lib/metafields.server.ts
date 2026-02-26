/**
 * metafields.server.ts
 *
 * Admin GraphQL helpers for reading and writing customer metafields.
 * All mutations use the `metafieldsSet` bulk mutation (2024-01+).
 *
 * Credentials come from the per-shop offline session access token
 * retrieved via `authenticate.admin()` in each route.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface QuizAnswers {
  style_preference?: string;
  size?: string;
  interests?: string[];
  budget_range?: string;
  [key: string]: string | string[] | undefined;
}

export interface MetafieldInput {
  ownerId: string; // Shopify GID e.g. "gid://shopify/Customer/123"
  namespace: string;
  key: string;
  type: string;
  value: string;
}

// ---------------------------------------------------------------------------
// GraphQL – write multiple metafields in one call
// ---------------------------------------------------------------------------
const METAFIELDS_SET_MUTATION = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        key
        namespace
        value
        type
        updatedAt
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// GraphQL – read a single flag metafield to check quiz completion
// ---------------------------------------------------------------------------
const GET_QUIZ_STATUS_QUERY = `#graphql
  query GetCustomerQuizStatus($customerId: ID!, $namespace: String!, $key: String!) {
    customer(id: $customerId) {
      id
      metafield(namespace: $namespace, key: $key) {
        id
        value
        updatedAt
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// GraphQL – read all ZPD metafields for one customer (admin reporting)
// ---------------------------------------------------------------------------
const GET_CUSTOMER_ZPD_QUERY = `#graphql
  query GetCustomerZPD($customerId: ID!, $namespace: String!) {
    customer(id: $customerId) {
      id
      email
      metafields(namespace: $namespace, first: 20) {
        edges {
          node {
            key
            value
            type
            updatedAt
          }
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Write quiz answers + completion flag to a customer's metafields.
 * `graphql` is the bound GraphQL client from `authenticate.admin()`.
 */
export async function saveQuizAnswers(
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>,
  customerId: string, // GID
  answers: QuizAnswers,
  namespace = "zpd",
): Promise<{ ok: boolean; errors: string[] }> {
  const now = new Date().toISOString();

  // Build the metafields array from the answers object
  const metafields: MetafieldInput[] = Object.entries(answers)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([key, value]) => {
      const isArray = Array.isArray(value);
      return {
        ownerId: customerId,
        namespace,
        key,
        type: isArray ? "list.single_line_text_field" : "single_line_text_field",
        // Shopify list metafields expect JSON-encoded arrays
        value: isArray ? JSON.stringify(value) : String(value),
      };
    });

  // Append the completion flag and timestamp
  metafields.push(
    {
      ownerId: customerId,
      namespace,
      key: "quiz_completed",
      type: "boolean",
      value: "true",
    },
    {
      ownerId: customerId,
      namespace,
      key: "quiz_completed_at",
      type: "date_time",
      value: now,
    },
  );

  const response = await graphql(METAFIELDS_SET_MUTATION, {
    variables: { metafields },
  });

  const json = (await response.json()) as {
    data?: {
      metafieldsSet?: {
        metafields?: unknown[];
        userErrors?: Array<{ field: string[]; message: string }>;
      };
    };
  };

  const userErrors = json.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    return {
      ok: false,
      errors: userErrors.map((e) => `${e.field.join(".")}: ${e.message}`),
    };
  }

  return { ok: true, errors: [] };
}

/**
 * Check whether a customer has already completed the quiz.
 * Returns `true` when the `quiz_completed` metafield is `"true"`.
 */
export async function isQuizCompleted(
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>,
  customerId: string, // GID
  namespace = "zpd",
): Promise<boolean> {
  const response = await graphql(GET_QUIZ_STATUS_QUERY, {
    variables: { customerId, namespace, key: "quiz_completed" },
  });

  const json = (await response.json()) as {
    data?: {
      customer?: {
        metafield?: { value: string } | null;
      } | null;
    };
  };

  return json.data?.customer?.metafield?.value === "true";
}

/**
 * Fetch all ZPD metafields for one customer (used in admin reporting).
 */
export async function getCustomerZPD(
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>,
  customerId: string,
  namespace = "zpd",
) {
  const response = await graphql(GET_CUSTOMER_ZPD_QUERY, {
    variables: { customerId, namespace },
  });

  const json = (await response.json()) as {
    data?: {
      customer?: {
        id: string;
        email: string;
        metafields: { edges: Array<{ node: { key: string; value: string; type: string; updatedAt: string } }> };
      } | null;
    };
  };

  return json.data?.customer ?? null;
}
