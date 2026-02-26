/**
 * index.tsx  —  Customer Account UI Extension entry point
 *
 * Extension target: customer-account.page.render
 *
 * This renders a dedicated quiz page inside the customer account area.
 * Shopify's Customer Account API provides session tokens; we use these
 * to authenticate every backend call — admin tokens are never exposed here.
 *
 * Auth flow:
 *   1. customerAccount.getAccessToken() → short-lived JWT (RS256)
 *   2. POST /api/quiz-status?shop=<shop>
 *      Authorization: Bearer <token>
 *      → { enabled, completed, questions, consentText }
 *   3. If not completed, render the quiz form
 *   4. On submit: POST /api/quiz-submit
 *      Authorization: Bearer <token>
 *      Body: { shop, answers }
 *   5. On success, show a thank-you screen (quiz_completed metafield
 *      is written by the backend — next load will skip the quiz)
 *
 * Docs:
 *   https://shopify.dev/docs/api/customer-account-ui-extensions
 */

import {
  reactExtension,
  useApi,
  useSettings,
} from "@shopify/ui-extensions-react/customer-account";
import { QuizPage } from "./QuizPage";

// The extension entry point registered in shopify.extension.toml
export default reactExtension("customer-account.page.render", () => <App />);

function App() {
  // `useApi` gives access to the Customer Account API surface
  const api = useApi("customer-account.page.render");
  // Settings fields defined in shopify.extension.toml
  const { app_url: appUrl } = useSettings<{ app_url?: string }>();

  // The shop domain comes from the storefront object on the API
  // (available in Customer Account extensions as of 2024-10)
  const shop = api.shop?.myshopifyDomain ?? "";

  const resolvedAppUrl = appUrl ?? process.env.SHOPIFY_APP_URL ?? "";

  return (
    <QuizPage
      api={api}
      shop={shop}
      appUrl={resolvedAppUrl}
    />
  );
}
