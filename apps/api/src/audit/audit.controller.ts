import { Controller, Get, Query } from '@nestjs/common';
import { type AuditQuery, auditQuerySchema } from '@sms/shared';
import { RequirePermission } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuditService } from './audit.service';

/** Spec §5.9 — SUPER_ADMIN and ADMIN. */
@Controller('audit')
@RequirePermission('audit.view')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery) {
    return this.audit.list(query);
  }
}
