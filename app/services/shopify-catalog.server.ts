import type { ActiveDiscountSummary } from "./offer-analyzer";

export interface CatalogVariant {
  id: string;
  title: string;
  price: number;
  currencyCode: string;
  sku: string | null;
  inventoryManagement: string; // "SHOPIFY" | "NOT_MANAGED"
  inventoryItemId: string;
  unitCost: number | null;
  imageUrl: string | null;
}

export interface CatalogProduct {
  id: string;
  title: string;
  status: string;
  imageUrl: string | null;
  variants: CatalogVariant[];
}

export interface StoreLocation {
  id: string;
  name: string;
  isActive: boolean;
}

const PRODUCTS_QUERY = `#graphql
  query getProductsForOfferCheck($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          status
          featuredImage {
            url
            altText
          }
          variants(first: 50) {
            edges {
              node {
                id
                title
                price
                sku
                inventoryManagement
                inventoryItem {
                  id
                  unitCost {
                    amount
                    currencyCode
                  }
                }
                image {
                  url
                }
              }
            }
          }
        }
      }
    }
  }
`;

const LOCATIONS_QUERY = `#graphql
  query getLocations($first: Int!) {
    locations(first: $first, includeInactive: false) {
      edges {
        node {
          id
          name
          isActive
        }
      }
    }
  }
`;

const INVENTORY_LEVEL_QUERY = `#graphql
  query getInventoryLevelForVariant($inventoryItemId: ID!, $locationId: ID!) {
    inventoryItem(id: $inventoryItemId) {
      id
      inventoryLevel(locationId: $locationId) {
        id
        quantities(names: ["available"]) {
          name
          quantity
        }
      }
    }
  }
`;

const ACTIVE_DISCOUNTS_QUERY = `#graphql
  query getActiveDiscounts($first: Int!) {
    discountNodes(first: $first, query: "status:active") {
      edges {
        node {
          id
          discount {
            __typename
            ... on DiscountCodeBasic {
              title
              status
              summary
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountAutomaticBasic {
              title
              status
              summary
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountCodeBxgy {
              title
              status
              summary
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountAutomaticBxgy {
              title
              status
              summary
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountCodeFreeShipping {
              title
              status
              summary
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountAutomaticFreeShipping {
              title
              status
              summary
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountCodeApp {
              title
              status
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountAutomaticApp {
              title
              status
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Fetch active products and their variants with price and unit cost from Shopify Admin GraphQL API.
 */
export async function fetchProductsForOfferCheck(
  admin: any,
  searchQuery?: string,
  limit = 50
): Promise<CatalogProduct[]> {
  const response = await admin.graphql(PRODUCTS_QUERY, {
    variables: {
      first: limit,
      query: searchQuery ? `status:ACTIVE title:*${searchQuery}*` : "status:ACTIVE",
    },
  });

  const json = await response.json();
  const edges = json.data?.products?.edges || [];

  return edges.map(({ node }: any): CatalogProduct => {
    const featuredUrl = node.featuredImage?.url || null;
    const variants: CatalogVariant[] = (node.variants?.edges || []).map(
      ({ node: v }: any): CatalogVariant => {
        const rawCost = v.inventoryItem?.unitCost?.amount;
        const unitCost = rawCost !== undefined && rawCost !== null ? parseFloat(rawCost) : null;
        const price = parseFloat(v.price || "0");
        const currencyCode = v.inventoryItem?.unitCost?.currencyCode || "USD";
        const variantImageUrl = v.image?.url || featuredUrl;

        return {
          id: v.id,
          title: v.title,
          price,
          currencyCode,
          sku: v.sku || null,
          inventoryManagement: v.inventoryManagement || "NOT_MANAGED",
          inventoryItemId: v.inventoryItem?.id || "",
          unitCost,
          imageUrl: variantImageUrl,
        };
      }
    );

    return {
      id: node.id,
      title: node.title,
      status: node.status,
      imageUrl: featuredUrl,
      variants,
    };
  });
}

/**
 * Fetch available store locations.
 */
export async function fetchStoreLocations(admin: any, limit = 20): Promise<StoreLocation[]> {
  const response = await admin.graphql(LOCATIONS_QUERY, {
    variables: { first: limit },
  });

  const json = await response.json();
  const edges = json.data?.locations?.edges || [];

  return edges.map(({ node }: any): StoreLocation => ({
    id: node.id,
    name: node.name,
    isActive: Boolean(node.isActive),
  }));
}

/**
 * Fetch exact inventory available quantity for an inventory item at a specific location.
 */
export async function fetchInventoryAvailable(
  admin: any,
  inventoryItemId: string,
  locationId: string
): Promise<{ available: number | null; error?: string }> {
  if (!inventoryItemId || !locationId) {
    return { available: null, error: "Missing inventory item ID or location ID" };
  }

  try {
    const response = await admin.graphql(INVENTORY_LEVEL_QUERY, {
      variables: {
        inventoryItemId,
        locationId,
      },
    });

    const json = await response.json();
    const quantities = json.data?.inventoryItem?.inventoryLevel?.quantities || [];
    const availableQty = quantities.find((q: any) => q.name === "available");

    if (availableQty && typeof availableQty.quantity === "number") {
      return { available: availableQty.quantity };
    }

    return { available: null };
  } catch (err: any) {
    return { available: null, error: err.message || "Failed to query inventory level" };
  }
}

/**
 * Fetch active store discounts and combination rules.
 */
export async function fetchActiveDiscounts(
  admin: any,
  limit = 25
): Promise<{
  available: boolean;
  unavailableReason?: string;
  activeDiscounts: ActiveDiscountSummary[];
}> {
  try {
    const response = await admin.graphql(ACTIVE_DISCOUNTS_QUERY, {
      variables: { first: limit },
    });

    const json = await response.json();

    if (json.errors && json.errors.length > 0) {
      const errorMsg = json.errors.map((e: any) => e.message).join(", ");
      return {
        available: false,
        unavailableReason: `Shopify GraphQL Error: ${errorMsg}`,
        activeDiscounts: [],
      };
    }

    const edges = json.data?.discountNodes?.edges || [];
    const activeDiscounts: ActiveDiscountSummary[] = edges
      .map(({ node }: any) => {
        const d = node.discount;
        if (!d) return null;

        return {
          id: node.id,
          title: d.title || "Untitled Discount",
          summary: d.summary || "",
          status: d.status || "ACTIVE",
          combinesWith: d.combinesWith
            ? {
                orderDiscounts: Boolean(d.combinesWith.orderDiscounts),
                productDiscounts: Boolean(d.combinesWith.productDiscounts),
                shippingDiscounts: Boolean(d.combinesWith.shippingDiscounts),
              }
            : undefined,
        };
      })
      .filter((d: any): d is ActiveDiscountSummary => d !== null);

    return {
      available: true,
      activeDiscounts,
    };
  } catch (err: any) {
    return {
      available: false,
      unavailableReason: err.message || "Unable to retrieve discount records from Shopify API",
      activeDiscounts: [],
    };
  }
}
