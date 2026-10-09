import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError } from '@sms/shared';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client';

/** Every error leaves the API as `{ statusCode, message, errors? }` (spec §7). */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    if (body.statusCode >= 500) this.logger.error(exception);
    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiError {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') return { statusCode, message: response };
      const { message, errors } = response as {
        message?: string | string[];
        errors?: ApiError['errors'];
      };
      return {
        statusCode,
        message: Array.isArray(message)
          ? (message[0] ?? exception.message)
          : (message ?? exception.message),
        ...(errors ? { errors } : {}),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            statusCode: HttpStatus.CONFLICT,
            message: 'A record with this value already exists.',
          };
        case 'P2003':
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'A referenced record does not exist.',
          };
        case 'P2025':
          return { statusCode: HttpStatus.NOT_FOUND, message: 'Record not found.' };
      }
    }

    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error.' };
  }
}
