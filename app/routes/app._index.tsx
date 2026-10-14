import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Badge,
  IndexTable,
  EmptyState,
  Banner,
  Box,
  Divider,
  List,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getRecentOfferChecks, getOfferCheckMetrics } from "../services/checks.server";
import { checkStoreReadiness } from "../services/shopify-catalog.server";
import { checkSubscriptionStatus } from "../services/billing.server";
import { PROMO_LINT_EMPTY_STATE_IMAGE } from "../components/empty-state-illustration";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const [checks, readiness, metrics, billingStatus] = await Promise.all([
    getRecentOfferChecks(session.shop, 5),
    checkStoreReadiness(admin),
    getOfferCheckMetrics(session.shop),
    checkSubscriptionStatus(billing, session.shop),
  ]);

  return json({
    checks,
    shop: session.shop,
    readiness,
    metrics,
    billingStatus,
  });
};

export default function HomeScreen() {
  const { checks, readiness, metrics, billingStatus } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "READY":
        return <Badge tone="success">Ready</Badge>;
      case "REVIEW":
        return <Badge tone="warning">Review</Badge>;
      case "BLOCKED":
        return <Badge tone="critical">Blocked</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formattedCheckedTime = new Date(readiness.checkedAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Page
      fullWidth
      title="PromoLint"
      subtitle="Catch offer problems before they reach checkout."
      primaryAction={{
        content: "Check an offer",
        onAction: () => navigate("/app/new"),
      }}
      secondaryActions={[
        {
          content: "Offer checks history",
          onAction: () => navigate("/app/checks"),
        },
        {
          content: "Settings",
          onAction: () => navigate("/app/settings"),
        },
        {
          content: billingStatus.hasActivePro ? "Plan & Billing" : "Plan & Billing ($19.99/mo)",
          onAction: () => navigate("/app/billing"),
        },
      ]}
    >
      <BlockStack gap="500">
        {/* Core Purpose & Guardrail Disclosure */}
        <Banner tone="info" title="Pre-launch promotion QA tool">
          <p>
            PromoLint is an administrative audit tool that checks proposed promotion scenarios against live inventory,
            Shopify unit costs, and active store discounts before launch. PromoLint does not publish offers to shoppers,
            alter checkout, create discount codes, or claim incremental sales impact.
          </p>
        </Banner>

        {/* Factual Shopify API Connection & Scope Status (Requirement 22) */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Shopify API Connection & Scope Status
                </Text>
                {readiness.isReady ? (
                  <Badge tone="success">API connection verified</Badge>
                ) : (
                  <Badge tone="warning">Scope setup required</Badge>
                )}
              </InlineStack>
              <Text as="span" variant="bodyXs" tone="subdued">
                Checked at {formattedCheckedTime}
              </Text>
            </InlineStack>
            <Divider />
            {readiness.isReady ? (
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  Shopify Admin GraphQL API connectivity is confirmed for this store:
                </Text>
                <List type="bullet">
                  <List.Item>
                    <strong>Product catalog (<code>read_products</code>):</strong> Verified access. Sampled {readiness.productCount} active product(s). <em>Note: Catalog accessibility verifies API read permission; it does not guarantee that cost per item is populated for every variant.</em>
                  </List.Item>
                  <List.Item>
                    <strong>Fulfillment locations (<code>read_locations</code>):</strong> Verified access. Detected {readiness.locationCount} active store location(s).
                  </List.Item>
                  <List.Item>
                    <strong>Store discounts (<code>read_discounts</code>):</strong> Verified access to active store discount rules and combination settings.
                  </List.Item>
                </List>
                <Text as="p" variant="bodyXs" tone="subdued">
                  Scope verification confirms PromoLint can query your store's GraphQL API. It does not verify that all products have unit costs populated, that inventory is sufficient across your catalog, or that proposed offers will be profitable.
                </Text>
              </BlockStack>
            ) : (
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="caution">
                  Requirements needing attention before promotions can be fully audited:
                </Text>
                <ul style={{ margin: 0, paddingLeft: "16px" }}>
                  {readiness.missingRequirements.map((req: string, i: number) => (
                    <li key={i}>{req}</li>
                  ))}
                </ul>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        {/* Factual Audit Metrics (Requirement 26) */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Offer Audit Activity
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                Historical records in this store
              </Text>
            </InlineStack>
            <Divider />
            <InlineStack gap="400" wrap={true}>
              <Box minWidth="140px">
                <BlockStack gap="050">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Total Audits
                  </Text>
                  <Text as="span" variant="headingLg">
                    {metrics.totalChecks}
                  </Text>
                  <Text as="span" variant="bodyXs" tone="subdued">
                    Saved pre-flight checks
                  </Text>
                </BlockStack>
              </Box>

              <Box minWidth="140px">
                <BlockStack gap="050">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Ready (Passed)
                  </Text>
                  <Text as="span" variant="headingLg">
                    {metrics.readyChecks}
                  </Text>
                  <Text as="span" variant="bodyXs" tone="subdued">
                    Zero blockers or review flags
                  </Text>
                </BlockStack>
              </Box>

              <Box minWidth="140px">
                <BlockStack gap="050">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Review Needed
                  </Text>
                  <Text as="span" variant="headingLg">
                    {metrics.reviewChecks}
                  </Text>
                  <Text as="span" variant="bodyXs" tone="subdued">
                    Missing cost or low stock
                  </Text>
                </BlockStack>
              </Box>

              <Box minWidth="140px">
                <BlockStack gap="050">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Blocked
                  </Text>
                  <Text as="span" variant="headingLg">
                    {metrics.blockedChecks}
                  </Text>
                  <Text as="span" variant="bodyXs" tone="subdued">
                    Negative profit or out of stock
                  </Text>
                </BlockStack>
              </Box>
            </InlineStack>
            <Divider />
            <Text as="p" variant="bodyXs" tone="subdued">
              <strong>Metrics Definition:</strong> These counts summarize historical pre-launch QA checks recorded in PromoLint. PromoLint audits pre-launch promotion scenarios; it does not measure storefront conversions, shopper redemption rates, or causal financial impact.
            </Text>
          </BlockStack>
        </Card>

        {/* First-Run Onboarding Guide (Requirement 27) */}
        {metrics.totalChecks === 0 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Getting Started with PromoLint (4 Steps)
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Follow this quick workflow to run your first pre-launch promotion audit with accurate data:
              </Text>
              <Divider />
              <BlockStack gap="300">
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        Step 1: Verify Store Fulfillment Location
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {readiness.locationCount > 0
                          ? `Found ${readiness.locationCount} active fulfillment location(s). Stock checks will query your selected facility.`
                          : "No fulfillment locations detected. Configure an active location in Shopify Settings > Locations."}
                      </Text>
                    </BlockStack>
                    <Badge tone={readiness.locationCount > 0 ? "success" : "warning"}>
                      {readiness.locationCount > 0 ? "Ready" : "Action Needed"}
                    </Badge>
                  </InlineStack>
                </Box>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        Step 2: Ensure Variant Unit Costs in Shopify
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        In Shopify Admin &gt; Products, enter a <strong>Cost per item</strong> under Pricing for each variant. PromoLint uses real costs to calculate gross margin and prevent unprofitable promotions.
                      </Text>
                    </BlockStack>
                    <Badge tone="info">Recommended</Badge>
                  </InlineStack>
                </Box>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        Step 3: Review Advisory QA Preferences
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        Configure your preferred warning thresholds for minimum inventory (e.g. 5 units) and minimum gross margin (e.g. 20%).
                      </Text>
                    </BlockStack>
                    <Button variant="plain" onClick={() => navigate("/app/settings")}>
                      Configure settings
                    </Button>
                  </InlineStack>
                </Box>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        Step 4: Run Your First Offer Check
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        Pick a trigger product and offered variant, choose your proposed discount (or bundle quantity), and inspect your pre-launch report.
                      </Text>
                    </BlockStack>
                    <Button variant="primary" onClick={() => navigate("/app/new")}>
                      Start check
                    </Button>
                  </InlineStack>
                </Box>
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        <Layout>
          {/* Main Action Banner */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Run an Offer Pre-Flight Check
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Simulate proposed discounts against current unit costs and live inventory counts.
                    </Text>
                  </BlockStack>
                  <Button variant="primary" onClick={() => navigate("/app/new")}>
                    New offer check
                  </Button>
                </InlineStack>
                <Divider />
                <Text as="p" variant="bodySm" tone="subdued">
                  Each check queries your live Shopify Admin GraphQL API upon submission and saves an immutable, time-stamped snapshot for your records.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Recent Checks Section (Requirements 21 & 26) */}
          <Layout.Section>
            <Card padding="0">
              <Box padding="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Recent Checks
                  </Text>
                  {checks.length > 0 && (
                    <Button variant="plain" onClick={() => navigate("/app/checks")}>
                      View all checks
                    </Button>
                  )}
                </InlineStack>
              </Box>

              {checks.length === 0 ? (
                <Box padding="600">
                  {/* Polished, Useful Empty State (Requirement 21) */}
                  <EmptyState
                    heading="No offer checks recorded yet"
                    action={{
                      content: "Check an offer",
                      onAction: () => navigate("/app/new"),
                    }}
                    secondaryAction={{
                      content: "Configure settings",
                      onAction: () => navigate("/app/settings"),
                    }}
                    image={PROMO_LINT_EMPTY_STATE_IMAGE}
                  >
                    <p>
                      Simulate a proposed promotion to inspect estimated profit, current stock availability,
                      and discount combination risks before making it active.
                    </p>
                  </EmptyState>

                  <Box paddingBlockStart="400">
                    <Card background="bg-surface-secondary">
                      <BlockStack gap="200">
                        <Text as="h3" variant="headingSm">
                          How PromoLint offer audits work:
                        </Text>
                        <List type="number">
                          <List.Item>
                            <strong>Scenario Input:</strong> Select your proposed trigger and offered products, discount type (percentage, fixed amount, or fixed price), and bundle quantity.
                          </List.Item>
                          <List.Item>
                            <strong>Live Data Verification:</strong> PromoLint queries Shopify for current unit costs, location-specific inventory, and active store discount rules.
                          </List.Item>
                          <List.Item>
                            <strong>Advisory QA Verdict:</strong> Receive an immediate status (Ready, Review, or Blocked) with break-even calculations, stock warnings, and stacking alerts.
                          </List.Item>
                        </List>
                      </BlockStack>
                    </Card>
                  </Box>
                </Box>
              ) : (
                <IndexTable
                  resourceName={{ singular: "check", plural: "checks" }}
                  itemCount={checks.length}
                  headings={[
                    { title: "Status" },
                    { title: "Scenario Trigger Product" },
                    { title: "Offered Product" },
                    { title: "Discount & Qty" },
                    { title: "Est. Gross Profit" },
                    { title: "Checked At" },
                    { title: "Action" },
                  ]}
                  selectable={false}
                >
                  {checks.map((check, index) => (
                    <IndexTable.Row id={check.id} key={check.id} position={index}>
                      <IndexTable.Cell>{renderStatusBadge(check.status)}</IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {check.triggerProductTitle}
                        </Text>
                        <br />
                        <Text as="span" variant="bodySm" tone="subdued">
                          {check.triggerVariantTitle}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {check.offeredProductTitle}
                        </Text>
                        <br />
                        <Text as="span" variant="bodySm" tone="subdued">
                          {check.offeredVariantTitle}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd">
                          {check.discountType === "PERCENTAGE"
                            ? `${check.discountValue}% off`
                            : check.discountType === "FIXED_AMOUNT"
                            ? `${check.currencyCode} ${check.discountValue.toFixed(2)} off`
                            : `Fixed: ${check.currencyCode} ${check.discountValue.toFixed(2)}`}
                        </Text>
                        {check.offerQuantity && check.offerQuantity > 1 && (
                          <>
                            <br />
                            <Text as="span" variant="bodyXs" tone="subdued">
                              Qty: {check.offerQuantity} units
                            </Text>
                          </>
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {check.estimatedGrossProfit !== null ? (
                          <Text
                            as="span"
                            tone={check.estimatedGrossProfit < 0 ? "critical" : undefined}
                          >
                            {check.currencyCode} {check.estimatedGrossProfit.toFixed(2)}
                            {check.estimatedGrossMargin !== null && (
                              <Text as="span" tone="subdued" variant="bodySm">
                                {` (${check.estimatedGrossMargin.toFixed(1)}%)`}
                              </Text>
                            )}
                          </Text>
                        ) : (
                          <Text as="span" tone="subdued">
                            Profit can’t be estimated
                          </Text>
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {new Date(check.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="200" blockAlign="center">
                          <Button
                            size="slim"
                            onClick={() => navigate(`/app/checks/${check.id}`)}
                          >
                            View
                          </Button>
                          <Button
                            size="slim"
                            onClick={() => navigate(`/app/new?duplicateId=${check.id}`)}
                          >
                            Duplicate
                          </Button>
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
