/**
 * app._index.tsx  –  Overview dashboard
 *
 * Shows:
 *  - Quiz completion count (aggregate, no PII)
 *  - Whether the quiz is enabled
 *  - Quick links to Quiz Builder and Settings
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { getQuizConfig } from "~/lib/quiz-config.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const [config, stats] = await Promise.all([
    getQuizConfig(shop),
    db.quizStats.findUnique({ where: { shop } }),
  ]);

  return json({
    shop,
    enabled: config?.enabled ?? false,
    questionCount: config?.questions.length ?? 0,
    totalCompleted: stats?.totalCompleted ?? 0,
    lastUpdated: stats?.updatedAt?.toISOString() ?? null,
  });
};

export default function Overview() {
  const { shop, enabled, questionCount, totalCompleted, lastUpdated } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page
      title="Quiz Overview"
      subtitle={shop}
      primaryAction={{
        content: "Go to Quiz Builder",
        onAction: () => navigate("/app/quiz-builder"),
      }}
      secondaryActions={[
        { content: "Settings", onAction: () => navigate("/app/settings") },
      ]}
    >
      <Layout>
        {/* Status banner */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">
                  Quiz Status
                </Text>
                <Badge tone={enabled ? "success" : "warning"}>
                  {enabled ? "Enabled" : "Disabled"}
                </Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                The onboarding quiz is{" "}
                {enabled
                  ? "active and showing to new customers."
                  : "currently disabled. Enable it in Settings."}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Stat cards */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            <StatCard
              title="Completions"
              value={totalCompleted.toLocaleString()}
              description="Total customers who finished the quiz"
            />
            <StatCard
              title="Questions"
              value={String(questionCount)}
              description="Active questions in the quiz"
            />
            <StatCard
              title="Last Activity"
              value={
                lastUpdated
                  ? new Date(lastUpdated).toLocaleDateString()
                  : "—"
              }
              description="Date of most recent completion"
            />
          </InlineGrid>
        </Layout.Section>

        {/* Getting started guide */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Getting Started
              </Text>
              <BlockStack gap="200">
                <StepItem
                  number={1}
                  title="Customise your quiz"
                  description="Add, edit or reorder questions in the Quiz Builder."
                  action={() => navigate("/app/quiz-builder")}
                  actionLabel="Open Quiz Builder"
                />
                <StepItem
                  number={2}
                  title="Install the customer account extension"
                  description="Deploy the extension to your customer account pages via the Shopify CLI."
                  action={() =>
                    window.open(
                      "https://shopify.dev/docs/apps/build/customer-identity/customer-account-ui-extensions",
                      "_blank",
                    )
                  }
                  actionLabel="View docs"
                />
                <StepItem
                  number={3}
                  title="Enable the quiz"
                  description="Toggle the quiz on in Settings to start collecting zero-party data."
                  action={() => navigate("/app/settings")}
                  actionLabel="Go to Settings"
                />
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text variant="headingSm" as="h3" tone="subdued">
          {title}
        </Text>
        <Text variant="heading2xl" as="p">
          {value}
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {description}
        </Text>
      </BlockStack>
    </Card>
  );
}

function StepItem({
  number,
  title,
  description,
  action,
  actionLabel,
}: {
  number: number;
  title: string;
  description: string;
  action: () => void;
  actionLabel: string;
}) {
  return (
    <InlineStack gap="400" align="start" blockAlign="start" wrap={false}>
      <Box
        background="bg-fill-active"
        borderRadius="full"
        padding="150"
        minWidth="28px"
      >
        <Text variant="bodyMd" as="span" fontWeight="bold">
          {number}
        </Text>
      </Box>
      <BlockStack gap="100">
        <Text variant="bodyMd" as="p" fontWeight="semibold">
          {title}
        </Text>
        <Text as="p" tone="subdued">
          {description}
        </Text>
        <Button variant="plain" onClick={action}>
          {actionLabel}
        </Button>
      </BlockStack>
    </InlineStack>
  );
}
