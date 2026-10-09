import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type AuthUser,
  type CreateUserInput,
  createUserSchema,
  type ResetPasswordInput,
  resetPasswordSchema,
  type StatusInput,
  statusSchema,
  type UpdateUserInput,
  updateUserSchema,
  type UserListQuery,
  userListQuerySchema,
} from '@sms/shared';
import { ClientIp, CurrentUser, RequirePermission } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UsersService } from './users.service';

/** Spec §5.7. Which roles an actor may touch is checked in the service (canManageRole). */
@Controller('users')
@RequirePermission('users.manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query(new ZodValidationPipe(userListQuerySchema)) query: UserListQuery) {
    return this.users.list(query);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
    @ClientIp() ip: string | null,
  ) {
    return this.users.create(actor, body, ip);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
    @ClientIp() ip: string | null,
  ) {
    return this.users.update(actor, id, body, ip);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(statusSchema)) body: StatusInput,
    @ClientIp() ip: string | null,
  ) {
    return this.users.setStatus(actor, id, body.isActive, ip);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @ClientIp() ip: string | null,
  ) {
    return this.users.resetPassword(actor, id, body.newPassword, ip);
  }
}
