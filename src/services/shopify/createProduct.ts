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

export type ShopifyRestCreateProductResult = ShopifyGraphqlCreateProductResult;

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
          price?: string | null;
          inventoryPolicy?: string | null;
          availableForSale?: boolean | null;
          inventoryItem?: {
            id?: string;
            sku?: string | null;
            tracked?: boolean | null;
            requiresShipping?: boolean | null;
          } | null;
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
        inventoryPolicy?: string | null;
        availableForSale?: boolean | null;
        inventoryItem?: {
          id?: string;
          sku?: string | null;
          tracked?: boolean | null;
          requiresShipping?: boolean | null;
        } | null;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  return (response?.errors || [])
    .map((item) => item.message || "Unknown GraphQL error")
    .filter(Boolean);
}

async function checkImageReachable(imageUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    console.log(`[SHOPIFY] imageUrl=${imageUrl}`);
    const response = await fetch(imageUrl, { method: "GET" });
    console.log(`[SHOPIFY] image reachable status=${response.status}`);
    if (!response.ok) {
      return {
        ok: false,
        error: "图片链接已失效，请重新生成图片。"
      };
    }

    return { ok: true };
  } catch (error) {
    console.log("[SHOPIFY] image reachable status=0");
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
  console.log("[SHOPIFY] media uploaded");
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
  requiresShipping: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const mutation = `
    mutation UpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          inventoryPolicy
          taxable
          inventoryItem {
            id
            sku
            tracked
            requiresShipping
          }
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
          inventoryPolicy: "CONTINUE",
          taxable: false,
          inventoryItem: {
            sku: params.sku,
            tracked: false,
            requiresShipping: params.requiresShipping
          }
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

  console.log(`[SHOPIFY] variant price set=${params.price.toFixed(2)}`);
  console.log(`[SHOPIFY] variantId=${params.variantId}`);
  console.log("[SHOPIFY] variant created");
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
  mediaReady?: boolean;
  featuredMediaReady?: boolean;
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
            inventoryPolicy
            availableForSale
            inventoryItem {
              id
              sku
              tracked
              requiresShipping
            }
          }
        }
      }
    }
  `;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await sleep(2000);

    const response = await postGraphql<GraphqlResponse<ProductValidationResponse>>({
      shop: params.shop,
      accessToken: params.accessToken,
      apiVersion: params.apiVersion,
      query,
      variables: { id: params.productId }
    });

    if (!response.ok || !response.data) {
      if (attempt === 5) {
        return {
          ok: false,
          error: `Shopify validation query failed: ${response.status} ${response.text}`
        };
      }
      await sleep(1500);
      continue;
    }

    const errors = collectGraphqlErrors(response.data);
    if (errors.length) {
      if (attempt === 5) {
        return { ok: false, error: errors.join("; ") };
      }
      await sleep(1500);
      continue;
    }

    const product = response.data.data?.product;
    const variant = product?.variants?.nodes?.[0];
    const actualPrice = Number(variant?.price || 0);
    const featuredMediaUrl = product?.featuredMedia?.preview?.image?.url || undefined;
    const mediaUrl = product?.media?.nodes?.[0]?.preview?.image?.url || undefined;
    const mediaReady = Boolean(mediaUrl);
    const featuredMediaReady = Boolean(featuredMediaUrl);

    if (
      variant?.id &&
      Number.isFinite(actualPrice) &&
      actualPrice === Number(params.expectedPrice.toFixed(2)) &&
      mediaReady
    ) {
      return {
        ok: true,
        productUrl: product?.onlineStoreUrl || `https://${params.shop}/products/${product?.handle || ""}`,
        featuredMediaUrl: featuredMediaUrl || mediaUrl,
        variantId: variant.id,
        mediaReady,
        featuredMediaReady
      };
    }

    if (attempt < 5) {
      console.log(`[SHOPIFY] variant verify price=${variant?.price || "0.00"}`);
      console.log(`[SHOPIFY] media not ready retry=${attempt}`);
      continue;
    }

    if (!variant?.id) {
      return { ok: false, error: "Shopify validation failed: product variant was not created." };
    }

    if (!Number.isFinite(actualPrice) || actualPrice !== Number(params.expectedPrice.toFixed(2))) {
      return {
        ok: false,
        error: `Shopify validation failed: variant price is ${variant?.price || "0.00"}, expected ${params.expectedPrice.toFixed(2)}.`
      };
    }

    console.log(`[SHOPIFY] variant verify price=${variant?.price || "0.00"}`);
    console.log("[SHOPIFY] media uploaded but featuredMedia not ready yet");
    return {
      ok: true,
      productUrl: product?.onlineStoreUrl || `https://${params.shop}/products/${product?.handle || ""}`,
      featuredMediaUrl: featuredMediaUrl || mediaUrl,
      variantId: variant.id,
      mediaReady: Boolean(mediaUrl),
      featuredMediaReady: false
    };
  }

  return { ok: false, error: "Shopify validation failed." };
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

  console.log("[SHOPIFY] product create start");

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
              inventoryPolicy
              availableForSale
              inventoryItem {
                id
                sku
                tracked
                requiresShipping
              }
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
    return {
      ok: false,
      error: "Shopify product creation failed: missing product or variant id."
    };
  }

  const variantUpdate = await updateVariantPricing({
    shop: input.shop,
    accessToken: input.accessToken,
    apiVersion: input.apiVersion,
    productId,
    variantId: initialVariantId,
    price: input.price,
    sku: input.sku || `DISCORD-${Date.now()}`,
    requiresShipping: input.shippingType !== "digital_download"
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

  console.log(`[SHOPIFY] variant verify price=${input.price.toFixed(2)}`);

  if (!validation.featuredMediaReady) {
    console.log("[SHOPIFY] media uploaded but featuredMedia not ready yet");
  } else {
    console.log("[SHOPIFY] featured image attached");
  }

  const handle = product?.handle || titleHandle(input.title);
  const fallbackProductUrl = `https://${input.shop}/products/${handle}`;
  const cartLink = buildCartLink(input.shop, validation.variantId);
  const productUrl = validation.productUrl || fallbackProductUrl;
  const checkoutUrl = cartLink || productUrl;
  const adminNumericId = asNumericId(productId);
  const adminStoreSlug = input.shop.replace(/\.myshopify\.com$/i, "");
  const adminUrl = adminNumericId
    ? `https://admin.shopify.com/store/${adminStoreSlug}/products/${adminNumericId}`
    : `https://${input.shop}/admin/products`;

  console.log(`[SHOPIFY] productUrl=${productUrl}`);
  console.log(`[SHOPIFY] cartUrl=${checkoutUrl}`);
  console.log(`[SHOPIFY] checkout url generated ${checkoutUrl}`);
  if (cartLink) {
    console.log("[SHOPIFY] product page price mismatch possible theme issue");
  }

  return {
    ok: true,
    productId,
    variantId: validation.variantId || initialVariantId,
    handle,
    productUrl,
    checkoutUrl,
    adminUrl,
    price: input.price,
    title: input.title
  };
}

export async function createShopifyProductRest(
  input: ShopifyGraphqlCreateProductInput
): Promise<ShopifyRestCreateProductResult> {
  if (!input.imageUrl) {
    return {
      ok: false,
      error: "缺少卡牌图，请先生成图片。"
    };
  }

  console.log("[SHOPIFY] product create start");

  const imageReachable = await checkImageReachable(input.imageUrl);
  if (!imageReachable.ok) {
    return {
      ok: false,
      error: imageReachable.error || "图片链接已失效，请重新生成图片。"
    };
  }

  const response = await fetch(`https://${input.shop}/admin/api/${input.apiVersion}/products.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": input.accessToken
    },
    body: JSON.stringify({
      product: {
        title: input.title,
        body_html: input.descriptionHtml,
        vendor: input.vendor || "LootCard AI",
        product_type: input.productType || "Custom AI Trading Card",
        status: "active",
        tags: input.tags.join(", "),
        variants: [
          {
            price: input.price.toFixed(2),
            sku: input.sku || `DISCORD-${Date.now()}`,
            inventory_policy: "continue",
            taxable: false,
            requires_shipping: input.shippingType !== "digital_download"
          }
        ],
        images: [
          {
            src: input.imageUrl,
            alt: input.title
          }
        ],
        metafields_global_title_tag: input.seoTitle || input.title,
        metafields_global_description_tag: input.seoDescription || input.title
      }
    })
  });

  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      error: `Shopify REST create product failed: ${response.status} ${text}`
    };
  }

  const parsed = JSON.parse(text) as {
    product?: {
      id?: number;
      title?: string;
      handle?: string;
      variants?: Array<{ id?: number; price?: string }>;
      image?: { src?: string | null } | null;
      images?: Array<{ src?: string | null }>;
    };
  };

  const product = parsed.product;
  const variant = product?.variants?.[0];
  const actualPrice = Number(variant?.price || 0);
  const featuredImage = product?.image?.src || product?.images?.[0]?.src || "";

  if (!product?.id || !variant?.id) {
    return { ok: false, error: "Shopify REST validation failed: missing product or variant." };
  }

  if (!Number.isFinite(actualPrice) || actualPrice !== Number(input.price.toFixed(2))) {
    return {
      ok: false,
      error: `Shopify REST validation failed: variant price is ${variant?.price || "0.00"}, expected ${input.price.toFixed(2)}.`
    };
  }

  if (!featuredImage) {
    return { ok: false, error: "Shopify REST validation failed: product media is missing." };
  }

  console.log(`[SHOPIFY] variant price set=${input.price.toFixed(2)}`);
  console.log(`[SHOPIFY] variantId=${variant.id}`);
  console.log("[SHOPIFY] variant created");
  console.log("[SHOPIFY] media uploaded");
  console.log("[SHOPIFY] featured image attached");

  const productUrl = `https://${input.shop}/products/${product.handle || titleHandle(input.title)}`;
  const checkoutUrl = `https://${input.shop}/cart/${variant.id}:1`;
  const adminStoreSlug = input.shop.replace(/\.myshopify\.com$/i, "");
  const adminUrl = `https://admin.shopify.com/store/${adminStoreSlug}/products/${product.id}`;

  console.log(`[SHOPIFY] productUrl=${productUrl}`);
  console.log(`[SHOPIFY] cartUrl=${checkoutUrl}`);
  console.log(`[SHOPIFY] checkout url generated ${checkoutUrl}`);

  return {
    ok: true,
    productId: String(product.id),
    variantId: String(variant.id),
    handle: product.handle || titleHandle(input.title),
    productUrl,
    checkoutUrl,
    adminUrl,
    price: input.price,
    title: input.title
  };
}
