import { z } from 'zod';

export const ORG_TYPES = [
  'pcu',
  'rbda',
  'scheme',
  'sector',
  'contractor',
  'consultant',
  'other',
] as const;
export const OrgTypeSchema = z.enum(ORG_TYPES);
export type OrgType = z.infer<typeof OrgTypeSchema>;

export const WUA_LEVELS = ['apex', 'sector', 'unit'] as const;
export const WuaLevelSchema = z.enum(WUA_LEVELS);
export type WuaLevel = z.infer<typeof WuaLevelSchema>;

export const SCOPE_TYPES = ['national', 'state', 'rbda', 'scheme', 'sector'] as const;
export const ScopeTypeSchema = z.enum(SCOPE_TYPES);
export type ScopeType = z.infer<typeof ScopeTypeSchema>;

export const RECORD_STATUSES = ['draft', 'submitted', 'approved', 'returned'] as const;
export const RecordStatusSchema = z.enum(RECORD_STATUSES);
export type RecordStatus = z.infer<typeof RecordStatusSchema>;

export const MODULE_KEYS = ['core', 'slis', 'me', 'blis', 'proc'] as const;
export const ModuleKeySchema = z.enum(MODULE_KEYS);
export type ModuleKey = z.infer<typeof ModuleKeySchema>;

export const WUA_OFFICES = ['chair', 'secretary', 'treasurer', 'other'] as const;
export const WuaOfficeSchema = z.enum(WUA_OFFICES);
export type WuaOffice = z.infer<typeof WuaOfficeSchema>;

export const FILE_SCAN_STATUSES = ['pending', 'clean', 'infected', 'failed'] as const;
export const FileScanStatusSchema = z.enum(FILE_SCAN_STATUSES);
export type FileScanStatus = z.infer<typeof FileScanStatusSchema>;
