import { z } from 'zod';

export const DependencyStatusSchema = z.enum(['up', 'down']);
export type DependencyStatus = z.infer<typeof DependencyStatusSchema>;

export const HealthCheckDetailsSchema = z.object({
  database: DependencyStatusSchema,
  redis: DependencyStatusSchema,
  storage: DependencyStatusSchema,
  clamd: DependencyStatusSchema,
  migrations: DependencyStatusSchema,
});
export type HealthCheckDetails = z.infer<typeof HealthCheckDetailsSchema>;

export const HealthCheckResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  details: HealthCheckDetailsSchema,
});
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
