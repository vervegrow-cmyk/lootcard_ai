# AGENTS.md

This file defines project rules for Codex, Roo, Claude, and other coding agents working in this repository.

## Core Principle

Do not perform a large refactor by default.

This repository should be changed with small, isolated, verifiable steps.

## Required Working Style

- Change one target at a time
- Keep the DIY production chain stable
- Prefer minimal edits over broad rewrites
- Preserve existing deployment behavior unless the task explicitly asks otherwise

## Do Not Break

Do not break the current LootCard DIY main path:

1. user request
2. A/B/C concept generation
3. option selection
4. image generation
5. R2 upload
6. confirmation
7. Shopify product creation
8. product link reply

## Shopify / R2 Rules

- Do not modify Shopify logic by default
- Do not modify R2/storage logic by default
- All generated images must be uploaded to R2 before being sent into Shopify
- Do not allow temporary generated image URLs to become final Shopify product images

## DIY Flow Rules

- Do not introduce a second DIY flow
- Do not keep parallel DIY implementations active
- Do not re-enable demo/random/FAQ/customer-service flows in the production path
- Do not move flow logic into `discord.bot.ts`

## Response Rules

- Default final commerce link should be `productUrl`
- Do not default to `checkoutUrl` unless the task explicitly asks for payment-link behavior
- English flow must stay fully English
- Chinese flow must stay fully Chinese

## Safety Rules

- After every code change, run `npm run build`
- After every code change, run the manual script in `tests/diy-flow-test.md`
- Do not commit unrelated local changes
- Do not include `railway.json` in commits unless the task explicitly asks for deployment config changes

## Change Discipline

- Documentation-only tasks should not change business code
- Engineering guardrails should be added before new risky features
- If a file is part of the frozen core chain, only change it for a tightly scoped reason
