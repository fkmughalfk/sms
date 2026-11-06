import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { InvoicePdfsController } from './invoice-pdfs.controller';
import { InvoicePdfsService } from './invoice-pdfs.service';

/** Invoice PDFs → invoices that reduce pending orders (orders module, phase O4). */
@Module({
  imports: [InvoicesModule],
  controllers: [InvoicePdfsController],
  providers: [InvoicePdfsService],
})
export class InvoicePdfsModule {}
