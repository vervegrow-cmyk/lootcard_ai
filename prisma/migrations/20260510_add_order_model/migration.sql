-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM (
  'DRAFT',
  'DESIGNING',
  'OPTION_SELECTED',
  'IMAGE_GENERATED',
  'WAITING_CONFIRMATION',
  'SHOPIFY_CREATED',
  'WAITING_PAYMENT',
  'PAID',
  'PRODUCTION',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
  'FAILED'
);

-- CreateTable
CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "discordUserId" TEXT NOT NULL,
  "discordChannelId" TEXT,
  "discordMessageId" TEXT,
  "cardProjectId" TEXT,
  "originalPrompt" TEXT,
  "selectedOption" TEXT,
  "selectedStyle" TEXT,
  "designPrompt" TEXT,
  "imageUrl" TEXT,
  "productTitle" TEXT,
  "productDescription" TEXT,
  "price" DECIMAL(10,2),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "shippingType" TEXT,
  "shippingAddressJson" JSONB,
  "shopifyShop" TEXT,
  "shopifyProductId" TEXT,
  "shopifyProductGid" TEXT,
  "shopifyVariantId" TEXT,
  "shopifyVariantGid" TEXT,
  "shopifyProductUrl" TEXT,
  "shopifyCheckoutUrl" TEXT,
  "shopifyOrderId" TEXT,
  "shopifyOrderGid" TEXT,
  "shopifyOrderName" TEXT,
  "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
  "paidAt" TIMESTAMP(3),
  "shippedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE INDEX "Order_discordUserId_idx" ON "Order"("discordUserId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_shopifyProductId_idx" ON "Order"("shopifyProductId");

-- CreateIndex
CREATE INDEX "Order_shopifyOrderId_idx" ON "Order"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "Order_orderNo_idx" ON "Order"("orderNo");
