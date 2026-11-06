import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  type AuthUser,
  type PdfImportQuery,
  pdfImportQuerySchema,
  type PdfResolveInput,
  pdfResolveInputSchema,
} from '@sms/shared';
import type { Response } from 'express';
import { ClientIp, CurrentUser, RequirePermission } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InvoicePdfsService } from './invoice-pdfs.service';

// Vercel functions accept ~4.5 MB request bodies; an invoice PDF is ~140 KB.
const MAX_FILES = 25;
const MAX_BYTES = 4 * 1024 * 1024;

/** Invoice PDFs from the current software (docs/ORDERS_DELIVERY_SPEC.md §4). Office only. */
@Controller('invoice-pdfs')
@RequirePermission('invoicePdf.import')
export class InvoicePdfsController {
  constructor(private readonly pdfs: InvoicePdfsService) {}

  /** Upload one or many PDFs (`files`). Each is read, checked, and posted if all is clear. */
  @Post()
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, { limits: { fileSize: MAX_BYTES } }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @ClientIp() ip: string | null,
  ) {
    if (!files?.length) throw new BadRequestException('Attach invoice PDFs as "files".');
    return this.pdfs.upload(user, files, ip);
  }

  @Get()
  list(@Query(new ZodValidationPipe(pdfImportQuerySchema)) query: PdfImportQuery) {
    return this.pdfs.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.pdfs.get(id);
  }

  /** The original PDF. */
  @Get(':id/file')
  async file(@Param('id') id: string, @Res() res: Response) {
    const f = await this.pdfs.file(id);
    res
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', `inline; filename="${f.name.replace(/"/g, '')}"`)
      .send(f.data);
  }

  /** Save the office's decisions; with `post: true` the invoice is posted if nothing is wrong. */
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(pdfResolveInputSchema)) body: PdfResolveInput,
    @ClientIp() ip: string | null,
  ) {
    return this.pdfs.resolve(user, id, body.resolution, body.post, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @ClientIp() ip: string | null) {
    return this.pdfs.remove(user, id, ip);
  }
}
