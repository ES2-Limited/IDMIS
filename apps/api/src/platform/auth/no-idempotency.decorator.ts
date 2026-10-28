import { SetMetadata } from '@nestjs/common';

export const NO_IDEMPOTENCY_KEY = 'noIdempotency';
export const NoIdempotency = () => SetMetadata(NO_IDEMPOTENCY_KEY, true);
