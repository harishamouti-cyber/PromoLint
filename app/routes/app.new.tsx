import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigate, useNavigation, Form } from "@remix-run/react";
import { useState, useMemo } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  Select,
  TextField,
  Button,
  BlockStack,
  InlineStack,
  Banner,
  Thumbnail,
  Divider,
  Box,
  InlineError,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  fetchProductsForOfferCheck,
  fetchStoreLocations,
  fetchInventoryAvailable,
  fetchActiveDiscounts,
  type CatalogProduct,
} from "../services/shopify-catalog.server";
import { getShopSettings } from "../services/settings.server";
import { createOfferCheck } from "../services/checks.server";
import { evaluateOfferCheck, type DiscountType } from "../services/offer-analyzer";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const [products, locations, settings] = await Promise.all([
    fetchProductsForOfferCheck(admin, undefined, 50),
    fetchStoreLocations(admin, 20),
    getShopSettings(session.shop),
  ]);

  return json({
    products,
    locations,
    settings,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const triggerProductId = formData.get("triggerProductId") as string;
  const triggerVariantId = formData.get("triggerVariantId") as string;
  const offeredProductId = formData.get("offeredProductId") as string;
  const offeredVariantId = formData.get("offeredVariantId") as string;
  const discountType = (formData.get("discountType") as DiscountType) || "PERCENTAGE";
  const rawDiscountValue = formData.get("discountValue") as string;
  const locationId = formData.get("locationId") as string;

  const errors: Record<string, string> = {};

  if (!triggerProductId) errors.triggerProductId = "Please select a trigger product.";
  if (!triggerVariantId) errors.triggerVariantId = "Please select a trigger variant.";
  if (!offeredProductId) errors.offeredProductId = "Please select an offered product.";
  if (!offeredVariantId) errors.offeredVariantId = "Please select an offered variant.";
  if (!locationId) errors.locationId = "Please select an inventory location.";

  const discountValue = parseFloat(rawDiscountValue);
  if (isNaN(discountValue) || discountValue <= 0) {
    errors.discountValue = "Enter a valid positive discount amount.";
  } else if (discountType === "PERCENTAGE" && discountValue > 100) {
    errors.discountValue = "Percentage discount cannot exceed 100%.";
  }

  if (Object.keys(errors).length > 0) {
    return json({ errors }, { status: 400 });
  }

  // Load fresh catalog details to guarantee authentic IDs, prices, and unit costs
  const [catalogProducts, locations, settings] = await Promise.all([
    fetchProductsForOfferCheck(admin, undefined, 100),
    fetchStoreLocations(admin, 20),
    getShopSettings(session.shop),
  ]);

  const triggerProduct = catalogProducts.find((p) => p.id === triggerProductId);
  const triggerVariant = triggerProduct?.variants.find((v) => v.id === triggerVariantId);

  const offeredProduct = catalogProducts.find((p) => p.id === offeredProductId);
  const offeredVariant = offeredProduct?.variants.find((v) => v.id === offeredVariantId);

  if (!triggerProduct || !triggerVariant) {
    return json({ errors: { triggerProductId: "Selected trigger product or variant not found in store catalog." } }, { status: 400 });
  }

  if (!offeredProduct || !offeredVariant) {
    return json({ errors: { offeredProductId: "Selected offered product or variant not found in store catalog." } }, { status: 400 });
  }

  const selectedLocation = locations.find((l) => l.id === locationId);
  const locationName = selectedLocation ? selectedLocation.name : "Selected Location";

  // Check inventory level at chosen location
  let inventoryQuantity: number | null = null;
  let hasInventoryRecord = true;
  const isInventoryTracked = offeredVariant.inventoryManagement === "SHOPIFY";

  if (isInventoryTracked && offeredVariant.inventoryItemId) {
    const invResult = await fetchInventoryAvailable(
      admin,
      offeredVariant.inventoryItemId,
      locationId
    );
    inventoryQuantity = invResult.available;
    hasInventoryRecord = invResult.hasInventoryRecord;
  }

  // Check active store discounts
  const discountData = await fetchActiveDiscounts(admin, 25);

  // Run pure domain evaluation
  const evaluation = evaluateOfferCheck({
    currentPrice: offeredVariant.price,
    unitCost: offeredVariant.unitCost,
    discountType,
    discountValue,
    currencyCode: offeredVariant.currencyCode,
    inventoryQuantity,
    inventoryTracked: isInventoryTracked,
    hasInventoryRecord,
    locationName,
    minStockThreshold: settings.minStockThreshold,
    minMarginThreshold: settings.minMarginThreshold,
    discountData,
  });

  // Persist check under shop identity
  const savedCheck = await createOfferCheck({
    shop: session.shop,
    triggerProductId: triggerProduct.id,
    triggerProductTitle: triggerProduct.title,
    triggerVariantId: triggerVariant.id,
    triggerVariantTitle: triggerVariant.title,
    offeredProductId: offeredProduct.id,
    offeredProductTitle: offeredProduct.title,
    offeredVariantId: offeredVariant.id,
    offeredVariantTitle: offeredVariant.title,
    offeredProductImageUrl: offeredVariant.imageUrl || offeredProduct.imageUrl,
    discountType,
    discountValue,
    currencyCode: offeredVariant.currencyCode,
    currentPrice: offeredVariant.price,
    locationId,
    locationName,
    evaluation,
  });

  return redirect(`/app/checks/${savedCheck.id}`);
};

export default function NewOfferCheckScreen() {
  const { products, locations, settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Form State
  const [triggerProductId, setTriggerProductId] = useState<string>(products[0]?.id || "");
  const [triggerVariantId, setTriggerVariantId] = useState<string>(
    products[0]?.variants[0]?.id || ""
  );

  const [offeredProductId, setOfferedProductId] = useState<string>(
    products[1]?.id || products[0]?.id || ""
  );
  const [offeredVariantId, setOfferedVariantId] = useState<string>(
    (products[1] || products[0])?.variants[0]?.id || ""
  );

  const [discountType, setDiscountType] = useState<DiscountType>("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState<string>("20");
  const [locationId, setLocationId] = useState<string>(
    settings.defaultLocationId && locations.some((l) => l.id === settings.defaultLocationId)
      ? settings.defaultLocationId
      : locations[0]?.id || ""
  );

  // Derived selected entities
  const selectedTriggerProduct = useMemo(
    () => products.find((p) => p.id === triggerProductId),
    [products, triggerProductId]
  );
  const selectedTriggerVariant = useMemo(
    () => selectedTriggerProduct?.variants.find((v) => v.id === triggerVariantId),
    [selectedTriggerProduct, triggerVariantId]
  );

  const selectedOfferedProduct = useMemo(
    () => products.find((p) => p.id === offeredProductId),
    [products, offeredProductId]
  );
  const selectedOfferedVariant = useMemo(
    () => selectedOfferedProduct?.variants.find((v) => v.id === offeredVariantId),
    [selectedOfferedProduct, offeredVariantId]
  );

  // Update variants when product selection changes
  const handleTriggerProductChange = (prodId: string) => {
    setTriggerProductId(prodId);
    const prod = products.find((p) => p.id === prodId);
    if (prod && prod.variants.length > 0) {
      setTriggerVariantId(prod.variants[0].id);
    } else {
      setTriggerVariantId("");
    }
  };

  const handleOfferedProductChange = (prodId: string) => {
    setOfferedProductId(prodId);
    const prod = products.find((p) => p.id === prodId);
    if (prod && prod.variants.length > 0) {
      setOfferedVariantId(prod.variants[0].id);
    } else {
      setOfferedVariantId("");
    }
  };

  if (products.length === 0) {
    return (
      <Page
        title="Check an offer"
        backAction={{ content: "Home", onAction: () => navigate("/app") }}
      >
        <Card>
          <BlockStack gap="400">
            <Banner tone="warning" title="No active products found in store catalog">
              <p>
                PromoLint requires active products in your Shopify store to perform offer checks.
                Please add or publish products in your Shopify Admin catalog first.
              </p>
            </Banner>
            <Button onClick={() => navigate("/app")}>Return to home</Button>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const productOptions = products.map((p) => ({
    label: p.title,
    value: p.id,
  }));

  const triggerVariantOptions = (selectedTriggerProduct?.variants || []).map((v) => ({
    label: `${v.title} (${v.currencyCode} ${v.price.toFixed(2)})`,
    value: v.id,
  }));

  const offeredVariantOptions = (selectedOfferedProduct?.variants || []).map((v) => ({
    label: `${v.title} (${v.currencyCode} ${v.price.toFixed(2)})`,
    value: v.id,
  }));

  const locationOptions = locations.map((loc) => ({
    label: loc.name,
    value: loc.id,
  }));

  return (
    <Page
      title="Check an offer"
      subtitle="Configure your trigger condition, proposed offered item, and discount parameters."
      backAction={{ content: "Home", onAction: () => navigate("/app") }}
    >
      <Form method="post">
        <BlockStack gap="500">
          {actionData?.errors && (
            <Banner tone="critical" title="Please review input errors">
              <ul style={{ margin: 0, paddingLeft: "16px" }}>
                {Object.values(actionData.errors).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </Banner>
          )}

          <Layout>
            <Layout.Section>
              {/* Step 1: Trigger Product Selection */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    1. Scenario Trigger Item (Baseline Condition)
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    The baseline item in your proposed promotion scenario. PromoLint is an admin audit tool and does not publish offers, inject cart conditions, or enforce storefront rules.
                  </Text>

                  <Select
                    label="Trigger Product"
                    name="triggerProductId"
                    options={productOptions}
                    value={triggerProductId}
                    onChange={handleTriggerProductChange}
                    error={actionData?.errors?.triggerProductId}
                  />

                  {triggerVariantOptions.length > 0 && (
                    <Select
                      label="Trigger Variant"
                      name="triggerVariantId"
                      options={triggerVariantOptions}
                      value={triggerVariantId}
                      onChange={setTriggerVariantId}
                      error={actionData?.errors?.triggerVariantId}
                    />
                  )}

                  {selectedTriggerProduct && (
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <InlineStack gap="300" blockAlign="center">
                        {selectedTriggerProduct.imageUrl && (
                          <Thumbnail
                            source={selectedTriggerProduct.imageUrl}
                            alt={selectedTriggerProduct.title}
                            size="small"
                          />
                        )}
                        <BlockStack gap="050">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            {selectedTriggerProduct.title}
                          </Text>
                          {selectedTriggerVariant && (
                            <Text as="span" variant="bodySm" tone="subdued">
                              Variant: {selectedTriggerVariant.title} • Price: {selectedTriggerVariant.currencyCode} {selectedTriggerVariant.price.toFixed(2)}
                            </Text>
                          )}
                        </BlockStack>
                      </InlineStack>
                    </Box>
                  )}
                </BlockStack>
              </Card>

              {/* Step 2: Offered Product Selection */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    2. Offered Product (Proposed Incentive)
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    The product and variant evaluated as a proposed upsell, reward, or bundle incentive in this scenario.
                  </Text>

                  <Select
                    label="Offered Product"
                    name="offeredProductId"
                    options={productOptions}
                    value={offeredProductId}
                    onChange={handleOfferedProductChange}
                    error={actionData?.errors?.offeredProductId}
                  />

                  {offeredVariantOptions.length > 0 && (
                    <Select
                      label="Offered Variant"
                      name="offeredVariantId"
                      options={offeredVariantOptions}
                      value={offeredVariantId}
                      onChange={setOfferedVariantId}
                      error={actionData?.errors?.offeredVariantId}
                    />
                  )}

                  {selectedOfferedProduct && (
                    <BlockStack gap="300">
                      <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                        <InlineStack gap="300" blockAlign="center">
                          {(selectedOfferedVariant?.imageUrl || selectedOfferedProduct.imageUrl) && (
                            <Thumbnail
                              source={selectedOfferedVariant?.imageUrl || selectedOfferedProduct.imageUrl || ""}
                              alt={selectedOfferedProduct.title}
                              size="small"
                            />
                          )}
                          <BlockStack gap="050">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              {selectedOfferedProduct.title}
                            </Text>
                            {selectedOfferedVariant && (
                              <Text as="span" variant="bodySm" tone="subdued">
                                Variant: {selectedOfferedVariant.title} • Current Price: {selectedOfferedVariant.currencyCode} {selectedOfferedVariant.price.toFixed(2)}
                                {selectedOfferedVariant.unitCost !== null ? (
                                  ` • Unit Cost: ${selectedOfferedVariant.currencyCode} ${selectedOfferedVariant.unitCost.toFixed(2)}`
                                ) : (
                                  " • (Unit cost not set in Shopify)"
                                )}
                              </Text>
                            )}
                          </BlockStack>
                        </InlineStack>
                      </Box>

                      {/* First-Run Guidance for Missing Unit Cost */}
                      {selectedOfferedVariant && selectedOfferedVariant.unitCost === null && (
                        <Banner tone="warning" title="Missing Unit Cost in Shopify">
                          <p>
                            This variant has no unit cost configured in Shopify. Gross profit and margin cannot be estimated,
                            and this offer cannot produce a Ready status. To enable profit calculations, set <strong>Cost per item</strong> under
                            Products &gt; Variants in Shopify Admin.
                          </p>
                        </Banner>
                      )}

                      {/* Guidance for Untracked Inventory */}
                      {selectedOfferedVariant && selectedOfferedVariant.inventoryManagement !== "SHOPIFY" && (
                        <Banner tone="info" title="Untracked Inventory">
                          <p>
                            Inventory tracking is not enabled for this variant in Shopify. PromoLint will record this as an untracked
                            item and will not constrain stock counts at your selected location.
                          </p>
                        </Banner>
                      )}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              {/* Step 3: Proposed Discount & Location */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    3. Proposed Discount & Inventory Location
                  </Text>

                  <InlineStack gap="400" wrap={false}>
                    <Box minWidth="200px">
                      <Select
                        label="Discount Type"
                        name="discountType"
                        options={[
                          { label: "Percentage (%)", value: "PERCENTAGE" },
                          { label: "Fixed Amount ($)", value: "FIXED_AMOUNT" },
                        ]}
                        value={discountType}
                        onChange={(val) => setDiscountType(val as DiscountType)}
                      />
                    </Box>
                    <Box width="100%">
                      <TextField
                        label={discountType === "PERCENTAGE" ? "Discount Percentage (%)" : "Fixed Discount Amount"}
                        name="discountValue"
                        type="number"
                        value={discountValue}
                        onChange={setDiscountValue}
                        autoComplete="off"
                        helpText={
                          discountType === "PERCENTAGE"
                            ? "E.g. 20 for a 20% discount"
                            : "E.g. 10.00 for a $10.00 discount"
                        }
                        error={actionData?.errors?.discountValue}
                      />
                    </Box>
                  </InlineStack>

                  <Select
                    label="Inventory Location to Audit"
                    name="locationId"
                    options={locationOptions}
                    value={locationId}
                    onChange={setLocationId}
                    helpText="Point-in-time stock availability will be queried for this location upon running the check."
                    error={actionData?.errors?.locationId}
                  />

                  <Divider />

                  <InlineStack align="end" gap="300">
                    <Button onClick={() => navigate("/app")}>Cancel</Button>
                    <Button variant="primary" submit loading={isSubmitting}>
                      Run pre-launch check
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Assumptions & Guidance Sidebar */}
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    How PromoLint Works
                  </Text>
                  <Text as="p" variant="bodySm">
                    PromoLint performs an honest, multi-point pre-launch audit:
                  </Text>
                  <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "13px", lineHeight: "1.5" }}>
                    <li>Estimates unit gross profit & margin using live catalog prices and unit costs.</li>
                    <li>Audits point-in-time stock levels at your chosen location.</li>
                    <li>Checks active store discount combination permissions.</li>
                  </ul>
                  <Divider />
                  <Text as="h3" variant="headingSm">
                    Advisory Scope & Disclaimers
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    • <strong>Exclusions:</strong> Shipping fees, sales taxes, payment gateway processing fees (e.g. 2.9% + 30¢), packaging, and customer returns are excluded from gross profit calculations.
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    • <strong>Discount Findings:</strong> Discount findings inspect combination rules configured in Shopify. Shopper eligibility, cart items, and Shopify checkout logic determine actual final prices.
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    • <strong>No Storefront Changes:</strong> PromoLint is an admin audit tool and does not publish promotions, modify themes, or change checkout.
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </Form>
    </Page>
  );
}
