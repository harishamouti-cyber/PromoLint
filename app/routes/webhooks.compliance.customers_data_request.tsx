import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // PromoLint does not collect, process, or store customer personal data in Version 1.
  return new Response(
    JSON.stringify({
      message: "No customer personal data is stored by PromoLint.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
