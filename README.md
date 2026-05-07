# CardForge AI

中文：`CardForge AI` 是一个以 Discord 为入口的 AI 定制卡牌销售与设计 Agent。它可以和用户多轮沟通、润色提示词、生成图片方案、根据反馈改图，并在 Shopify OAuth 已授权后，自动创建 Shopify 商品链接给用户下单。  
English: `CardForge AI` is a Discord-first AI agent for custom trading card sales and design coordination. It can handle multi-turn customer chat, polish prompts, generate image options, revise designs, and, once Shopify OAuth is connected, automatically create Shopify product links for checkout.

## 项目能力 | What It Does

- 中文：支持中英文对话，并自动跟随用户语言。  
  English: Supports both Chinese and English and follows the user's language preference.
- 中文：使用 Hermes Orchestrator 统一识别 intent、stage、target agent 和 target skill。  
  English: Uses a Hermes Orchestrator to detect intent, stage, target agent, and target skill.
- 中文：支持提示词润色、直接出图、改图、A/B/C 选项选择。  
  English: Supports prompt polishing, direct image generation, image revision, and A/B/C option selection.
- 中文：支持 Shopify OAuth 自动授权，不再强依赖手动 Admin Access Token。  
  English: Supports Shopify OAuth authorization and no longer depends on a manually pasted Admin Access Token.
- 中文：支持 Discord 中直接创建 Shopify 商品，并返回 storefront 下单链接。  
  English: Supports creating a Shopify product directly from Discord and returning the storefront checkout link.
- 中文：使用 Prisma + PostgreSQL 保存用户记忆、项目状态、Shopify 会话和对话记录。  
  English: Uses Prisma + PostgreSQL to store user memory, project state, Shopify sessions, and conversation logs.

## 当前架构 | Current Architecture

```text
Discord User Message
  -> discord.bot.ts
  -> read memory + recent conversation
  -> Hermes Orchestrator
  -> target agent
  -> target skill
  -> execute tool / skill
  -> persist memory + conversation
  -> reply to Discord
```

### Agents

- `src/agents/hermes-orchestrator.agent.ts`  
  中文：唯一主控，负责语言识别、意图识别、阶段判断、路由和结果合并。  
  English: The single controller for language detection, intent detection, stage selection, routing, and result merging.
- `src/agents/customer-service.agent.ts`  
  中文：负责 FAQ、价格、交付周期和售后说明。  
  English: Handles FAQ, pricing, delivery, and after-sales explanations.
- `src/agents/design.agent.ts`  
  中文：负责需求收集、出图、选图和改图。  
  English: Handles requirement collection, image generation, selection, and revision.
- `src/agents/prompt.agent.ts`  
  中文：负责润色、翻译、扩写和图像 prompt 生成。  
  English: Handles prompt polishing, translation, expansion, and image-prompt conversion.
- `src/agents/shopify.agent.ts`  
  中文：负责 Shopify 商品创建、链接生成和支付流程返回。  
  English: Handles Shopify product creation, link generation, and payment flow responses.
- `src/agents/memory.agent.ts`  
  中文：负责持久化用户语言偏好、项目状态、选择和修改记录。  
  English: Handles persistence of language preference, project state, selections, and revisions.

### Skills

- `src/skills/customer-service/*`
- `src/skills/design/*`
- `src/skills/prompt/*`
- `src/skills/shopify/*`
- `src/skills/memory/*`

## Shopify 自动建品 | Shopify Auto Product Creation

中文：当用户在 Discord 发送类似下面的消息时，系统会优先路由到 Shopify 建品流程，而不是走普通 FAQ：

- `给我一个商品名为123456789的shopify产品链接`
- `帮我创建一个动漫卡牌链接，价格29.99`
- `创建商品`
- `下单链接`
- `购买链接`

English: When a Discord user sends messages like the following, the bot routes them to Shopify product creation instead of customer-service FAQ:

- `Give me a Shopify product link named 123456789`
- `Create an anime card link, price 29.99`
- `create product`
- `checkout link`
- `payment link`

### 自动提取规则 | Extraction Rules

- 中文：`给我一个商品名为123456789的shopify产品链接`  
  English: `Give me a Shopify product link named 123456789`  
  Result:
  - `title = 123456789`
  - `price = DEFAULT_CARD_PRICE`

- 中文：`帮我创建一个动漫卡牌链接，价格29.99`  
  English: `Create an anime card link, price 29.99`  
  Result:
  - `title = 动漫卡牌`
  - `price = 29.99`

### 创建商品默认值 | Product Defaults

- `descriptionHtml = "Custom product created from Discord order request."`
- `vendor = "LootCard AI"`
- `productType = "Custom Product"`
- `status = ACTIVE`
- `tags = ["discord-order", "lootcard-ai"]`
- `sku = DISCORD-${Date.now()}`

### 成功返回内容 | Success Response

中文：创建成功后，Discord 会直接返回：

```text
✅ Shopify 产品已创建

商品名：xxx
价格：$xx.xx
商品ID：gid://shopify/Product/...
下单链接：https://your-store.myshopify.com/products/handle
后台链接：https://admin.shopify.com/store/your-store/products/123456789

你可以点击下单链接直接购买。
```

English: After success, Discord replies with the product title, price, product ID, storefront URL, and admin URL directly.

## Shopify OAuth

中文：项目现在使用 Shopify OAuth 自动授权，不再强依赖 `SHOPIFY_ADMIN_ACCESS_TOKEN`。  
English: The project now uses Shopify OAuth and no longer requires `SHOPIFY_ADMIN_ACCESS_TOKEN`.

### 关键路由 | Key Routes

- `GET /`
- `GET /health`
- `GET /auth/shopify`
- `GET /auth/callback`
- `POST /webhooks/shopify`

### OAuth 流程 | OAuth Flow

1. 用户打开 `/auth/shopify?shop=your-store.myshopify.com`
2. 服务端生成 `state` 并写入安全 cookie
3. Shopify 完成授权回调到 `/auth/callback`
4. 系统校验 `state` 和 Shopify HMAC
5. 用 `code` 换取 access token
6. 保存 `shop`、`accessToken`、`scope` 到 PostgreSQL
7. 自动注册 webhook
8. 首页显示 `Shopify Connected ✅`

### 当前数据库表 | Current Shopify Tables

- `ShopifyShop`
- `shopify_sessions`

## 环境变量 | Environment Variables

复制 `.env.example` 到 `.env`，然后填写真实值。  
Copy `.env.example` to `.env`, then fill in the real values.

```env
PORT=3000
ECHO_BOT_MODE=false
MOCK_IMAGE_MODE=true

DISCORD_BOT_TOKEN=
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/cardforge_ai?schema=public

SHOPIFY_STORE_DOMAIN=clearance-sale-dekuch.myshopify.com
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=https://lootcardai-production.up.railway.app
SHOPIFY_SCOPES=write_products,read_products,read_orders
SHOPIFY_API_VERSION=2026-04
DEFAULT_CARD_PRICE=29.99

AI_PROVIDER_ORDER=anthropic,openai,openrouter,kimi,deepseek,dashscope,zhipu,google,xai

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4o-mini

KIMI_API_KEY=
KIMI_MODEL=moonshot-v1-8k

DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat

DASHSCOPE_API_KEY=
DASHSCOPE_MODEL=qwen-plus

ZHIPU_API_KEY=
ZHIPU_MODEL=glm-4-flash

GOOGLE_API_KEY=
GOOGLE_MODEL=gemini-1.5-flash

XAI_API_KEY=
XAI_MODEL=grok-2-latest
```

## 本地启动 | Local Setup

1. 进入项目目录 | Enter the project directory

```bash
cd cardforge-ai
```

2. 安装依赖 | Install dependencies

```bash
npm install
```

3. 复制环境变量模板 | Copy the environment template

```bash
cp .env.example .env
```

4. 配置 PostgreSQL 和 `.env` | Configure PostgreSQL and `.env`

5. 生成 Prisma Client | Generate Prisma Client

```bash
npm run prisma:generate
```

6. 同步 schema | Push schema

```bash
npm run db:push:safe
```

7. 构建并启动 | Build and start

```bash
npm run build
npm run start
```

开发模式 | Development mode:

```bash
npm run dev
```

## Railway 部署 | Railway Deployment

当前 `railway.json`：

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "node dist/index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

部署步骤 | Deployment steps:

1. 推送代码到 GitHub | Push code to GitHub
2. 在 Railway 创建项目并连接仓库 | Create a Railway project and connect the repo
3. 添加 PostgreSQL | Add PostgreSQL
4. 设置环境变量 | Configure environment variables
5. Railway 自动 build 和 deploy | Let Railway build and deploy automatically

## 测试流程 | Test Flow

### Shopify OAuth 测试 | Shopify OAuth Test

1. 打开首页 `/`
2. 如果未连接，点击 `Connect or Reauthorize Shopify`
3. 完成 OAuth
4. 首页显示 `Shopify Connected ✅`

### Discord 测试 | Discord Test

推荐测试消息 | Recommended test messages:

1. `你能做什么`
2. `人造人十八号，直接出图`
3. `A`
4. `太亮了，加点金色`
5. `给我一个商品名为123456789的shopify产品链接`
6. `帮我创建一个动漫卡牌链接，价格29.99`

预期结果 | Expected results:

- 设计类请求进入设计流程
- Shopify 链接类请求直接创建 Shopify 产品
- Discord 直接返回下单链接，而不是教程式回复

## 日志 | Logging

运行时诊断日志包括：

- `[Raw User Message]`
- `[INTENT]`
- `[Hermes Intent]`
- `[Target Agent]`
- `[Target Skill]`
- `[Stage]`
- `[SHOPIFY] loading session`
- `[SHOPIFY] creating product`
- `[SHOPIFY] product created`
- `[DISCORD] sending product URL`
- `[Skill Result]`

## Provider Fallback

中文：文本模型层支持多 provider fallback。如果一个 provider 因网络、鉴权、配额或余额问题失败，系统会尝试 `AI_PROVIDER_ORDER` 中的下一个 provider。  
English: The text generation layer supports fallback across providers. If one provider fails due to network, auth, quota, or balance issues, the app tries the next provider in `AI_PROVIDER_ORDER`.

健康检查命令 | Health check command:

```bash
npm run provider:health-check
```

只测试单个 provider | Test a single provider:

```bash
node ./scripts/provider-health-check.js kimi
```

## 已知说明 | Notes

- 中文：当前 Codex 沙箱环境可能阻止外网 HTTPS 出站，所以本地测试第三方模型 API 时可能看到 `fetch failed` 或 `EACCES`。  
  English: The current Codex sandbox may block outbound HTTPS, so third-party model API tests may fail with `fetch failed` or `EACCES`.
- 中文：如果要准确验证 API 连通性和余额，请在你自己的本地终端或 Railway 线上环境里测试。  
  English: To verify API connectivity and balance accurately, test in your own local terminal or Railway environment.

## 后续扩展 | Next Extensions

- 接入真实图片生成模型 | Connect a real image generation model
- 增加 Discord Buttons 版 A/B/C 选择 | Add Discord button-based A/B/C selection
- 增加 Shopify 订单 webhook | Add Shopify order webhooks
- 增加后台管理页面 | Add an admin dashboard
- 增加从 Discord 消息中提取更多商品参数，例如数量、价格、标签 | Extract more product parameters from Discord messages such as quantity, price, and tags
