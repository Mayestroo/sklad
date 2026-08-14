# 1. Orthogonal Status Axes for Purchases

We separate purchase document state into three independent axes: Document Lifecycle (`DRAFT`, `POSTED`, `CANCELLED`), Payment Lifecycle (`UNPAID`, `PARTIALLY_PAID`, `PAID`), and Return Lifecycle (`NONE`, `PARTIALLY_RETURNED`, `FULLY_RETURNED`). Combining these into a single linear status causes unresolvable collisions when a receipt is simultaneously posted, partially paid, and partially returned.
