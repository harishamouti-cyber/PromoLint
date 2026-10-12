import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, Form } from "@remix-run/react";
import { useState } from "react";
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
  BlockStack,
  TextField,
  Select,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getRecentOfferChecks, deleteOfferCheck } from "../services/checks.server";
import { PROMO_LINT_EMPTY_STATE_IMAGE } from "../components/empty-state-illustration";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const searchQuery = url.searchParams.get("q") || "";
  const status = url.searchParams.get("status") || "ALL";
  const discountType = url.searchParams.get("discountType") || "ALL";
  const dateRange = url.searchParams.get("dateRange") || "ALL";

  const checks = await getRecentOfferChecks(session.shop, {
    searchQuery,
    status,
    discountType,
    dateRange,
    limit: 100,
  });

  return json({
    checks,
    searchQuery,
    status,
    discountType,
    dateRange,
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
  const { checks, searchQuery, status, discountType, dateRange } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();

  const [localSearch, setLocalSearch] = useState(searchQuery);

  const handleFilterChange = (field: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "ALL") {
      params.set(field, value);
    } else {
      params.delete(field);
    }
    navigate(`/app/checks?${params.toString()}`);
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const params = new URLSearchParams(window.location.search);
    if (localSearch.trim()) {
      params.set("q", localSearch.trim());
    } else {
      params.delete("q");
    }
    navigate(`/app/checks?${params.toString()}`);
  };

  const handleClearFilters = () => {
    setLocalSearch("");
    navigate("/app/checks");
  };

  const hasActiveFilters = Boolean(
    searchQuery || (status && status !== "ALL") || (discountType && discountType !== "ALL") || (dateRange && dateRange !== "ALL")
  );

  const renderStatusBadge = (s: string) => {
    switch (s) {
      case "READY":
        return <Badge tone="success">Ready</Badge>;
      case "REVIEW":
        return <Badge tone="warning">Review</Badge>;
      case "BLOCKED":
        return <Badge tone="critical">Blocked</Badge>;
      default:
        return <Badge>{s}</Badge>;
    }
  };

  return (
    <Page
      fullWidth
      title="Offer checks"
      subtitle="History of all pre-launch promotion audits for this store."
      primaryAction={{
        content: "Check an offer",
        onAction: () => navigate("/app/new"),
      }}
      secondaryActions={[
        {
          content: "Export CSV",
          accessibilityLabel: "Export filtered audit checks as CSV spreadsheet",
          onAction: () => {
            const params = new URLSearchParams(window.location.search);
            window.open(`/app/checks/export?${params.toString()}`, "_blank");
          },
          disabled: checks.length === 0,
        },
      ]}
      backAction={{ content: "Home", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="400">
        {/* Search & Filter Toolbar (Requirement 20) */}
        <Card>
          <form onSubmit={handleSearchSubmit}>
            <BlockStack gap="300">
              <InlineStack gap="300" wrap={true} blockAlign="end">
                <Box minWidth="260px">
                  <TextField
                    label="Search audits"
                    value={localSearch}
                    onChange={setLocalSearch}
                    placeholder="Search by product title or SKU..."
                    autoComplete="off"
                    clearButton
                    onClearButtonClick={() => {
                      setLocalSearch("");
                      const params = new URLSearchParams(window.location.search);
                      params.delete("q");
                      navigate(`/app/checks?${params.toString()}`);
                    }}
                  />
                </Box>

                <Box minWidth="150px">
                  <Select
                    label="Status"
                    options={[
                      { label: "All Statuses", value: "ALL" },
                      { label: "Ready", value: "READY" },
                      { label: "Review", value: "REVIEW" },
                      { label: "Blocked", value: "BLOCKED" },
                    ]}
                    value={status}
                    onChange={(val) => handleFilterChange("status", val)}
                  />
                </Box>

                <Box minWidth="180px">
                  <Select
                    label="Discount Type"
                    options={[
                      { label: "All Discount Types", value: "ALL" },
                      { label: "Percentage Off", value: "PERCENTAGE" },
                      { label: "Fixed Amount Off", value: "FIXED_AMOUNT" },
                      { label: "Fixed Offer Price", value: "FIXED_PRICE" },
                    ]}
                    value={discountType}
                    onChange={(val) => handleFilterChange("discountType", val)}
                  />
                </Box>

                <Box minWidth="150px">
                  <Select
                    label="Date Range"
                    options={[
                      { label: "All Time", value: "ALL" },
                      { label: "Last 24 Hours", value: "24h" },
                      { label: "Last 7 Days", value: "7d" },
                      { label: "Last 30 Days", value: "30d" },
                    ]}
                    value={dateRange}
                    onChange={(val) => handleFilterChange("dateRange", val)}
                  />
                </Box>

                <InlineStack gap="200">
                  <Button submit>Search</Button>
                  {hasActiveFilters && (
                    <Button variant="plain" onClick={handleClearFilters}>
                      Clear filters
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>
            </BlockStack>
          </form>
        </Card>

        {/* Results Table */}
        <Card padding="0">
          {checks.length === 0 ? (
            <Box padding="600">
              <EmptyState
                heading={hasActiveFilters ? "No audits match your filter criteria" : "No offer checks recorded yet"}
                action={{
                  content: hasActiveFilters ? "Reset filters" : "Run an offer check",
                  onAction: () => {
                    if (hasActiveFilters) {
                      handleClearFilters();
                    } else {
                      navigate("/app/new");
                    }
                  },
                }}
                image={PROMO_LINT_EMPTY_STATE_IMAGE}
              >
                <p>
                  {hasActiveFilters
                    ? "Try adjusting your search keywords, status, or date filters to view saved checks."
                    : "Run a pre-launch check to audit proposed offers against current unit costs, live inventory, and existing store discounts."}
                </p>
              </EmptyState>
            </Box>
          ) : (
            <IndexTable
              resourceName={{ singular: "offer check", plural: "offer checks" }}
              itemCount={checks.length}
              headings={[
                { title: "Status" },
                { title: "Scenario Trigger Product" },
                { title: "Offered Product" },
                { title: "Discount & Qty" },
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
                      {check.triggerVariantSku ? ` • SKU: ${check.triggerVariantSku}` : ""}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {check.offeredProductTitle}
                    </Text>
                    <br />
                    <Text as="span" variant="bodySm" tone="subdued">
                      {check.offeredVariantTitle}
                      {check.offeredVariantSku ? ` • SKU: ${check.offeredVariantSku}` : ""}
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
                    <Text as="span" variant="bodySm">
                      {check.locationName}
                    </Text>
                    <br />
                    <Text as="span" variant="bodyXs" tone="subdued">
                      Single location
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
                      <Button
                        size="slim"
                        onClick={() => navigate(`/app/new?duplicateId=${check.id}`)}
                      >
                        Duplicate
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
