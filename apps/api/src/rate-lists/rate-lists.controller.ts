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
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type AuthUser,
  type RateListInput,
  rateListInputSchema,
  type RateListQuery,
  rateListQuerySchema,
} from '@sms/shared';
import type { Response } from 'express';
import { ClientIp, CurrentUser, RequirePermission } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { buildRateListTemplate, parseRateListWorkbook } from './rate-list-excel';
import { RateListsService } from './rate-lists.service';

const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5 MB request bodies

/**
 * Rate lists (docs/ORDERS_DELIVERY_SPEC.md §2). Everyone signed in can read them
 * (salesmen book orders from the current list); writes need `rateList.manage` (ADMIN+).
 */
@Controller('rate-lists')
@RequirePermission('masters.read')
export class RateListsController {
  constructor(private readonly service: RateListsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(rateListQuerySchema)) query: RateListQuery) {
    return this.service.list(query);
  }

  /** The list in force now; 404 when none has started yet. */
  @Get('current')
  current() {
    return this.service.current();
  }

  /** A new list's starting lines: `?from=<id>`, else copied from the newest list. */
  @Get('draft')
  @RequirePermission('rateList.manage')
  draft(@Query('from') from?: string) {
    return this.service.draft(from || undefined);
  }

  /** The template .xlsx: every active product with the rates of `?from=<id>` / the newest list. */
  @Get('template')
  @RequirePermission('rateList.manage')
  async template(@Query('from') from: string | undefined, @Res() res: Response) {
    const draft = await this.service.draft(from || undefined);
    const buffer = await buildRateListTemplate(draft.items);
    res
      .status(200)
      .setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .setHeader('Content-Disposition', 'attachment; filename="rate-list.xlsx"')
      .send(buffer);
  }

  /** Reads an edited template; nothing is saved (the lines come back for review). */
  @Post('parse-excel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('rateList.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async parseExcel(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Attach the .xlsx rate list as "file".');
    const [products, previous] = await Promise.all([
      this.service.products(),
      this.service.latestRates(),
    ]);
    return parseRateListWorkbook(file.buffer, products, previous);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermission('rateList.manage')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(rateListInputSchema)) body: RateListInput,
    @ClientIp() ip: string | null,
  ) {
    return this.service.create(user, body, ip);
  }

  @Put(':id')
  @RequirePermission('rateList.manage')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rateListInputSchema)) body: RateListInput,
    @ClientIp() ip: string | null,
  ) {
    return this.service.update(user, id, body, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('rateList.manage')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @ClientIp() ip: string | null) {
    return this.service.remove(user, id, ip);
  }
}
