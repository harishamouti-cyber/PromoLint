import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getRecentOfferChecks, formatOfferChecksToCsv } from "../services/checks.server";

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
    limit: 500, // Export up to 500 records
  });

  const csvContent = formatOfferChecksToCsv(checks);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `promolint-offer-checks-${timestamp}.csv`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache",
    },
  });
};
