# Shopify Quiz App — Zero-Party Data Onboarding Quiz

A production-ready Shopify app that collects zero-party data from customers via an onboarding quiz in the **customer account area**, stores answers as typed metafields on the customer record, and provides a Polaris merchant dashboard.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                      SHOPIFY PLATFORM                          │
│                                                                │
│  ┌─────────────────────────┐  ┌───────────────────────────┐   │
│  │  Customer Accounts Area │  │     Shopify Admin         │   │
│  │  (UI Extension)         │  │  (Embedded App)           │   │
│  │                         │  │                           │   │
│  │  QuizPage.tsx           │  │  /app          Overview   │   │
│  │  └─ fetch() + JWT token │  │  /app/quiz-builder        │   │
│  └────────────┬────────────┘  │  /app/settings            │   │
│               │                └───────────────────────────┘   │
└───────────────┼───────────────────────────────────────────────┘
                │ POST /api/quiz-submit
                │ Authorization: Bearer <customerAccountToken>
                ▼
┌───────────────────────────────────────────────────────────────┐
│                   REMIX APP (backend)                          │
│                                                                │
│  api.quiz-status   → verify JWT → return config + done flag   │
│  api.quiz-submit   → verify JWT → Admin API metafieldsSet()   │
│  webhooks/*        → GDPR + uninstall handlers                 │
│  Prisma (SQLite/PG) → Sessions, QuizConfig, QuizStats          │
└───────────────────────────────────────────────────────────────┘
                │ Admin GraphQL
                ▼
┌───────────────────────────────────────────────────────────────┐
│           SHOPIFY CUSTOMER METAFIELDS (namespace: zpd)         │
│  quiz_completed       boolean                                  │
│  quiz_completed_at    date_time                                │
│  style_preference     single_line_text_field                   │
│  size                 single_line_text_field                   │
│  interests            list.single_line_text_field              │
│  budget_range         single_line_text_field                   │
└───────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
shopify-quiz-app/
├── app/
│   ├── db.server.ts                  Prisma client singleton
│   ├── root.tsx                      Remix root layout
│   ├── shopify.server.ts             Shopify app config + afterAuth hook
│   ├── lib/
│   │   ├── customer-token.server.ts  JWT verification (JWKS, jose)
│   │   ├── metafields.server.ts      Admin GraphQL helpers
│   │   ├── quiz-config.server.ts     Read/write QuizConfig in DB
│   │   └── rate-limit.server.ts      In-memory sliding-window rate limiter
│   └── routes/
│       ├── app.tsx                   Embedded admin shell (AppProvider)
│       ├── app._index.tsx            Overview dashboard
│       ├── app.quiz-builder.tsx      Quiz Builder (questions CRUD)
│       ├── app.settings.tsx          Settings (toggle, namespace, consent)
│       ├── auth.$.tsx                OAuth catch-all
│       ├── auth.login/               Login page
│       ├── api.quiz-status.tsx       GET  /api/quiz-status
│       ├── api.quiz-submit.tsx       POST /api/quiz-submit
│       ├── webhooks.app.uninstalled.tsx
│       ├── webhooks.customers.data_request.tsx
│       ├── webhooks.customers.redact.tsx
│       └── webhooks.shop.redact.tsx
├── extensions/
│   └── customer-account-quiz/
│       ├── shopify.extension.toml    Extension manifest
│       ├── package.json
│       ├── tsconfig.json
│       ├── locales/en.default.json
│       └── src/
│           ├── index.tsx             Extension entry (target registration)
│           └── QuizPage.tsx          Quiz UI state machine
├── prisma/
│   └── schema.prisma
├── shopify.app.toml
├── vite.config.ts
├── tsconfig.json
├── package.json
├── .env.example
└── README.md
```

---

## Local Development — Step by Step

### Prerequisites

- Node.js 18+ (v22 recommended)
- [Shopify CLI 3.x](https://shopify.dev/docs/apps/tools/cli) — `npm install -g @shopify/cli`
- A [Shopify Partner account](https://partners.shopify.com) with a development store

### 1. Clone and install

```bash
git clone <repo-url> shopify-quiz-app
cd shopify-quiz-app
npm install
```

### 2. Create the app in your Partner Dashboard

1. Go to **Partners Dashboard → Apps → Create app**
2. Choose **Create app manually**
3. Copy the **API key** and **API secret**

### 3. Configure environment variables

```bash
cp .env.example .env
# Edit .env and fill in SHOPIFY_API_KEY, SHOPIFY_API_SECRET
```

### 4. Set up the database

```bash
npx prisma migrate dev --name init
# Creates dev.db (SQLite) with all tables
```

### 5. Link your app config

```bash
npx shopify app config link
# Follow prompts to select your app from the Partner Dashboard
```

### 6. Start the dev server

```bash
npm run dev
# Shopify CLI starts the app, creates a tunnel, and opens the browser
# The tunnel URL is automatically set as SHOPIFY_APP_URL
```

### 7. Install on your dev store

- Follow the installation URL printed by the CLI
- Complete OAuth — the `afterAuth` hook creates a default `QuizConfig`

### 8. Deploy the customer account extension

```bash
npx shopify app deploy
# This pushes the extension to Shopify and makes it available
# in your dev store's customer account area
```

To enable the extension in your store:
1. Go to **Shopify Admin → Online Store → Themes → Customize**
2. Navigate to **Customer accounts**
3. Add the **Onboarding Quiz** block (or page)
4. Set the **App URL** setting to your app's public URL

### 9. Test the quiz

1. Create a new customer account on your dev store
2. Navigate to the customer account area (`/account`)
3. The quiz page should appear at `/extensions/customer-account-quiz`
4. Complete the quiz and verify metafields in **Admin → Customers → [customer] → Metafields**

---

## GraphQL Operations Reference

### Write quiz answers (Backend → Admin API)

```graphql
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
```

Variables:
```json
{
  "metafields": [
    {
      "ownerId": "gid://shopify/Customer/1234567890",
      "namespace": "zpd",
      "key": "style_preference",
      "type": "single_line_text_field",
      "value": "Minimalist"
    },
    {
      "ownerId": "gid://shopify/Customer/1234567890",
      "namespace": "zpd",
      "key": "interests",
      "type": "list.single_line_text_field",
      "value": "[\"Running\",\"Travel\"]"
    },
    {
      "ownerId": "gid://shopify/Customer/1234567890",
      "namespace": "zpd",
      "key": "quiz_completed",
      "type": "boolean",
      "value": "true"
    },
    {
      "ownerId": "gid://shopify/Customer/1234567890",
      "namespace": "zpd",
      "key": "quiz_completed_at",
      "type": "date_time",
      "value": "2025-01-15T10:30:00Z"
    }
  ]
}
```

### Check quiz completion (Backend → Admin API)

```graphql
query GetCustomerQuizStatus($customerId: ID!, $namespace: String!, $key: String!) {
  customer(id: $customerId) {
    metafield(namespace: $namespace, key: $key) {
      id
      value
      updatedAt
    }
  }
}
```

Variables:
```json
{
  "customerId": "gid://shopify/Customer/1234567890",
  "namespace": "zpd",
  "key": "quiz_completed"
}
```

### GDPR — delete customer metafields

```graphql
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
```

---

## Metafield Schema

| Namespace | Key                | Type                         | Description                          |
|-----------|-------------------|------------------------------|--------------------------------------|
| `zpd`     | `quiz_completed`   | `boolean`                    | `true` after completion              |
| `zpd`     | `quiz_completed_at`| `date_time`                  | ISO-8601 timestamp                   |
| `zpd`     | `style_preference` | `single_line_text_field`     | Chosen style                         |
| `zpd`     | `size`             | `single_line_text_field`     | Clothing size                        |
| `zpd`     | `interests`        | `list.single_line_text_field`| JSON array of selected interests     |
| `zpd`     | `budget_range`     | `single_line_text_field`     | Budget bracket                       |

To create metafield definitions (recommended for storefront access):
```
Shopify Admin → Settings → Custom data → Customers → Add definition
```

---

## Security Notes

| Concern | Mitigation |
|---|---|
| Admin tokens in extension | Never sent — extension uses Customer Account tokens only |
| Customer impersonation | JWT verified against Shopify's JWKS (RS256) before any write |
| Rate limiting | Sliding-window per IP (5 submits/min, 30 status checks/min) |
| Input validation | Zod schema on all API inputs; only allowlisted keys written |
| PII storage | No customer PII in our DB; all answers live in Shopify metafields |
| GDPR | `customers/redact` webhook deletes all ZPD metafields; `shop/redact` wipes merchant config |
| Multi-tenant | Per-shop offline sessions in Prisma; scoped DB queries by shop |

---

## Production Deployment

### Recommended stack
- **Hosting**: Railway, Render, Fly.io, or Heroku (Node.js)
- **Database**: PostgreSQL (change `DATABASE_URL` and `provider = "postgresql"` in `schema.prisma`)
- **Rate limiting**: Replace in-memory limiter with [Upstash Redis](https://upstash.com)

### Deploy checklist
1. Set all env vars on your hosting platform
2. Run `npx prisma migrate deploy` (not `dev`) on first deploy
3. Run `npx shopify app deploy` to push the extension
4. Update `SHOPIFY_APP_URL` to your production domain
5. Re-register webhooks: `npx shopify app webhook trigger` or via afterAuth hook

---

## Development Commands

```bash
npm run dev          # Start dev server with Shopify CLI tunnel
npm run build        # Production build
npm run setup        # Generate Prisma client + run migrations
npx prisma studio    # Browse the database in a GUI
npx prisma migrate dev --name <name>  # Create a new migration
```
