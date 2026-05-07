-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "UserMemory" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "profile" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT 'inquiry',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardProject" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inquiry',
    "originalPrompt" TEXT NOT NULL,
    "currentPrompt" TEXT NOT NULL DEFAULT '',
    "selectedStyleId" TEXT,
    "finalDesignSummary" TEXT,
    "shopifyProductId" TEXT,
    "shopifyProductUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardStyleOption" (
    "id" TEXT NOT NULL,
    "cardProjectId" TEXT NOT NULL,
    "styleId" TEXT NOT NULL,
    "styleName" TEXT NOT NULL,
    "designSummary" TEXT NOT NULL,
    "imagePrompt" TEXT NOT NULL,
    "imageUrl" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardStyleOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackLog" (
    "id" TEXT NOT NULL,
    "cardProjectId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "feedbackText" TEXT NOT NULL,
    "oldPrompt" TEXT NOT NULL,
    "newPrompt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyProductLog" (
    "id" TEXT NOT NULL,
    "cardProjectId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyProductUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopifyProductLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationLog" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyShop" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "scope" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "webhookStatus" TEXT NOT NULL DEFAULT 'pending',
    "webhookTopics" TEXT NOT NULL DEFAULT '',
    "reauthorizeRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShopifyShop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopify_sessions" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "scope" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMemory_discordUserId_key" ON "UserMemory"("discordUserId");

-- CreateIndex
CREATE INDEX "CardProject_discordUserId_createdAt_idx" ON "CardProject"("discordUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CardStyleOption_cardProjectId_createdAt_idx" ON "CardStyleOption"("cardProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackLog_cardProjectId_createdAt_idx" ON "FeedbackLog"("cardProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "ShopifyProductLog_cardProjectId_createdAt_idx" ON "ShopifyProductLog"("cardProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationLog_discordUserId_createdAt_idx" ON "ConversationLog"("discordUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyShop_shop_key" ON "ShopifyShop"("shop");

-- CreateIndex
CREATE INDEX "ShopifyShop_installedAt_idx" ON "ShopifyShop"("installedAt");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_sessions_shop_key" ON "shopify_sessions"("shop");

-- AddForeignKey
ALTER TABLE "CardStyleOption" ADD CONSTRAINT "CardStyleOption_cardProjectId_fkey" FOREIGN KEY ("cardProjectId") REFERENCES "CardProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackLog" ADD CONSTRAINT "FeedbackLog_cardProjectId_fkey" FOREIGN KEY ("cardProjectId") REFERENCES "CardProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyProductLog" ADD CONSTRAINT "ShopifyProductLog_cardProjectId_fkey" FOREIGN KEY ("cardProjectId") REFERENCES "CardProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

