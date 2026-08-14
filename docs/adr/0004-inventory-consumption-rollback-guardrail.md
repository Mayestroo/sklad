# 4. Inventory Consumption Rollback Guardrail

A posted purchase receipt cannot be unposted or cancelled if downstream operations depend on it. Specifically, unposting is rejected if any linked financial payments or returns exist, or if the current warehouse stock level for any line item has fallen below the receipt quantity due to sales dispatches or transfers.
