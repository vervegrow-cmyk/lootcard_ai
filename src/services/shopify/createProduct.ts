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
}

export interface ShopifyGraphqlCreateProductResult {
  ok: boolean;
  productId?: string;
  variantId?: string;
  handle?: string;
  productUrl?: string;
  adminUrl?: string;
  price?: number;
  title?: string;
  error?: string;
}

interface GraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message?: string }>;
}

interface ProductCreateData {
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
        }>;
      };
    };
    userErrors?: Array<{ message: string }>;
  };
}

function titleHandle(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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

export async function createShopifyProductGraphql(
  input: ShopifyGraphqlCreateProductInput
): Promise<ShopifyGraphqlCreateProductResult> {
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

  const created = await postGraphql<GraphqlResponse<ProductCreateData>>({
    shop: input.shop,
    accessToken: input.accessToken,
    apiVersion: input.apiVersion,
    query: createMutation,
    variables: {
      input: {
        title: input.title,
        descriptionHtml: input.descriptionHtml,
        vendor: input.vendor || "LootCard AI",
        productType: input.productType || "Custom Product",
        tags: input.tags,
        status: "ACTIVE"
      }
    }
  });

  if (!created.ok || !created.data) {
    return {
      ok: false,
      error: `Shopify GraphQL create product failed: ${created.status} ${created.text}`
    };
  }

  if (created.data.errors?.length) {
    return {
      ok: false,
      error: created.data.errors.map((item) => item.message || "Unknown GraphQL error").join("; ")
    };
  }

  const userErrors = created.data.data?.productCreate?.userErrors || [];
  if (userErrors.length > 0) {
    return {
      ok: false,
      error: userErrors.map((item) => item.message).join("; ")
    };
  }

  const product = created.data.data?.productCreate?.product;
  const productId = product?.id || "";
  const variantId = product?.variants?.nodes?.[0]?.id || "";

  if (productId && variantId) {
    const updateVariantMutation = `
      mutation UpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
            inventoryPolicy
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const updated = await postGraphql<
      GraphqlResponse<{
        productVariantsBulkUpdate?: {
          userErrors?: Array<{ message: string }>;
        };
      }>
    >({
      shop: input.shop,
      accessToken: input.accessToken,
      apiVersion: input.apiVersion,
      query: updateVariantMutation,
      variables: {
        productId,
        variants: [
          {
            id: variantId,
            price: input.price.toFixed(2),
            sku: input.sku || `DISCORD-${Date.now()}`,
            inventoryPolicy: "CONTINUE",
            taxable: true
          }
        ]
      }
    });

    if (!updated.ok || !updated.data) {
      return {
        ok: false,
        error: `Shopify variant update failed: ${updated.status} ${updated.text}`
      };
    }

    const variantErrors = updated.data.data?.productVariantsBulkUpdate?.userErrors || [];
    if (variantErrors.length > 0) {
      return {
        ok: false,
        error: variantErrors.map((item) => item.message).join("; ")
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

    const publications = await postGraphql<
      GraphqlResponse<{
        publications?: {
          nodes?: Array<{ id?: string; name?: string }>;
        };
      }>
    >({
      shop: input.shop,
      accessToken: input.accessToken,
      apiVersion: input.apiVersion,
      query: publicationQuery
    });

    const onlineStorePublication = publications.data?.data?.publications?.nodes?.find((item) =>
      (item.name || "").toLowerCase().includes("online store")
    );

    if (onlineStorePublication?.id) {
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
        shop: input.shop,
        accessToken: input.accessToken,
        apiVersion: input.apiVersion,
        query: publishMutation,
        variables: {
          id: productId,
          input: [{ publicationId: onlineStorePublication.id }]
        }
      });
    }
  }

  const handle = product?.handle || titleHandle(input.title);
  const productUrl = product?.onlineStoreUrl || `https://${input.shop}/products/${handle}`;
  const adminNumericId = productId.split("/").pop() || "";
  const adminStoreSlug = input.shop.replace(/\.myshopify\.com$/i, "");
  const adminUrl = adminNumericId
    ? `https://admin.shopify.com/store/${adminStoreSlug}/products/${adminNumericId}`
    : `https://${input.shop}/admin/products`;

  return {
    ok: true,
    productId,
    variantId,
    handle,
    productUrl,
    adminUrl,
    price: input.price,
    title: input.title
  };
}
