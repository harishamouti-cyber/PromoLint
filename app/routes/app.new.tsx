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
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  fetchProductsForOfferCheck,
  fetchStoreLocations,
  fetchInventoryAvailable,
  fetchActiveDiscounts,
} from "../services/shopify-catalog.server";
import { getShopSettings } from "../services/settings.server";
import { createOfferCheck, getOfferCheckById } from "../services/checks.server";
import {
  evaluateOfferCheck,
  calculateDiscountedPrice,
  calculateBreakEven,
  type DiscountType,
} from "../services/offer-analyzer";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const duplicateId = url.searchParams.get("duplicateId");

  const [products, locations, settings, duplicateCheck] = await Promise.all([
    fetchProductsForOfferCheck(admin, undefined, 50),
    fetchStoreLocations(admin, 20),
    getShopSettings(session.shop),
    duplicateId ? getOfferCheckById(session.shop, duplicateId) : Promise.resolve(null),
  ]);

  return json({
    products,
    locations,
    settings,
    duplicateCheck,
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
  const rawOfferQuantity = formData.get("offerQuantity") as string;
  const rawCustomCost = formData.get("customCostAssumption") as string;
  const locationId = formData.get("locationId") as string;
  const duplicatedFromId = formData.get("duplicatedFromId") as string;

  const errors: Record<string, string> = {};

  if (!triggerProductId) errors.triggerProductId = "Please select a trigger product.";
  if (!triggerVariantId) errors.triggerVariantId = "Please select a trigger variant.";
  if (!offeredProductId) errors.offeredProductId = "Please select an offered product.";
  if (!offeredVariantId) errors.offeredVariantId = "Please select an offered variant.";
  if (!locationId) errors.locationId = "Please select an inventory location.";

  const offerQuantity = parseInt(rawOfferQuantity, 10);
  if (isNaN(offerQuantity) || offerQuantity < 1) {
    errors.offerQuantity = "Offer quantity must be at least 1 unit.";
  }

  const discountValue = parseFloat(rawDiscountValue);
  if (isNaN(discountValue) || discountValue <= 0) {
    errors.discountValue = "Enter a valid positive discount amount or offer price.";
  } else if (discountType === "PERCENTAGE" && discountValue > 100) {
    errors.discountValue = "Percentage discount cannot exceed 100%.";
  }

  let customCostAssumption: number | null = null;
  if (rawCustomCost && rawCustomCost.trim().length > 0) {
    const parsedCost = parseFloat(rawCustomCost);
    if (isNaN(parsedCost) || parsedCost < 0) {
      errors.customCostAssumption = "Cost assumption must be a positive number.";
    } else {
      customCostAssumption = parsedCost;
    }
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
    customCostAssumption,
    offerQuantity,
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
    triggerVariantSku: triggerVariant.sku,
    offeredProductId: offeredProduct.id,
    offeredProductTitle: offeredProduct.title,
    offeredVariantId: offeredVariant.id,
    offeredVariantTitle: offeredVariant.title,
    offeredVariantSku: offeredVariant.sku,
    offeredProductImageUrl: offeredVariant.imageUrl || offeredProduct.imageUrl,
    offerQuantity,
    discountType,
    discountValue,
    currencyCode: offeredVariant.currencyCode,
    currentPrice: offeredVariant.price,
    locationId,
    locationName,
    evaluation,
    duplicatedFromId: duplicatedFromId || null,
  });

  return redirect(`/app/checks/${savedCheck.id}`);
};

export default function NewOfferCheckScreen() {
  const { products, locations, settings, duplicateCheck } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Filter / Search state for products
  const [productSearch, setProductSearch] = useState<string>("");

  // Form State (pre-populated if duplicating an earlier check)
  const initialTriggerProduct = duplicateCheck?.triggerProductId || products[0]?.id || "";
  const initialTriggerVariant = duplicateCheck?.triggerVariantId || products[0]?.variants[0]?.id || "";
  const initialOfferedProduct = duplicateCheck?.offeredProductId || products[1]?.id || products[0]?.id || "";
  const initialOfferedVariant = duplicateCheck?.offeredVariantId || (products[1] || products[0])?.variants[0]?.id || "";

  const [triggerProductId, setTriggerProductId] = useState<string>(initialTriggerProduct);
  const [triggerVariantId, setTriggerVariantId] = useState<string>(initialTriggerVariant);

  const [offeredProductId, setOfferedProductId] = useState<string>(initialOfferedProduct);
  const [offeredVariantId, setOfferedVariantId] = useState<string>(initialOfferedVariant);

  const [offerQuantity, setOfferQuantity] = useState<string>(
    duplicateCheck?.offerQuantity ? duplicateCheck.offerQuantity.toString() : "1"
  );
  const [discountType, setDiscountType] = useState<DiscountType>(
    (duplicateCheck?.discountType as DiscountType) || "PERCENTAGE"
  );
  const [discountValue, setDiscountValue] = useState<string>(
    duplicateCheck?.discountValue ? duplicateCheck.discountValue.toString() : "20"
  );
  const [customCostAssumption, setCustomCostAssumption] = useState<string>(
    duplicateCheck?.costSource?.includes("Merchant manual cost assumption") && duplicateCheck.unitCost !== null
      ? duplicateCheck.unitCost.toString()
      : ""
  );
  const [locationId, setLocationId] = useState<string>(
    duplicateCheck?.locationId ||
      (settings.defaultLocationId && locations.some((l) => l.id === settings.defaultLocationId)
        ? settings.defaultLocationId
        : locations[0]?.id || "")
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

  // Live Reactive Calculation Preview (Requirement 12 & 13)
  const previewData = useMemo(() => {
    if (!selectedOfferedVariant) return null;
    const currentPrice = selectedOfferedVariant.price;
    const parsedVal = parseFloat(discountValue) || 0;
    const parsedQty = Math.max(1, parseInt(offerQuantity, 10) || 1);
    const parsedCustomCost = customCostAssumption ? parseFloat(customCostAssumption) : null;

    const effectiveCost =
      selectedOfferedVariant.unitCost !== null
        ? selectedOfferedVariant.unitCost
        : parsedCustomCost !== null && !isNaN(parsedCustomCost)
        ? parsedCustomCost
        : null;

    const unitSellingPrice = calculateDiscountedPrice(currentPrice, discountType, parsedVal);
    const totalRevenue = unitSellingPrice * parsedQty;
    const breakEven = calculateBreakEven(currentPrice, effectiveCost, settings.minMarginThreshold);

    const unitGrossProfit = effectiveCost !== null ? unitSellingPrice - effectiveCost : null;
    const grossMargin =
      unitGrossProfit !== null && unitSellingPrice > 0
        ? (unitGrossProfit / unitSellingPrice) * 100
        : null;

    return {
      currentPrice,
      unitSellingPrice,
      totalRevenue,
      effectiveCost,
      unitGrossProfit,
      grossMargin,
      breakEven,
      quantity: parsedQty,
    };
  }, [selectedOfferedVariant, discountType, discountValue, offerQuantity, customCostAssumption, settings.minMarginThreshold]);

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

  // Filtered product options for fast selection (Requirement 16)
  const filteredProducts = products.filter((p) => {
    if (!productSearch.trim()) return true;
    const q = productSearch.toLowerCase().trim();
    const titleMatch = p.title.toLowerCase().includes(q);
    const skuMatch = p.variants.some((v) => v.sku && v.sku.toLowerCase().includes(q));
    return titleMatch || skuMatch;
  });

  const productOptions = (filteredProducts.length > 0 ? filteredProducts : products).map((p) => ({
    label: p.title,
    value: p.id,
  }));

  const triggerVariantOptions = (selectedTriggerProduct?.variants || []).map((v) => ({
    label: `${v.title}${v.sku ? ` (SKU: ${v.sku})` : ""} — ${v.currencyCode} ${v.price.toFixed(2)}`,
    value: v.id,
  }));

  const offeredVariantOptions = (selectedOfferedProduct?.variants || []).map((v) => ({
    label: `${v.title}${v.sku ? ` (SKU: ${v.sku})` : ""} — ${v.currencyCode} ${v.price.toFixed(2)}`,
    value: v.id,
  }));

  const locationOptions = locations.map((loc) => ({
    label: loc.name,
    value: loc.id,
  }));

  return (
    <Page
      title="Check an offer"
      subtitle="Configure your trigger condition, proposed offered item, discount parameters, and bundle quantity."
      backAction={{ content: "Home", onAction: () => navigate("/app") }}
    >
      <Form method="post">
        {duplicateCheck && (
          <input type="hidden" name="duplicatedFromId" value={duplicateCheck.id} />
        )}

        <BlockStack gap="500">
          {duplicateCheck && (
            <Banner tone="info" title="Duplicating Previous Offer Check">
              <p>
                Form parameters pre-filled from check recorded on{" "}
                <strong>
                  {new Date(duplicateCheck.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </strong>
                . Adjust the proposed discount, quantity, or scenario parameters below. Running the check will save a separate, independent audit record.
              </p>
            </Banner>
          )}

          {actionData?.errors && (
            <Banner tone="critical" title="Please review input errors">
              <ul style={{ margin: 0, paddingLeft: "16px" }}>
                {Object.values(actionData.errors).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </Banner>
          )}

          {/* Product Quick Search Filter (Requirement 16) */}
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Catalog Search & Quick Filter
              </Text>
              <TextField
                label="Search catalog products or SKUs"
                value={productSearch}
                onChange={setProductSearch}
                placeholder="Filter by product title or variant SKU..."
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setProductSearch("")}
                helpText="Filters the dropdown menus below in real time. Items are bound strictly by stable Shopify IDs."
              />
            </BlockStack>
          </Card>

          <Layout>
            <Layout.Section>
              {/* Step 1: Trigger Product Selection */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    1. Scenario Input: Trigger Product (Baseline Condition)
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    The baseline product in your proposed offer scenario. PromoLint audits a proposed scenario; it does not enforce cart conditions, publish promotions, or create an upsell on your storefront.
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
                              {selectedTriggerVariant.sku ? ` • SKU: ${selectedTriggerVariant.sku}` : " • (No SKU)"}
                            </Text>
                          )}
                          <Text as="span" variant="bodyXs" tone="subdued">
                            Shopify GID: <code>{selectedTriggerVariant?.id || selectedTriggerProduct.id}</code>
                          </Text>
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
                    2. Scenario Input: Offered Product (Proposed Incentive)
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
                                {selectedOfferedVariant.sku ? ` • SKU: ${selectedOfferedVariant.sku}` : " • (No SKU)"}
                                {selectedOfferedVariant.unitCost !== null ? (
                                  ` • Shopify Unit Cost: ${selectedOfferedVariant.currencyCode} ${selectedOfferedVariant.unitCost.toFixed(2)}`
                                ) : (
                                  " • (Unit cost not set in Shopify)"
                                )}
                              </Text>
                            )}
                            <Text as="span" variant="bodyXs" tone="subdued">
                              Shopify GID: <code>{selectedOfferedVariant?.id || selectedOfferedProduct.id}</code>
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      </Box>

                      {/* Missing Unit Cost & Optional Manual Assumption (Requirements 15 & 23) */}
                      {selectedOfferedVariant && selectedOfferedVariant.unitCost === null && (
                        <Card background="bg-surface-secondary">
                          <BlockStack gap="300">
                            <Banner tone="warning" title="Missing Unit Cost in Shopify">
                              <p>
                                This variant has no unit cost in Shopify. Profit cannot be estimated unless a cost is recorded.
                                Follow these steps in Shopify Admin to add a cost:
                              </p>
                              <ol style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                                <li>Open <strong>Shopify Admin &gt; Products</strong> and click <strong>{selectedOfferedProduct.title}</strong>.</li>
                                <li>Under <strong>Variants</strong>, click <strong>{selectedOfferedVariant.title}</strong>.</li>
                                <li>Under <strong>Pricing</strong>, enter your cost in <strong>Cost per item</strong>.</li>
                                <li>Click <strong>Save</strong> in Shopify Admin.</li>
                              </ol>
                              <p style={{ marginTop: "8px" }}>
                                Alternatively, you can enter an optional <strong>manual cost assumption</strong> below to test this promotion scenario now without altering Shopify's catalog data.
                              </p>
                            </Banner>
                            <TextField
                              label="Optional Merchant Cost Assumption (Per Unit)"
                              name="customCostAssumption"
                              type="number"
                              value={customCostAssumption}
                              onChange={setCustomCostAssumption}
                              autoComplete="off"
                              placeholder="e.g. 12.50"
                              helpText="If entered, PromoLint will use this assumption to estimate gross margin for this check. The audit snapshot will clearly label this as a manual assumption and will never overwrite Shopify's data."
                              error={actionData?.errors?.customCostAssumption}
                            />
                          </BlockStack>
                        </Card>
                      )}

                      {/* Guidance for Untracked Inventory (Requirement 23) */}
                      {selectedOfferedVariant && selectedOfferedVariant.inventoryManagement !== "SHOPIFY" && (
                        <Banner tone="info" title="Inventory Tracking Disabled in Shopify">
                          <p>
                            Inventory tracking is disabled for this variant in Shopify. PromoLint records this as untracked.
                            Untracked inventory does not mean unlimited stock; physical availability cannot be monitored or verified at your selected location.
                          </p>
                          <p style={{ marginTop: "6px" }}>
                            <strong>To enable inventory tracking:</strong>
                          </p>
                          <ol style={{ margin: "4px 0 0 0", paddingLeft: "20px" }}>
                            <li>Open <strong>Shopify Admin &gt; Products</strong> and select <strong>{selectedOfferedProduct.title}</strong>.</li>
                            <li>Under <strong>Variants</strong>, click <strong>{selectedOfferedVariant.title}</strong>.</li>
                            <li>Under <strong>Inventory</strong>, check <strong>Track quantity</strong>.</li>
                            <li>Assign on-hand stock quantities to your fulfillment locations and click <strong>Save</strong>.</li>
                          </ol>
                        </Banner>
                      )}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              {/* Step 3: Proposed Discount, Quantity & Location (Requirements 11 & 12) */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    3. Proposed Discount, Offer Quantity & Location
                  </Text>

                  <InlineStack gap="400" wrap={true}>
                    <Box minWidth="220px">
                      <Select
                        label="Discount Scenario Type"
                        name="discountType"
                        options={[
                          { label: "Percentage Off (%)", value: "PERCENTAGE" },
                          { label: "Fixed Amount Off ($)", value: "FIXED_AMOUNT" },
                          { label: "Fixed Offer Price ($)", value: "FIXED_PRICE" },
                        ]}
                        value={discountType}
                        onChange={(val) => setDiscountType(val as DiscountType)}
                      />
                    </Box>

                    <Box minWidth="180px">
                      <TextField
                        label={
                          discountType === "PERCENTAGE"
                            ? "Discount Percentage (%)"
                            : discountType === "FIXED_AMOUNT"
                            ? "Fixed Amount Off ($)"
                            : "Fixed Offer Price ($)"
                        }
                        name="discountValue"
                        type="number"
                        value={discountValue}
                        onChange={setDiscountValue}
                        autoComplete="off"
                        helpText={
                          discountType === "PERCENTAGE"
                            ? "E.g. 20 for 20% off"
                            : discountType === "FIXED_AMOUNT"
                            ? "E.g. 5.00 for $5.00 off"
                            : "E.g. 15.00 for a $15.00 offer price"
                        }
                        error={actionData?.errors?.discountValue}
                      />
                    </Box>

                    <Box minWidth="150px">
                      <TextField
                        label="Offer Quantity (Bundle units)"
                        name="offerQuantity"
                        type="number"
                        value={offerQuantity}
                        onChange={setOfferQuantity}
                        autoComplete="off"
                        helpText="Units offered per purchase (e.g. 1 for single, 2+ for bundle)"
                        error={actionData?.errors?.offerQuantity}
                      />
                    </Box>
                  </InlineStack>

                  <Select
                    label="Inventory Location to Audit"
                    name="locationId"
                    options={locationOptions}
                    value={locationId}
                    onChange={setLocationId}
                    helpText="Point-in-time stock availability will be audited strictly for this selected location. Stock at other fulfillment locations is not included."
                    error={actionData?.errors?.locationId}
                  />

                  {/* Live Reactive Pricing & Break-Even Preview (Requirements 12 & 13) */}
                  {previewData && (
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="h3" variant="headingSm">
                            Pre-Audit Calculation Preview
                          </Text>
                          <Badge tone="info">Live Preview</Badge>
                        </InlineStack>
                        <Divider />
                        <InlineStack gap="600" wrap={true}>
                          <Box minWidth="140px">
                            <Text as="span" variant="bodyXs" tone="subdued">Catalog Price</Text>
                            <br />
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              ${previewData.currentPrice.toFixed(2)}
                            </Text>
                          </Box>
                          <Box minWidth="160px">
                            <Text as="span" variant="bodyXs" tone="subdued">Estimated Selling Price</Text>
                            <br />
                            <Text as="span" variant="bodyMd" fontWeight="bold">
                              ${previewData.unitSellingPrice.toFixed(2)} / unit
                            </Text>
                          </Box>
                          {previewData.quantity > 1 && (
                            <Box minWidth="160px">
                              <Text as="span" variant="bodyXs" tone="subdued">Bundle Revenue ({previewData.quantity} units)</Text>
                              <br />
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                ${previewData.totalRevenue.toFixed(2)} total
                              </Text>
                            </Box>
                          )}
                          <Box minWidth="180px">
                            <Text as="span" variant="bodyXs" tone="subdued">
                              Break-Even Min. Price (Target {settings.minMarginThreshold}%)
                            </Text>
                            <br />
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              {previewData.breakEven.targetMarginPrice !== null
                                ? `$${previewData.breakEven.targetMarginPrice.toFixed(2)} (Max discount: $${previewData.breakEven.maxDiscountAmount?.toFixed(2)})`
                                : "Requires unit cost"}
                            </Text>
                          </Box>
                        </InlineStack>
                      </BlockStack>
                    </Box>
                  )}

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
                    Advisory Threshold Preferences
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Store preference thresholds: Minimum margin: <strong>{settings.minMarginThreshold}%</strong>, Minimum stock: <strong>{settings.minStockThreshold} units</strong>.
                    These are internal merchant preferences used solely for audit linting, not Shopify platform limits or revenue guarantees.
                  </Text>

                  <Divider />

                  <Text as="h3" variant="headingSm">
                    Multi-Unit & Bundle Audits
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Setting quantity &gt; 1 simulates a bundle offer. PromoLint audits total revenue, total unit cost, and checks whether available location inventory can fulfill the bundle size.
                  </Text>

                  <Divider />

                  <Text as="h3" variant="headingSm">
                    Explicit Exclusions
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Gross profit estimates explicitly exclude shipping, sales taxes, payment gateway processing fees (e.g. 2.9% + 30¢), packaging, and customer returns.
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
