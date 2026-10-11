export default function TermsOfService() {
  return (
    <div style={{ maxWidth: "800px", margin: "40px auto", padding: "0 20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: "#202223", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px" }}>PromoLint Terms of Service</h1>
      <p style={{ color: "#6d7175", marginBottom: "24px" }}>Last updated: October 2026</p>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>1. Acceptance of Terms</h2>
        <p>
          By installing and using PromoLint (&ldquo;the App&rdquo;), you agree to be bound by these Terms of Service.
          PromoLint is provided as an administrative quality assurance tool for Shopify merchants.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>2. Nature of Service & Estimates</h2>
        <p>
          PromoLint provides pre-launch simulations, gross profit estimates, and inventory warnings based on current Shopify catalog parameters.
          You acknowledge and agree that:
        </p>
        <ul style={{ paddingLeft: "20px", marginTop: "8px" }}>
          <li>
            <strong>Profit Calculations Are Estimates:</strong> Profit figures are estimated gross profit per unit based solely on variant price and unit cost.
            They exclude shipping, taxes, gateway fees, customer returns, packaging, and store overhead. Figures are not guaranteed net profits.
          </li>
          <li>
            <strong>Stock Counts Are Point-in-Time:</strong> Stock levels represent quantities observed at the moment the check is executed. PromoLint does not reserve inventory.
          </li>
          <li>
            <strong>Discount Warnings Are Advisories:</strong> Discount checks audit store combination settings. Actual customer checkout behavior may vary based on eligibility, cart contents, customer tags, and third-party app scripts.
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>3. Scope of Operation</h2>
        <p>
          Version 1 of PromoLint operates strictly as an administrative back-office tool. It does not publish discounts, modify storefront themes,
          inject customer tracking cookies, or intervene in checkout transactions.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>4. Contact</h2>
        <p>Support inquiries can be directed to: <code>harishamouti@gmail.com</code>.</p>
      </section>
    </div>
  );
}
