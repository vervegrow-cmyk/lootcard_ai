import { ShopifyProductDraft, ShopifyProductResult } from "../types";
import { shopifyAuthService } from "./shopify-auth.service";

export interface CreateShopifyProductInput {
  title?: string;
  description?: string;
  price?: number;
  tags?: string[];
  shop?: string;
}

export interface CreateShopifyProductOutput {
  ok: boolean;
  productId?: string;
  variantId?: string;
  handle?: string;
  productUrl?: string;
  adminUrl?: string;
  price?: number;
  title?: string;
  shop?: string;
  reauthorizeUrl?: string;
  missing?: string[];
  error?: string;
}

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function shopifyApiVersion(): string {
  return env("SHOPIFY_API_VERSION") || "2026-04";
}

function defaultPrice(): number {
  const parsed = Number(process.env.DEFAULT_CARD_PRICE || "29.99");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 29.99;
}

function defaultTags(): string[] {
  return ["custom-card", "ai-card", "discord-order", "lootcard"];
}

function htmlDescription(input?: string): string {
  return (
    input?.trim() ||
    [
      "Custom-made AI trading card by LootCard AI.",
      "Production and delivery usually takes about 30 days.",
      "Final design will follow the confirmed Discord conversation."
    ].join("<br><br>")
  );
}

function titleHandle(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isShopifyConfigured(): boolean {
  return shopifyAuthService.isOAuthConfigured();
}

export class ShopifyService {
  isShopifyConfigured(): boolean {
    return isShopifyConfigured();
  }

  async getShopifyToken(shop?: string): Promise<{ shop: string; accessToken: string } | null> {
    const shopRecord =
      (shop ? await shopifyAuthService.getShopByDomain(shop) : null) ||
      (await shopifyAuthService.getPrimaryShop());

    if (!shopRecord || shopRecord.reauthorizeRequired) {
      return null;
    }

    console.log("[Shopify OAuth Token Loaded]", shopRecord.shop);
    return {
      shop: shopRecord.shop,
      accessToken: shopRecord.accessToken
    };
  }

  async createShopifyProduct(input: CreateShopifyProductInput): Promise<CreateShopifyProductOutput> {
    if (!shopifyAuthService.isOAuthConfigured()) {
      return {
        ok: false,
        missing: shopifyAuthService.getMissingOAuthEnv(),
        error: `Shopify OAuth is not configured. Missing: ${shopifyAuthService.getMissingOAuthEnv().join(", ")}`
      };
    }

    const tokenContext = await this.getShopifyToken(input.shop);
    const shopRecord =
      (input.shop ? await shopifyAuthService.getShopByDomain(input.shop) : null) ||
      (await shopifyAuthService.getPrimaryShop());

    if (!shopRecord || !tokenContext) {
      return {
        ok: false,
        missing: ["installed_shop"],
        error: "No installed Shopify shop was found. Open the embedded app in Shopify Admin to complete OAuth installation first."
      };
    }

    if (shopRecord.reauthorizeRequired) {
      const reauthorizeUrl = await shopifyAuthService.markShopForReauthorization(shopRecord.shop);
      return {
        ok: false,
        shop: shopRecord.shop,
        reauthorizeUrl,
        error: "The connected Shopify shop requires reauthorization."
      };
    }

    const title = input.title?.trim() || "Custom AI Trading Card";
    const description = htmlDescription(input.description);
    const price = input.price ?? defaultPrice();
    const tags = input.tags?.length ? input.tags : defaultTags();

    console.log("[Shopify Product Create Start]", {
      shop: shopRecord.shop,
      title,
      price,
      tags
    });

    const createMutation = `
      mutation CreateProduct($input: ProductCreateInput!) {
        productCreate(product: $input) {
          product {
            id
            title
            handle
            onlineStoreUrl
            variants(first: 1) {
              nodes {
                id
                price
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const createVariables = {
      input: {
        title,
        descriptionHtml: description,
        vendor: "LootCard AI",
        productType: "Custom AI Card",
        tags,
        status: "ACTIVE"
      }
    };

    try {
      const endpoint = `https://${shopRecord.shop}/admin/api/${shopifyApiVersion()}/graphql.json`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": tokenContext.accessToken
        },
        body: JSON.stringify({
          query: createMutation,
          variables: createVariables
        })
      });

      const text = await response.text();
      if (response.status === 401 || response.status === 403) {
        const reauthorizeUrl = await shopifyAuthService.markShopForReauthorization(shopRecord.shop);
        return {
          ok: false,
          shop: shopRecord.shop,
          reauthorizeUrl,
          error: `Shopify token is no longer valid for ${shopRecord.shop}. Reauthorization is required.`
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          shop: shopRecord.shop,
          error: `Shopify GraphQL create product failed: ${response.status} ${text}`
        };
      }

      const parsed = JSON.parse(text) as {
        data?: {
          productCreate?: {
            product?: {
              id?: string;
              title?: string;
              handle?: string;
              onlineStoreUrl?: string | null;
              variants?: {
                nodes?: Array<{
                  id?: string;
                  price?: string;
                }>;
              };
            };
            userErrors?: Array<{ message: string }>;
          };
        };
      };

      const userErrors = parsed.data?.productCreate?.userErrors || [];
      if (userErrors.length > 0) {
        return {
          ok: false,
          shop: shopRecord.shop,
          error: userErrors.map((item) => item.message).join("; ")
        };
      }

      const product = parsed.data?.productCreate?.product;
      const productId = product?.id || "";
      const variantId = product?.variants?.nodes?.[0]?.id || "";

      if (productId && variantId) {
        const updateVariantMutation = `
          mutation UpdateVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              productVariants {
                id
                price
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const updateVariantResponse = await fetch(endpoint, {
          method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": tokenContext.accessToken
            },
          body: JSON.stringify({
            query: updateVariantMutation,
            variables: {
              productId,
              variants: [
                {
                  id: variantId,
                  price: price.toFixed(2)
                }
              ]
            }
          })
        });

        const updateVariantText = await updateVariantResponse.text();
        if (!updateVariantResponse.ok) {
          console.log("[Shopify Product Create Result]", updateVariantText);
          return {
            ok: false,
            shop: shopRecord.shop,
            error: `Shopify variant update failed: ${updateVariantResponse.status} ${updateVariantText}`
          };
        }

        const updateVariantParsed = JSON.parse(updateVariantText) as {
          data?: {
            productVariantsBulkUpdate?: {
              userErrors?: Array<{ message: string }>;
            };
          };
        };

        const updateVariantErrors = updateVariantParsed.data?.productVariantsBulkUpdate?.userErrors || [];
        if (updateVariantErrors.length > 0) {
          return {
            ok: false,
            shop: shopRecord.shop,
            error: updateVariantErrors.map((item) => item.message).join("; ")
          };
        }
      }

      if (productId) {
        const publicationQuery = `
          query GetPublications {
            publications(first: 20) {
              nodes {
                id
                name
              }
            }
          }
        `;

        const publicationResponse = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": tokenContext.accessToken
          },
          body: JSON.stringify({ query: publicationQuery })
        });

        const publicationText = await publicationResponse.text();
        if (publicationResponse.ok) {
          const publicationParsed = JSON.parse(publicationText) as {
            data?: {
              publications?: {
                nodes?: Array<{ id?: string; name?: string }>;
              };
            };
          };

          const onlineStorePublication = (publicationParsed.data?.publications?.nodes || []).find((item) =>
            (item.name || "").toLowerCase().includes("online store")
          );

          if (onlineStorePublication?.id) {
            const publishMutation = `
              mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
                publishablePublish(id: $id, input: $input) {
                  publishable {
                    ... on Product {
                      id
                    }
                  }
                  shop {
                    id
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;

            const publishResponse = await fetch(endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": tokenContext.accessToken
              },
              body: JSON.stringify({
                query: publishMutation,
                variables: {
                  id: productId,
                  input: [
                    {
                      publicationId: onlineStorePublication.id
                    }
                  ]
                }
              })
            });

            const publishText = await publishResponse.text();
            console.log("[Shopify Product Create Result]", publishText);
          }
        }
      }

      const handle = product?.handle || titleHandle(title);
      const productUrl = product?.onlineStoreUrl || `https://${shopRecord.shop}/products/${handle}`;
      const adminNumericId = productId.split("/").pop() || "";
      const adminUrl = adminNumericId
        ? `https://${shopRecord.shop}/admin/products/${adminNumericId}`
        : `https://${shopRecord.shop}/admin/products`;

      console.log("[Shopify Product URL]", productUrl);
      console.log("[Shopify Product Create Result]", {
        ok: true,
        productId,
        variantId,
        handle,
        productUrl,
        price
      });

      return {
        ok: true,
        productId,
        variantId,
        handle,
        productUrl,
        adminUrl,
        price,
        title,
        shop: shopRecord.shop
      };
    } catch (error) {
      console.log("[Shopify Product Create Result]", error);
      return {
        ok: false,
        shop: shopRecord.shop,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async createProduct(product: ShopifyProductDraft): Promise<ShopifyProductResult> {
    const result = await this.createShopifyProduct({
      title: product.title,
      description: product.description,
      price: Number(product.price || defaultPrice()),
      tags: product.tags
    });

    if (!result.ok || !result.productId || !result.handle || !result.productUrl) {
      throw new Error(result.error || "SHOPIFY_CREATE_FAILED");
    }

    return {
      id: result.productId,
      handle: result.handle,
      url: result.productUrl,
      title: result.title || product.title,
      price: String(result.price ?? product.price),
      sku: product.sku
    };
  }
}

export const shopifyService = new ShopifyService();
