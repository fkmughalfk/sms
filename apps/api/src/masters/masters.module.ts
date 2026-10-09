import { Module } from '@nestjs/common';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { PartiesModule } from './parties/parties.module';
import { SubPartiesModule } from './sub-parties/sub-parties.module';
import { CitiesModule } from './cities/cities.module';
import { SalespersonsModule } from './salespersons/salespersons.module';
import { BanksModule } from './banks/banks.module';

/** Master data (spec §5.6): one module per master. */
@Module({
  imports: [
    CategoriesModule,
    ProductsModule,
    PartiesModule,
    SubPartiesModule,
    CitiesModule,
    SalespersonsModule,
    BanksModule,
  ],
})
export class MastersModule {}
