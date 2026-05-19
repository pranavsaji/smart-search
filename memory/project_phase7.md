---
name: project-phase7
description: Phase 7 Direct Commerce & Native Marketplace — CatalogAdapter, vendor portal, order lifecycle, returns, disputes, webhooks
metadata:
  type: project
---

Phase 7 implemented 2026-05-26. Direct Commerce: vendors sell natively inside iAM with no deeplinks.

**Why:** Replace Rainforest/Amazon proxy (isBookable: false) with first-party catalog (isBookable: true). Full checkout, stock management, and order tracking inside iAM.

**Key files built:**
- `lib/services/catalog/adapter.ts` — CatalogAdapter (id: `catalog_products`, type: `products`)
- `lib/vendor/portal.ts` — Vendor + product CRUD, atomic `decrementStock`
- `lib/orders/orders.ts` — Order lifecycle with SSE broadcast
- `lib/orders/returns.ts` — 14-day return window, Stripe refund on vendor approval
- `lib/orders/disputes.ts` — Dispute escalation queue
- `app/api/webhooks/vendor/order/route.ts` — HMAC-SHA256 signed webhook

**New VendorType:** `'catalog_product'` added to `lib/checkout/types.ts`

**New collections:** `vendors`, `products`, `vendor_orders`, `return_requests`, `disputes`

**Feature flags:** `VENDOR_PORTAL_ENABLED`, `VENDOR_WEBHOOK_SECRET`, `ADMIN_EMAILS`

**Test count:** 263/263 (was 157). 6 new suites with 106 new tests.

**How to apply:** Next phase (8) is Ecosystem SDK — public adapter API. CatalogAdapter pattern is the template for third-party adapters.
