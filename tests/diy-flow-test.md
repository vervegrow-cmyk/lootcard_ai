# DIY Flow Manual Regression Test

Last updated: 2026-05-11

## Purpose

This document is a manual regression checklist for the current LootCard DIY Agent.

It is designed to validate the existing production flow without changing business behavior.

## Preconditions

Before testing:

1. Run `npm run build` successfully.
2. Confirm the Discord bot is online.
3. Confirm testing is performed inside the `#lootcarddiy` channel only.
4. Confirm Shopify OAuth is already connected.
5. Confirm R2 storage is configured and reachable.
6. Confirm image generation provider is configured and reachable.

## Expected Log Prefixes

During testing, watch for these log prefixes:

- `[DISCORD]`
- `[LLM_ROUTER]`
- `[DIY_FLOW]`
- `[IMAGE]`
- `[STORAGE]`
- `[SHOPIFY]`

## English Flow

### Step 1

User message:

```text
cancel
```

Expected user-facing behavior:

- The current DIY flow is cancelled.
- The bot replies in English.

Expected logs:

- `[DISCORD] incoming message cancel`
- `[LLM_ROUTER]`
- `[DIY_FLOW] cancel matched`
- `[DIY_FLOW] reset complete`

### Step 2

User message:

```text
hello
```

Expected user-facing behavior:

- The bot does not resume an old order automatically.
- The bot gives a simple English prompt to describe the card request.

Expected logs:

- `[DISCORD] incoming message hello`
- `[LLM_ROUTER]`
- No Shopify creation logs
- No stale recovery logs

### Step 3

User message:

```text
I want a black gold SSR anime girl trading card
```

Expected user-facing behavior:

- The bot starts a new DIY order flow.
- The bot replies fully in English.
- The bot returns A/B/C concept options.

Expected logs:

- `[DISCORD] incoming message I want a black gold SSR anime girl trading card`
- `[LLM_ROUTER]`
- `[DIY_FLOW] using en templates`
- `[DIY_FLOW] stage=CONCEPT_OPTIONS`

### Step 4

User message:

```text
A
```

Expected user-facing behavior:

- The bot selects concept A.
- The bot generates a real image.
- The image is uploaded to R2.
- The bot sends a Discord attachment, not only text.
- The bot replies with the confirmation prompt in English.

Expected logs:

- `[DISCORD] incoming message A`
- `[LLM_ROUTER]`
- `[DIY_FLOW] option selected A`
- `[IMAGE] provider=`
- `[IMAGE] generating...`
- `[IMAGE] success`
- `[STORAGE] provider=r2`
- `[STORAGE] upload success publicImageUrl=`
- `[DIY_FLOW] stage=WAITING_CONFIRMATION`

### Step 5

User message:

```text
1
```

Expected user-facing behavior:

- The bot creates a real Shopify product.
- The bot returns the product link in English.
- The bot does not return admin URLs or internal IDs.

Expected logs:

- `[DISCORD] incoming message 1`
- `[LLM_ROUTER]`
- `[SHOPIFY] create product from draft`
- `[SHOPIFY] product create start`
- `[SHOPIFY] productUrl=`

## Chinese Flow

### Step 1

User message:

```text
取消
```

Expected user-facing behavior:

- 当前 DIY 流程被彻底取消。
- 回复使用中文。

Expected logs:

- `[DISCORD] incoming message 取消`
- `[LLM_ROUTER]`
- `[DIY_FLOW] cancel matched`
- `[DIY_FLOW] reset complete`

### Step 2

User message:

```text
你好
```

Expected user-facing behavior:

- 不自动恢复旧订单。
- 提示用户直接描述卡牌需求。

Expected logs:

- `[DISCORD] incoming message 你好`
- `[LLM_ROUTER]`
- 不应出现 Shopify 创建日志

### Step 3

User message:

```text
给我黑金SSR女角色卡牌
```

Expected user-facing behavior:

- 进入新的 DIY 正式流程。
- 回复 A/B/C 中文方案。

Expected logs:

- `[DISCORD] incoming message 给我黑金SSR女角色卡牌`
- `[LLM_ROUTER]`
- `[DIY_FLOW] using zh templates`
- `[DIY_FLOW] stage=CONCEPT_OPTIONS`

### Step 4

User message:

```text
A
```

Expected user-facing behavior:

- 选择 A 方案。
- 真实出图。
- 上传到 R2。
- Discord 发送图片附件。
- 进入等待确认状态。

Expected logs:

- `[DISCORD] incoming message A`
- `[LLM_ROUTER]`
- `[DIY_FLOW] option selected A`
- `[IMAGE] provider=`
- `[IMAGE] generating...`
- `[IMAGE] success`
- `[STORAGE] provider=r2`
- `[STORAGE] upload success publicImageUrl=`
- `[DIY_FLOW] stage=WAITING_CONFIRMATION`

### Step 5

User message:

```text
1
```

Expected user-facing behavior:

- 创建真实 Shopify 商品。
- 只返回产品链接。
- 不返回 admin 链接或技术字段。

Expected logs:

- `[DISCORD] incoming message 1`
- `[LLM_ROUTER]`
- `[SHOPIFY] create product from draft`
- `[SHOPIFY] product create start`
- `[SHOPIFY] productUrl=`

## Regenerate Flow

### Step

User message:

```text
3
```

Expected user-facing behavior:

- The current confirmation-stage concept is discarded.
- A fresh set of concept options is generated again.
- No Shopify product is created in this step.

Expected logs:

- `[DISCORD] incoming message 3`
- `[LLM_ROUTER]`
- `[DIY_FLOW] using`
- `[DIY_FLOW] stage=CONCEPT_OPTIONS`
- No `[SHOPIFY] create product from draft`

## Cancel Then Greeting Flow

### Step 1

User message:

```text
cancel
```

Expected user-facing behavior:

- Flow is cleared completely.

Expected logs:

- `[DIY_FLOW] cancel matched`
- `[DIY_FLOW] reset complete`

### Step 2

User message:

```text
hello
```

Expected user-facing behavior:

- The bot does not stay locked in the previous flow.
- The bot replies as an idle entry prompt, not as an in-flow warning.

Expected logs:

- `[DISCORD] incoming message hello`
- `[LLM_ROUTER]`
- No image generation logs
- No Shopify logs

## Failure Conditions

Any of the following should be treated as a regression:

- English request returns Chinese concept templates.
- A/B/C selection creates Shopify product immediately.
- Product creation starts before confirmation input.
- R2 upload is skipped after image generation.
- Shopify uses a temporary image URL instead of an R2 URL.
- The bot responds from a demo/random/FAQ flow.
- `cancel` does not fully reset the current DIY session.
- `hello` after cancel still behaves like an active order flow.

