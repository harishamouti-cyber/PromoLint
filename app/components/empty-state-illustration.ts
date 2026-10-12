/**
 * PromoLint Self-Contained Empty State Illustration
 * 
 * Provides an inline SVG data URI representing a pre-launch promotion QA checklist
 * and discount audit tag. This eliminates external network/CDN dependencies,
 * avoids CSP blocking or broken image fallbacks in restricted/offline admin environments,
 * and renders sharply across all screen densities.
 */

const RAW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180" fill="none">
  <!-- Subtle circular background glow -->
  <circle cx="90" cy="90" r="80" fill="#F4F6F8" />
  <circle cx="90" cy="90" r="68" fill="#EBF5FA" stroke="#D2E8F7" stroke-width="1.5" stroke-dasharray="4 3" />
  
  <!-- Clipboard base -->
  <rect x="52" y="42" width="76" height="96" rx="8" fill="#FFFFFF" stroke="#8C9196" stroke-width="2" />
  
  <!-- Clipboard clip top -->
  <rect x="70" y="34" width="40" height="14" rx="4" fill="#E4E5E7" stroke="#6D7175" stroke-width="2" />
  <rect x="78" y="30" width="24" height="8" rx="2" fill="#5C6AC4" />

  <!-- Checklist rows on paper -->
  <!-- Row 1: Stock check -->
  <rect x="62" y="58" width="12" height="12" rx="3" fill="#E3F1DF" stroke="#008060" stroke-width="1.5" />
  <path d="M65 64l2.5 2.5 5-5" stroke="#008060" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  <rect x="79" y="62" width="38" height="4" rx="2" fill="#8C9196" />

  <!-- Row 2: Unit cost check -->
  <rect x="62" y="78" width="12" height="12" rx="3" fill="#E3F1DF" stroke="#008060" stroke-width="1.5" />
  <path d="M65 84l2.5 2.5 5-5" stroke="#008060" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  <rect x="79" y="82" width="42" height="4" rx="2" fill="#8C9196" />

  <!-- Row 3: Discount stacking check -->
  <rect x="62" y="98" width="12" height="12" rx="3" fill="#FFF4E5" stroke="#B98900" stroke-width="1.5" />
  <circle cx="68" cy="104" r="2" fill="#B98900" />
  <rect x="79" y="102" width="32" height="4" rx="2" fill="#BABEC3" />

  <!-- Row 4: Summary bar -->
  <rect x="62" y="118" width="56" height="4" rx="2" fill="#D2D5D8" />

  <!-- Floating Discount Tag / Badge in Foreground -->
  <path d="M112 110l26 26c1.5 1.5 4 1.5 5.5 0l14-14c1.5-1.5 1.5-4 0-5.5l-26-26a4 4 0 0 0-2.8-1.2H112a2 2 0 0 0-2 2v15.9a4 4 0 0 0 1.2 2.8z" fill="#5C6AC4" />
  <circle cx="118" cy="98" r="3" fill="#FFFFFF" />
  <!-- Tag % icon -->
  <path d="M136 122l8-8m-7 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm8 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" />
</svg>`;

export const PROMO_LINT_EMPTY_STATE_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(RAW_SVG)}`;
