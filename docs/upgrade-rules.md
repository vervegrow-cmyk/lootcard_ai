# Upgrade Rules

## Branching

- `main` is the stable branch.
- All new feature work must start from a `feature/*` branch.
- Do not develop experimental features directly on `main`.

## Frozen Core Files

The following files are treated as core-chain files and should be considered frozen by default:

- `src/bot/discord.bot.ts`
- `src/router/llm-router.ts`
- `src/flows/diy-card.flow.ts`
- `src/services/shopify.service.ts`
- `src/services/storage.service.ts`

Changes to these files require a narrow, explicit goal.

## Feature Flag Rule

- Every new feature must be guarded by a Feature Flag before it is merged.
- Do not enable unfinished functionality by default.
- Do not mix feature-flag work with unrelated cleanup.

## Build Rule

After every code change:

1. Run `npm run build`
2. Confirm the build succeeds before commit or push

## Regression Rule

After every code change:

1. Run the manual checklist in `tests/diy-flow-test.md`
2. Verify both English and Chinese flows
3. Verify cancel/reset flow
4. Verify Shopify link creation flow

## Flow Protection

Do not introduce or reintroduce these flows:

- demo flow
- random flow
- customer-service flow
- FAQ flow
- simulated preview flow
- fantasy card flow
- NFT lore flow

The project should protect the single official DIY sales flow.

## Discord Entry Rule

- Do not move business logic back into `src/bot/discord.bot.ts`
- The bot entry should remain thin
- Flow orchestration should stay in dedicated flow/router/service files

## Scope Control

- Every task should aim at one clear outcome
- Avoid bundling architecture cleanup, product changes, and deployment changes in one commit
- Do not mix business logic changes with documentation-only updates

