import { z } from 'zod';
import { ImportColumnDefinition } from '../core/import';

export const SLIS_IMPORT_DATASETS = [
  'slis.farmer',
  'slis.plot',
  'slis.fee_billing',
  'slis.fee_collection',
  'slis.water_request',
  'slis.crop_production',
  'slis.training',
] as const;

export const SlisImportDatasetSchema = z.enum(SLIS_IMPORT_DATASETS);
export type SlisImportDataset = z.infer<typeof SlisImportDatasetSchema>;

/**
 * Farmer import row schema.
 * Note: identityNumber is encrypted and hashed at the worker layer before saving to parsed_data.
 */
export const FarmerImportRowSchema = z.object({
  farmerCode: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  otherNames: z.string().optional(),
  gender: z.enum(['female', 'male']),
  birthYear: z.coerce.number().int().min(1900).max(new Date().getFullYear()).optional(),
  phone: z.string().optional(),
  village: z.string().optional(),
  wardCode: z.string().optional(),
  sectorCode: z.string().optional(),
  documentTypeKey: z.string().optional(), // 'nin', 'bvn', 'voters_card', etc.
  identityNumber: z.string().optional(), // Processed with dual-key encryption + hash
  bankName: z.string().optional(),
});
export type FarmerImportRow = z.infer<typeof FarmerImportRowSchema>;

/**
 * Plot import row schema.
 */
export const PlotImportRowSchema = z.object({
  plotCode: z.string().min(1).max(50),
  sectorCode: z.string().min(1),
  irrigationTypeKey: z.string().optional(),
  serviceType: z.enum(['new', 'improved', 'none']).optional(),
  wardCode: z.string().optional(),
  areaHa: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .optional(),
  wktGeometry: z.string().optional(),
});
export type PlotImportRow = z.infer<typeof PlotImportRowSchema>;

/**
 * Fee billing import row schema.
 */
export const FeeBillingImportRowSchema = z.object({
  seasonName: z.string().min(1),
  targetType: z.enum(['wua', 'farmer']),
  targetCode: z.string().min(1), // WUA regNo or farmerCode
  amountNgn: z.string().regex(/^\d+(\.\d{1,2})?$/),
});
export type FeeBillingImportRow = z.infer<typeof FeeBillingImportRowSchema>;

/**
 * Fee collection import row schema.
 */
export const FeeCollectionImportRowSchema = z.object({
  seasonName: z.string().min(1),
  targetType: z.enum(['wua', 'farmer']),
  targetCode: z.string().min(1),
  amountNgn: z.string().regex(/^\d+(\.\d{1,2})?$/),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fieldReceiptRef: z.string().min(1).max(100),
});
export type FeeCollectionImportRow = z.infer<typeof FeeCollectionImportRowSchema>;

/**
 * Water request import row schema.
 */
export const WaterRequestImportRowSchema = z.object({
  level: z.enum(['apex', 'sector', 'unit', 'individual']),
  targetCode: z.string().min(1), // farmerCode for individual, WUA regNo otherwise
  seasonName: z.string().min(1),
  volumeM3: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  periodFromOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  periodToOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type WaterRequestImportRow = z.infer<typeof WaterRequestImportRowSchema>;

/**
 * Crop production import row schema.
 */
export const CropProductionImportRowSchema = z.object({
  plotCode: z.string().min(1),
  seasonName: z.string().min(1),
  cropTypeKey: z.string().min(1),
  areaHa: z.string().regex(/^\d+(\.\d{1,4})?$/),
  yieldT: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/)
    .optional(),
});
export type CropProductionImportRow = z.infer<typeof CropProductionImportRowSchema>;

/**
 * Column definitions catalogue for generating downloadable CSV templates.
 */
export const SLIS_IMPORT_TEMPLATES: Record<SlisImportDataset, ImportColumnDefinition[]> = {
  'slis.farmer': [
    {
      name: 'farmerCode',
      header: 'Farmer Code',
      required: true,
      type: 'string',
      example: 'KRIS-SEC1-001',
    },
    { name: 'firstName', header: 'First Name', required: true, type: 'string', example: 'Ibrahim' },
    { name: 'lastName', header: 'Last Name', required: true, type: 'string', example: 'Musa' },
    {
      name: 'otherNames',
      header: 'Other Names',
      required: false,
      type: 'string',
      example: 'Aliyu',
    },
    { name: 'gender', header: 'Gender', required: true, type: 'string', example: 'male' },
    { name: 'birthYear', header: 'Birth Year', required: false, type: 'number', example: 1985 },
    {
      name: 'phone',
      header: 'Phone Number',
      required: false,
      type: 'string',
      example: '+2348031234567',
    },
    { name: 'village', header: 'Village', required: false, type: 'string', example: 'Kadawa' },
    { name: 'wardCode', header: 'Ward Code', required: false, type: 'string', example: 'KDW-01' },
    {
      name: 'sectorCode',
      header: 'Sector Code',
      required: false,
      type: 'string',
      example: 'SEC-A',
    },
    {
      name: 'documentTypeKey',
      header: 'ID Document Type',
      required: false,
      type: 'string',
      example: 'nin',
    },
    {
      name: 'identityNumber',
      header: 'ID Number',
      required: false,
      type: 'string',
      example: '12345678901',
    },
    {
      name: 'bankName',
      header: 'Bank Name',
      required: false,
      type: 'string',
      example: 'First Bank',
    },
  ],
  'slis.plot': [
    {
      name: 'plotCode',
      header: 'Plot Code',
      required: true,
      type: 'string',
      example: 'P-SEC1-042',
    },
    { name: 'sectorCode', header: 'Sector Code', required: true, type: 'string', example: 'SEC-A' },
    {
      name: 'irrigationTypeKey',
      header: 'Irrigation Type',
      required: false,
      type: 'string',
      example: 'gravity',
    },
    {
      name: 'serviceType',
      header: 'Service Type',
      required: false,
      type: 'string',
      example: 'improved',
    },
    { name: 'wardCode', header: 'Ward Code', required: false, type: 'string', example: 'KDW-01' },
    {
      name: 'areaHa',
      header: 'Area (Hectares)',
      required: false,
      type: 'string',
      example: '1.2500',
    },
    {
      name: 'wktGeometry',
      header: 'Boundary WKT',
      required: false,
      type: 'string',
      example: 'POLYGON((...))',
    },
  ],
  'slis.fee_billing': [
    {
      name: 'seasonName',
      header: 'Season Name',
      required: true,
      type: 'string',
      example: 'Dry Season 2026',
    },
    {
      name: 'targetType',
      header: 'Target Type (wua/farmer)',
      required: true,
      type: 'string',
      example: 'farmer',
    },
    {
      name: 'targetCode',
      header: 'Target Code',
      required: true,
      type: 'string',
      example: 'KRIS-SEC1-001',
    },
    {
      name: 'amountNgn',
      header: 'Amount NGN',
      required: true,
      type: 'string',
      example: '15000.00',
    },
  ],
  'slis.fee_collection': [
    {
      name: 'seasonName',
      header: 'Season Name',
      required: true,
      type: 'string',
      example: 'Dry Season 2026',
    },
    {
      name: 'targetType',
      header: 'Target Type (wua/farmer)',
      required: true,
      type: 'string',
      example: 'farmer',
    },
    {
      name: 'targetCode',
      header: 'Target Code',
      required: true,
      type: 'string',
      example: 'KRIS-SEC1-001',
    },
    {
      name: 'amountNgn',
      header: 'Amount NGN',
      required: true,
      type: 'string',
      example: '15000.00',
    },
    {
      name: 'paidOn',
      header: 'Paid On (YYYY-MM-DD)',
      required: true,
      type: 'string',
      example: '2026-03-15',
    },
    {
      name: 'fieldReceiptRef',
      header: 'Field Receipt Ref',
      required: true,
      type: 'string',
      example: 'PB-4412',
    },
  ],
  'slis.water_request': [
    {
      name: 'level',
      header: 'Request Level',
      required: true,
      type: 'string',
      example: 'individual',
    },
    {
      name: 'targetCode',
      header: 'Target Code',
      required: true,
      type: 'string',
      example: 'KRIS-SEC1-001',
    },
    {
      name: 'seasonName',
      header: 'Season Name',
      required: true,
      type: 'string',
      example: 'Dry Season 2026',
    },
    {
      name: 'volumeM3',
      header: 'Volume (m3)',
      required: false,
      type: 'string',
      example: '2500.00',
    },
    {
      name: 'periodFromOn',
      header: 'From Date',
      required: false,
      type: 'string',
      example: '2026-02-01',
    },
    {
      name: 'periodToOn',
      header: 'To Date',
      required: false,
      type: 'string',
      example: '2026-02-28',
    },
  ],
  'slis.crop_production': [
    {
      name: 'plotCode',
      header: 'Plot Code',
      required: true,
      type: 'string',
      example: 'P-SEC1-042',
    },
    {
      name: 'seasonName',
      header: 'Season Name',
      required: true,
      type: 'string',
      example: 'Dry Season 2026',
    },
    { name: 'cropTypeKey', header: 'Crop Type', required: true, type: 'string', example: 'rice' },
    {
      name: 'areaHa',
      header: 'Area (Hectares)',
      required: true,
      type: 'string',
      example: '1.2500',
    },
    { name: 'yieldT', header: 'Yield (Tons)', required: false, type: 'string', example: '4.500' },
  ],
  'slis.training': [
    {
      name: 'topic',
      header: 'Topic',
      required: true,
      type: 'string',
      example: 'Water Scheduling Best Practices',
    },
    {
      name: 'tags',
      header: 'Tags (comma-separated)',
      required: false,
      type: 'string',
      example: 'water_management,governance',
    },
    {
      name: 'heldOn',
      header: 'Held On (YYYY-MM-DD)',
      required: true,
      type: 'string',
      example: '2026-03-10',
    },
    {
      name: 'venue',
      header: 'Venue',
      required: false,
      type: 'string',
      example: 'Sector A Community Hall',
    },
  ],
};
