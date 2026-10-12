import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useNavigation, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  Banner,
  BlockStack,
  InlineStack,
  Box,
  Divider,
  Button,
  Thumbnail,
  List,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getOfferCheckById, deleteOfferCheck, recheckExistingOfferCheck } from "../services/checks.server";
import type { OfferWarning } from "../services/offer-analyzer";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const checkId = params.id;

  if (!checkId) {
    throw new Response("Missing check ID", { status: 400 });
  }

  const check = await getOfferCheckById(session.shop, checkId);

  if (!check) {
    throw new Response("Offer check not found", { status: 404 });
  }

  let warnings: OfferWarning[] = [];
  try {
    warnings = JSON.parse(check.warnings);
  } catch {
    warnings = [];
  }

  return json({
    check,
    warnings,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const checkId = params.id;

  if (!checkId) {
    throw new Response("Missing check ID", { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    await deleteOfferCheck(session.shop, checkId);
    return redirect("/app/checks");
  }

  if (intent === "recheck") {
    const newCheck = await recheckExistingOfferCheck(admin, session.shop, checkId);
    return redirect(`/app/checks/${newCheck.id}`);
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

export default function CheckResultDetailScreen() {
  const { check, warnings } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isDeleting = navigation.formData?.get("intent") === "delete";
  const isRechecking = navigation.formData?.get("intent") === "recheck";

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "READY":
        return <Badge tone="success" size="large">Ready</Badge>;
      case "REVIEW":
        return <Badge tone="warning" size="large">Review</Badge>;
      case "BLOCKED":
        return <Badge tone="critical" size="large">Blocked</Badge>;
      default:
        return <Badge size="large">{status}</Badge>;
    }
  };

  const renderInventoryStateBadge = (
    state: string | null | undefined,
    quantity: number | null,
    isTracked: boolean
  ) => {
    switch (state) {
      case "UNTRACKED":
        return <Badge tone="info">Untracked in Shopify</Badge>;
      case "MISSING_RECORD":
        return <Badge tone="warning">No record at location</Badge>;
      case "UNAVAILABLE":
        return <Badge tone="warning">Data unavailable</Badge>;
      case "ZERO_STOCK":
        return <Badge tone="critical">{quantity !== null && quantity < 0 ? `${quantity} units (Oversold)` : "0 units (Out of stock)"}</Badge>;
      case "LOW_STOCK":
        return <Badge tone="warning">{`${quantity} units (Low stock)`}</Badge>;
      case "HEALTHY":
        return <Badge tone="success">{`${quantity} units (Available)`}</Badge>;
      default:
        if (!isTracked) return <Badge tone="info">Untracked in Shopify</Badge>;
        if (quantity === 0) return <Badge tone="critical">0 units (Out of stock)</Badge>;
        return <Badge>{quantity !== null ? `${quantity} units` : "Unavailable"}</Badge>;
    }
  };

  const getStatusBanner = () => {
    if (check.status === "BLOCKED") {
      return (
        <Banner tone="critical" title="Offer Blocked — Critical Issues Detected">
          <p>
            Critical blockers were identified (such as selling below unit cost, out-of-stock inventory, or price-exceeding discounts).
            We recommend revising promotion parameters or restocking before launching.
          </p>
        </Banner>
      );
    }
    if (check.status === "REVIEW") {
      return (
        <Banner tone="warning" title="Offer Needs Review — Caution Advised">
          <p>
            Potential risks require merchant attention (e.g. missing unit cost preventing profit estimation, stock below your configured threshold,
            or active store discounts with combination permissions enabled).
          </p>
        </Banner>
      );
    }
    return (
      <Banner tone="success" title="Offer Ready — Pre-Flight Passed">
        <p>
          All automated checks passed with positive estimated gross margin, verified inventory at the selected
          location, and no immediate configuration blockers.
        </p>
      </Banner>
    );
  };

  return (
    <Page
      title="Offer Check Result"
      subtitle={`Point-in-time snapshot captured on ${new Date(check.createdAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })}`}
      backAction={{ content: "Offer checks", onAction: () => navigate("/app/checks") }}
      secondaryActions={[
        {
          content: "Run new check",
          onAction: () => navigate("/app/new"),
        },
      ]}
    >
      <BlockStack gap="500">
        {getStatusBanner()}

        {/* First-Run Guidance for Missing Unit Cost */}
        {check.unitCost === null && (
          <Banner tone="warning" title="Missing Unit Cost Guidance">
            <p>
              Shopify has no unit cost recorded for this variant. Because PromoLint adheres to zero-mock calculations,
              gross profit and margin cannot be fabricated. To unlock profit estimates on future checks:
            </p>
            <ol style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
              <li>Open <strong>Shopify Admin &gt; Products</strong> and select this product.</li>
              <li>Scroll to <strong>Variants</strong> and click the variant.</li>
              <li>Enter a value in <strong>Cost per item</strong> and save.</li>
              <li>Click <strong>Re-check with live data</strong> below to generate an updated audit snapshot.</li>
            </ol>
          </Banner>
        )}

        <Layout>
          {/* Main Column */}
          <Layout.Section>
            {/* Key Metrics Summary Cards */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Estimated Unit Financials & Stock Status
                  </Text>
                  {renderStatusBadge(check.status)}
                </InlineStack>

                <Divider />

                <InlineStack gap="600" wrap={true}>
                  <Box minWidth="150px">
                    <BlockStack gap="100">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Selling Price (Post-Discount)
                      </Text>
                      <Text as="span" variant="headingLg">
                        {check.currencyCode} {check.discountedPrice.toFixed(2)}
                      </Text>
                      <Text as="span" variant="bodyXs" tone="subdued">
                        Original: {check.currencyCode} {check.currentPrice.toFixed(2)}
                      </Text>
                    </BlockStack>
                  </Box>

                  <Box minWidth="150px">
                    <BlockStack gap="100">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Estimated Gross Profit
                      </Text>
                      {check.estimatedGrossProfit !== null ? (
                        <Text
                          as="span"
                          variant="headingLg"
                          tone={check.estimatedGrossProfit < 0 ? "critical" : "success"}
                        >
                          {check.currencyCode} {check.estimatedGrossProfit.toFixed(2)}
                        </Text>
                      ) : (
                        <Text as="span" variant="bodyMd" tone="caution">
                          Cost not set
                        </Text>
                      )}
                      <Text as="span" variant="bodyXs" tone="subdued">
                        Unit Cost: {check.unitCost !== null ? `${check.currencyCode} ${check.unitCost.toFixed(2)}` : "Missing in Shopify"}
                      </Text>
                    </BlockStack>
                  </Box>

                  <Box minWidth="150px">
                    <BlockStack gap="100">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Estimated Gross Margin
                      </Text>
                      {check.estimatedGrossMargin !== null ? (
                        <Text
                          as="span"
                          variant="headingLg"
                          tone={check.estimatedGrossMargin < 20 ? "caution" : undefined}
                        >
                          {check.estimatedGrossMargin.toFixed(1)}%
                        </Text>
                      ) : (
                        <Text as="span" variant="bodyMd" tone="subdued">
                          N/A
                        </Text>
                      )}
                      <Text as="span" variant="bodyXs" tone="subdued">
                        Gross profit / selling price
                      </Text>
                    </BlockStack>
                  </Box>

                  <Box minWidth="150px">
                    <BlockStack gap="100">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Inventory Observed
                      </Text>
                      {renderInventoryStateBadge(check.inventoryState, check.inventoryQuantity, check.inventoryTracked)}
                      <Text as="span" variant="bodyXs" tone="subdued">
                        Location: {check.locationName}
                      </Text>
                    </BlockStack>
                  </Box>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Comprehensive Parameters Breakdown (Priority 4) */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Audit Snapshot Parameters & Retrieved Values
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  The exact values queried from Shopify Admin at the check timestamp ({new Date(check.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}):
                </Text>

                <Divider />

                <InlineStack gap="600" wrap={true}>
                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Catalog Variant Price</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{check.currencyCode} {check.currentPrice.toFixed(2)}</Text>
                    </BlockStack>
                  </Box>
                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Proposed Discount</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {check.discountType === "PERCENTAGE" ? `${check.discountValue}% off` : `${check.currencyCode} ${check.discountValue.toFixed(2)} off`}
                      </Text>
                    </BlockStack>
                  </Box>
                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Selling Price After Discount</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{check.currencyCode} {check.discountedPrice.toFixed(2)}</Text>
                    </BlockStack>
                  </Box>
                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Shopify Unit Cost</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {check.unitCost !== null ? `${check.currencyCode} ${check.unitCost.toFixed(2)}` : "Missing in Shopify"}
                      </Text>
                    </BlockStack>
                  </Box>
                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Gross Profit Estimate</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {check.estimatedGrossProfit !== null ? `${check.currencyCode} ${check.estimatedGrossProfit.toFixed(2)}` : "Cannot calculate"}
                      </Text>
                    </BlockStack>
                  </Box>
                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Gross Margin Estimate</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {check.estimatedGrossMargin !== null ? `${check.estimatedGrossMargin.toFixed(1)}%` : "N/A"}
                      </Text>
                    </BlockStack>
                  </Box>
                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Audited Location</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{check.locationName}</Text>
                    </BlockStack>
                  </Box>
                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Inventory State at Location</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {check.inventoryTracked
                          ? check.inventoryQuantity !== null
                            ? `${check.inventoryQuantity} units observed`
                            : "Unavailable"
                          : "Untracked in Shopify"}
                      </Text>
                    </BlockStack>
                  </Box>
                </InlineStack>

                <Divider />

                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    Explicit Exclusions from Gross Profit
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    This estimate strictly measures <code>discounted price − unit cost</code>. The following expenses are explicitly excluded:
                    customer shipping fees, sales taxes and duties, payment processor fees (e.g. 2.9% + 30¢), packaging materials, warehouse handling, and customer refund allowances.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Audit Findings & Warnings */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Audit Findings & Warnings ({warnings.length})
                </Text>

                {warnings.length === 0 ? (
                  <Text as="p" variant="bodyMd" tone="success">
                    ✓ No warnings or conflicts identified during this pre-flight check.
                  </Text>
                ) : (
                  <List type="bullet">
                    {warnings.map((w, idx) => (
                      <List.Item key={idx}>
                        <InlineStack gap="200" blockAlign="start">
                          <Badge
                            tone={
                              w.severity === "BLOCKER"
                                ? "critical"
                                : w.severity === "WARNING"
                                ? "warning"
                                : "info"
                            }
                          >
                            {w.severity}
                          </Badge>
                          <Text as="span" variant="bodyMd">
                            {w.message}
                          </Text>
                        </InlineStack>
                      </List.Item>
                    ))}
                  </List>
                )}
              </BlockStack>
            </Card>

            {/* Offer Configuration Breakdown */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Offer Configuration
                </Text>
                <Divider />

                {/* Scenario Trigger Product */}
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm" tone="subdued">
                    Scenario Trigger Item (Baseline Condition)
                  </Text>
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    {check.triggerProductTitle}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Variant: {check.triggerVariantTitle} • Shopify ID: <code>{check.triggerVariantId}</code>
                  </Text>
                </BlockStack>

                <Divider />

                {/* Offered Product */}
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm" tone="subdued">
                    Offered Incentive Item & Discount
                  </Text>
                  <InlineStack gap="300" blockAlign="center">
                    {check.offeredProductImageUrl && (
                      <Thumbnail
                        source={check.offeredProductImageUrl}
                        alt={check.offeredProductTitle}
                        size="small"
                      />
                    )}
                    <BlockStack gap="050">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {check.offeredProductTitle}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        Variant: {check.offeredVariantTitle} • Shopify ID: <code>{check.offeredVariantId}</code>
                      </Text>
                      <Text as="span" variant="bodySm">
                        Proposed Discount:{" "}
                        <strong>
                          {check.discountType === "PERCENTAGE"
                            ? `${check.discountValue}%`
                            : `${check.currencyCode} ${check.discountValue.toFixed(2)}`}
                        </strong>
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Sidebar */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Actions
                </Text>
                <Form method="post">
                  <input type="hidden" name="intent" value="recheck" />
                  <Button
                    variant="primary"
                    submit
                    loading={isRechecking}
                    helpText="Queries current catalog prices, unit costs, stock, and discounts to create a new time-stamped result snapshot."
                  >
                    Re-check with live data
                  </Button>
                </Form>
                <Button onClick={() => navigate("/app/new")}>
                  Run another check
                </Button>
                <Form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <Button
                    tone="critical"
                    submit
                    loading={isDeleting}
                    onClick={(e) => {
                      if (!confirm("Are you sure you want to delete this saved check?")) {
                        e.preventDefault();
                      }
                    }}
                  >
                    Delete check
                  </Button>
                </Form>

                <Divider />

                <Text as="h3" variant="headingSm">
                  Snapshot Integrity
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  This report is a permanent point-in-time snapshot. Re-checking queries live Shopify data and generates
                  a new audit record rather than overwriting historical evidence.
                </Text>

                <Divider />

                <Text as="h3" variant="headingSm">
                  Assumptions & Scope
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {check.assumptions}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
