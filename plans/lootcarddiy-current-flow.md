# LootCardDIY Current Flow Notes

Last reviewed: 2026-05-11

## Scope

This document describes the current `lootcarddiy` runtime flow by reading the existing code only.

It does not propose new architecture and does not assume older demo flows are still part of the intended production path.

## Current Active Entry

The current Discord entrypoint is:

- `src/bot/discord.bot.ts`

The bot currently imports and uses:

- `src/flows/diy-card.flow.ts`
- `src/router/llm-router.ts`

Important:

- `src/flows/lootcard-diy.flow.ts` exists, but its file header marks it as deprecated:
  - `@deprecated Use diy-card.flow.ts only. Do not import this flow.`
- The active bot file currently uses `diyCardFlow`, not `lootcardDiyFlow`.

## Current Message Path

Current runtime path in `discord.bot.ts`:

1. Ignore bot messages and empty content.
2. Only process the `#lootcarddiy` channel.
3. Log incoming user text.
4. Log user conversation to memory storage.
5. Detect whether the user already has an active DIY session:
   - if yes, `currentFlow = DIY_CARD_FLOW`
   - else, `currentFlow = IDLE`
6. Route the message through `llmRouter.route(...)`.
7. Handle one of three high-level cases:
   - `CANCEL`
   - `DIY_CARD_FLOW`
   - fallback prompt asking the user to describe the card they want
8. If image URLs are returned, download them and send them as Discord attachments.
9. Log assistant reply to memory storage.

## Current Router

File:

- `src/router/llm-router.ts`

### Router intents

The router currently supports:

- `CREATE_DIY_CARD`
- `SEARCH_GALLERY`
- `CONFIRM_SELECTION`
- `MODIFY_DESIGN`
- `REGENERATE`
- `CREATE_SHOPIFY_PRODUCT`
- `CHECK_ORDER`
- `GET_PRODUCT_LINK`
- `GET_PAYMENT_LINK`
- `CANCEL`
- `GENERAL_HELP`

### Router flows

The router currently returns one of:

- `IDLE`
- `DIY_CARD_FLOW`
- `GALLERY_SEARCH_FLOW`
- `ORDER_FLOW`

### Current routing behavior

The router detects:

- cancel/reset commands
- A/B/C selection
- confirm commands like `1`, `confirm`, `yes`, `ok`, `go`, `checkout`, `buy`
- modify commands
- regenerate commands
- gallery-like messages
- order-like messages
- DIY card creation messages

For card creation, current keywords include both English and Chinese terms such as:

- `card`
- `trading card`
- `anime`
- `girl`
- `black gold`
- `ssr`
- `waifu`
- `cyberpunk`
- `卡`
- `卡牌`
- `美女`
- `黑金`
- `动漫`

## Current DIY Flow

File:

- `src/flows/diy-card.flow.ts`

### Current internal stages

The active DIY flow uses:

- `IDLE`
- `CONCEPT_OPTIONS`
- `IMAGE_GENERATING`
- `WAITING_CONFIRMATION`
- `SHOPIFY_CREATED`

### Current session payload

The in-memory DIY session currently stores:

- `discordUserId`
- `username`
- `language`
- `stage`
- `orderId`
- `orderNo`
- `originalMessage`
- `options`
- `selectedOption`
- `imageUrl`
- `productUrl`
- `checkoutUrl`
- `createdAt`
- `updatedAt`

### Current language behavior

Language is passed in from `llm-router.ts` and then used in `diy-card.flow.ts`.

The flow uses:

- `src/i18n/templates`

for:

- concept list copy
- preview confirmation copy
- cancel reply
- error messages
- product confirmation reply

## Current Official Business Flow

Based on the code in `diy-card.flow.ts`, the current intended business path is:

1. User sends a card request.
2. Router returns `CREATE_DIY_CARD`.
3. Flow creates a draft order through `orderService.createDraftOrder(...)`.
4. Flow generates three concept options.
5. Flow stores the options in session and memory.
6. User replies `A`, `B`, or `C`.
7. Flow generates a real image through `imageService.generateImage(...)`.
8. Flow uploads the image to permanent storage through `storageService.uploadImageFromUrl(...)`.
9. Flow updates the order with:
   - selected option
   - permanent image URL
   - `WAITING_CONFIRMATION`
10. Bot sends the generated image back to Discord as an attachment.
11. User replies confirm language such as:
   - `1`
   - `confirm`
   - `yes`
   - `ok`
   - `go`
   - `checkout`
   - `buy`
12. Flow creates the Shopify product through `shopifyService.createShopifyProductFromDiscord(...)`.
13. Flow stores:
   - `productUrl`
   - `checkoutUrl`
14. Bot replies with the final product confirmation message.

## Current Storage Behavior

File:

- `src/services/storage.service.ts`

### Provider resolution

Storage provider resolution currently uses:

1. `CDN_PROVIDER`
2. `STORAGE_PROVIDER`
3. default: `r2`

### Current supported providers

- `r2`
- `cloudinary`

### Current R2 requirements

For R2 uploads, the code expects:

- `R2_PUBLIC_BASE_URL`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_ENDPOINT`

### Current behavior for generated images

After image generation, the active flow uploads the returned image URL to permanent storage.

The flow then saves the permanent URL into:

- session `imageUrl`
- order image field
- order metadata `permanentImageUrl`

## Current Shopify Product Creation Path

File:

- `src/services/shopify.service.ts`

Current DIY flow calls:

- `shopifyService.createShopifyProductFromDiscord(...)`

The Shopify service currently:

- validates / upgrades image URLs to permanent URLs
- prepares title, price, description, tags, SEO
- uses GraphQL first
- can fall back to REST for product/image edge cases

The DIY flow currently passes:

- selected option title
- selected option price
- generated product description
- permanent image URL
- shipping type
- style tags

## Current Persistence

Files involved:

- `src/services/order.service.ts`
- `src/services/memory.service.ts`

### Order persistence

The current flow creates and updates real `Order` rows.

Current important writes:

- create draft order
- save draft options
- save selected option
- attach generated image
- set order status to `WAITING_CONFIRMATION`
- attach Shopify product after product creation
- cancel order on user cancel

### Memory persistence

The flow also updates memory with:

- `flowMode`
- `stage`
- `currentStage`
- `currentOrderDraft`
- `language`

## What Is Still Present In Code

Even though the bot entry is currently centered on the DIY flow, the repository still contains older or broader structures, including:

- legacy agents
- older router/service files
- deprecated `lootcard-diy.flow.ts`
- additional skills and agents not required for the core DIY path

This means the repository is not yet fully minimal, even though the active entry has already narrowed toward the DIY process.

## Practical Conclusion

At the moment, the production-facing path appears to be:

- `discord.bot.ts`
- `llm-router.ts`
- `diy-card.flow.ts`
- `image.service.ts`
- `storage.service.ts`
- `shopify.service.ts`
- `order.service.ts`
- `memory.service.ts`

The deprecated file:

- `src/flows/lootcard-diy.flow.ts`

should be treated as historical or transitional unless the entrypoint is changed back to it.

## Recommended Reading Order For Future Work

If someone needs to continue stabilizing `lootcarddiy`, the most useful reading order is:

1. `src/bot/discord.bot.ts`
2. `src/router/llm-router.ts`
3. `src/flows/diy-card.flow.ts`
4. `src/services/image.service.ts`
5. `src/services/storage.service.ts`
6. `src/services/shopify.service.ts`
7. `src/services/order.service.ts`
8. `src/services/memory.service.ts`

## Notes

- This document intentionally reflects the current code as-is.
- It does not assume all local uncommitted files are already deployed.
- It is meant to help the next cleanup pass focus on the real active path instead of older unused logic.
