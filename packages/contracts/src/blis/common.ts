import { z } from 'zod';

export const GeometryInputSchema = z.union([z.record(z.string(), z.unknown()), z.string().min(1)]);
export type GeometryInput = z.infer<typeof GeometryInputSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});
