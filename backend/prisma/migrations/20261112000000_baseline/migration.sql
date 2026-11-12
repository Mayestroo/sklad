-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CashAccountType" AS ENUM ('USD_CASH', 'UZS_CASH', 'BANK');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('uz', 'ru');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('VIEW', 'CREATE', 'EDIT', 'DELETE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PRODUCT', 'RAW_MATERIAL', 'SERVICE', 'BUNDLE');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('piece', 'kg', 'liter', 'meter', 'box', 'pack');

-- CreateEnum
CREATE TYPE "InventoryDocType" AS ENUM ('INBOUND', 'OUTBOUND', 'STOCKTAKING', 'TRANSFER');

-- CreateEnum
CREATE TYPE "InventoryDocStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED', 'IN_TRANSIT', 'RECEIVED');

-- CreateEnum
CREATE TYPE "CounterpartyType" AS ENUM ('CUSTOMER', 'SUPPLIER', 'BOTH');

-- CreateEnum
CREATE TYPE "CounterpartySettlementSide" AS ENUM ('CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "SettlementAllocationTarget" AS ENUM ('SALES_INVOICE', 'SALES_ORDER', 'SALES_RETURN', 'PURCHASE_RECEIPT', 'PURCHASE_RETURN', 'ADDITIONAL_EXPENSE', 'SERVICE_ACT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('NEW', 'PENDING_APPROVAL', 'APPROVED', 'ACCEPTED', 'PROCESSING', 'SENT_TO_PRODUCTION', 'IN_PRODUCTION', 'PARTIALLY_READY', 'READY', 'AWAITING_PAYMENT', 'PAYMENT_CONFIRMED', 'READY_TO_SHIP', 'READY_FOR_SHIPMENT', 'PARTIALLY_SHIPPED', 'SHIPPED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentCondition" AS ENUM ('PREPAID_100', 'PARTIAL', 'CREDIT');

-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ManufacturingStatus" AS ENUM ('DRAFT', 'PLANNED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductionMaterialMovementType" AS ENUM ('ISSUE', 'RETURN');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'CLICK', 'PAYME');

-- CreateEnum
CREATE TYPE "DealStageSlug" AS ENUM ('LEAD', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "PurchaseDocStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchasePaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "PurchaseReturnStatus" AS ENUM ('NONE', 'PARTIALLY_RETURNED', 'FULLY_RETURNED');

-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('TRANSPORT', 'CUSTOMS', 'BROKER', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseAllocationMethod" AS ENUM ('BY_AMOUNT', 'BY_QUANTITY', 'BY_WEIGHT');

-- CreateEnum
CREATE TYPE "SalesDocStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesPaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "SalesReturnStatus" AS ENUM ('NONE', 'PARTIALLY_RETURNED', 'FULLY_RETURNED');

-- CreateEnum
CREATE TYPE "SalesReturnDocStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnDocStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceActType" AS ENUM ('PROVIDED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "ServiceActStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServicePaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "OpeningBalanceStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OpeningBalanceCategory" AS ENUM ('CASH', 'BANK', 'INVENTORY', 'CUSTOMER_DEBT', 'SUPPLIER_DEBT', 'CUSTOMER_ADVANCE', 'SUPPLIER_ADVANCE', 'FIXED_ASSET', 'OTHER_ASSET', 'OTHER_LIABILITY', 'EQUITY');

-- CreateEnum
CREATE TYPE "FixedAssetStatus" AS ENUM ('ACTIVE', 'IN_REPAIR', 'DISPOSED', 'WRITTEN_OFF');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "slug" TEXT NOT NULL,
    "default_language" "Language" NOT NULL DEFAULT 'uz',
    "status" "CompanyStatus" NOT NULL DEFAULT 'TRIAL',
    "trial_ends_at" TIMESTAMP(3),
    "settings" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_announcements" (
    "id" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "message" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "sender_name" TEXT NOT NULL,
    "is_from_admin" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'STARTER',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3) NOT NULL,
    "next_billing_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "payment_number" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CLICK',
    "amount" DECIMAL(15,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PAID',
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transaction_id" TEXT,
    "receipt_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "preferred_language" "Language" NOT NULL DEFAULT 'uz',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "name" JSONB NOT NULL,
    "slug" TEXT NOT NULL,
    "is_system_role" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "slug" TEXT NOT NULL,
    "description" JSONB,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "address" TEXT,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" JSONB NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_defect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "symbol" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "name" JSONB NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "code" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "category_id" TEXT,
    "type" "ProductType" NOT NULL DEFAULT 'PRODUCT',
    "name" JSONB NOT NULL,
    "description" JSONB,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "unit_of_measure" "UnitOfMeasure" NOT NULL DEFAULT 'piece',
    "cost_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cost_price_currency" TEXT NOT NULL DEFAULT 'UZS',
    "cost_price_exchange_rate" DECIMAL(15,4) NOT NULL DEFAULT 1,
    "sale_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sale_price_currency" TEXT,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 12,
    "min_stock_alert" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "weight" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" JSONB NOT NULL,
    "price_adjustment" DECIMAL(15,2) NOT NULL DEFAULT 0,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_bundle_items" (
    "id" TEXT NOT NULL,
    "bundle_product_id" TEXT NOT NULL,
    "component_product_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,

    CONSTRAINT "product_bundle_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "doc_number" TEXT NOT NULL,
    "doc_type" "InventoryDocType" NOT NULL,
    "doc_status" "InventoryDocStatus" NOT NULL DEFAULT 'DRAFT',
    "doc_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_document_items" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "total_price" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "inventory_document_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source_warehouse_id" TEXT NOT NULL,
    "target_warehouse_id" TEXT NOT NULL,
    "transfer_number" TEXT NOT NULL,
    "status" "InventoryDocStatus" NOT NULL DEFAULT 'DRAFT',
    "transfer_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shipped_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "comment" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparties" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "CounterpartyType" NOT NULL DEFAULT 'CUSTOMER',
    "name" TEXT NOT NULL,
    "inn" TEXT,
    "mfo" TEXT,
    "bank_account" TEXT,
    "bank_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "folder_id" TEXT,
    "price_list_id" TEXT,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "customer_debt" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "supplier_debt" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "debt_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counterparties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparty_balances" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "counterparty_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "customer_debt" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "supplier_debt" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counterparty_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparty_settlement_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "counterparty_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "side" "CounterpartySettlementSide" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "entry_type" TEXT NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_doc_type" TEXT NOT NULL,
    "source_doc_id" TEXT NOT NULL,
    "source_line_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "reverses_entry_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "counterparty_settlement_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_allocations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "counterparty_id" TEXT NOT NULL,
    "finance_transaction_id" TEXT NOT NULL,
    "side" "CounterpartySettlementSide" NOT NULL,
    "currency" TEXT NOT NULL,
    "target_type" "SettlementAllocationTarget" NOT NULL,
    "target_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "reverses_allocation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparty_folders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT DEFAULT '#3b82f6',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counterparty_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "counterparty_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'NEW',
    "payment_condition" "PaymentCondition" NOT NULL DEFAULT 'PREPAID_100',
    "required_payment_percent" DECIMAL(5,2),
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_date" TIMESTAMP(3),
    "delivery_address" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "exchange_rate" DECIMAL(15,4) NOT NULL DEFAULT 1,
    "subtotal_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "additional_charge_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "additional_charge_vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 12,
    "additional_charge_vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "comment" TEXT,
    "price_list_id" TEXT,
    "warehouse_id" TEXT,
    "assigned_seller_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(15,2) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "reserved_qty" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "ready_qty" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "shipped_qty" DECIMAL(15,3) NOT NULL DEFAULT 0,

    CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sales_order_id" TEXT NOT NULL,
    "sales_order_item_id" TEXT,
    "product_id" TEXT NOT NULL,
    "required_qty" DECIMAL(15,3) NOT NULL,
    "ready_qty" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'PENDING',
    "due_date" TIMESTAMP(3),
    "assigned_to_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_recipes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "output_quantity" DECIMAL(15,3) NOT NULL,
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_recipe_items" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,

    CONSTRAINT "production_recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "doc_number" TEXT NOT NULL,
    "doc_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "product_id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "responsible_id" TEXT,
    "planned_quantity" DECIMAL(15,3) NOT NULL,
    "produced_quantity" DECIMAL(15,3),
    "status" "ManufacturingStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "planned_material_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "actual_material_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_material_lines" (
    "id" TEXT NOT NULL,
    "production_document_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "planned_quantity" DECIMAL(15,3) NOT NULL,
    "actual_quantity" DECIMAL(15,3),
    "unit_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,

    CONSTRAINT "production_material_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_material_batches" (
    "id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit_cost" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_material_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_material_movements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "production_document_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "movement_type" "ProductionMaterialMovementType" NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit_cost" DECIMAL(15,2) NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_material_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "counterparty_id" TEXT NOT NULL,
    "sales_order_id" TEXT,
    "invoice_number" TEXT NOT NULL,
    "status" "SalesDocStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_status" "SalesPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "return_status" "SalesReturnStatus" NOT NULL DEFAULT 'NONE',
    "invoice_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "exchange_rate" DECIMAL(15,4) NOT NULL DEFAULT 1,
    "contract_number" TEXT,
    "contract_date" TIMESTAMP(3),
    "payment_terms" TEXT,
    "comment" TEXT,
    "price_list_id" TEXT,
    "subtotal_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "additional_charge_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "additional_charge_vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 12,
    "additional_charge_vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_cogs" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "gross_profit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "posted_by_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(15,2) NOT NULL,
    "unit_cogs" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "line_cogs" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "line_gross_profit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_below_cost" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sales_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_returns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoice_id" TEXT,
    "counterparty_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "defect_warehouse_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "reason" TEXT,
    "status" "SalesReturnDocStatus" NOT NULL DEFAULT 'DRAFT',
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_cogs" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(15,2) NOT NULL,
    "unit_cogs" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "line_cogs" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_defective" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lists" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_prices" (
    "id" TEXT NOT NULL,
    "price_list_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "price" DECIMAL(15,2) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "counterparty_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "status" "InventoryDocStatus" NOT NULL DEFAULT 'DRAFT',
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "total_price" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "counterparty_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "DealStageSlug" NOT NULL DEFAULT 'LEAD',
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "assigned_user_id" TEXT,
    "expected_close" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "counterparty_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "order_id" TEXT,
    "cash_account_id" TEXT NOT NULL,
    "payment_number" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "amount" DECIMAL(15,2) NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "type" "AccountType" NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entry_number" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "source_doc_type" TEXT,
    "source_doc_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "debit_account_id" TEXT NOT NULL,
    "credit_account_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "description" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_accounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "account_type" "CashAccountType" NOT NULL,
    "name" JSONB NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "direction" "TransactionDirection" NOT NULL,
    "name" JSONB NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "transaction_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "account_id" TEXT NOT NULL,
    "transfer_to_id" TEXT,
    "counterparty_id" TEXT,
    "settlement_side" "CounterpartySettlementSide",
    "transaction_type_id" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "transfer_to_amount" DECIMAL(15,2),
    "transfer_exchange_rate" DECIMAL(15,6),
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "exchange_rate" DECIMAL(15,4) NOT NULL,
    "transaction_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "doc_number" TEXT,
    "source_doc_type" TEXT,
    "source_doc_id" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'POSTED',
    "responsible_user_id" TEXT,
    "cancelled_by_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "created_by_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "doc_number" TEXT NOT NULL,
    "doc_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "counterparty_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "exchange_rate" DECIMAL(15,4) NOT NULL DEFAULT 1,
    "contract_number" TEXT,
    "contract_date" TIMESTAMP(3),
    "comment" TEXT,
    "status" "PurchaseDocStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_status" "PurchasePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "return_status" "PurchaseReturnStatus" NOT NULL DEFAULT 'NONE',
    "subtotal_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "additional_expenses_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "gtd_number" TEXT,
    "gtd_date" TIMESTAMP(3),
    "customs_post" TEXT,
    "created_by_id" TEXT,
    "posted_by_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipt_items" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "returned_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "weight" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(15,2) NOT NULL,
    "allocated_expenses" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "landed_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_expenses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "expense_type" "ExpenseType" NOT NULL,
    "supplier_id" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "allocation_method" "ExpenseAllocationMethod" NOT NULL DEFAULT 'BY_AMOUNT',
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_returns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receipt_id" TEXT,
    "counterparty_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "act_number" TEXT,
    "reason" TEXT,
    "comment" TEXT,
    "status" "ReturnDocStatus" NOT NULL DEFAULT 'DRAFT',
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_batches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "receipt_id" TEXT,
    "production_document_id" TEXT,
    "batch_number" TEXT NOT NULL,
    "initial_qty" DECIMAL(15,3) NOT NULL,
    "remaining_qty" DECIMAL(15,3) NOT NULL,
    "purchase_price" DECIMAL(15,2) NOT NULL,
    "landed_cost" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "additional_expenses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "doc_number" TEXT NOT NULL,
    "doc_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PurchaseDocStatus" NOT NULL DEFAULT 'DRAFT',
    "expense_type" "ExpenseType" NOT NULL,
    "counterparty_id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "exchange_rate" DECIMAL(15,4) NOT NULL DEFAULT 1,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "allocation_method" "ExpenseAllocationMethod" NOT NULL DEFAULT 'BY_AMOUNT',
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "cash_account_id" TEXT,
    "comment" TEXT,
    "created_by_id" TEXT,
    "posted_by_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "additional_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "additional_expense_items" (
    "id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "receipt_item_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "initial_landed_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "allocated_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "new_landed_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sold_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "remaining_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "cogs_adjustment" DECIMAL(15,2) NOT NULL DEFAULT 0,

    CONSTRAINT "additional_expense_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_consumptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sales_invoice_item_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit_cost" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_acts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "act_number" TEXT NOT NULL,
    "type" "ServiceActType" NOT NULL,
    "counterparty_id" TEXT NOT NULL,
    "status" "ServiceActStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_status" "ServicePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "act_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "exchange_rate" DECIMAL(12,4) NOT NULL DEFAULT 1.0,
    "external_number" TEXT,
    "external_date" TIMESTAMP(3),
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_acts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_act_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "act_id" TEXT NOT NULL,
    "product_id" TEXT,
    "service_name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1.0,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "service_act_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balance_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "doc_number" TEXT NOT NULL,
    "opening_date" TIMESTAMP(3) NOT NULL,
    "status" "OpeningBalanceStatus" NOT NULL DEFAULT 'DRAFT',
    "total_assets" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_liabilities" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_equity" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "balance_difference" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_id" TEXT,
    "approved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "approved_at" TIMESTAMP(3),

    CONSTRAINT "opening_balance_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balance_lines" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "category" "OpeningBalanceCategory" NOT NULL,
    "account_id" TEXT,
    "product_id" TEXT,
    "warehouse_id" TEXT,
    "counterparty_id" TEXT,
    "fixed_asset_id" TEXT,
    "quantity" DECIMAL(15,3),
    "unit_cost" DECIMAL(15,2),
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "accumulated_depreciation" DECIMAL(15,2) DEFAULT 0,
    "net_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "exchange_rate" DECIMAL(12,4) NOT NULL DEFAULT 1.0,
    "batch_number" TEXT,
    "contract_number" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opening_balance_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inventory_number" TEXT NOT NULL,
    "asset_type" TEXT NOT NULL DEFAULT 'EQUIPMENT',
    "acquisition_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initial_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "accumulated_depreciation" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net_book_value" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "useful_life_months" INTEGER NOT NULL DEFAULT 60,
    "depreciation_method" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "custodian_user_id" TEXT,
    "status" "FixedAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balance_import_sessions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_balance_import_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balance_import_errors" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sheet_name" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "field_name" TEXT,
    "invalid_value" TEXT,
    "error_message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_balance_import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_idx" ON "support_tickets"("tenant_id");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_idx" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "subscription_payments_tenant_id_idx" ON "subscription_payments"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_tenant_id_payment_number_key" ON "subscription_payments"("tenant_id", "payment_number");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "roles_tenant_id_idx" ON "roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_slug_key" ON "roles"("tenant_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_slug_key" ON "permissions"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_module_action_key" ON "permissions"("module", "action");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "branches_tenant_id_idx" ON "branches"("tenant_id");

-- CreateIndex
CREATE INDEX "warehouses_tenant_id_idx" ON "warehouses"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "currencies_code_key" ON "currencies"("code");

-- CreateIndex
CREATE INDEX "tax_rates_tenant_id_idx" ON "tax_rates"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_entity_type_entity_id_idx" ON "audit_logs"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "categories_tenant_id_idx" ON "categories"("tenant_id");

-- CreateIndex
CREATE INDEX "products_tenant_id_idx" ON "products"("tenant_id");

-- CreateIndex
CREATE INDEX "products_tenant_id_barcode_idx" ON "products"("tenant_id", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "product_variants_tenant_id_idx" ON "product_variants"("tenant_id");

-- CreateIndex
CREATE INDEX "stock_levels_tenant_id_idx" ON "stock_levels"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_levels_tenant_id_warehouse_id_product_id_key" ON "stock_levels"("tenant_id", "warehouse_id", "product_id");

-- CreateIndex
CREATE INDEX "inventory_documents_tenant_id_idx" ON "inventory_documents"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_documents_tenant_id_doc_number_key" ON "inventory_documents"("tenant_id", "doc_number");

-- CreateIndex
CREATE INDEX "stock_transfers_tenant_id_idx" ON "stock_transfers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_tenant_id_transfer_number_key" ON "stock_transfers"("tenant_id", "transfer_number");

-- CreateIndex
CREATE INDEX "counterparties_tenant_id_idx" ON "counterparties"("tenant_id");

-- CreateIndex
CREATE INDEX "counterparties_tenant_id_folder_id_idx" ON "counterparties"("tenant_id", "folder_id");

-- CreateIndex
CREATE INDEX "counterparties_tenant_id_inn_idx" ON "counterparties"("tenant_id", "inn");

-- CreateIndex
CREATE INDEX "counterparty_balances_tenant_id_currency_idx" ON "counterparty_balances"("tenant_id", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "counterparty_balances_counterparty_id_currency_key" ON "counterparty_balances"("counterparty_id", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "counterparty_settlement_entries_idempotency_key_key" ON "counterparty_settlement_entries"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "counterparty_settlement_entries_reverses_entry_id_key" ON "counterparty_settlement_entries"("reverses_entry_id");

-- CreateIndex
CREATE INDEX "counterparty_settlement_entries_tenant_id_counterparty_id_c_idx" ON "counterparty_settlement_entries"("tenant_id", "counterparty_id", "currency", "created_at");

-- CreateIndex
CREATE INDEX "counterparty_settlement_entries_tenant_id_source_doc_type_s_idx" ON "counterparty_settlement_entries"("tenant_id", "source_doc_type", "source_doc_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_allocations_idempotency_key_key" ON "settlement_allocations"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_allocations_reverses_allocation_id_key" ON "settlement_allocations"("reverses_allocation_id");

-- CreateIndex
CREATE INDEX "settlement_allocations_tenant_id_counterparty_id_currency_s_idx" ON "settlement_allocations"("tenant_id", "counterparty_id", "currency", "side", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "settlement_allocations_finance_transaction_id_idx" ON "settlement_allocations"("finance_transaction_id");

-- CreateIndex
CREATE INDEX "counterparty_folders_tenant_id_idx" ON "counterparty_folders"("tenant_id");

-- CreateIndex
CREATE INDEX "sales_orders_tenant_id_idx" ON "sales_orders"("tenant_id");

-- CreateIndex
CREATE INDEX "sales_orders_tenant_id_status_idx" ON "sales_orders"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sales_orders_tenant_id_counterparty_id_idx" ON "sales_orders"("tenant_id", "counterparty_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_tenant_id_order_number_key" ON "sales_orders"("tenant_id", "order_number");

-- CreateIndex
CREATE INDEX "stock_reservations_tenant_id_idx" ON "stock_reservations"("tenant_id");

-- CreateIndex
CREATE INDEX "stock_reservations_tenant_id_product_id_warehouse_id_idx" ON "stock_reservations"("tenant_id", "product_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "stock_reservations_order_id_idx" ON "stock_reservations"("order_id");

-- CreateIndex
CREATE INDEX "production_orders_tenant_id_idx" ON "production_orders"("tenant_id");

-- CreateIndex
CREATE INDEX "production_orders_tenant_id_sales_order_id_idx" ON "production_orders"("tenant_id", "sales_order_id");

-- CreateIndex
CREATE INDEX "production_recipes_tenant_id_product_id_is_active_idx" ON "production_recipes"("tenant_id", "product_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "production_recipe_items_recipe_id_product_id_key" ON "production_recipe_items"("recipe_id", "product_id");

-- CreateIndex
CREATE INDEX "production_documents_tenant_id_status_doc_date_idx" ON "production_documents"("tenant_id", "status", "doc_date");

-- CreateIndex
CREATE INDEX "production_documents_tenant_id_product_id_idx" ON "production_documents"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_documents_tenant_id_doc_number_key" ON "production_documents"("tenant_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "production_material_lines_production_document_id_product_id_key" ON "production_material_lines"("production_document_id", "product_id");

-- CreateIndex
CREATE INDEX "production_material_batches_batch_id_idx" ON "production_material_batches"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_material_batches_line_id_batch_id_key" ON "production_material_batches"("line_id", "batch_id");

-- CreateIndex
CREATE INDEX "production_material_movements_tenant_id_production_document_idx" ON "production_material_movements"("tenant_id", "production_document_id", "created_at");

-- CreateIndex
CREATE INDEX "production_material_movements_batch_id_idx" ON "production_material_movements"("batch_id");

-- CreateIndex
CREATE INDEX "sales_invoices_tenant_id_idx" ON "sales_invoices"("tenant_id");

-- CreateIndex
CREATE INDEX "sales_invoices_tenant_id_counterparty_id_idx" ON "sales_invoices"("tenant_id", "counterparty_id");

-- CreateIndex
CREATE INDEX "sales_invoices_tenant_id_status_idx" ON "sales_invoices"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_tenant_id_invoice_number_key" ON "sales_invoices"("tenant_id", "invoice_number");

-- CreateIndex
CREATE INDEX "sales_returns_tenant_id_idx" ON "sales_returns"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_returns_tenant_id_return_number_key" ON "sales_returns"("tenant_id", "return_number");

-- CreateIndex
CREATE INDEX "price_lists_tenant_id_idx" ON "price_lists"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_prices_price_list_id_product_id_key" ON "product_prices"("price_list_id", "product_id");

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_idx" ON "purchase_orders"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_order_number_key" ON "purchase_orders"("tenant_id", "order_number");

-- CreateIndex
CREATE INDEX "deals_tenant_id_idx" ON "deals"("tenant_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_idx" ON "payments"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_payment_number_key" ON "payments"("tenant_id", "payment_number");

-- CreateIndex
CREATE INDEX "accounts_tenant_id_idx" ON "accounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenant_id_code_key" ON "accounts"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "journal_entries_tenant_id_idx" ON "journal_entries"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenant_id_entry_number_key" ON "journal_entries"("tenant_id", "entry_number");

-- CreateIndex
CREATE INDEX "cash_accounts_tenant_id_idx" ON "cash_accounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_accounts_tenant_id_account_type_key" ON "cash_accounts"("tenant_id", "account_type");

-- CreateIndex
CREATE INDEX "transaction_types_tenant_id_idx" ON "transaction_types"("tenant_id");

-- CreateIndex
CREATE INDEX "finance_transactions_tenant_id_idx" ON "finance_transactions"("tenant_id");

-- CreateIndex
CREATE INDEX "finance_transactions_tenant_id_direction_idx" ON "finance_transactions"("tenant_id", "direction");

-- CreateIndex
CREATE INDEX "finance_transactions_tenant_id_transaction_date_idx" ON "finance_transactions"("tenant_id", "transaction_date");

-- CreateIndex
CREATE INDEX "purchase_receipts_tenant_id_idx" ON "purchase_receipts"("tenant_id");

-- CreateIndex
CREATE INDEX "purchase_receipts_tenant_id_counterparty_id_idx" ON "purchase_receipts"("tenant_id", "counterparty_id");

-- CreateIndex
CREATE INDEX "purchase_receipts_tenant_id_status_idx" ON "purchase_receipts"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_tenant_id_doc_number_key" ON "purchase_receipts"("tenant_id", "doc_number");

-- CreateIndex
CREATE INDEX "purchase_expenses_tenant_id_idx" ON "purchase_expenses"("tenant_id");

-- CreateIndex
CREATE INDEX "purchase_returns_tenant_id_idx" ON "purchase_returns"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_returns_tenant_id_return_number_key" ON "purchase_returns"("tenant_id", "return_number");

-- CreateIndex
CREATE UNIQUE INDEX "product_batches_production_document_id_key" ON "product_batches"("production_document_id");

-- CreateIndex
CREATE INDEX "product_batches_tenant_id_idx" ON "product_batches"("tenant_id");

-- CreateIndex
CREATE INDEX "product_batches_tenant_id_warehouse_id_product_id_idx" ON "product_batches"("tenant_id", "warehouse_id", "product_id");

-- CreateIndex
CREATE INDEX "additional_expenses_tenant_id_idx" ON "additional_expenses"("tenant_id");

-- CreateIndex
CREATE INDEX "additional_expenses_tenant_id_status_idx" ON "additional_expenses"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "additional_expenses_receipt_id_idx" ON "additional_expenses"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "additional_expenses_tenant_id_doc_number_key" ON "additional_expenses"("tenant_id", "doc_number");

-- CreateIndex
CREATE INDEX "batch_consumptions_tenant_id_idx" ON "batch_consumptions"("tenant_id");

-- CreateIndex
CREATE INDEX "batch_consumptions_batch_id_idx" ON "batch_consumptions"("batch_id");

-- CreateIndex
CREATE INDEX "batch_consumptions_sales_invoice_item_id_idx" ON "batch_consumptions"("sales_invoice_item_id");

-- CreateIndex
CREATE INDEX "service_acts_tenant_id_type_idx" ON "service_acts"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "service_acts_tenant_id_status_idx" ON "service_acts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "service_acts_tenant_id_counterparty_id_idx" ON "service_acts"("tenant_id", "counterparty_id");

-- CreateIndex
CREATE INDEX "service_acts_tenant_id_act_date_idx" ON "service_acts"("tenant_id", "act_date");

-- CreateIndex
CREATE UNIQUE INDEX "service_acts_tenant_id_act_number_key" ON "service_acts"("tenant_id", "act_number");

-- CreateIndex
CREATE INDEX "service_act_items_tenant_id_act_id_idx" ON "service_act_items"("tenant_id", "act_id");

-- CreateIndex
CREATE INDEX "opening_balance_documents_tenant_id_status_idx" ON "opening_balance_documents"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "opening_balance_documents_tenant_id_opening_date_idx" ON "opening_balance_documents"("tenant_id", "opening_date");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balance_documents_tenant_id_doc_number_key" ON "opening_balance_documents"("tenant_id", "doc_number");

-- CreateIndex
CREATE INDEX "opening_balance_lines_tenant_id_document_id_idx" ON "opening_balance_lines"("tenant_id", "document_id");

-- CreateIndex
CREATE INDEX "opening_balance_lines_tenant_id_category_idx" ON "opening_balance_lines"("tenant_id", "category");

-- CreateIndex
CREATE INDEX "fixed_assets_tenant_id_status_idx" ON "fixed_assets"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_tenant_id_inventory_number_key" ON "fixed_assets"("tenant_id", "inventory_number");

-- CreateIndex
CREATE INDEX "opening_balance_import_sessions_tenant_id_document_id_idx" ON "opening_balance_import_sessions"("tenant_id", "document_id");

-- CreateIndex
CREATE INDEX "opening_balance_import_errors_tenant_id_session_id_idx" ON "opening_balance_import_errors"("tenant_id", "session_id");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bundle_items" ADD CONSTRAINT "product_bundle_items_bundle_product_id_fkey" FOREIGN KEY ("bundle_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bundle_items" ADD CONSTRAINT "product_bundle_items_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_documents" ADD CONSTRAINT "inventory_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_documents" ADD CONSTRAINT "inventory_documents_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_documents" ADD CONSTRAINT "inventory_documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_document_items" ADD CONSTRAINT "inventory_document_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "inventory_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_document_items" ADD CONSTRAINT "inventory_document_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_warehouse_id_fkey" FOREIGN KEY ("source_warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_target_warehouse_id_fkey" FOREIGN KEY ("target_warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "counterparty_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_balances" ADD CONSTRAINT "counterparty_balances_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_settlement_entries" ADD CONSTRAINT "counterparty_settlement_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_settlement_entries" ADD CONSTRAINT "counterparty_settlement_entries_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_settlement_entries" ADD CONSTRAINT "counterparty_settlement_entries_reverses_entry_id_fkey" FOREIGN KEY ("reverses_entry_id") REFERENCES "counterparty_settlement_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_finance_transaction_id_fkey" FOREIGN KEY ("finance_transaction_id") REFERENCES "finance_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_reverses_allocation_id_fkey" FOREIGN KEY ("reverses_allocation_id") REFERENCES "settlement_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_folders" ADD CONSTRAINT "counterparty_folders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_assigned_seller_id_fkey" FOREIGN KEY ("assigned_seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_sales_order_item_id_fkey" FOREIGN KEY ("sales_order_item_id") REFERENCES "sales_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_recipes" ADD CONSTRAINT "production_recipes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_recipes" ADD CONSTRAINT "production_recipes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_recipes" ADD CONSTRAINT "production_recipes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_recipe_items" ADD CONSTRAINT "production_recipe_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "production_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_recipe_items" ADD CONSTRAINT "production_recipe_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_documents" ADD CONSTRAINT "production_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_documents" ADD CONSTRAINT "production_documents_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_documents" ADD CONSTRAINT "production_documents_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "production_recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_documents" ADD CONSTRAINT "production_documents_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_documents" ADD CONSTRAINT "production_documents_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_documents" ADD CONSTRAINT "production_documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_lines" ADD CONSTRAINT "production_material_lines_production_document_id_fkey" FOREIGN KEY ("production_document_id") REFERENCES "production_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_lines" ADD CONSTRAINT "production_material_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_batches" ADD CONSTRAINT "production_material_batches_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "production_material_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_batches" ADD CONSTRAINT "production_material_batches_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "product_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_movements" ADD CONSTRAINT "production_material_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_movements" ADD CONSTRAINT "production_material_movements_production_document_id_fkey" FOREIGN KEY ("production_document_id") REFERENCES "production_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_movements" ADD CONSTRAINT "production_material_movements_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "production_material_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_movements" ADD CONSTRAINT "production_material_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "product_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_movements" ADD CONSTRAINT "production_material_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_defect_warehouse_id_fkey" FOREIGN KEY ("defect_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_types" ADD CONSTRAINT "transaction_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_transfer_to_id_fkey" FOREIGN KEY ("transfer_to_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_transaction_type_id_fkey" FOREIGN KEY ("transaction_type_id") REFERENCES "transaction_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_expenses" ADD CONSTRAINT "purchase_expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_expenses" ADD CONSTRAINT "purchase_expenses_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_expenses" ADD CONSTRAINT "purchase_expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_production_document_id_fkey" FOREIGN KEY ("production_document_id") REFERENCES "production_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_expenses" ADD CONSTRAINT "additional_expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_expenses" ADD CONSTRAINT "additional_expenses_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_expenses" ADD CONSTRAINT "additional_expenses_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_expenses" ADD CONSTRAINT "additional_expenses_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_expenses" ADD CONSTRAINT "additional_expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_expenses" ADD CONSTRAINT "additional_expenses_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_expense_items" ADD CONSTRAINT "additional_expense_items_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "additional_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_expense_items" ADD CONSTRAINT "additional_expense_items_receipt_item_id_fkey" FOREIGN KEY ("receipt_item_id") REFERENCES "purchase_receipt_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_expense_items" ADD CONSTRAINT "additional_expense_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_consumptions" ADD CONSTRAINT "batch_consumptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_consumptions" ADD CONSTRAINT "batch_consumptions_sales_invoice_item_id_fkey" FOREIGN KEY ("sales_invoice_item_id") REFERENCES "sales_invoice_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_consumptions" ADD CONSTRAINT "batch_consumptions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "product_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_acts" ADD CONSTRAINT "service_acts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_acts" ADD CONSTRAINT "service_acts_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_act_items" ADD CONSTRAINT "service_act_items_act_id_fkey" FOREIGN KEY ("act_id") REFERENCES "service_acts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_act_items" ADD CONSTRAINT "service_act_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_documents" ADD CONSTRAINT "opening_balance_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_documents" ADD CONSTRAINT "opening_balance_documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_documents" ADD CONSTRAINT "opening_balance_documents_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_lines" ADD CONSTRAINT "opening_balance_lines_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "opening_balance_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_lines" ADD CONSTRAINT "opening_balance_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_lines" ADD CONSTRAINT "opening_balance_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_lines" ADD CONSTRAINT "opening_balance_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_lines" ADD CONSTRAINT "opening_balance_lines_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_lines" ADD CONSTRAINT "opening_balance_lines_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_lines" ADD CONSTRAINT "opening_balance_lines_fixed_asset_id_fkey" FOREIGN KEY ("fixed_asset_id") REFERENCES "fixed_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_custodian_user_id_fkey" FOREIGN KEY ("custodian_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_import_sessions" ADD CONSTRAINT "opening_balance_import_sessions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "opening_balance_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_import_sessions" ADD CONSTRAINT "opening_balance_import_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_import_errors" ADD CONSTRAINT "opening_balance_import_errors_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "opening_balance_import_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Database-level invariants that schema.prisma cannot express.
-- Keep in sync with the services that rely on them (ADR 0022 / 0023).
-- ---------------------------------------------------------------------------

-- Currency / amount CHECK constraints
ALTER TABLE "products"
  ADD CONSTRAINT "products_sale_price_currency_check"
  CHECK ("sale_price_currency" IS NULL OR "sale_price_currency" IN ('USD', 'UZS'));
ALTER TABLE "products"
  ADD CONSTRAINT "products_cost_price_currency_check"
  CHECK ("cost_price_currency" IN ('USD', 'UZS'));
ALTER TABLE "products"
  ADD CONSTRAINT "products_cost_price_exchange_rate_check"
  CHECK ("cost_price_exchange_rate" > 0);
ALTER TABLE "counterparty_settlement_entries"
  ADD CONSTRAINT "counterparty_settlement_entries_currency_check"
  CHECK ("currency" IN ('USD', 'UZS'));
ALTER TABLE "counterparty_settlement_entries"
  ADD CONSTRAINT "counterparty_settlement_entries_amount_check"
  CHECK ("amount" <> 0);
ALTER TABLE "settlement_allocations"
  ADD CONSTRAINT "settlement_allocations_currency_check"
  CHECK ("currency" IN ('USD', 'UZS'));
ALTER TABLE "settlement_allocations"
  ADD CONSTRAINT "settlement_allocations_amount_check"
  CHECK ("amount" <> 0);

-- Cash-account currency isolation
ALTER TABLE "cash_accounts"
  ADD CONSTRAINT "cash_accounts_type_currency_check"
  CHECK (
    ("account_type" = 'UZS_CASH' AND "currency" = 'UZS') OR
    ("account_type" = 'USD_CASH' AND "currency" = 'USD') OR
    ("account_type" = 'BANK' AND "currency" IN ('UZS', 'USD'))
  );
ALTER TABLE "finance_transactions"
  ADD CONSTRAINT "finance_transactions_exchange_rate_check"
  CHECK (
    "exchange_rate" > 0 AND
    ("currency" <> 'UZS' OR "exchange_rate" = 1)
  );

CREATE OR REPLACE FUNCTION enforce_finance_transaction_cash_account_currency()
RETURNS TRIGGER AS $$
DECLARE
  source_tenant_id TEXT;
  source_currency TEXT;
  source_is_active BOOLEAN;
  linked_cash_account_id TEXT;
  target_tenant_id TEXT;
  target_currency TEXT;
  target_is_active BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
       AND NEW.direction IS NOT DISTINCT FROM OLD.direction
       AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id
       AND NEW.transfer_to_id IS NOT DISTINCT FROM OLD.transfer_to_id
       AND NEW.amount IS NOT DISTINCT FROM OLD.amount
       AND NEW.transfer_to_amount IS NOT DISTINCT FROM OLD.transfer_to_amount
       AND NEW.transfer_exchange_rate IS NOT DISTINCT FROM OLD.transfer_exchange_rate
       AND NEW.exchange_rate IS NOT DISTINCT FROM OLD.exchange_rate
       AND NEW.currency IS NOT DISTINCT FROM OLD.currency
       AND NEW.source_doc_type IS NOT DISTINCT FROM OLD.source_doc_type
       AND NEW.source_doc_id IS NOT DISTINCT FROM OLD.source_doc_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.account_id IS NULL THEN
    RAISE EXCEPTION 'A finance transaction must belong to a cash or bank account';
  END IF;

  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'A finance transaction amount must be positive';
  END IF;

  SELECT "tenant_id", "currency", "is_active"
  INTO source_tenant_id, source_currency, source_is_active
  FROM "cash_accounts"
  WHERE "id" = NEW.account_id;

  IF NOT FOUND OR source_tenant_id <> NEW.tenant_id OR NOT source_is_active THEN
    RAISE EXCEPTION 'Finance transaction source account must be active and belong to the same tenant';
  END IF;

  IF source_currency <> NEW.currency THEN
    RAISE EXCEPTION 'Finance transaction currency % does not match source account currency %', NEW.currency, source_currency;
  END IF;
  IF NEW.exchange_rate IS NULL OR NEW.exchange_rate <= 0
     OR (NEW.currency = 'UZS' AND NEW.exchange_rate <> 1) THEN
    RAISE EXCEPTION 'Finance transaction exchange rate is invalid for currency %', NEW.currency;
  END IF;

  IF NEW.source_doc_type = 'PAYMENT' THEN
    SELECT "cash_account_id" INTO linked_cash_account_id
    FROM "payments"
    WHERE "id" = NEW.source_doc_id AND "tenant_id" = NEW.tenant_id;
    IF NOT FOUND OR linked_cash_account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'Finance transaction must use the cash/bank account recorded on its payment';
    END IF;
  ELSIF NEW.source_doc_type = 'AdditionalExpense' THEN
    SELECT "cash_account_id" INTO linked_cash_account_id
    FROM "additional_expenses"
    WHERE "id" = NEW.source_doc_id AND "tenant_id" = NEW.tenant_id;
    IF FOUND AND linked_cash_account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'Finance transaction must use the account recorded on its additional expense';
    END IF;
  ELSIF NEW.source_doc_type = 'OpeningBalanceDocument' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "opening_balance_lines" AS line
      WHERE line."document_id" = NEW.source_doc_id
        AND line."tenant_id" = NEW.tenant_id
        AND line."account_id" = NEW.account_id
        AND line."currency" = NEW.currency
        AND line."amount" = NEW.amount
    ) THEN
      RAISE EXCEPTION 'Finance transaction must match an opening balance line for the same account and currency';
    END IF;
  END IF;

  IF NEW.direction = 'TRANSFER' THEN
    IF NEW.transfer_to_id IS NULL OR NEW.transfer_to_amount IS NULL OR NEW.transfer_to_amount <= 0 THEN
      RAISE EXCEPTION 'A transfer requires a destination account and positive destination amount';
    END IF;
    IF NEW.transfer_to_id = NEW.account_id THEN
      RAISE EXCEPTION 'A transfer source and destination account must be different';
    END IF;

    SELECT "tenant_id", "currency", "is_active"
    INTO target_tenant_id, target_currency, target_is_active
    FROM "cash_accounts"
    WHERE "id" = NEW.transfer_to_id;

    IF NOT FOUND OR target_tenant_id <> NEW.tenant_id OR NOT target_is_active THEN
      RAISE EXCEPTION 'Finance transaction destination account must be active and belong to the same tenant';
    END IF;

    IF source_currency = target_currency AND NEW.transfer_to_amount <> NEW.amount THEN
      RAISE EXCEPTION 'Same-currency transfers must debit and credit the same amount';
    END IF;
    IF source_currency = target_currency AND NEW.transfer_exchange_rate IS NOT NULL THEN
      RAISE EXCEPTION 'Same-currency transfers must not carry an exchange rate';
    END IF;
    IF source_currency <> target_currency THEN
      IF NEW.transfer_exchange_rate IS NULL OR NEW.transfer_exchange_rate <= 0 THEN
        RAISE EXCEPTION 'Cross-currency transfers require a positive USD/UZS exchange rate';
      END IF;
      IF source_currency = 'USD' AND target_currency = 'UZS'
         AND NEW.exchange_rate <> NEW.transfer_exchange_rate THEN
        RAISE EXCEPTION 'A USD-to-UZS transfer must use the transfer quote as its finance transaction rate';
      END IF;
      IF source_currency = 'USD' AND target_currency = 'UZS'
         AND ABS(ROUND(NEW.amount * NEW.transfer_exchange_rate, 2) - NEW.transfer_to_amount) > 0.01 THEN
        RAISE EXCEPTION 'USD-to-UZS transfer amount does not match the recorded exchange rate';
      END IF;
      IF source_currency = 'UZS' AND target_currency = 'USD'
         AND ABS(ROUND(NEW.amount / NEW.transfer_exchange_rate, 2) - NEW.transfer_to_amount) > 0.01 THEN
        RAISE EXCEPTION 'UZS-to-USD transfer amount does not match the recorded exchange rate';
      END IF;
    END IF;
  ELSIF NEW.transfer_to_id IS NOT NULL OR NEW.transfer_to_amount IS NOT NULL THEN
    RAISE EXCEPTION 'Only transfers may specify a destination account or destination amount';
  ELSIF NEW.transfer_exchange_rate IS NOT NULL THEN
    RAISE EXCEPTION 'Only transfers may specify an exchange rate';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "finance_transactions_cash_account_currency_guard"
BEFORE INSERT OR UPDATE ON "finance_transactions"
FOR EACH ROW
EXECUTE FUNCTION enforce_finance_transaction_cash_account_currency();

CREATE OR REPLACE FUNCTION prevent_used_cash_account_recurrency()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.account_type IS DISTINCT FROM OLD.account_type
     OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    IF OLD.balance <> 0
       OR EXISTS (
         SELECT 1 FROM "finance_transactions"
         WHERE "account_id" = OLD.id OR "transfer_to_id" = OLD.id
       ) THEN
      RAISE EXCEPTION 'A cash account with a balance or transaction history cannot change account type or currency';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "cash_accounts_identity_immutability_guard"
BEFORE UPDATE ON "cash_accounts"
FOR EACH ROW
EXECUTE FUNCTION prevent_used_cash_account_recurrency();

CREATE OR REPLACE FUNCTION enforce_payment_cash_account_type()
RETURNS TRIGGER AS $$
DECLARE
  account_tenant_id TEXT;
  account_type "CashAccountType";
  account_is_active BOOLEAN;
  document_currency TEXT;
BEGIN
  IF NEW.cash_account_id IS NULL THEN
    RAISE EXCEPTION 'A payment must be assigned to a cash or bank account';
  END IF;

  SELECT "tenant_id", "account_type", "is_active"
  INTO account_tenant_id, account_type, account_is_active
  FROM "cash_accounts"
  WHERE "id" = NEW.cash_account_id;

  IF NOT FOUND OR account_tenant_id <> NEW.tenant_id OR NOT account_is_active THEN
    RAISE EXCEPTION 'Payment cash account must be active and belong to the same tenant';
  END IF;

  IF NEW.method = 'CASH' AND account_type = 'BANK' THEN
    RAISE EXCEPTION 'Cash payments must use the currency-specific cash till';
  END IF;
  IF NEW.method <> 'CASH' AND account_type <> 'BANK' THEN
    RAISE EXCEPTION 'Bank and electronic payments must use the bank account';
  END IF;

  IF (NEW.invoice_id IS NULL) = (NEW.order_id IS NULL) THEN
    RAISE EXCEPTION 'A payment must be linked to exactly one sales document';
  END IF;

  IF NEW.invoice_id IS NOT NULL THEN
    SELECT "currency" INTO document_currency
    FROM "sales_invoices"
    WHERE "id" = NEW.invoice_id AND "tenant_id" = NEW.tenant_id;
  ELSIF NEW.order_id IS NOT NULL THEN
    SELECT "currency" INTO document_currency
    FROM "sales_orders"
    WHERE "id" = NEW.order_id AND "tenant_id" = NEW.tenant_id;
  ELSE
    document_currency := NULL;
  END IF;

  IF (NEW.invoice_id IS NOT NULL OR NEW.order_id IS NOT NULL)
     AND document_currency IS NULL THEN
    RAISE EXCEPTION 'A linked sales document must belong to the same tenant';
  END IF;
  IF document_currency IS NOT NULL AND document_currency <> (
    SELECT "currency" FROM "cash_accounts" WHERE "id" = NEW.cash_account_id
  ) THEN
    RAISE EXCEPTION 'Payment account currency must match its linked sales document currency';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payments_cash_account_type_guard"
BEFORE INSERT OR UPDATE ON "payments"
FOR EACH ROW
EXECUTE FUNCTION enforce_payment_cash_account_type();
