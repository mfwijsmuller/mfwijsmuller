/**
 * QuizPage.tsx
 *
 * The main quiz UI rendered inside the customer account area.
 *
 * Uses Shopify's customer account UI extension component library:
 *   - Page, Card, BlockStack, InlineStack, Text, Button, etc.
 *   - Select, Checkbox for answer inputs
 *
 * State machine: idle → loading → (skip | quiz) → submitting → done | error
 */

import { useEffect, useState, useCallback } from "react";
import {
  BlockStack,
  Button,
  Card,
  Checkbox,
  Heading,
  InlineStack,
  Page,
  Select,
  Text,
  View,
} from "@shopify/ui-extensions-react/customer-account";

// ---------------------------------------------------------------------------
// Types (mirrors QuizQuestion in quiz-config.server.ts)
// ---------------------------------------------------------------------------
interface QuizQuestion {
  id: string;
  key: string;
  type: "single_line_text_field" | "list.single_line_text_field";
  question: string;
  options: string[];
  multiSelect?: boolean;
}

interface QuizStatus {
  enabled: boolean;
  completed: boolean;
  questions: QuizQuestion[];
  consentText: string;
}

type PageState =
  | { phase: "loading" }
  | { phase: "skip" }           // quiz disabled or already completed
  | { phase: "quiz"; status: QuizStatus }
  | { phase: "submitting" }
  | { phase: "done" }
  | { phase: "error"; message: string };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface QuizPageProps {
  // The Customer Account extension API object (from useApi)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api: any;
  shop: string;
  appUrl: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function QuizPage({ api, shop, appUrl }: QuizPageProps) {
  const [state, setState] = useState<PageState>({ phase: "loading" });
  // answers keyed by question.key → single string or array of strings
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  // ── Step 1: Check quiz status on mount ─────────────────────────────────
  useEffect(() => {
    if (!appUrl || !shop) {
      setState({ phase: "error", message: "App is not configured (missing app URL)." });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // Get a short-lived Customer Account access token.
        // This is a JWT signed by Shopify — never an admin token.
        const token = await api.customerAccount.getAccessToken();

        const res = await fetch(`${appUrl}/api/quiz-status?shop=${encodeURIComponent(shop)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);
        const status: QuizStatus = await res.json();

        if (cancelled) return;
        if (!status.enabled || status.completed) {
          setState({ phase: "skip" });
        } else {
          setState({ phase: "quiz", status });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            phase: "error",
            message: err instanceof Error ? err.message : "Failed to load quiz.",
          });
        }
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Step 2: Handle answer changes ──────────────────────────────────────
  const handleSingleAnswer = useCallback((key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleMultiAnswer = useCallback((key: string, option: string, checked: boolean) => {
    setAnswers((prev) => {
      const current = (prev[key] as string[] | undefined) ?? [];
      return {
        ...prev,
        [key]: checked
          ? [...current, option]
          : current.filter((o) => o !== option),
      };
    });
  }, []);

  // ── Step 3: Submit quiz ─────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (state.phase !== "quiz") return;

    // Basic client-side validation: all questions need at least one answer
    for (const q of state.status.questions) {
      const ans = answers[q.key];
      if (!ans || (Array.isArray(ans) && ans.length === 0)) {
        setState({
          phase: "error",
          message: `Please answer "${q.question}" before submitting.`,
        });
        return;
      }
    }

    setState({ phase: "submitting" });

    try {
      const token = await api.customerAccount.getAccessToken();

      const res = await fetch(`${appUrl}/api/quiz-submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shop, answers }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      setState({ phase: "done" });
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Submission failed.",
      });
    }
  }, [state, answers, api, appUrl, shop]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (state.phase === "loading") {
    return (
      <Page>
        <Text>Loading your personalisation quiz…</Text>
      </Page>
    );
  }

  if (state.phase === "skip") {
    // Quiz not needed — navigate away or show a neutral message
    return (
      <Page>
        <Card>
          <BlockStack spacing="base">
            <Heading>You&apos;re all set!</Heading>
            <Text>
              Your preferences are already saved. Thank you for completing the quiz.
            </Text>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  if (state.phase === "done") {
    return (
      <Page>
        <Card>
          <BlockStack spacing="loose">
            <Heading>Thank you! 🎉</Heading>
            <Text>
              Your preferences have been saved. We&apos;ll use them to personalise
              your experience.
            </Text>
            <Button
              kind="primary"
              onPress={() => {
                // Navigate back to the account home
                api.navigation?.navigate?.("shopify:customer-account/profile");
              }}
            >
              Go to my account
            </Button>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  if (state.phase === "error") {
    return (
      <Page>
        <Card>
          <BlockStack spacing="base">
            <Heading>Something went wrong</Heading>
            <Text>{state.message}</Text>
            <Button
              kind="secondary"
              onPress={() => setState({ phase: "loading" })}
            >
              Try again
            </Button>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  if (state.phase === "submitting") {
    return (
      <Page>
        <Text>Saving your answers…</Text>
      </Page>
    );
  }

  // ── Quiz form ────────────────────────────────────────────────────────────
  const { questions, consentText } = state.status;

  return (
    <Page>
      <BlockStack spacing="loose">
        <Card>
          <BlockStack spacing="base">
            <Heading>Tell us about yourself</Heading>
            <Text>
              Answer a few quick questions to help us personalise your shopping
              experience.
            </Text>
          </BlockStack>
        </Card>

        {questions.map((q) => (
          <Card key={q.id}>
            <BlockStack spacing="base">
              <Text size="medium" emphasis="bold">
                {q.question}
              </Text>

              {q.multiSelect ? (
                /* Multi-select: render checkboxes */
                <BlockStack spacing="tight">
                  {q.options.map((opt) => {
                    const current = (answers[q.key] as string[] | undefined) ?? [];
                    return (
                      <Checkbox
                        key={opt}
                        id={`${q.key}-${opt}`}
                        label={opt}
                        checked={current.includes(opt)}
                        onChange={(checked) =>
                          handleMultiAnswer(q.key, opt, checked)
                        }
                      />
                    );
                  })}
                </BlockStack>
              ) : (
                /* Single-select: render a dropdown */
                <Select
                  label={q.question}
                  labelHidden
                  value={(answers[q.key] as string | undefined) ?? ""}
                  onChange={(v) => handleSingleAnswer(q.key, v)}
                  options={[
                    { value: "", label: "— Select an option —", disabled: true },
                    ...q.options.map((opt) => ({ value: opt, label: opt })),
                  ]}
                />
              )}
            </BlockStack>
          </Card>
        ))}

        {/* Consent block */}
        <View>
          <Text size="small" appearance="subdued">
            {consentText}
          </Text>
        </View>

        {/* Submit */}
        <Button
          kind="primary"
          onPress={handleSubmit}
          loading={state.phase === "submitting"}
        >
          Save my preferences
        </Button>
      </BlockStack>
    </Page>
  );
}
