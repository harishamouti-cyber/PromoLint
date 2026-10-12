import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigate, useNavigation, Form } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Select,
  Button,
  BlockStack,
  InlineStack,
  Banner,
  Divider,
  List,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { fetchStoreLocations } from "../services/shopify-catalog.server";
import { getShopSettings, updateShopSettings } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const [locations, settings] = await Promise.all([
    fetchStoreLocations(admin, 20),
    getShopSettings(session.shop),
  ]);

  return json({
    locations,
    settings,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const defaultLocationId = formData.get("defaultLocationId") as string;
  const rawMinStock = formData.get("minStockThreshold") as string;
  const rawMinMargin = formData.get("minMarginThreshold") as string;

  const errors: Record<string, string> = {};

  const minStock = parseInt(rawMinStock, 10);
  if (isNaN(minStock) || minStock < 0) {
    errors.minStockThreshold = "Minimum stock threshold must be a non-negative number.";
  }

  const minMargin = parseFloat(rawMinMargin);
  if (isNaN(minMargin) || minMargin < 0 || minMargin > 100) {
    errors.minMarginThreshold = "Gross margin threshold must be between 0% and 100%.";
  }

  if (Object.keys(errors).length > 0) {
    return json({ errors, success: false }, { status: 400 });
  }

  const locations = await fetchStoreLocations(admin, 20);
  const selectedLoc = locations.find((l) => l.id === defaultLocationId);

  await updateShopSettings(session.shop, {
    defaultLocationId: defaultLocationId || null,
    defaultLocationName: selectedLoc ? selectedLoc.name : null,
    minStockThreshold: minStock,
    minMarginThreshold: minMargin,
  });

  return json({ success: true, errors: {} });
};

export default function SettingsScreen() {
  const { locations, settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [defaultLocationId, setDefaultLocationId] = useState<string>(
    settings.defaultLocationId || (locations[0]?.id || "")
  );
  const [minStockThreshold, setMinStockThreshold] = useState<string>(
    settings.minStockThreshold.toString()
  );
  const [minMarginThreshold, setMinMarginThreshold] = useState<string>(
    settings.minMarginThreshold.toString()
  );

  const locationOptions = [
    { label: "None (Prompt on each check)", value: "" },
    ...locations.map((loc) => ({
      label: loc.name,
      value: loc.id,
    })),
  ];

  return (
    <Page
      title="Settings"
      subtitle="Configure audit thresholds and default inventory location for PromoLint."
      backAction={{ content: "Home", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        {actionData?.success && (
          <Banner tone="success" title="Settings updated">
            <p>Your PromoLint audit thresholds and preferences were saved successfully.</p>
          </Banner>
        )}

        {actionData?.errors && Object.keys(actionData.errors).length > 0 && (
          <Banner tone="critical" title="Please correct the form errors">
            <ul style={{ margin: 0, paddingLeft: "16px" }}>
              {Object.values(actionData.errors).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </Banner>
        )}

        <Form method="post">
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Merchant Audit Preferences
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Customize your store's warning sensitivity for pre-launch offer audits. These thresholds represent your advisory QA preferences; they do not alter Shopify inventory policies or block discount creation in your store.
                  </Text>

                  <Select
                    label="Default Inventory Location"
                    name="defaultLocationId"
                    options={locationOptions}
                    value={defaultLocationId}
                    onChange={setDefaultLocationId}
                    helpText="Pre-selected inventory location when starting a new offer check."
                  />

                  <TextField
                    label="Minimum Stock Warning Threshold (units)"
                    name="minStockThreshold"
                    type="number"
                    value={minStockThreshold}
                    onChange={setMinStockThreshold}
                    autoComplete="off"
                    helpText="Advisory preference: Triggers a review warning if available inventory at check time is below this number."
                    error={actionData?.errors?.minStockThreshold}
                  />

                  <TextField
                    label="Minimum Gross Margin Warning Threshold (%)"
                    name="minMarginThreshold"
                    type="number"
                    value={minMarginThreshold}
                    onChange={setMinMarginThreshold}
                    autoComplete="off"
                    suffix="%"
                    helpText="Advisory preference: Triggers a review warning if estimated gross margin is below this percentage."
                    error={actionData?.errors?.minMarginThreshold}
                  />

                  <Divider />

                  <InlineStack align="end" gap="300">
                    <Button onClick={() => navigate("/app")}>Cancel</Button>
                    <Button variant="primary" submit loading={isSaving}>
                      Save settings
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Included in Calculations
                  </Text>
                  <List type="bullet">
                    <List.Item>Offered variant catalog price</List.Item>
                    <List.Item>Shopify inventory item unit cost</List.Item>
                    <List.Item>Point-in-time available stock count</List.Item>
                    <List.Item>Store discount combination settings</List.Item>
                  </List>

                  <Divider />

                  <Text as="h3" variant="headingSm">
                    Excluded from Calculations
                  </Text>
                  <List type="bullet">
                    <List.Item>Customer shipping fees and delivery costs</List.Item>
                    <List.Item>Sales taxes and duties</List.Item>
                    <List.Item>Payment gateway transaction fees</List.Item>
                    <List.Item>Packaging, handling, and warehouse overhead</List.Item>
                    <List.Item>Customer return and refund allowances</List.Item>
                  </List>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </Form>
      </BlockStack>
    </Page>
  );
}
