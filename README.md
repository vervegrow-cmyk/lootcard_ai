# CardForge AI

中文：`CardForge AI` 是一个以 Discord 为入口的 AI 定制卡牌销售与设计 Agent。它可以和客户多轮沟通、润色提示词、生成图片方案、根据反馈改图、确认最终设计，并在最后创建 Shopify 下单链接。  
English: `CardForge AI` is a Discord-first AI agent for custom trading card sales and design coordination. It can handle multi-turn customer chat, polish prompts, generate image options, revise designs, confirm the final version, and create a Shopify checkout link.

## 项目能力 | What It Does

- 中文：支持中英文对话，并自动跟随用户语言。
  English: Supports Chinese and English conversations and follows the user's language preference.
- 中文：使用 Hermes Orchestrator 统一识别 intent、stage、target agent 和 target skill。
  English: Uses a Hermes Orchestrator to detect intent, stage, target agent, and target skill.
- 中文：支持提示词润色、直接出图、改图、A/B/C 选择和 Shopify 链接生成。
  English: Supports prompt polishing, direct image generation, image revision, A/B/C selection, and Shopify link creation.
- 中文：使用 Prisma + PostgreSQL 保存用户记忆、项目状态、选择记录和修改历史。
  English: Uses Prisma + PostgreSQL to persist user memory, project state, selections, and revision history.
- 中文：数据库异常时会自动回退到内存模式，避免 Bot 中断。
  English: Falls back to in-memory state if the database is temporarily unavailable.
- 中文：支持 `MOCK_IMAGE_MODE=true`，在未接入真实图片模型前先跑通完整流程。
  English: Supports `MOCK_IMAGE_MODE=true` so the full workflow works before a real image model is connected.
- 中文：支持多模型文本接口 fallback。
  English: Supports multi-provider text fallback.

## 当前架构 | Current Architecture

中文：当前项目保留原有 Express、Discord、Prisma、Memory、Shopify、Image Service 基础，只把主控流程收敛到 Hermes Orchestrator。  
English: The current project keeps the existing Express, Discord, Prisma, Memory, Shopify, and Image Service foundations, while routing the main flow through Hermes Orchestrator.

```text
Discord User Message
  -> discord.bot.ts
  -> read memory + recent conversation
  -> Hermes Orchestrator
  -> target agent
  -> target skill
  -> save memory + conversation
  -> reply to Discord
```

### Agents

- `hermes-orchestrator.agent.ts`
  中文：唯一主控，负责语言识别、意图识别、阶段判断、路由和结果合并。
  English: The single flow controller that handles language detection, intent detection, stage selection, routing, and result merging.
- `customer-service.agent.ts`
  中文：负责 FAQ、价格、交付周期、售后说明。
  English: Handles FAQ, pricing, delivery, and after-sales explanations.
- `design.agent.ts`
  中文：负责需求收集、出图、选图、改图。
  English: Handles requirement collection, image generation, image selection, and image revision.
- `prompt.agent.ts`
  中文：负责润色、翻译、扩写和图像 prompt 生成。
  English: Handles prompt polishing, translation, expansion, and image-prompt conversion.
- `shopify.agent.ts`
  中文：负责创建商品和支付链接。
  English: Handles Shopify product and checkout link creation.
- `memory.agent.ts`
  中文：负责保存语言偏好、项目状态、选择和修改记录。
  English: Handles persistence of language preference, project state, selections, and revisions.

### Skills

- `skills/customer-service/*`
- `skills/design/*`
- `skills/prompt/*`
- `skills/shopify/*`
- `skills/memory/*`

## 对话行为 | Key Conversation Behaviors

- 中文：用户说 `你能做什么` 时，Bot 直接介绍能力。
  English: If the user says `What can you do?`, the bot explains its capabilities directly.
- 中文：用户说 `人造人十八号，直接出图` 时，Bot 不会继续机械追问，而是自动补全并返回 3 个方案。
  English: If the user says `Android 18, generate images directly`, the bot auto-fills missing info and returns 3 image options instead of asking repeated questions.
- 中文：用户说 `不要问我问题，直接出图` 时，Bot 进入 direct-generate 模式。
  English: If the user says `Do not ask me more questions, just generate it`, the bot enters direct-generate mode.
- 中文：用户说 `帮我润色提示词：黑金女王卡牌` 时，Bot 只润色提示词，不进入 Shopify 流程。
  English: If the user says `Polish this prompt: black and gold queen card`, the bot only polishes the prompt and does not enter Shopify flow.
- 中文：用户回复 `A / B / C` 时，Bot 记录选择。
  English: If the user replies `A / B / C`, the bot records the selected option.
- 中文：用户说 `太亮了，加点金色` 时，Bot 会修改当前方案或当前 prompt。
  English: If the user says `Too bright, add more gold`, the bot revises the current design or prompt.
- 中文：用户说 `确认，就这个，生成链接` 时，Bot 会创建 Shopify 商品，或在未配置时给出明确提示。
  English: If the user says `Confirm this one and create the link`, the bot creates a Shopify product or clearly explains that Shopify is not configured.

## 直接出图规则 | Direct Generate Rules

中文：项目已经明确去掉这种固定死逻辑：  
English: The project explicitly avoids this hard-coded loop:

```ts
if (!character || !style) {
  return askQuestion();
}
```

中文：如果用户明确要求直接生成，系统会自动补全缺失信息并继续执行。  
English: If the user clearly requests immediate generation, the system auto-fills missing fields and continues.

- `character = Android 18`
- `theme = anime character card`
- `style = premium anime collectible card, SSR rarity, refined border, cinematic lighting, high detail, suitable for physical custom cards`
- `count = 3`

中文：常见 direct-generate 触发词包括：  
English: Typical direct-generate triggers include:

- `直接出图 / 直接生成`
- `不要问 / 不要废话`
- `没有其他要求`
- `就要这个`
- `你自己设计`
- `不要反复问`

## 项目结构 | Project Structure

```text
cardforge-ai/
|-- src/
|   |-- index.ts
|   |-- server.ts
|   |-- bot/
|   |   `-- discord.bot.ts
|   |-- agents/
|   |   |-- hermes-orchestrator.agent.ts
|   |   |-- customer-service.agent.ts
|   |   |-- design.agent.ts
|   |   |-- prompt.agent.ts
|   |   |-- shopify.agent.ts
|   |   `-- memory.agent.ts
|   |-- skills/
|   |   |-- customer-service/
|   |   |-- design/
|   |   |-- prompt/
|   |   |-- shopify/
|   |   `-- memory/
|   |-- services/
|   |   |-- claude.service.ts
|   |   |-- image.service.ts
|   |   |-- shopify.service.ts
|   |   |-- memory.service.ts
|   |   `-- order.service.ts
|   |-- routes/
|   |   `-- health.route.ts
|   |-- types/
|   |   |-- agent.types.ts
|   |   |-- skill.types.ts
|   |   `-- index.ts
|   `-- utils/
|       |-- json-parser.ts
|       `-- logger.ts
|-- prisma/
|   `-- schema.prisma
|-- .env.example
|-- package.json
|-- tsconfig.json
|-- railway.json
`-- README.md
```

## 技术栈 | Tech Stack

- Node.js
- TypeScript
- discord.js
- Express
- Prisma
- PostgreSQL
- Anthropic SDK
- OpenAI-compatible text APIs
- Shopify Admin API
- Railway

## 环境变量 | Environment Variables

中文：复制 `.env.example` 到 `.env`，然后填入真实值。  
English: Copy `.env.example` to `.env` and fill in the real values.

```env
PORT=3000
ECHO_BOT_MODE=false
MOCK_IMAGE_MODE=true

DISCORD_BOT_TOKEN=
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/cardforge_ai?schema=public

SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=
SHOPIFY_API_VERSION=2025-10
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

1. 中文：进入项目目录。  
   English: Enter the project directory.

```bash
cd cardforge-ai
```

2. 中文：安装依赖。  
   English: Install dependencies.

```bash
npm install
```

3. 中文：复制环境变量模板。  
   English: Copy the environment template.

```bash
cp .env.example .env
```

4. 中文：配置 PostgreSQL 连接。  
   English: Configure PostgreSQL.

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/cardforge_ai?schema=public
```

5. 中文：生成 Prisma Client。  
   English: Generate Prisma Client.

```bash
npm run prisma:generate
```

6. 中文：同步 schema 或执行迁移。  
   English: Push schema or run migrations.

```bash
node .\node_modules\prisma\build\index.js db push
```

或 | Or:

```bash
npm run prisma:migrate -- --name init
```

7. 中文：构建并启动项目。  
   English: Build and start the app.

```bash
npm run build
npm run start
```

开发模式 | Development:

```bash
npm run dev
```

## PostgreSQL 说明 | PostgreSQL Notes

中文：本地 Windows 环境推荐流程：安装 PostgreSQL、创建 `cardforge_ai` 数据库、设置 `DATABASE_URL`、生成 Prisma Client、同步 schema。  
English: For local Windows setup, install PostgreSQL, create the `cardforge_ai` database, set `DATABASE_URL`, generate Prisma Client, and sync the schema.

常用命令 | Useful commands:

```bash
npm run prisma:generate
node .\node_modules\prisma\build\index.js db push
```

手动验证 | Manual verification:

```bash
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -h localhost -U postgres -d cardforge_ai
```

### Windows Prisma 文件锁 | Prisma File Lock on Windows

中文：如果 `node_modules\\.prisma` 内出现 `EPERM` rename 错误，通常是旧的 Node 进程仍在占用 Prisma 引擎文件。  
English: If Prisma Client generation fails with an `EPERM` rename error in `node_modules\\.prisma`, an older Node process is usually still holding the Prisma engine file.

解决方式 | Fix:

1. 停掉当前项目进程 | Stop the running project process
2. 重新执行 `npm run prisma:generate` | Run `npm run prisma:generate` again

## Discord Bot 配置 | Discord Bot Setup

1. 在 Discord Developer Portal 创建应用 | Create an application in Discord Developer Portal
2. 打开 `Bot` 页面 | Open the `Bot` page
3. 创建或重置 Bot Token | Create or reset the bot token
4. 把 Token 填到 `DISCORD_BOT_TOKEN` | Put the token into `DISCORD_BOT_TOKEN`
5. 开启 `MESSAGE CONTENT INTENT` | Enable `MESSAGE CONTENT INTENT`
6. 邀请 Bot 进入服务器并授予发消息权限 | Invite the bot to your server with message permissions

重要提醒 | Important:

- 只使用 Bot Token | Use the Bot Token only
- 不要填 Application ID | Do not paste Application ID
- 不要填 Client Secret | Do not paste Client Secret
- 不要提交 `.env` | Do not commit `.env`

## Shopify 行为 | Shopify Behavior

中文：当 Shopify 已配置时，Bot 可以创建商品并返回购买链接。  
English: When Shopify is configured, the bot can create a product and return a purchase link.

商品描述固定包含 | The product description always includes:

```text
This is a custom-made AI trading card.
Production and delivery time: approximately 30 days.
Final production will follow the confirmed design preview.
Custom orders are made-to-order.
```

中文：如果 Shopify 未配置，Bot 不会崩溃，而是明确提示“已记录最终设计，配置完成后可生成下单链接”。  
English: If Shopify is not configured, the bot does not crash. It replies clearly that the final design is recorded and the checkout link can be generated later.

## 图片生成 | Image Generation

中文：`MOCK_IMAGE_MODE=true` 时，即使没有真实图片模型，也能跑完整个流程。  
English: With `MOCK_IMAGE_MODE=true`, the full workflow works even without a real image provider.

当前行为 | Current behavior:

- 返回 3 个 mock 图片链接 | Returns 3 mock image URLs
- 保留 A/B/C 选图流程 | Preserves the A/B/C selection flow
- 支持 prompt revision 流程 | Supports prompt revision flow

预留扩展接口 | Safe extension points:

- OpenAI Images
- Replicate
- Stable Diffusion

## 多模型回退 | AI Provider Fallback

中文：文本模型层支持多个 provider 自动回退。如果某一个 provider 因为 quota、余额、限流、临时故障或鉴权失败不可用，系统会尝试 `AI_PROVIDER_ORDER` 里的下一个 provider。  
English: The text generation layer supports fallback across configured providers. If one provider fails because of quota, balance, temporary outage, rate limiting, or authorization failure, the app tries the next provider in `AI_PROVIDER_ORDER`.

当前支持 | Current supported providers:

- Anthropic
- OpenAI
- OpenRouter
- Kimi / Moonshot
- DeepSeek
- DashScope / Qwen
- Zhipu AI
- Google Gemini
- xAI

本地健康检查命令 | Local health check command:

```bash
npm run provider:health-check
```

中文：这个脚本会逐个检测 provider，并区分 `ok / network_error / auth_error / quota_error / model_error`。  
English: This script checks each provider and classifies the result as `ok / network_error / auth_error / quota_error / model_error`.

只测单个 provider | Check a single provider only:

```bash
node ./scripts/provider-health-check.js kimi
```

## 本地测试 | Local Testing

推荐测试流程 | Recommended Discord test flow:

1. `你能做什么 / What can you do?`
2. `人造人十八号，直接出图 / Android 18, generate images directly`
3. `A`
4. `太亮了，加点金色 / Too bright, add more gold`
5. `确认，就这个，生成链接 / Confirm this one and create the link`

也可以测试 | You can also test:

- `帮我润色提示词：黑金女王卡牌 / Polish this prompt: black and gold queen card`
- `不要问我问题，直接出图 / Do not ask me more questions, just generate it`
- `你是不能出图么 / Can you generate images or not?`

健康检查 | Health check:

```text
GET /health
```

## 日志 | Logging

运行时日志包括 | Runtime diagnostics include:

- `[Raw User Message]`
- `[Hermes Intent]`
- `[Target Agent]`
- `[Target Skill]`
- `[Stage]`
- `[Memory Update]`
- `[Skill Result]`

## Railway 部署 | Railway Deployment

中文：项目已包含 `railway.json`。  
English: `railway.json` is already included.

部署步骤 | Basic deployment steps:

1. 推送代码到 GitHub | Push the repository to GitHub
2. 创建 Railway 项目 | Create a Railway project
3. 连接仓库 | Connect the repository
4. 添加 PostgreSQL | Add PostgreSQL
5. 配置环境变量 | Set the required environment variables
6. 部署 | Deploy

Build command:

```text
npm install && npm run build
```

Start command:

```text
npm run start
```

中文：当前推荐把 `prisma db push` 放在启动阶段，通过 `prestart` 执行，这样 Railway 在应用真正连上 PostgreSQL 后会先同步表结构，再启动 Bot。  
English: The recommended setup is to run `prisma db push` in the startup phase through `prestart`, so Railway syncs the schema after the app can actually reach PostgreSQL, and only then starts the bot.

## 当前沙箱限制 | Known Limitation in This Sandbox

中文：在当前 Codex 沙箱环境里，外网 HTTPS 出站被环境规则拦截，所以 provider health check 可能报：

- `fetch failed`
- `EACCES`
- `connect ...:443`

这不一定代表 provider 没余额。  
English: In the current Codex sandbox session, outbound HTTPS is blocked by environment rules, so provider health checks may fail with `fetch failed`, `EACCES`, or `connect ...:443`. This does not automatically mean the provider has no balance.

中文：如果要准确验证某个 provider 的余额或连通性，请在你自己的本地终端或正常联网的部署环境里测试。  
English: To verify provider balance or connectivity accurately, run the same check in your own local terminal or in a normal deployment environment with internet access.

## 后续扩展 | Next Extensions

- 接入真实图片生成模型 | Connect a real image generation API
- 增加 Discord Button 式 A/B/C 选择 | Add Discord button-based A/B/C selection
- 增加 Shopify 订单 webhook | Add Shopify order webhooks
- 增加后台管理页面 | Add an admin dashboard
- 导出反馈与修改数据用于训练 | Export feedback and revision data for future model improvement
