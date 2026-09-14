# 22. Strict Value Invariants and Zero-Tolerance Data Fallbacks

## Context
Across enterprise ERP operations involving finances, sales invoices, purchases, warehouse inventory, and multi-tenant security, silent default substitutions (e.g. `order.currency || 'UZS'`, `dto.exchangeRate || 1`, `Number(item.quantity) || 1`, `Number(item.unitPrice) || 0`, `user.tenantId || 'SYSTEM'`) pose grave business and accounting risks:
- Missing or malformed currency codes silently falling back to `'UZS'` leads to corrupted ledgers, distorted multi-currency debt accounts, and invalid currency conversions.
- Foreign transactions (`currency !== 'UZS'`) defaulting `exchangeRate` to `1` causes catastrophic financial reporting errors (e.g., $1,000 recorded as 1,000 UZS instead of 12,800,000 UZS).
- Missing line item quantities or prices silently defaulting to `1` or `0` masks user input bugs and bypasses business invariants.
- Identity and tenant fallbacks risk leaking data or contaminating cross-tenant records.
- Display formatters (such as `formatCurrency`) silently swallowing `null` or `undefined` amounts or currencies masks data corruption at runtime.

## Decision
1. **Zero-Tolerance for Silent Missing Required Data**: Required business fields must never be replaced with silent fallback defaults (`||`, `??`). If a required field is `null`, `undefined`, empty, or out of range, the application must fail explicitly at the boundary with a structured validation error (`BadRequestException`).
2. **Strict Currency & Exchange Rate Invariant**:
   - Every transaction and financial document must explicitly supply a supported currency (`USD` or `UZS`) validated via `@IsValidCurrency()`.
   - Whenever `currency !== 'UZS'`, `exchangeRate` is strictly required and must be a positive number (`exchangeRate > 0`). It must never default to `1`.
3. **Item Quantity and Unit Price Invariants**:
   - All document line items must explicitly specify `quantity > 0` and `unitPrice >= 0`. Silent substitutions (`|| 1` or `|| 0`) are prohibited.
4. **Tenant Security Invariant**:
   - All multi-tenant API requests must resolve a verified, non-empty `tenantId` from authenticated credentials. Any request lacking a valid tenant context must immediately fail with `401 Unauthorized` / `403 Forbidden`.
5. **Display & Formatter Invariants**:
   - Formatter utilities (such as `formatCurrency`) strictly require valid, non-null, non-undefined, non-empty numeric amounts and currency strings, throwing explicit `TypeError` upon violations rather than rendering masked fallback values.
