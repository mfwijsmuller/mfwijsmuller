/**
 * app.quiz-builder.tsx  –  Quiz Builder page
 *
 * Merchant can add, edit, reorder, and delete quiz questions.
 * Changes are saved to the QuizConfig table.
 *
 * Data shape per question:
 *   { id, key, type, question, options[], multiSelect? }
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  Divider,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Select,
  Tag,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useState } from "react";
import { authenticate } from "~/shopify.server";
import {
  getQuizConfig,
  saveQuizConfig,
  type QuizQuestion,
} from "~/lib/quiz-config.server";

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await getQuizConfig(session.shop);
  return json({ questions: config?.questions ?? [] });
};

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  let questions: QuizQuestion[];
  try {
    questions = JSON.parse(formData.get("questions") as string) as QuizQuestion[];
  } catch {
    return json({ error: "Invalid questions payload" }, { status: 400 });
  }

  // Basic server-side validation
  for (const q of questions) {
    if (!q.id || !q.key || !q.question) {
      return json({ error: "Each question must have id, key, and question text" }, { status: 400 });
    }
    if (!/^[a-z_]{1,64}$/.test(q.key)) {
      return json({ error: `Invalid key "${q.key}". Use lowercase letters and underscores only.` }, { status: 400 });
    }
    if (q.options.length < 2) {
      return json({ error: `Question "${q.question}" must have at least 2 options.` }, { status: 400 });
    }
  }

  await saveQuizConfig(session.shop, { questions });
  return json({ success: true });
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const TYPE_OPTIONS = [
  { label: "Single answer", value: "single_line_text_field" },
  { label: "Multiple answers", value: "list.single_line_text_field" },
];

export default function QuizBuilderPage() {
  const { questions: initialQuestions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions);
  const saving = navigation.state === "submitting";

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: `q_${Date.now()}`,
        key: "",
        type: "single_line_text_field",
        question: "",
        options: ["Option 1", "Option 2"],
        multiSelect: false,
      },
    ]);
  };

  const updateQuestion = (idx: number, patch: Partial<QuizQuestion>) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    );
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.set("questions", JSON.stringify(questions));
    submit(formData, { method: "post" });
  }, [questions, submit]);

  return (
    <Page
      title="Quiz Builder"
      primaryAction={{
        content: saving ? "Saving…" : "Save changes",
        onAction: handleSave,
        loading: saving,
      }}
    >
      <Layout>
        {actionData && "error" in actionData && (
          <Layout.Section>
            <Banner tone="critical" title="Save failed">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}
        {actionData && "success" in actionData && (
          <Layout.Section>
            <Banner tone="success" title="Quiz saved!" />
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="500">
            {questions.length === 0 ? (
              <Card>
                <EmptyState
                  heading="No questions yet"
                  action={{ content: "Add first question", onAction: addQuestion }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Add questions to collect zero-party data from your customers.</p>
                </EmptyState>
              </Card>
            ) : (
              questions.map((q, idx) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  index={idx}
                  total={questions.length}
                  onChange={(patch) => updateQuestion(idx, patch)}
                  onRemove={() => removeQuestion(idx)}
                  onMove={(dir) => moveQuestion(idx, dir)}
                />
              ))
            )}

            <Button onClick={addQuestion} variant="secondary">
              + Add question
            </Button>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// QuestionCard
// ---------------------------------------------------------------------------
function QuestionCard({
  question,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  question: QuizQuestion;
  index: number;
  total: number;
  onChange: (patch: Partial<QuizQuestion>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [newOption, setNewOption] = useState("");

  const addOption = () => {
    if (!newOption.trim()) return;
    onChange({ options: [...question.options, newOption.trim()] });
    setNewOption("");
  };

  const removeOption = (opt: string) => {
    onChange({ options: question.options.filter((o) => o !== opt) });
  };

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text variant="headingSm" as="h3">
            Question {index + 1}
          </Text>
          <InlineStack gap="200">
            <Button
              size="slim"
              icon={undefined}
              disabled={index === 0}
              onClick={() => onMove(-1)}
              accessibilityLabel="Move up"
            >
              ↑
            </Button>
            <Button
              size="slim"
              disabled={index === total - 1}
              onClick={() => onMove(1)}
              accessibilityLabel="Move down"
            >
              ↓
            </Button>
            <Button size="slim" tone="critical" onClick={onRemove}>
              Remove
            </Button>
          </InlineStack>
        </InlineStack>

        <Divider />

        <TextField
          label="Question text"
          value={question.question}
          onChange={(v) => onChange({ question: v })}
          autoComplete="off"
          placeholder="e.g. Which style best describes you?"
        />

        <TextField
          label="Metafield key"
          value={question.key}
          onChange={(v) => onChange({ key: v.toLowerCase().replace(/[^a-z_]/g, "_") })}
          autoComplete="off"
          helpText="Lowercase, underscores only. Used as the Shopify metafield key."
          placeholder="e.g. style_preference"
        />

        <Select
          label="Answer type"
          options={TYPE_OPTIONS}
          value={question.type}
          onChange={(v) =>
            onChange({
              type: v as QuizQuestion["type"],
              multiSelect: v === "list.single_line_text_field",
            })
          }
        />

        <BlockStack gap="200">
          <Text variant="bodySm" as="p" tone="subdued">
            Options (at least 2)
          </Text>
          <InlineStack gap="200" wrap>
            {question.options.map((opt) => (
              <Tag key={opt} onRemove={() => removeOption(opt)}>
                {opt}
              </Tag>
            ))}
          </InlineStack>
          <InlineStack gap="200" align="start">
            <TextField
              label=""
              labelHidden
              value={newOption}
              onChange={setNewOption}
              placeholder="New option…"
              autoComplete="off"
              onKeyPress={(e: React.KeyboardEvent) => {
                if (e.key === "Enter") addOption();
              }}
            />
            <Button onClick={addOption} size="slim">
              Add
            </Button>
          </InlineStack>
        </BlockStack>

        {question.type === "list.single_line_text_field" && (
          <Checkbox
            label="Allow multiple selections"
            checked={question.multiSelect ?? true}
            onChange={(v) => onChange({ multiSelect: v })}
          />
        )}
      </BlockStack>
    </Card>
  );
}
