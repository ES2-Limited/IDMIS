import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { type ZodType } from 'zod';
import type { ValidationErrorItem } from '@idmis/contracts';

@Injectable()
export class ZodValidationPipe<T = unknown> implements PipeTransform<unknown, T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly schema: ZodType<T, any>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const errors: ValidationErrorItem[] = result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return {
          field: path || 'payload',
          message: issue.message,
          code: issue.code,
        };
      });

      throw new BadRequestException({
        message: 'The payload contains invalid fields',
        errors,
      });
    }

    return result.data;
  }
}
