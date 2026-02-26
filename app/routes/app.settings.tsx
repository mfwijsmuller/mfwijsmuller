/**
 * app.settings.tsx  –  Settings page
 *
 * Merchant can:
 *  - Enable / disable the quiz
 *  - Customise the metafield namespace
 *  - Customise the consent / privacy copy shown in the quiz
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  ContextualSaveBar,
  Divider,
  Layout,
  Page,
  Text,
  TextField,
  Toggle,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { authenticate } from "~/shopify.server";
import { getQuizConfig, saveQuizConfig } from "~/lib/quiz-config.server";

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await getQuizConfig(session.shop);

  return json({
    enabled: config?.enabled ?? false,
    namespace: config?.namespace ?? "zpd",
    consentText:
      config?.consentText ??
      "Your answers help us personalise your experience. You can request deletion at any time.",
  });
};

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const enabled = formData.get("enabled") === "true";
  const namespace = (formData.get("namespace") as string)?.trim();
  const consentText = (formData.get("consentText") as string)?.trim();

  if (!namespace || !/^[a-z][a-z0-9_]{0,19}$/.test(namespace)) {
    return json(
      { error: "Namespace must be lowercase letters, numbers or underscores, starting with a letter, max 20 chars." },
      { status: 400 },
    );
  }

  if (!consentText) {
    return json({ error: "Consent text cannot be empty." }, { status: 400 });
  }

  await saveQuizConfig(session.shop, { enabled, namespace, consentText });
  return json({ success: true });
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  const loader = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const [enabled, setEnabled] = useState(loader.enabled);
  const [namespace, setNamespace] = useState(loader.namespace);
  const [consentText, setConsentText] = useState(loader.consentText);
  const isDirty =
    enabled !== loader.enabled ||
    namespace !== loader.namespace ||
    consentText !== loader.consentText;

  const saving = navigation.state === "submitting";

  // Reset dirty state after successful save
  useEffect(() => {
    if (actionData && "success" in actionData) {
      // loader values will refresh after action
    }
  }, [actionData]);

  return (
    <Page title="Settings">
      {isDirty && (
        <ContextualSaveBar
          message="Unsaved changes"
          saveAction={{
            content: saving ? "Saving…" : "Save",
            loading: saving,
            onAction: () => {
              const form = document.getElementById("settings-form") as HTMLFormElement;
              form?.requestSubmit();
            },
          }}
          discardAction={{
            onAction: () => {
              setEnabled(loader.enabled);
              setNamespace(loader.namespace);
              setConsentText(loader.consentText);
            },
          }}
        />
      )}

      <Form id="settings-form" method="post">
        <input type="hidden" name="enabled" value={String(enabled)} />

        <Layout>
          {actionData && "error" in actionData && (
            <Layout.Section>
              <Banner tone="critical" title="Could not save">
                <p>{actionData.error}</p>
              </Banner>
            </Layout.Section>
          )}
          {actionData && "success" in actionData && (
            <Layout.Section>
              <Banner tone="success" title="Settings saved!" />
            </Layout.Section>
          )}

          {/* Quiz toggle */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Quiz Toggle
                </Text>
                <Divider />
                <Toggle
                  label="Enable onboarding quiz"
                  helpText="When enabled, customers who have not completed the quiz will see it in their account area."
                  checked={enabled}
                  onChange={setEnabled}
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Metafield namespace */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Data Namespace
                </Text>
                <Divider />
                <TextField
                  label="Metafield namespace"
                  name="namespace"
                  value={namespace}
                  onChange={setNamespace}
                  helpText={`All quiz answers are stored under this namespace on the customer record (e.g. customer.metafields.${namespace}.style_preference).`}
                  autoComplete="off"
                  placeholder="zpd"
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Consent text */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Consent &amp; Privacy
                </Text>
                <Divider />
                <TextField
                  label="Consent text"
                  name="consentText"
                  value={consentText}
                  onChange={setConsentText}
                  multiline={4}
                  helpText="Displayed to the customer above the quiz submit button. Should explain how data is used and that they can request deletion."
                  autoComplete="off"
                />
                <Banner tone="info">
                  <p>
                    Shopify automatically handles GDPR customer data requests and
                    redaction webhooks for this app. Customers can also contact
                    your store to request data deletion at any time.
                  </p>
                </Banner>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Metafield schema reference */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Metafield Schema Reference
                </Text>
                <Divider />
                <Text as="p" tone="subdued">
                  The following metafields are written to each customer record when
                  they complete the quiz. You can also define custom metafield
                  definitions in your Shopify admin under{" "}
                  <strong>Settings → Custom data → Customers</strong>.
                </Text>
                <MetafieldTable namespace={namespace} />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Button submit variant="primary" loading={saving}>
              Save settings
            </Button>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Static metafield reference table
// ---------------------------------------------------------------------------
const METAFIELD_SCHEMA = [
  { key: "quiz_completed", type: "boolean", description: "True after the customer finishes the quiz" },
  { key: "quiz_completed_at", type: "date_time", description: "ISO-8601 timestamp of completion" },
  { key: "style_preference", type: "single_line_text_field", description: "Customer's style choice" },
  { key: "size", type: "single_line_text_field", description: "Preferred clothing size" },
  { key: "interests", type: "list.single_line_text_field", description: "List of selected interests" },
  { key: "budget_range", type: "single_line_text_field", description: "Preferred budget range" },
];

function MetafieldTable({ namespace }: { namespace: string }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #e1e3e5", textAlign: "left" }}>
            <th style={{ padding: "8px 12px" }}>Namespace</th>
            <th style={{ padding: "8px 12px" }}>Key</th>
            <th style={{ padding: "8px 12px" }}>Type</th>
            <th style={{ padding: "8px 12px" }}>Description</th>
          </tr>
        </thead>
        <tbody>
          {METAFIELD_SCHEMA.map((m) => (
            <tr
              key={m.key}
              style={{ borderBottom: "1px solid #f1f2f3" }}
            >
              <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>
                {namespace}
              </td>
              <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>
                {m.key}
              </td>
              <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#637381" }}>
                {m.type}
              </td>
              <td style={{ padding: "8px 12px" }}>{m.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
