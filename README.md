# CardForge AI

CardForge AI 是一个基于 Discord 的 AI 定制卡牌成交系统。用户在 Discord 中描述想要的卡牌设计后，系统会自动收集需求、生成专业图片 prompt、给出 A/B/C 三个设计方向、支持继续修改设计、确认最终方案，并在确认后自动创建 Shopify 商品链接返回给客户下单。

## 项目能力

- Discord Bot 实时监听客户消息
- 多 Agent 协作处理需求收集、Prompt 优化、风格方案生成、反馈修正和 Shopify 建品
- Prisma + PostgreSQL 保存用户阶段、会话日志、项目状态、风格选项、反馈记录和 Shopify 日志
- 支持 Mock 图片生成模式，先跑通完整业务流程
- 适配 Railway 部署

## 技术栈

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

## 项目结构

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

## 业务流程

1. Discord 用户发送定制需求。
2. Bot 读取用户消息并写入 `ConversationLog`。
3. `MainAgent` 判断当前阶段。
4. 如果信息不足，继续追问，且每次最多问 1-2 个问题。
5. 信息足够后，`PromptAgent` 生成专业图片 prompt。
6. `StyleAgent` 生成 A/B/C 三个风格方向。
7. `ImageService` 在 mock 模式下返回可访问占位图链接。
8. 客户选择方案或提出修改意见。
9. `FeedbackAgent` 优化 prompt 并生成新方案。
10. 客户明确确认后，`ShopifyAgent` 生成商品草稿，`ShopifyService` 调用 Shopify Admin API 创建商品。
11. Bot 把 Shopify 商品链接返回到 Discord。

## 本地安装

1. 进入项目目录：

```bash
cd cardforge-ai
```

2. 安装依赖：

```bash
npm install
```

3. 复制环境变量：

```bash
cp .env.example .env
```

4. 配置 PostgreSQL 数据库连接串到 `DATABASE_URL`。

5. 生成 Prisma Client：

```bash
npm run prisma:generate
```

6. 执行迁移：

```bash
npm run prisma:migrate
```

7. 启动开发模式：

```bash
npm run dev
```

## PostgreSQL 配置

- 本地 PostgreSQL 可以使用标准连接串格式：

```env
DATABASE_URL=postgresql://username:password@localhost:5432/cardforge_ai?schema=public
```

- Railway PostgreSQL 创建后也会提供可直接使用的 `DATABASE_URL`。

## 环境变量说明

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

- `DISCORD_BOT_TOKEN`: Discord Bot Token
- `ANTHROPIC_API_KEY`: Claude API Key。留空时系统会用本地 fallback 逻辑处理 Prompt、反馈和商品描述
- `ANTHROPIC_MODEL`: Claude 模型名
- `SHOPIFY_STORE_DOMAIN`: Shopify 店铺域名，例如 `your-store.myshopify.com`
- `SHOPIFY_ADMIN_ACCESS_TOKEN`: Shopify Custom App 的 Admin Token
- `SHOPIFY_API_VERSION`: Shopify API 版本
- `DATABASE_URL`: PostgreSQL 连接串
- `PORT`: Express 服务端口
- `DEFAULT_CARD_PRICE`: 默认商品价格
- `MOCK_IMAGE_MODE`: `true` 时使用 mock 图片生成

## Discord Bot 创建方法

1. 打开 Discord Developer Portal。
2. 创建一个新应用。
3. 进入 `Bot` 页面并创建 Bot。
4. 复制 Bot Token 填入 `.env` 的 `DISCORD_BOT_TOKEN`。
5. 在 `OAuth2 > URL Generator` 里勾选：
   - `bot`
   - `applications.commands`
6. Bot 权限至少勾选：
   - `View Channels`
   - `Send Messages`
   - `Read Message History`
   - `Use Slash Commands`

## 开启 MESSAGE CONTENT INTENT

1. 打开 Discord Developer Portal 中对应应用。
2. 进入 `Bot` 页面。
3. 在 `Privileged Gateway Intents` 中开启 `MESSAGE CONTENT INTENT`。
4. 保存后重启 Bot。

## Shopify Custom App 创建方法

1. 进入 Shopify 后台。
2. 打开 `Settings > Apps and sales channels`。
3. 点击 `Develop apps`。
4. 创建一个 Custom App。
5. 至少启用这些 Admin API 权限：
   - `write_products`
   - `read_products`
6. 安装应用并复制 Admin API access token。
7. 把 `SHOPIFY_STORE_DOMAIN`、`SHOPIFY_ADMIN_ACCESS_TOKEN`、`SHOPIFY_API_VERSION` 写入 `.env`。

## Railway 部署方法

1. 将项目推送到 GitHub。
2. 在 Railway 创建新项目并选择 `Deploy from GitHub Repo`。
3. 添加 PostgreSQL 服务。
4. 将 Railway 提供的数据库连接串设置给 `DATABASE_URL`。
5. 配置以下环境变量：
   - `DISCORD_BOT_TOKEN`
   - `ANTHROPIC_API_KEY`
   - `ANTHROPIC_MODEL`
   - `SHOPIFY_STORE_DOMAIN`
   - `SHOPIFY_ADMIN_ACCESS_TOKEN`
   - `SHOPIFY_API_VERSION`
   - `DATABASE_URL`
   - `PORT`
   - `DEFAULT_CARD_PRICE`
   - `MOCK_IMAGE_MODE`
6. Railway 会读取 `railway.json`。
7. 构建命令：

```bash
npm install && npm run build
```

8. 启动命令：

```bash
npm run start
```

9. 部署完成后可用 `/health` 检查：

```text
https://your-service.up.railway.app/health
```

## 本地运行和测试流程

1. 启动服务后，在 Discord 中发送：

```text
我想做一张黑金暗黑风格的女王卡牌，SSR，实体卡，10张。
```

2. 系统如果发现缺少关键信息，会继续追问。

3. 信息足够后，Bot 会返回三种风格方向：
   - A. Black Gold Luxury Card
   - B. Dark Gothic Queen Card
   - C. Cyber Neon Limited Card

4. 用户回复：

```text
A
```

5. 如果用户想调整，可以继续发送：

```text
Make it darker
Add more gold
Change the character style
```

6. 当用户明确确认时发送：

```text
confirm
```

或：

```text
确认
就这个
可以下单
create link
```

7. 系统会创建 Shopify 商品并返回商品链接。

## 如何模拟图片生成

- 默认 `MOCK_IMAGE_MODE=true`
- `image.service.ts` 会返回 `https://placehold.co/...` 占位图链接
- 这样不接真实图片模型也能跑完整流程

## 数据库模型说明

- `UserMemory`: 保存用户长期偏好摘要和当前阶段
- `CardProject`: 保存卡牌项目主状态、当前 prompt、选中方案和 Shopify 结果
- `CardStyleOption`: 保存 A/B/C 风格选项
- `FeedbackLog`: 保存每次反馈修改
- `ShopifyProductLog`: 保存建品记录
- `ConversationLog`: 保存最近会话

## 关键业务规则

- 每次最多追问 1-2 个问题
- 信息不足时不会直接创建 Shopify 商品
- 必须收到明确确认指令才会创建 Shopify 商品
- 商品描述中会写明预计约 30 天到货
- 不承诺退款政策
- 图片生成失败时，仍然可以基于文字方案推进

## 后续扩展

- 接真实图片生成模型，例如 OpenAI Images、Replicate、Stability 或 Midjourney 工作流
- 改成 Discord Button 选择 A/B/C 方案
- 接 Shopify 订单通知和支付成功回调
- 增加后台管理页面
- 导出用户反馈训练数据

## 当前说明

- 项目已经预留 `ClaudeService`，未配置 `ANTHROPIC_API_KEY` 时会走本地 fallback 逻辑，方便你先用 mock 图片模式打通流程。
- Shopify 建品仍然需要真实 Shopify 店铺凭证才能创建正式商品。
