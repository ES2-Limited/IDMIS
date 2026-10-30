import { z } from 'zod';

export const REQUEST_LEVELS = ['apex', 'sector', 'unit', 'individual'] as const;
export const RequestLevelSchema = z.enum(REQUEST_LEVELS);
export type RequestLevel = z.infer<typeof RequestLevelSchema>;

export const SERVICE_TYPES = ['new', 'improved', 'none'] as const;
export const ServiceTypeSchema = z.enum(SERVICE_TYPES);
export type ServiceType = z.infer<typeof ServiceTypeSchema>;

export const WATER_DECISIONS = ['pending', 'approved', 'rejected'] as const;
export const WaterDecisionSchema = z.enum(WATER_DECISIONS);
export type WaterDecision = z.infer<typeof WaterDecisionSchema>;

export const SLIS_GENDERS = ['female', 'male'] as const;
export const SlisGenderSchema = z.enum(SLIS_GENDERS);
export type SlisGender = z.infer<typeof SlisGenderSchema>;

export const SYNC_OUTCOMES = ['applied', 'rejected', 'conflict', 'quarantined'] as const;
export const SyncOutcomeSchema = z.enum(SYNC_OUTCOMES);
export type SyncOutcome = z.infer<typeof SyncOutcomeSchema>;

export const QUARANTINE_REASONS = ['grant_expired', 'device_revoked'] as const;
export const QuarantineReasonSchema = z.enum(QUARANTINE_REASONS);
export type QuarantineReason = z.infer<typeof QuarantineReasonSchema>;

export const SYNC_OP_ACTIONS = ['create', 'update', 'delete'] as const;
export const SyncOpActionSchema = z.enum(SYNC_OP_ACTIONS);
export type SyncOpAction = z.infer<typeof SyncOpActionSchema>;

export const SYNC_CONFLICT_RESOLUTIONS = ['accept_device', 'keep_server', 'merge'] as const;
export const SyncConflictResolutionSchema = z.enum(SYNC_CONFLICT_RESOLUTIONS);
export type SyncConflictResolution = z.infer<typeof SyncConflictResolutionSchema>;

export const SYNC_QUARANTINE_RESOLUTIONS = ['applied', 'discarded'] as const;
export const SyncQuarantineResolutionSchema = z.enum(SYNC_QUARANTINE_RESOLUTIONS);
export type SyncQuarantineResolution = z.infer<typeof SyncQuarantineResolutionSchema>;
