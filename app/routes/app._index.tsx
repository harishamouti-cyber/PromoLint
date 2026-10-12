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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getRecentOfferChecks } from "../services/checks.server";
import { checkStoreReadiness } from "../services/shopify-catalog.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [checks, readiness] = await Promise.all([
    getRecentOfferChecks(session.shop, 5),
    checkStoreReadiness(admin),
  ]);

  return json({
    checks,
    shop: session.shop,
    readiness,
  });
};

export default function HomeScreen() {
  const { checks, shop, readiness } = useLoaderData<typeof loader>();
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

  return (
    <Page
      title="PromoLint"
      subtitle="Catch offer problems before they reach checkout."
      primaryAction={{
        content: "Check an offer",
        onAction: () => navigate("/app/new"),
      }}
      secondaryActions={[
        {
          content: "Settings",
          onAction: () => navigate("/app/settings"),
        },
      ]}
    >
      <BlockStack gap="500">
        <Banner tone="info" title="Pre-launch offer quality assurance">
          <p>
            PromoLint is an administrative QA tool to audit proposed promotion scenarios
            against live inventory, catalog unit costs, and active store discounts before you
            launch. PromoLint does not publish storefront widgets, modify checkout, or alter merchant theme files.
          </p>
        </Banner>

        {/* Store Readiness Status based purely on live Shopify Admin GraphQL API checks */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Store Audit Readiness
                </Text>
                {readiness.isReady ? (
                  <Badge tone="success">Ready for audits</Badge>
                ) : (
                  <Badge tone="warning">Setup required</Badge>
                )}
              </InlineStack>
              <Text as="span" variant="bodyXs" tone="subdued">
                Live Shopify API check
              </Text>
            </InlineStack>
            <Divider />
            {readiness.isReady ? (
              <Text as="p" variant="bodyMd">
                Shopify Admin API permissions are confirmed active. We verified access to your product catalog ({readiness.productCount} active products detected),
                store fulfillment locations ({readiness.locationCount} locations), and active store discount rules.
              </Text>
            ) : (
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="caution">
                  PromoLint detected store requirements needing attention before offers can be fully audited:
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

        {/* First-Run Guidance for Missing Product Costs */}
        <Banner tone="info" title="First-time setup tip: Set variant unit costs in Shopify">
          <p>
            PromoLint strictly uses real Shopify data and never fabricates mock profit numbers. To calculate estimated gross margin,
            Shopify must have a <strong>Cost per item</strong> recorded for your variants (under <em>Shopify Admin &gt; Products &gt; [Product] &gt; Variants</em>).
            Offers with missing costs will be flagged for review to prevent unnoticed financial losses.
          </p>
        </Banner>

        <Layout>
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
                  <EmptyState
                    heading="No offer checks yet"
                    action={{
                      content: "Check an offer",
                      onAction: () => navigate("/app/new"),
                    }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      Simulate a proposed promotion to inspect estimated profit, current stock availability,
                      and discount combination risks before making it active.
                    </p>
                  </EmptyState>
                </Box>
              ) : (
                <IndexTable
                  resourceName={{ singular: "check", plural: "checks" }}
                  itemCount={checks.length}
                  headings={[
                    { title: "Status" },
                    { title: "Scenario Trigger Product" },
                    { title: "Offered Product" },
                    { title: "Discount" },
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
