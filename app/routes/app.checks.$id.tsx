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
import { type OfferWarning, getStructuredFindingDetails } from "../services/offer-analyzer";
import { checkSubscriptionStatus } from "../services/billing.server";

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
  const { admin, session, billing } = await authenticate.admin(request);
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
    const billingStatus = await checkSubscriptionStatus(billing, session.shop);
    if (!billingStatus.hasActivePro && billingStatus.freeChecksUsed >= billingStatus.freeCheckLimit) {
      return json({
        error: `You have reached the Free Tier limit of ${billingStatus.freeCheckLimit} audits. Upgrade to PromoLint Pro ($19.99/mo) for unlimited audits.`
      }, { status: 403 });
    }
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

  const isManualCost = check.costSource?.includes("Merchant manual cost assumption");

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

  const renderFindingLevelBadge = (w: OfferWarning) => {
    const level = w.findingLevel || (
      w.severity === "BLOCKER" ? "Warning" :
      w.severity === "WARNING" ? "Review" : "Good to know"
    );

    switch (level) {
      case "Warning":
        return <Badge tone="critical">Warning</Badge>;
      case "Review":
        return <Badge tone="warning">Review</Badge>;
      case "Unable to verify":
        return <Badge tone="attention">Unable to verify</Badge>;
      case "Good to know":
      default:
        return <Badge tone="info">Good to know</Badge>;
    }
  };

  const renderInventoryStateBadge = (
    state: string | null | undefined,
    quantity: number | null,
    isTracked: boolean
  ) => {
    switch (state) {
      case "NOT_TRACKED":
      case "UNTRACKED":
        return <Badge tone="info">Inventory not tracked</Badge>;
      case "UNABLE_TO_VERIFY":
      case "MISSING_RECORD":
      case "UNAVAILABLE":
        return <Badge tone="warning">Unable to verify</Badge>;
      case "OUT_OF_STOCK":
      case "ZERO_STOCK":
        return (
          <Badge tone="critical">
            {quantity !== null && quantity < 0 ? `Out of stock (${quantity} units oversold)` : "Out of stock (0 units)"}
          </Badge>
        );
      case "LOW_STOCK":
        return <Badge tone="warning">{`Low stock (${quantity} units)`}</Badge>;
      case "IN_STOCK":
      case "HEALTHY":
        return <Badge tone="success">{`In stock (${quantity} units)`}</Badge>;
      default:
        if (!isTracked) return <Badge tone="info">Inventory not tracked</Badge>;
        if (quantity === 0) return <Badge tone="critical">Out of stock (0 units)</Badge>;
        return <Badge>{quantity !== null ? `${quantity} units` : "Unable to verify"}</Badge>;
    }
  };

  const getStatusBanner = () => {
    if (check.status === "BLOCKED") {
      return (
        <Banner tone="critical" title="Offer Blocked — Critical Issues Detected">
          <p>
            Critical blockers were identified (such as selling below unit cost, out-of-stock inventory, or discounts exceeding product price).
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
            unverified data, or active store discounts with combination permissions enabled).
          </p>
        </Banner>
      );
    }
    return (
      <Banner tone="success" title="Pre-Launch Checks Passed (Ready for Review)">
        <p>
          Automated pre-flight checks passed based on available catalog data, positive estimated gross margin, and verified inventory at the selected location.
          <strong> Note:</strong> A Ready status reflects automated pre-launch linting against store settings; it does not guarantee customer sales, final checkout price, or net business profitability.
        </p>
      </Banner>
    );
  };

  return (
    <Page
      fullWidth
      title="Offer Check Result"
      subtitle={`Point-in-time snapshot captured on ${new Date(check.createdAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })}`}
      backAction={{ content: "Offer checks", onAction: () => navigate("/app/checks") }}
      secondaryActions={[
        {
          content: "Print summary",
          accessibilityLabel: "Print this offer audit summary or save as PDF",
          onAction: () => window.print(),
        },
        {
          content: "Duplicate check",
          onAction: () => navigate(`/app/new?duplicateId=${check.id}`),
        },
        {
          content: "Run new check",
          onAction: () => navigate("/app/new"),
        },
      ]}
    >
      <BlockStack gap="500">
        <style>{`
          @media print {
            header[class*="Page-Header"],
            .Polaris-Header-Title__TitleAndSubtitleWrapper button,
            button[type="submit"],
            .no-print {
              display: none !important;
            }
            .print-only-header {
              display: block !important;
              margin-bottom: 20px;
              border-bottom: 2px solid #333;
              padding-bottom: 12px;
            }
            body {
              background: #fff !important;
              color: #000 !important;
            }
          }
          @media screen {
            .print-only-header {
              display: none !important;
            }
          }
        `}</style>

        {/* Print-Only Header for PDF & Paper exports */}
        <div className="print-only-header">
          <Text as="h1" variant="headingXl">
            PromoLint Offer Audit Report
          </Text>
          <Text as="p" variant="bodyMd">
            Audit Snapshot ID: {check.id} | Store: {check.shop} | Captured: {new Date(check.createdAt).toLocaleString()}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Status: {check.status} | Scenario: {check.triggerProductTitle} ({check.triggerVariantTitle}) + {check.offeredProductTitle} ({check.offeredVariantTitle})
          </Text>
        </div>

        {getStatusBanner()}

        {/* Contextual Guidance for Missing Unit Cost (Requirement 23) */}
        {check.unitCost === null && (
          <Banner tone="warning" title="Profit Can’t Be Estimated (Missing Unit Cost)">
            <p>
              Shopify has no unit cost recorded for this variant. Because PromoLint adheres to zero-mock calculations,
              gross profit and margin cannot be fabricated. To unlock profit estimates:
            </p>
            <ol style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
              <li>Open <strong>Shopify Admin &gt; Products</strong> and select this product.</li>
              <li>Scroll to <strong>Variants</strong> and click the variant.</li>
              <li>Enter a value in <strong>Cost per item</strong> under Pricing and click Save.</li>
              <li>Click <strong>Recheck current data</strong> below to generate an updated audit snapshot.</li>
            </ol>
          </Banner>
        )}

        {/* Contextual Guidance for Untracked Inventory (Requirement 23) */}
        {check.inventoryTracked === false && (
          <Banner tone="info" title="Inventory Tracking Disabled in Shopify">
            <p>
              Inventory tracking is disabled for this variant in Shopify. PromoLint classifies this as untracked and does not assume unlimited physical stock.
              To monitor inventory counts:
            </p>
            <ol style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
              <li>Open <strong>Shopify Admin &gt; Products</strong> and click on this product.</li>
              <li>Under <strong>Variants</strong>, click the variant.</li>
              <li>Under <strong>Inventory</strong>, check <strong>Track quantity</strong>.</li>
              <li>Assign stock counts to your fulfillment locations and click <strong>Save</strong>.</li>
              <li>Click <strong>Recheck current data</strong> below to capture fresh inventory numbers.</li>
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
                          Profit can’t be estimated
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
                        <Text as="span" variant="bodyMd" tone="caution">
                          Margin can’t be estimated
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

                {/* Multi-Unit Scenario Totals (Requirement 11) */}
                {check.offerQuantity && check.offerQuantity > 1 && (
                  <>
                    <Divider />
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="h3" variant="headingSm">
                            Multi-Unit Bundle Totals ({check.offerQuantity} units offered)
                          </Text>
                          <Badge tone="info">Bundle Scenario</Badge>
                        </InlineStack>
                        <InlineStack gap="600" wrap={true}>
                          <Box minWidth="140px">
                            <Text as="span" variant="bodyXs" tone="subdued">Total Bundle Revenue</Text>
                            <br />
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              {check.currencyCode} {check.totalRevenue?.toFixed(2) || (check.discountedPrice * check.offerQuantity).toFixed(2)}
                            </Text>
                          </Box>
                          <Box minWidth="140px">
                            <Text as="span" variant="bodyXs" tone="subdued">Total Bundle Cost</Text>
                            <br />
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              {check.totalCost !== null && check.totalCost !== undefined
                                ? `${check.currencyCode} ${check.totalCost.toFixed(2)}`
                                : "Requires unit cost"}
                            </Text>
                          </Box>
                          <Box minWidth="160px">
                            <Text as="span" variant="bodyXs" tone="subdued">Total Bundle Gross Profit</Text>
                            <br />
                            <Text as="span" variant="bodyMd" fontWeight="bold">
                              {check.totalGrossProfit !== null && check.totalGrossProfit !== undefined
                                ? `${check.currencyCode} ${check.totalGrossProfit.toFixed(2)}`
                                : "Profit can’t be estimated"}
                            </Text>
                          </Box>
                        </InlineStack>
                      </BlockStack>
                    </Box>
                  </>
                )}
              </BlockStack>
            </Card>

            {/* Break-Even & Target Margin View (Requirement 13) */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Break-Even & Maximum Discount Benchmark
                  </Text>
                  <Badge tone="info">Advisory Benchmark</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Theoretical pricing thresholds based on recorded unit cost. Helps identify how steep a discount can be before eroding profit margins:
                </Text>
                <Divider />

                <InlineStack gap="600" wrap={true}>
                  <Box minWidth="180px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">0% Profit Price (Unit Cost)</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {check.unitCost !== null
                          ? `${check.currencyCode} ${check.unitCost.toFixed(2)}`
                          : "Requires unit cost"}
                      </Text>
                      <Text as="span" variant="bodyXs" tone="subdued">Selling below this causes direct loss</Text>
                    </BlockStack>
                  </Box>

                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Target Margin Min. Selling Price</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {check.breakEvenPrice !== null && check.breakEvenPrice !== undefined
                          ? `${check.currencyCode} ${check.breakEvenPrice.toFixed(2)}`
                          : "Requires unit cost"}
                      </Text>
                      <Text as="span" variant="bodyXs" tone="subdued">Price needed to maintain advisory target margin</Text>
                    </BlockStack>
                  </Box>

                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Max Allowable Discount</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {check.maxDiscountAmount !== null && check.maxDiscountAmount !== undefined
                          ? `${check.currencyCode} ${check.maxDiscountAmount.toFixed(2)}`
                          : "Requires unit cost"}
                      </Text>
                      <Text as="span" variant="bodyXs" tone="subdued">From catalog price without breaching margin threshold</Text>
                    </BlockStack>
                  </Box>
                </InlineStack>

                <Divider />
                <Text as="p" variant="bodyXs" tone="subdued">
                  Assumptions: Break-even figures reflect direct merchandise cost only and exclude shipping expenses, sales taxes, payment gateway processing fees, packaging, and operating costs.
                </Text>
              </BlockStack>
            </Card>

            {/* Transparent Calculation Breakdown (Requirement 4) */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Calculation Breakdown & Formula
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Transparent step-by-step calculations supported by available Shopify data. Figures are never fabricated:
                </Text>

                <Divider />

                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">1. Catalog Price</Text>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {check.currencyCode} {check.currentPrice.toFixed(2)}
                    </Text>
                  </InlineStack>

                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">2. Proposed Discount</Text>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {check.discountType === "PERCENTAGE"
                        ? `${check.discountValue}% off (-${check.currencyCode} ${(check.currentPrice - check.discountedPrice).toFixed(2)})`
                        : check.discountType === "FIXED_AMOUNT"
                        ? `${check.currencyCode} ${check.discountValue.toFixed(2)} off`
                        : `Fixed offer price: ${check.currencyCode} ${check.discountValue.toFixed(2)} (-${check.currencyCode} ${(check.currentPrice - check.discountedPrice).toFixed(2)} off)`}
                    </Text>
                  </InlineStack>

                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">3. Estimated Selling Price</Text>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {check.currencyCode} {check.discountedPrice.toFixed(2)} per unit
                    </Text>
                  </InlineStack>

                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">4. Unit Cost</Text>
                    <InlineStack gap="100" blockAlign="center">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {check.unitCost !== null
                          ? `${check.currencyCode} ${check.unitCost.toFixed(2)}`
                          : "Missing in Shopify"}
                      </Text>
                      {isManualCost && (
                        <Badge tone="attention">Merchant Manual Assumption</Badge>
                      )}
                    </InlineStack>
                  </InlineStack>

                  <Divider />

                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">5. Estimated Gross Profit</Text>
                    <Text as="span" variant="bodyMd" fontWeight="bold">
                      {check.estimatedGrossProfit !== null
                        ? `${check.currencyCode} ${check.estimatedGrossProfit.toFixed(2)} (Selling price − Unit cost)`
                        : "Profit can’t be estimated"}
                    </Text>
                  </InlineStack>

                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">6. Estimated Gross Margin</Text>
                    <Text as="span" variant="bodyMd" fontWeight="bold">
                      {check.estimatedGrossMargin !== null
                        ? `${check.estimatedGrossMargin.toFixed(1)}% (Gross profit ÷ Selling price)`
                        : "Margin can’t be estimated"}
                    </Text>
                  </InlineStack>
                </BlockStack>

                <Divider />

                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    Explicit Financial Exclusions (Gross Profit Disclaimers)
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    This figure measures estimated selling price − unit cost only. The following real-world expenses are explicitly excluded:
                  </Text>
                  <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "12px", color: "var(--p-color-text-subdued)" }}>
                    <li>Customer shipping fees and carrier freight charges</li>
                    <li>Sales taxes, VAT, GST, and international customs duties</li>
                    <li>Payment gateway processing transaction fees (e.g. 2.9% + 30¢)</li>
                    <li>Packaging materials, boxes, and warehouse fulfillment labor</li>
                    <li>Customer return, replacement, and refund allowances</li>
                    <li>Operating overhead, marketing, and acquisition costs</li>
                  </ul>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Audit Parameters & Retrieved Values (Requirement 8) */}
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
                        {check.discountType === "PERCENTAGE"
                          ? `${check.discountValue}% off`
                          : check.discountType === "FIXED_AMOUNT"
                          ? `${check.currencyCode} ${check.discountValue.toFixed(2)} off`
                          : `Fixed offer price: ${check.currencyCode} ${check.discountValue.toFixed(2)}`}
                      </Text>
                    </BlockStack>
                  </Box>
                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Offer Quantity</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{check.offerQuantity || 1} unit(s)</Text>
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
                      <Text as="span" variant="bodyXs" tone="subdued">
                        Source: {check.costSource || "Shopify inventoryItem.unitCost"}
                      </Text>
                    </BlockStack>
                  </Box>
                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Estimated Gross Profit</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {check.estimatedGrossProfit !== null ? `${check.currencyCode} ${check.estimatedGrossProfit.toFixed(2)}` : "Profit can’t be estimated"}
                      </Text>
                    </BlockStack>
                  </Box>
                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Estimated Gross Margin</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {check.estimatedGrossMargin !== null ? `${check.estimatedGrossMargin.toFixed(1)}%` : "Margin can’t be estimated"}
                      </Text>
                    </BlockStack>
                  </Box>
                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Audited Location</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{check.locationName}</Text>
                      <Text as="span" variant="bodyXs" tone="subdued">
                        Applies strictly to {check.locationName} (ID: {check.locationId})
                      </Text>
                    </BlockStack>
                  </Box>
                  <Box minWidth="200px">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" tone="subdued">Inventory State</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {check.inventoryTracked
                          ? check.inventoryQuantity !== null
                            ? `${check.inventoryQuantity} units observed`
                            : "Unable to verify"
                          : "Inventory not tracked"}
                      </Text>
                    </BlockStack>
                  </Box>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Audit Findings & Warnings (Requirements 10 & 28, P1.8) */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Audit Findings ({warnings.length})
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Structured pre-flight findings & recommendations
                  </Text>
                </InlineStack>

                {warnings.length === 0 ? (
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <Text as="p" variant="bodyMd" tone="success">
                      ✓ No warnings or conflicts identified during this pre-flight check.
                    </Text>
                  </Box>
                ) : (
                  <BlockStack gap="300">
                    {warnings.map((w, idx) => {
                      const details = getStructuredFindingDetails(w);
                      return (
                        <Box
                          key={idx}
                          padding="400"
                          background="bg-surface-secondary"
                          borderRadius="200"
                        >
                          <BlockStack gap="200">
                            <InlineStack gap="200" blockAlign="center">
                              {renderFindingLevelBadge(w)}
                              <Text as="span" variant="headingSm">
                                {w.code.replace(/_/g, " ")}
                              </Text>
                            </InlineStack>

                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {w.message}
                            </Text>

                            <Divider />

                            <BlockStack gap="150">
                              <InlineStack gap="200" blockAlign="start">
                                <Box minWidth="150px">
                                  <Text as="span" variant="bodySm" fontWeight="semibold">
                                    What was checked:
                                  </Text>
                                </Box>
                                <Box width="100%">
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    {details.whatWasChecked}
                                  </Text>
                                </Box>
                              </InlineStack>

                              <InlineStack gap="200" blockAlign="start">
                                <Box minWidth="150px">
                                  <Text as="span" variant="bodySm" fontWeight="semibold">
                                    Data used:
                                  </Text>
                                </Box>
                                <Box width="100%">
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    {details.dataUsed}
                                  </Text>
                                </Box>
                              </InlineStack>

                              <InlineStack gap="200" blockAlign="start">
                                <Box minWidth="150px">
                                  <Text as="span" variant="bodySm" fontWeight="semibold">
                                    Why it matters:
                                  </Text>
                                </Box>
                                <Box width="100%">
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    {details.whyItMatters}
                                  </Text>
                                </Box>
                              </InlineStack>

                              <InlineStack gap="200" blockAlign="start">
                                <Box minWidth="150px">
                                  <Text as="span" variant="bodySm" fontWeight="semibold" tone="success">
                                    Practical next step:
                                  </Text>
                                </Box>
                                <Box width="100%">
                                  <Text as="span" variant="bodySm">
                                    {details.nextStep}
                                  </Text>
                                </Box>
                              </InlineStack>
                            </BlockStack>
                          </BlockStack>
                        </Box>
                      );
                    })}
                  </BlockStack>
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

                {/* Scenario Trigger Product (Requirement 7) */}
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm" tone="subdued">
                    Scenario Input: Trigger Product (Baseline Condition)
                  </Text>
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    {check.triggerProductTitle}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Variant: {check.triggerVariantTitle}
                    {check.triggerVariantSku ? ` • SKU: ${check.triggerVariantSku}` : " • (No SKU)"}
                    {" • "}Shopify GID: <code>{check.triggerVariantId}</code>
                  </Text>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    Scenario input only. PromoLint audits a proposed scenario; it does not enforce cart conditions, publish promotions, or create an upsell on your storefront.
                  </Text>
                </BlockStack>

                <Divider />

                {/* Offered Product */}
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm" tone="subdued">
                    Scenario Input: Offered Incentive Item & Proposed Discount
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
                        Variant: {check.offeredVariantTitle}
                        {check.offeredVariantSku ? ` • SKU: ${check.offeredVariantSku}` : " • (No SKU)"}
                        {" • "}Shopify GID: <code>{check.offeredVariantId}</code>
                      </Text>
                      <Text as="span" variant="bodySm">
                        Proposed Discount:{" "}
                        <strong>
                          {check.discountType === "PERCENTAGE"
                            ? `${check.discountValue}% off`
                            : check.discountType === "FIXED_AMOUNT"
                            ? `${check.currencyCode} ${check.discountValue.toFixed(2)} off`
                            : `Fixed price: ${check.currencyCode} ${check.discountValue.toFixed(2)}`}
                        </strong>
                        {check.offerQuantity && check.offerQuantity > 1 && (
                          <span> • Quantity: <strong>{check.offerQuantity} units</strong></span>
                        )}
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

                {/* Recheck current data (Requirement 18) */}
                <Form method="post">
                  <input type="hidden" name="intent" value="recheck" />
                  <BlockStack gap="100">
                    <Button
                      variant="primary"
                      submit
                      loading={isRechecking}
                    >
                      Recheck current data
                    </Button>
                    <Text as="p" variant="bodyXs" tone="subdued">
                      Queries current catalog prices, unit costs, stock, and discounts to create a new time-stamped result snapshot without altering this historical record.
                    </Text>
                  </BlockStack>
                </Form>

                {/* Duplicate check as starting point (Requirement 19) */}
                <Button onClick={() => navigate(`/app/new?duplicateId=${check.id}`)}>
                  Duplicate check
                </Button>

                <Button onClick={() => navigate("/app/new")}>
                  Run another check
                </Button>

                <Form
                  method="post"
                  onSubmit={(e) => {
                    if (!confirm("Are you sure you want to delete this saved check?")) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="intent" value="delete" />
                  <Button
                    tone="critical"
                    submit
                    loading={isDeleting}
                  >
                    Delete check
                  </Button>
                </Form>

                <Divider />

                <Text as="h3" variant="headingSm">
                  Immutable Audit Snapshot
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  This report is an immutable point-in-time snapshot. Historical records never silently change when catalog prices or costs update.
                  Clicking <strong>Recheck current data</strong> queries current live Shopify data and creates a new timestamped snapshot record.
                </Text>

                <Divider />

                <Text as="h3" variant="headingSm">
                  Discount Stacking Assumptions
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {check.discountAssumptions || "PromoLint inspects combination permissions (combinesWith) on active Shopify discounts. This is an advisory configuration check, not a live checkout simulation."}
                </Text>

                <Divider />

                <Text as="h3" variant="headingSm">
                  General Assumptions & Scope
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
