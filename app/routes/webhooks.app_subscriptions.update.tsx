import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { handleSubscriptionWebhookUpdate } from "../services/billing.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`[PromoLint Webhook] Received ${topic} for ${shop}`);

  // Safely extract subscription payload from Shopify webhook body
  const appSubscription = payload?.app_subscription;

  if (shop && appSubscription) {
    try {
      await handleSubscriptionWebhookUpdate(shop, appSubscription);
      console.log(`[PromoLint Webhook] Successfully updated subscription for ${shop} to ${appSubscription.status}`);
    } catch (error) {
      console.error(`[PromoLint Webhook] Error updating subscription for ${shop}:`, error);
      // Return 200 so Shopify does not repeatedly retry if it's an internal validation issue,
      // but let server log the error.
    }
  }

  return new Response(null, { status: 200 });
};
