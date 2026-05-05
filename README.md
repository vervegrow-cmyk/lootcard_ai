# CardForge AI

CardForge AI is a Discord-first AI agent for selling and coordinating custom trading card projects.
It turns casual customer messages into a structured order flow: collect requirements, generate polished card prompts, present multiple design directions, revise concepts based on feedback, confirm the final design, and create a Shopify checkout link.

This project is built for Discord communities, custom card sellers, and creators who want an AI-assisted workflow for made-to-order card sales.

## Highlights

- Multi-agent workflow for inquiry, prompt generation, style exploration, feedback refinement, and Shopify product creation
- Discord bot that supports multi-turn customer conversations
- A/B/C design option flow with mock image previews
- PostgreSQL + Prisma persistence for user memory, project state, style options, and conversation history
- Shopify product creation with made-to-order messaging and an estimated 30-day delivery note
- Railway-ready deployment setup

## Example User Journey

1. A user sends a message in Discord:

```text
I want a black and gold dark queen trading card, SSR, physical card, 10 copies.
```

2. The bot collects any missing details.
3. The prompt agent turns the request into a polished image prompt.
4. The style agent generates three design directions:
   - A. Black Gold Luxury Card
   - B. Dark Gothic Queen Card
   - C. Cyber Neon Limited Card
5. The user chooses a direction or sends revision feedback.
6. The feedback agent refines the prompt and generates updated options.
7. When the user explicitly confirms, the system creates a Shopify product.
8. The checkout link is returned directly in Discord.

## Tech Stack

- Node.js
- TypeScript
- discord.js
- Express
- Prisma
- PostgreSQL
- Claude API / Anthropic SDK
- Shopify Admin API
- dotenv
- Railway

## Project Structure

```text
cardforge-ai/
├─ src/
│  ├─ index.ts
│  ├─ server.ts
│  ├─ bot/
│  │  └─ discord.bot.ts
│  ├─ agents/
│  │  ├─ main-agent.ts
│  │  ├─ prompt-agent.ts
│  │  ├─ style-agent.ts
│  │  ├─ feedback-agent.ts
│  │  └─ shopify-agent.ts
│  ├─ services/
│  │  ├─ claude.service.ts
│  │  ├─ image.service.ts
│  │  ├─ shopify.service.ts
│  │  ├─ memory.service.ts
│  │  └─ order.service.ts
│  ├─ prompts/
│  │  ├─ main-agent.prompt.ts
│  │  ├─ prompt-generator.prompt.ts
│  │  ├─ feedback-optimizer.prompt.ts
│  │  └─ product-description.prompt.ts
│  ├─ routes/
│  │  └─ health.route.ts
│  ├─ types/
│  │  └─ index.ts
│  └─ utils/
│     ├─ json-parser.ts
│     └─ logger.ts
├─ prisma/
│  └─ schema.prisma
├─ .env.example
├─ package.json
├─ tsconfig.json
├─ railway.json
└─ README.md
```

## Core Workflow

1. The Discord bot listens for `messageCreate`.
2. User input is stored in `ConversationLog`.
3. `MainAgent` decides whether to ask follow-up questions, show style options, revise a concept, or create a Shopify product.
4. `PromptAgent` generates a professional card image prompt.
5. `StyleAgent` builds three creative directions.
6. `ImageService` returns mock preview URLs when `MOCK_IMAGE_MODE=true`.
7. `FeedbackAgent` improves the active prompt when the customer asks for changes.
8. `ShopifyAgent` prepares title, description, SKU, price, and tags.
9. `ShopifyService` creates the final product and returns the product URL.

## Local Setup

1. Enter the project directory:

```bash
cd cardforge-ai
```

2. Install dependencies:

```bash
npm install
```

3. Copy the environment template:

```bash
cp .env.example .env
```

4. Set your PostgreSQL `DATABASE_URL`.
5. Generate Prisma Client:

```bash
npm run prisma:generate
```

6. Run migrations:

```bash
npm run prisma:migrate
```

7. Start development mode:

```bash
npm run dev
```

## Environment Variables

```env
DISCORD_BOT_TOKEN=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
SHOPIFY_STORE_DOMAIN=
SHOPIFY_ADMIN_ACCESS_TOKEN=
SHOPIFY_API_VERSION=2025-10
DATABASE_URL=
PORT=3000
DEFAULT_CARD_PRICE=29.99
MOCK_IMAGE_MODE=true
```

## PostgreSQL

Example local connection string:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/cardforge_ai?schema=public
```

Railway PostgreSQL can also provide the `DATABASE_URL` directly.

## Discord Bot Setup

1. Open Discord Developer Portal.
2. Create a new application.
3. Go to the `Bot` page and create a bot user.
4. Copy the bot token into `.env` as `DISCORD_BOT_TOKEN`.
5. In `OAuth2 > URL Generator`, select:
   - `bot`
   - `applications.commands`
6. Grant at least these permissions:
   - `View Channels`
   - `Send Messages`
   - `Read Message History`
   - `Use Slash Commands`

## Enable MESSAGE CONTENT INTENT

1. Open your app in Discord Developer Portal.
2. Go to the `Bot` page.
3. Enable `MESSAGE CONTENT INTENT` under privileged intents.
4. Save and restart the bot.

## Shopify Custom App Setup

1. Open Shopify Admin.
2. Go to `Settings > Apps and sales channels`.
3. Click `Develop apps`.
4. Create a custom app.
5. Enable at least:
   - `write_products`
   - `read_products`
6. Install the app and copy the Admin API access token.
7. Fill in:
   - `SHOPIFY_STORE_DOMAIN`
   - `SHOPIFY_ADMIN_ACCESS_TOKEN`
   - `SHOPIFY_API_VERSION`

## Railway Deployment

1. Push this project to GitHub.
2. Create a new Railway project from the GitHub repository.
3. Add a PostgreSQL service.
4. Set the required environment variables in Railway.
5. Railway will read `railway.json`.

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm run start
```

Health check:

```text
https://your-service.up.railway.app/health
```

## Testing Flow

Send a message like:

```text
I want a black and gold dark queen trading card, SSR, physical card, 10 copies.
```

Then test these flows:

- missing detail follow-up questions
- option selection with `A`, `B`, or `C`
- revision requests like `Make it darker`
- final confirmation with `confirm`, `确认`, `就这个`, `可以下单`, or `create link`

## Mock Image Generation

When `MOCK_IMAGE_MODE=true`, the app uses placeholder preview URLs from `placehold.co` so the full flow works without a real image model.

## Database Models

- `UserMemory`
- `CardProject`
- `CardStyleOption`
- `FeedbackLog`
- `ShopifyProductLog`
- `ConversationLog`

## Business Rules

- Ask no more than 1 or 2 follow-up questions at a time
- Do not create a Shopify product before explicit customer confirmation
- Product descriptions must state that production and delivery take approximately 30 days
- Do not promise refund policies unless you add your own backend rule
- If image generation fails, the text-based option flow should still continue

## Future Extensions

- Real image generation API integration
- Discord button-based option selection
- Shopify order notifications
- Admin dashboard
- Exportable customer feedback training data

## Current Notes

- If `ANTHROPIC_API_KEY` is missing, the project falls back to local prompt logic so the mock flow can still run.
- Real Shopify product creation still requires valid Shopify credentials.
