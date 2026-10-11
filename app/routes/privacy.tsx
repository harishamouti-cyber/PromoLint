export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: "800px", margin: "40px auto", padding: "0 20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: "#202223", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px" }}>PromoLint Privacy Policy</h1>
      <p style={{ color: "#6d7175", marginBottom: "24px" }}>Last updated: October 2026</p>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>1. Overview</h2>
        <p>
          PromoLint (&ldquo;the App&rdquo;) is an offer-analysis and pre-launch quality assurance tool for Shopify merchants.
          Our guiding philosophy is minimal scope: we do not collect, process, or sell customer personal data (PII), and we do not monitor store shoppers.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>2. Data We Access</h2>
        <p>To perform offer analyses on behalf of the store merchant, the App queries the following via Shopify Admin API:</p>
        <ul style={{ paddingLeft: "20px", marginTop: "8px" }}>
          <li><strong>Product Catalog Data:</strong> Product and variant titles, IDs, prices, and unit costs to estimate gross margin.</li>
          <li><strong>Inventory Levels:</strong> Quantities observed at selected inventory locations to check stock availability.</li>
          <li><strong>Discounts:</strong> Store-level discount titles, types, and combination rules to detect potential coupon stacking conflicts.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>3. Data We Store</h2>
        <p>
          We store merchant-configured settings (such as minimum-stock thresholds and gross-margin targets) and saved offer checks initiated by the merchant.
          We store authenticated Shopify session tokens in our secure database to communicate with Shopify on behalf of the merchant.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>4. GDPR & Data Deletion</h2>
        <p>
          When you uninstall PromoLint, our automated webhook listener removes your store sessions and access credentials.
          Upon receipt of a mandatory <code>shop/redact</code> GDPR compliance request, all associated offer checks and configuration settings are erased.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>5. Contact</h2>
        <p>If you have any questions about this Privacy Policy, please contact us at: <code>harishamouti@gmail.com</code>.</p>
      </section>
    </div>
  );
}
