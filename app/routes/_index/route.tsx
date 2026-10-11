import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>PromoLint</h1>
        <p className={styles.text}>
          Catch offer problems before they reach checkout.
        </p>
        <p style={{ color: "#6d7175", marginBottom: "20px" }}>
          Pre-launch offer simulation and quality assurance for Shopify merchants.
          Audit proposed promotions against catalog unit costs, live inventory levels, and store discount rules.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" placeholder="my-store.myshopify.com" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in to PromoLint
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Gross Margin Protection</strong>. Simulates proposed discounts against variant unit costs to flag margin-eroding or below-cost offers before launch.
          </li>
          <li>
            <strong>Location-Aware Stock Check</strong>. Verifies point-in-time inventory availability at your chosen fulfillment location to prevent overselling.
          </li>
          <li>
            <strong>Discount Stacking Preflight</strong>. Audits active store discounts to detect combination rules that could enable unintended coupon stacking at checkout.
          </li>
        </ul>
        <div style={{ marginTop: "32px", fontSize: "14px", color: "#6d7175", display: "flex", gap: "16px" }}>
          <a href="/privacy" style={{ color: "#2c6ecb", textDecoration: "none" }}>Privacy Policy</a>
          <span>•</span>
          <a href="/terms" style={{ color: "#2c6ecb", textDecoration: "none" }}>Terms of Service</a>
        </div>
      </div>
    </div>
  );
}
