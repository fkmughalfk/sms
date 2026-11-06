import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type AuthUser,
  type SlipQuery,
  slipQuerySchema,
  slipRejectSchema,
  type SlipSubmit,
  slipSubmitSchema,
} from '@sms/shared';
import type { Response } from 'express';
import { ClientIp, CurrentUser, RequirePermission } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PaymentSlipsService } from './payment-slips.service';

const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5 MB; the app shrinks photos first

/**
 * Payment slips (docs/ORDERS_DELIVERY_SPEC.md §5). Anyone who records payments can upload
 * one; the office's are saved as payments at once, a salesman's wait for `payment.edit`.
 */
@Controller('payment-slips')
@RequirePermission('payment.create')
export class PaymentSlipsController {
  constructor(private readonly slips: PaymentSlipsService) {}

  /** Multipart: `file` (photo / PDF) and `data` (JSON: { details, allowDuplicate }). */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { data?: string },
    @ClientIp() ip: string | null,
  ) {
    if (!file) throw new BadRequestException('Attach the slip photo as "file".');
    let json: unknown;
    try {
      json = JSON.parse(body.data ?? '{}');
    } catch {
      throw new BadRequestException('"data" must be JSON.');
    }
    const parsed = slipSubmitSchema.safeParse(json);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      throw new BadRequestException({
        message: errors[0]?.message ?? 'Check the details.',
        errors,
      });
    }
    return this.slips.upload(user, file, parsed.data.details, parsed.data.allowDuplicate, ip);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(slipQuerySchema)) q: SlipQuery) {
    return this.slips.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.slips.get(user, id);
  }

  @Get(':id/file')
  async file(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const f = await this.slips.file(user, id);
    res
      .status(200)
      .setHeader('Content-Type', f.type)
      .setHeader('Content-Disposition', `inline; filename="${f.name.replace(/"/g, '')}"`)
      .send(f.data);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('payment.edit')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(slipSubmitSchema)) body: SlipSubmit,
    @ClientIp() ip: string | null,
  ) {
    return this.slips.confirm(user, id, body.details, body.allowDuplicate, ip);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('payment.edit')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(slipRejectSchema)) body: { reason: string },
    @ClientIp() ip: string | null,
  ) {
    return this.slips.reject(user, id, body.reason, ip);
  }
}
