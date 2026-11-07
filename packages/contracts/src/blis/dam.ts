import { z } from 'zod';
import { DamComponentEnum, InspectionStatusEnum } from './enums';
import { GeometryInputSchema, PaginationQuerySchema } from './common';

export const ReservoirSchema = z.object({
  id: z.string().uuid(),
  basinId: z.string().uuid(),
  name: z.string().min(1).max(255),
  river: z.string().max(255).nullable().optional(),
  areaKm2: z.string().nullable().optional(),
  volumeMcm: z.string().nullable().optional(),
  meanDepthM: z.string().nullable().optional(),
  maxDepthM: z.string().nullable().optional(),
  relativeDepth: z.string().nullable().optional(),
  maxLengthKm: z.string().nullable().optional(),
  maxWidthKm: z.string().nullable().optional(),
  meanElevationM: z.string().nullable().optional(),
  sedimentRatio: z.string().nullable().optional(),
  fetchKm: z.string().nullable().optional(),
  depthRatio: z.string().nullable().optional(),
  volumeDevelopment: z.string().nullable().optional(),
  geom: z
    .union([z.record(z.string(), z.unknown()), z.string()])
    .nullable()
    .optional(),
  createdAt: z.string(),
  createdBy: z.string().uuid(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid(),
  version: z.number().int().positive(),
  importBatchId: z.string().uuid().nullable().optional(),
});
export type Reservoir = z.infer<typeof ReservoirSchema>;

export const CreateReservoirInputSchema = z.object({
  basinId: z.string().uuid(),
  name: z.string().min(1).max(255),
  river: z.string().max(255).optional(),
  areaKm2: z.string().optional(),
  volumeMcm: z.string().optional(),
  meanDepthM: z.string().optional(),
  maxDepthM: z.string().optional(),
  relativeDepth: z.string().optional(),
  maxLengthKm: z.string().optional(),
  maxWidthKm: z.string().optional(),
  meanElevationM: z.string().optional(),
  sedimentRatio: z.string().optional(),
  fetchKm: z.string().optional(),
  depthRatio: z.string().optional(),
  volumeDevelopment: z.string().optional(),
  geom: GeometryInputSchema.optional(),
});
export type CreateReservoirInput = z.infer<typeof CreateReservoirInputSchema>;

export const UpdateReservoirInputSchema = CreateReservoirInputSchema.partial().extend({
  version: z.number().int().positive(),
});
export type UpdateReservoirInput = z.infer<typeof UpdateReservoirInputSchema>;

export const ListReservoirsQuerySchema = PaginationQuerySchema.extend({
  basinId: z.string().uuid().optional(),
  search: z.string().optional(),
});
export type ListReservoirsQuery = z.infer<typeof ListReservoirsQuerySchema>;

export const DamSchema = z.object({
  id: z.string().uuid(),
  code: z.string().max(50).nullable().optional(),
  name: z.string().min(1).max(255),
  altName: z.string().max(255).nullable().optional(),
  basinId: z.string().uuid(),
  reservoirId: z.string().uuid().nullable().optional(),
  secondaryOfDamId: z.string().uuid().nullable().optional(),
  purposeId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  completionYear: z.number().int().nullable().optional(),
  foundation: z.string().nullable().optional(),
  heightM: z.string().nullable().optional(),
  crestLengthM: z.string().nullable().optional(),
  bodyVolumeMcm: z.string().nullable().optional(),
  spillwayType: z.string().nullable().optional(),
  spillwayCapacityM3s: z.string().nullable().optional(),
  reservoirCapacityMcm: z.string().nullable().optional(),
  reservoirAreaKm2: z.string().nullable().optional(),
  reservoirLengthKm: z.string().nullable().optional(),
  hydropowerMw: z.string().nullable().optional(),
  meanAnnualEnergyGwh: z.string().nullable().optional(),
  irrigatedAreaHa: z.string().nullable().optional(),
  catchmentKm2: z.string().nullable().optional(),
  ownerOrgId: z.string().uuid().nullable().optional(),
  consultantOrgId: z.string().uuid().nullable().optional(),
  contractorOrgId: z.string().uuid().nullable().optional(),
  lgaId: z.string().uuid().nullable().optional(),
  nearestTown: z.string().max(255).nullable().optional(),
  resettlementNotes: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  geom: z
    .union([z.record(z.string(), z.unknown()), z.string()])
    .nullable()
    .optional(),
  altitudeM: z.string().nullable().optional(),
  createdAt: z.string(),
  createdBy: z.string().uuid(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid(),
  version: z.number().int().positive(),
  importBatchId: z.string().uuid().nullable().optional(),
});
export type Dam = z.infer<typeof DamSchema>;

export const CreateDamInputSchema = z.object({
  code: z.string().max(50).optional(),
  name: z.string().min(1).max(255),
  altName: z.string().max(255).optional(),
  basinId: z.string().uuid(),
  reservoirId: z.string().uuid().optional(),
  secondaryOfDamId: z.string().uuid().optional(),
  purposeId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  completionYear: z.number().int().optional(),
  foundation: z.string().optional(),
  heightM: z.string().optional(),
  crestLengthM: z.string().optional(),
  bodyVolumeMcm: z.string().optional(),
  spillwayType: z.string().optional(),
  spillwayCapacityM3s: z.string().optional(),
  reservoirCapacityMcm: z.string().optional(),
  reservoirAreaKm2: z.string().optional(),
  reservoirLengthKm: z.string().optional(),
  hydropowerMw: z.string().optional(),
  meanAnnualEnergyGwh: z.string().optional(),
  irrigatedAreaHa: z.string().optional(),
  catchmentKm2: z.string().optional(),
  ownerOrgId: z.string().uuid().optional(),
  consultantOrgId: z.string().uuid().optional(),
  contractorOrgId: z.string().uuid().optional(),
  lgaId: z.string().uuid().optional(),
  nearestTown: z.string().max(255).optional(),
  resettlementNotes: z.string().optional(),
  notes: z.string().optional(),
  geom: GeometryInputSchema.optional(),
  altitudeM: z.string().optional(),
});
export type CreateDamInput = z.infer<typeof CreateDamInputSchema>;

export const UpdateDamInputSchema = CreateDamInputSchema.partial().extend({
  version: z.number().int().positive(),
});
export type UpdateDamInput = z.infer<typeof UpdateDamInputSchema>;

export const ListDamsQuerySchema = PaginationQuerySchema.extend({
  basinId: z.string().uuid().optional(),
  reservoirId: z.string().uuid().optional(),
  purposeId: z.string().uuid().optional(),
  search: z.string().optional(),
});
export type ListDamsQuery = z.infer<typeof ListDamsQuerySchema>;

export const DamComponentConditionSchema = z.object({
  inspectionId: z.string().uuid(),
  component: DamComponentEnum,
  ratingId: z.string().uuid(),
  notes: z.string().nullable().optional(),
});
export type DamComponentCondition = z.infer<typeof DamComponentConditionSchema>;

export const UpsertDamComponentConditionInputSchema = z.object({
  inspectionId: z.string().uuid(),
  component: DamComponentEnum,
  ratingId: z.string().uuid(),
  notes: z.string().optional(),
});
export type UpsertDamComponentConditionInput = z.infer<
  typeof UpsertDamComponentConditionInputSchema
>;

export const DamComponentInputSchema = z.object({
  component: DamComponentEnum,
  ratingId: z.string().uuid(),
  notes: z.string().optional(),
});
export type DamComponentInput = z.infer<typeof DamComponentInputSchema>;

export const CreateInspectionComponentInputSchema = DamComponentInputSchema;
export type CreateInspectionComponentInput = DamComponentInput;

export const DamSafetyInspectionSchema = z.object({
  id: z.string().uuid(),
  damId: z.string().uuid(),
  inspectedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nextDueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  hazardClassId: z.string().uuid().nullable().optional(),
  specificHazards: z.string().nullable().optional(),
  safetyContact: z.string().nullable().optional(),
  staffOnSite: z.number().int().nullable().optional(),
  staffQualifications: z.string().nullable().optional(),
  safetyBudgetNgn: z.string().nullable().optional(),
  meetsStandard: z.boolean().nullable().optional(),
  status: InspectionStatusEnum.default('submitted'),
  submittedBy: z.string().uuid().nullable().optional(),
  submittedAt: z.string().nullable().optional(),
  approvedBy: z.string().uuid().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  returnedBy: z.string().uuid().nullable().optional(),
  returnedAt: z.string().nullable().optional(),
  returnComment: z.string().nullable().optional(),
  deviceId: z.string().uuid().nullable().optional(),
  importBatchId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  createdBy: z.string().uuid(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid(),
  version: z.number().int().positive(),
  components: z.array(DamComponentConditionSchema).optional(),
});
export type DamSafetyInspection = z.infer<typeof DamSafetyInspectionSchema>;

export const CreateDamSafetyInspectionInputSchema = z.object({
  damId: z.string().uuid(),
  inspectedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nextDueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  hazardClassId: z.string().uuid().optional(),
  specificHazards: z.string().optional(),
  safetyContact: z.string().optional(),
  staffOnSite: z.number().int().optional(),
  staffQualifications: z.string().optional(),
  safetyBudgetNgn: z.string().optional(),
  meetsStandard: z.boolean().optional(),
  components: z.array(DamComponentInputSchema).optional(),
});
export type CreateDamSafetyInspectionInput = z.infer<typeof CreateDamSafetyInspectionInputSchema>;

export const UpdateDamSafetyInspectionInputSchema = CreateDamSafetyInspectionInputSchema.partial()
  .omit({ damId: true })
  .extend({
    version: z.number().int().positive(),
  });
export type UpdateDamSafetyInspectionInput = z.infer<typeof UpdateDamSafetyInspectionInputSchema>;

export const ReturnDamInspectionInputSchema = z.object({
  comment: z.string().min(1, 'Return comment is required'),
});
export type ReturnDamInspectionInput = z.infer<typeof ReturnDamInspectionInputSchema>;

export const ListDamInspectionsQuerySchema = PaginationQuerySchema.extend({
  damId: z.string().uuid().optional(),
  status: InspectionStatusEnum.optional(),
});
export type ListDamInspectionsQuery = z.infer<typeof ListDamInspectionsQuerySchema>;

export const MvDamStatusSchema = z.object({
  damId: z.string().uuid(),
  inspectionId: z.string().uuid(),
  inspectedOn: z.string(),
  meetsStandard: z.boolean(),
  hazardClassId: z.string().uuid().nullable().optional(),
  hazardClass: z.string().nullable().optional(),
  nextDueOn: z.string().nullable().optional(),
  isOverdue: z.boolean(),
  approvedAt: z.string(),
});
export type MvDamStatus = z.infer<typeof MvDamStatusSchema>;
