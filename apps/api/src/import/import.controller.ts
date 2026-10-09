import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { type AuthUser, importMappingSchema } from '@sms/shared';
import { ClientIp, CurrentUser, RequirePermission } from '../common/decorators';
import { ImportService } from './import.service';

const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5 MB request bodies

/** Spec §7/§11: `POST /import/excel` (multipart, SUPER_ADMIN). Dry run unless `dryRun=false`. */
@Controller('import')
@RequirePermission('import.run')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post('excel')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  excel(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { dryRun?: string; mapping?: string },
    @ClientIp() ip: string | null,
  ) {
    if (!file) throw new BadRequestException('Attach the .xlsx workbook as "file".');
    let mappingJson: unknown;
    try {
      mappingJson = body.mapping ? JSON.parse(body.mapping) : {};
    } catch {
      throw new BadRequestException('"mapping" must be JSON.');
    }
    const mapping = importMappingSchema.safeParse(mappingJson);
    if (!mapping.success) throw new BadRequestException('"mapping" is not in the expected shape.');
    return this.imports.run(user, file.buffer, mapping.data, body.dryRun !== 'false', ip);
  }
}
