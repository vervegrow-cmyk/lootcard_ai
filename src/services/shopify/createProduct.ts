import { ShippingType } from "../../types";

export interface ShopifyGraphqlCreateProductInput {
  shop: string;
  accessToken: string;
  apiVersion: string;
  title: string;
  descriptionHtml: string;
  price: number;
  tags: string[];
  vendor?: string;
  productType?: string;
  sku?: string;
  imageUrl: string;
  seoTitle?: string;
  seoDescription?: string;
  shippingType?: ShippingType;
  inventoryQuantity?: number;
}

export interface ShopifyGraphqlCreateProductResult {
  ok: boolean;
  productId?: string;
  variantId?: string;
  handle?: string;
  productUrl?: string;
  checkoutUrl?: string;
  adminUrl?: string;
  price?: number;
  title?: string;
  error?: string;
}

interface GraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message?: string }>;
}

interface ProductCreateResponse {
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
          sku?: string;
          inventoryPolicy?: string | null;
          availableForSale?: boolean | null;
        }>;
      };
    };
    userErrors?: Array<{ message: string }>;
  };
}

interface ProductValidationResponse {
  product?: {
    id?: string;
    title?: string;
    handle?: string;
    onlineStoreUrl?: string | null;
    featuredMedia?: {
      id?: string;
      alt?: string | null;
      mediaContentType?: string | null;
      preview?: {
        image?: {
          url?: string | null;
        } | null;
      } | null;
    } | null;
    media?: {
      nodes?: Array<{
        id?: string;
        alt?: string | null;
        mediaContentType?: string | null;
        preview?: {
          image?: {
            url?: string | null;
          } | null;
        } | null;
      }>;
    };
    variants?: {
      nodes?: Array<{
        id?: string;
        price?: string | null;
        sku?: string | null;
        inventoryPolicy?: string | null;
        availableForSale?: boolean | null;
      }>;
    };
  } | null;
}

function titleHandle(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function asNumericId(gid?: string): string {
  return gid?.split("/").pop() || "";
}

function buildCartLink(shop: string, variantId?: string): string | undefined {
  const numericVariantId = asNumericId(variantId);
  if (!numericVariantId) {
    return undefined;
  }
  return `https://${shop}/cart/${numericVariantId}:1`;
}

async function postGraphql<TData>(params: {
  shop: string;
  accessToken: string;
  apiVersion: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<{ ok: boolean; data?: TData; text: string; status: number }> {
  const response = await fetch(`https://${params.shop}/admin/api/${params.apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": params.accessToken
    },
    body: JSON.stringify({
      query: params.query,
      variables: params.variables || {}
    })
  });

  const text = await response.text();
  if (!response.ok) {
    return { ok: false, text, status: response.status };
  }

  return {
    ok: true,
    text,
    status: response.status,
    data: JSON.parse(text) as TData
  };
}

function collectGraphqlErrors(response?: GraphqlResponse<unknown>): string[] {
  const errors = response?.errors || [];
  return errors.map((item) => item.message || "Unknown GraphQL error").filter(Boolean);
}

async function checkImageReachable(imageUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    console.log(`[SHOPIFY] imageUrl=${imageUrl}`);
    const response = await fetch(imageUrl, { method: "GET" });
    console.log(`[SHOPIFY] image reachable check status=${response.status}`);
    if (!response.ok) {
      return {
        ok: false,
        error: "图片链接已失效，请重新生成图片。"
      };
    }
    return { ok: true };
  } catch (error) {
    console.log("[SHOPIFY] image reachable check status=0");
    return {
      ok: false,
      error: error instanceof Error ? error.message : "图片链接已失效，请重新生成图片。"
    };
  }
}

async function uploadProductMedia(params: {
  shop: string;
  accessToken: string;
  apiVersion: string;
  productId: string;
  imageUrl: string;
  altText: string;
}): Promise<{ ok: boolean; mediaId?: string; error?: string }> {
  console.log(`[SHOPIFY] media upload start imageUrl=${params.imageUrl}`);

  const mutation = `
    mutation AddProductMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage {
            id
            alt
            status
            image {
              url
            }
          }
        }
        mediaUserErrors {
          field
          message
        }
      }
    }
  `;

  const response = await postGraphql<
    GraphqlResponse<{
      productCreateMedia?: {
        media?: Array<{ id?: string }>;
        mediaUserErrors?: Array<{ message: string }>;
      };
    }>
  >({
    shop: params.shop,
    accessToken: params.accessToken,
    apiVersion: params.apiVersion,
    query: mutation,
    variables: {
      productId: params.productId,
      media: [
        {
          mediaContentType: "IMAGE",
          originalSource: params.imageUrl,
          alt: params.altText
        }
      ]
    }
  });

  if (!response.ok || !response.data) {
    const error = `Shopify media upload failed: ${response.status} ${response.text}`;
    console.log(`[SHOPIFY] media upload failed error=${error}`);
    return { ok: false, error };
  }

  const errors = collectGraphqlErrors(response.data);
  if (errors.length) {
    const error = errors.join("; ");
    console.log(`[SHOPIFY] media upload failed error=${error}`);
    return { ok: false, error };
  }

  const userErrors = response.data.data?.productCreateMedia?.mediaUserErrors || [];
  if (userErrors.length) {
    const error = userErrors.map((item) => item.message).join("; ");
    console.log(`[SHOPIFY] media upload failed error=${error}`);
    return { ok: false, error };
  }

  const mediaId = response.data.data?.productCreateMedia?.media?.[0]?.id;
  console.log(`[SHOPIFY] media upload success mediaId=${mediaId || ""}`);
  return { ok: true, mediaId };
}

async function updateVariantPricing(params: {
  shop: string;
  accessToken: string;
  apiVersion: string;
  productId: string;
  variantId: string;
  price: number;
  sku: string;
}): Promise<{ ok: boolean; error?: string }> {
  const mutation = `
    mutation UpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          inventoryPolicy
          taxable
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await postGraphql<
    GraphqlResponse<{
      productVariantsBulkUpdate?: {
        productVariants?: Array<{ id?: string; price?: string }>;
        userErrors?: Array<{ message: string }>;
      };
    }>
  >({
    shop: params.shop,
    accessToken: params.accessToken,
    apiVersion: params.apiVersion,
    query: mutation,
    variables: {
      productId: params.productId,
      variants: [
        {
          id: params.variantId,
          price: params.price.toFixed(2),
          sku: params.sku,
          inventoryPolicy: "CONTINUE",
          taxable: false
        }
      ]
    }
  });

  if (!response.ok || !response.data) {
    return {
      ok: false,
      error: `Shopify variant update failed: ${response.status} ${response.text}`
    };
  }

  const errors = collectGraphqlErrors(response.data);
  if (errors.length) {
    return { ok: false, error: errors.join("; ") };
  }

  const userErrors = response.data.data?.productVariantsBulkUpdate?.userErrors || [];
  if (userErrors.length) {
    return { ok: false, error: userErrors.map((item) => item.message).join("; ") };
  }

  console.log(`[SHOPIFY] variant price set price=${params.price.toFixed(2)}`);
  console.log(`[SHOPIFY] variantId=${params.variantId}`);
  return { ok: true };
}

async function publishToOnlineStore(params: {
  shop: string;
  accessToken: string;
  apiVersion: string;
  productId: string;
}): Promise<void> {
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

  const publications = await postGraphql<
    GraphqlResponse<{
      publications?: {
        nodes?: Array<{ id?: string; name?: string }>;
      };
    }>
  >({
    shop: params.shop,
    accessToken: params.accessToken,
    apiVersion: params.apiVersion,
    query: publicationQuery
  });

  const onlineStorePublication = publications.data?.data?.publications?.nodes?.find((item) =>
    (item.name || "").toLowerCase().includes("online store")
  );

  if (!onlineStorePublication?.id) {
    return;
  }

  const publishMutation = `
    mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors {
          field
          message
        }
      }
    }
  `;

  await postGraphql({
    shop: params.shop,
    accessToken: params.accessToken,
    apiVersion: params.apiVersion,
    query: publishMutation,
    variables: {
      id: params.productId,
      input: [{ publicationId: onlineStorePublication.id }]
    }
  });
}

async function validateCreatedProduct(params: {
  shop: string;
  accessToken: string;
  apiVersion: string;
  productId: string;
  expectedPrice: number;
}): Promise<{
  ok: boolean;
  productUrl?: string;
  featuredMediaUrl?: string;
  variantId?: string;
  error?: string;
}> {
  const query = `
    query ValidateProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        onlineStoreUrl
        featuredMedia {
          ... on MediaImage {
            id
            alt
            mediaContentType
            preview {
              image {
                url
              }
            }
          }
        }
        media(first: 10) {
          nodes {
            ... on MediaImage {
              id
              alt
              mediaContentType
              preview {
                image {
                  url
                }
              }
            }
          }
        }
        variants(first: 10) {
          nodes {
            id
            price
            sku
            inventoryPolicy
            availableForSale
          }
        }
      }
    }
  `;

  const response = await postGraphql<GraphqlResponse<ProductValidationResponse>>({
    shop: params.shop,
    accessToken: params.accessToken,
    apiVersion: params.apiVersion,
    query,
    variables: { id: params.productId }
  });

  if (!response.ok || !response.data) {
    return {
      ok: false,
      error: `Shopify validation query failed: ${response.status} ${response.text}`
    };
  }

  const errors = collectGraphqlErrors(response.data);
  if (errors.length) {
    return { ok: false, error: errors.join("; ") };
  }

  const product = response.data.data?.product;
  const variant = product?.variants?.nodes?.[0];
  const actualPrice = Number(variant?.price || 0);
  const featuredMediaUrl =
    product?.featuredMedia?.preview?.image?.url || product?.media?.nodes?.[0]?.preview?.image?.url;

  if (!variant?.id) {
    return { ok: false, error: "Shopify validation failed: product variant was not created." };
  }

  if (!Number.isFinite(actualPrice) || actualPrice !== Number(params.expectedPrice.toFixed(2))) {
    return {
      ok: false,
      error: `Shopify validation failed: variant price is ${variant?.price || "0.00"}, expected ${params.expectedPrice.toFixed(2)}.`
    };
  }

  if (!featuredMediaUrl) {
    return { ok: false, error: "Shopify validation failed: product media is missing." };
  }

  return {
    ok: true,
    productUrl: product?.onlineStoreUrl || `https://${params.shop}/products/${product?.handle || ""}`,
    featuredMediaUrl,
    variantId: variant.id
  };
}

export async function createShopifyProductGraphql(
  input: ShopifyGraphqlCreateProductInput
): Promise<ShopifyGraphqlCreateProductResult> {
  if (!input.imageUrl) {
    return {
      ok: false,
      error: "缺少卡牌图，请先生成图片。"
    };
  }

  const imageReachable = await checkImageReachable(input.imageUrl);
  if (!imageReachable.ok) {
    return {
      ok: false,
      error: imageReachable.error || "图片链接已失效，请重新生成图片。"
    };
  }

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
              sku
              inventoryPolicy
              availableForSale
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

  const created = await postGraphql<GraphqlResponse<ProductCreateResponse>>({
    shop: input.shop,
    accessToken: input.accessToken,
    apiVersion: input.apiVersion,
    query: createMutation,
    variables: {
      input: {
        title: input.title,
        descriptionHtml: input.descriptionHtml,
        vendor: input.vendor || "LootCard AI",
        productType: input.productType || "Custom AI Trading Card",
        tags: input.tags,
        status: "ACTIVE",
        seo: {
          title: input.seoTitle || input.title,
          description: input.seoDescription || input.title
        }
      }
    }
  });

  if (!created.ok || !created.data) {
    return {
      ok: false,
      error: `Shopify GraphQL create product failed: ${created.status} ${created.text}`
    };
  }

  const graphErrors = collectGraphqlErrors(created.data);
  if (graphErrors.length) {
    return { ok: false, error: graphErrors.join("; ") };
  }

  const userErrors = created.data.data?.productCreate?.userErrors || [];
  if (userErrors.length) {
    return { ok: false, error: userErrors.map((item) => item.message).join("; ") };
  }

  const product = created.data.data?.productCreate?.product;
  const productId = product?.id || "";
  const initialVariantId = product?.variants?.nodes?.[0]?.id || "";

  if (!productId || !initialVariantId) {
    return { ok: false, error: "Shopify product creation failed: missing product or variant id." };
  }

  const variantUpdate = await updateVariantPricing({
    shop: input.shop,
    accessToken: input.accessToken,
    apiVersion: input.apiVersion,
    productId,
    variantId: initialVariantId,
    price: input.price,
    sku: input.sku || `DISCORD-${Date.now()}`
  });

  if (!variantUpdate.ok) {
    return { ok: false, error: variantUpdate.error };
  }

  const mediaUpload = await uploadProductMedia({
    shop: input.shop,
    accessToken: input.accessToken,
    apiVersion: input.apiVersion,
    productId,
    imageUrl: input.imageUrl,
    altText: input.title
  });

  if (!mediaUpload.ok) {
    return { ok: false, error: mediaUpload.error };
  }

  await publishToOnlineStore({
    shop: input.shop,
    accessToken: input.accessToken,
    apiVersion: input.apiVersion,
    productId
  });

  const validation = await validateCreatedProduct({
    shop: input.shop,
    accessToken: input.accessToken,
    apiVersion: input.apiVersion,
    productId,
    expectedPrice: input.price
  });

  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const handle = product?.handle || titleHandle(input.title);
  const fallbackProductUrl = `https://${input.shop}/products/${handle}`;
  const cartLink = buildCartLink(input.shop, validation.variantId);
  const productUrl = cartLink || validation.productUrl || fallbackProductUrl;
  const adminNumericId = asNumericId(productId);
  const adminStoreSlug = input.shop.replace(/\.myshopify\.com$/i, "");
  const adminUrl = adminNumericId
    ? `https://admin.shopify.com/store/${adminStoreSlug}/products/${adminNumericId}`
    : `https://${input.shop}/admin/products`;

  console.log(`[SHOPIFY] productUrl=${productUrl}`);
  if (cartLink) {
    console.log("[SHOPIFY] product page price mismatch possible theme issue");
  }

  return {
    ok: true,
    productId,
    variantId: validation.variantId || initialVariantId,
    handle,
    productUrl,
    checkoutUrl: productUrl,
    adminUrl,
    price: input.price,
    title: input.title
  };
}
