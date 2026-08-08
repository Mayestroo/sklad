import { Module } from '@nestjs/common';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { InventoryDocumentsController } from './documents/inventory-documents.controller';
import { InventoryDocumentsService } from './documents/inventory-documents.service';
import { StockTransfersController } from './transfers/stock-transfers.controller';
import { StockTransfersService } from './transfers/stock-transfers.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [
    CategoriesController,
    ProductsController,
    InventoryDocumentsController,
    StockTransfersController,
  ],
  providers: [
    CategoriesService,
    ProductsService,
    InventoryDocumentsService,
    StockTransfersService,
  ],
  exports: [
    CategoriesService,
    ProductsService,
    InventoryDocumentsService,
    StockTransfersService,
  ],
})
export class InventoryModule {}
