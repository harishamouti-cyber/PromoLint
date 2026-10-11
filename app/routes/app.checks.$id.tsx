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
import { getOfferCheckById, deleteOfferCheck } from "../services/checks.server";
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
  const { session } = await authenticate.admin(request);
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

  return json({ error: "Unknown action" }, { status: 400 });
};

export default function CheckResultDetailScreen() {
  const { check, warnings } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isDeleting = navigation.formData?.get("intent") === "delete";

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

  const getStatusBanner = () => {
    if (check.status === "BLOCKED") {
      return (
        <Banner tone="critical" title="Offer Blocked — Critical Problems Detected">
          <p>
            This offer configuration has critical blockers such as selling below cost, zero stock,
            or an invalid discount amount. We recommend resolving these blockers before activating this offer.
          </p>
        </Banner>
      );
    }
    if (check.status === "REVIEW") {
      return (
        <Banner tone="warning" title="Offer Needs Review — Caution Advised">
          <p>
            Potential risks were detected (e.g. low stock, missing unit costs, or active store discounts with
            stacking enabled). Review the findings below before publishing.
          </p>
        </Banner>
      );
    }
    return (
      <Banner tone="success" title="Offer Ready — Pre-Flight Passed">
        <p>
          All automated checks passed with positive estimated gross margins, adequate inventory at the selected
          location, and no immediate configuration blockers.
        </p>
      </Banner>
    );
  };

  return (
    <Page
      title="Offer Check Result"
      subtitle={`Checked on ${new Date(check.createdAt).toLocaleString(undefined, {
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

        <Layout>
          {/* Main Column */}
          <Layout.Section>
            {/* Key Financial & Stock Summary */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Estimated Unit Financials & Stock
                  </Text>
                  {renderStatusBadge(check.status)}
                </InlineStack>

                <Divider />

                <InlineStack gap="600" wrap={true}>
                  <Box minWidth="150px">
                    <BlockStack gap="100">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Discounted Unit Price
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
                      {check.inventoryTracked ? (
                        <Text
                          as="span"
                          variant="headingLg"
                          tone={check.inventoryQuantity === 0 ? "critical" : undefined}
                        >
                          {check.inventoryQuantity !== null ? `${check.inventoryQuantity} units` : "Unavailable"}
                        </Text>
                      ) : (
                        <Text as="span" variant="bodyMd" tone="subdued">
                          Untracked
                        </Text>
                      )}
                      <Text as="span" variant="bodyXs" tone="subdued">
                        Location: {check.locationName}
                      </Text>
                    </BlockStack>
                  </Box>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Findings & Warnings */}
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

                {/* Trigger Product */}
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm" tone="subdued">
                    Trigger Condition
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
                    Offered Item & Discount
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
                  Assumptions & Methodology
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {check.assumptions}
                </Text>
                <Divider />
                <Text as="h3" variant="headingSm">
                  Actions
                </Text>
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
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
