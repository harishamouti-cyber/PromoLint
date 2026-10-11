import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useNavigation, Form } from "@remix-run/react";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  EmptyState,
  Box,
  InlineStack,
  Banner,
  BlockStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getRecentOfferChecks, deleteOfferCheck } from "../services/checks.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const checks = await getRecentOfferChecks(session.shop, 100);

  return json({
    checks,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const checkId = formData.get("checkId") as string;

  if (checkId) {
    await deleteOfferCheck(session.shop, checkId);
  }

  return json({ success: true });
};

export default function OfferChecksListScreen() {
  const { checks } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();

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
      title="Offer checks"
      subtitle="History of all pre-launch promotion audits for this store."
      primaryAction={{
        content: "Check an offer",
        onAction: () => navigate("/app/new"),
      }}
      backAction={{ content: "Home", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="400">
        <Card padding="0">
          {checks.length === 0 ? (
            <Box padding="600">
              <EmptyState
                heading="No offer checks recorded yet"
                action={{
                  content: "Run an offer check",
                  onAction: () => navigate("/app/new"),
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Run a pre-launch check to audit proposed offers against current unit costs,
                  live inventory, and existing store discounts.
                </p>
              </EmptyState>
            </Box>
          ) : (
            <IndexTable
              resourceName={{ singular: "offer check", plural: "offer checks" }}
              itemCount={checks.length}
              headings={[
                { title: "Status" },
                { title: "Trigger Product" },
                { title: "Offered Product" },
                { title: "Discount" },
                { title: "Est. Gross Profit" },
                { title: "Location" },
                { title: "Checked At" },
                { title: "Actions" },
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
                    {check.discountType === "PERCENTAGE"
                      ? `${check.discountValue}% off`
                      : `${check.currencyCode} ${check.discountValue.toFixed(2)} off`}
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
                        Cost missing
                      </Text>
                    )}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm">
                      {check.locationName}
                    </Text>
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
                      <Form method="post">
                        <input type="hidden" name="checkId" value={check.id} />
                        <Button
                          size="slim"
                          tone="critical"
                          submit
                          onClick={(e) => {
                            if (!confirm("Delete this saved check?")) {
                              e.preventDefault();
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </Form>
                    </InlineStack>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
