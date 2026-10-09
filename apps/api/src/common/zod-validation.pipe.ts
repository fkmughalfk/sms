import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Validates a body/query with a shared zod schema (spec §7). Unknown keys —
 * including any client-sent calculated values — are stripped by the schema.
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const errors = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new BadRequestException({ message: errors[0]?.message ?? 'Invalid request.', errors });
  }
}
