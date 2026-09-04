# 17. Unified Nomenclature Types and Accounting in Purchase Receipts

A purchase receipt supports a heterogeneous mix of nomenclature item types within a single document: finished goods (`PRODUCT`), raw materials and manufacturing inputs (`RAW_MATERIAL`), and operational services (`SERVICE`).

When posting a purchase receipt:
1. **Finished Goods (`PRODUCT`)**: Increments warehouse `StockLevel`, creates a `ProductBatch` for FIFO consumption, and posts an accounting debit to Account 2910 (Finished Goods / Merchandise).
2. **Raw Materials (`RAW_MATERIAL`)**: Increments warehouse `StockLevel`, creates a `ProductBatch` for production order consumption, and posts an accounting debit to Account 1010 (Materials & Raw Supplies).
3. **Services (`SERVICE`)**: Bypasses warehouse stock and batch tracking entirely. Debits operational expense Account 9420 (Administrative Expenses) or Account 9430 (Other Operating Expenses). Services are excluded from physical purchase returns.

Counterparty accounts payable (Credit 6010) and input VAT (Debit 4410) are consolidated for the full document.
