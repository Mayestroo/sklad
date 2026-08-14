# 7. Product Catalog Cost Price Synchronization with Latest Posted Purchase

When a purchase receipt is posted, the base catalog item cost price (`Product.costPrice`) is automatically synchronized with the latest unit purchase price for future purchase suggestions and catalog references, while inventory batch valuation and COGS calculations strictly adhere to the distinct `ProductBatch` records created for each receipt.
