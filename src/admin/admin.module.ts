import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AnalyticsModule } from '../analytics/analytics.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { SellersModule } from '../sellers/sellers.module';
import { ProductsModule } from '../products/products.module';
import { CategoriesModule } from '../categories/categories.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    AnalyticsModule,
    OrdersModule,
    PaymentsModule,
    SellersModule,
    ProductsModule,
    CategoriesModule,
    UsersModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
