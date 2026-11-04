import type { ImportBatchResponse, ImportRowResponse } from '@idmis/contracts';

export interface ImportDatasetOption {
  id: string;
  name: string;
  module: 'core' | 'slis' | 'me' | 'blis';
  description: string;
  sampleColumns: string[];
  requiredColumns: string[];
  naturalKey: string;
  templateFileName: string;
}

export const AVAILABLE_DATASETS: ImportDatasetOption[] = [
  {
    id: 'wua',
    name: 'Water User Associations (WUAs)',
    module: 'core',
    description:
      'Bulk register Apex, Sector, and Unit WUAs with bank linkage and scheme association.',
    sampleColumns: [
      'name',
      'regNo',
      'level',
      'schemeCode',
      'wardCode',
      'address',
      'bankName',
      'bankAccountNumber',
    ],
    requiredColumns: ['name', 'level', 'schemeCode'],
    naturalKey: 'Registration Number / Name',
    templateFileName: 'idmis_wua_template.csv',
  },
  {
    id: 'slis.farmer',
    name: 'Farmers & Households',
    module: 'slis',
    description:
      'Farmer profiles with encrypted identity numbers, telephone, household contacts, and village tenure.',
    sampleColumns: [
      'farmerCode',
      'firstName',
      'lastName',
      'gender',
      'phone',
      'village',
      'wardCode',
      'identityNumber',
    ],
    requiredColumns: ['farmerCode', 'firstName', 'lastName', 'gender'],
    naturalKey: 'Farmer Code',
    templateFileName: 'idmis_farmers_template.csv',
  },
  {
    id: 'slis.plot',
    name: 'Cadastral Farm Plots',
    module: 'slis',
    description:
      'Irrigation command plots with GIS WKT geometry polygons, sector turnout codes, and area in hectares.',
    sampleColumns: ['plotCode', 'sectorCode', 'areaHa', 'wktGeometry', 'farmerCode', 'serviceType'],
    requiredColumns: ['plotCode', 'sectorCode'],
    naturalKey: 'Plot Code',
    templateFileName: 'idmis_plots_template.csv',
  },
];

export const mockRecentBatches: ImportBatchResponse[] = [
  {
    id: '018f3b10-0001-7000-8000-000000000001',
    dataset: 'wua',
    fileId: '018f3b20-0001-7000-8000-000000000001',
    status: 'committed',
    schemeId: '018f3a60-0003-7000-8000-000000000003',
    stateId: '018f3a70-0001-7000-8000-000000000001',
    totalRows: 142,
    validRows: 142,
    errorRows: 0,
    committedRows: 142,
    errorMessage: null,
    committedAt: '2026-11-03T16:20:00Z',
    undoneAt: null,
    createdBy: '018f3a80-0001-7000-8000-000000000001',
    createdAt: '2026-11-03T16:15:00Z',
    updatedAt: '2026-11-03T16:20:00Z',
    version: 2,
  },
  {
    id: '018f3b10-0002-7000-8000-000000000002',
    dataset: 'slis.farmer',
    fileId: '018f3b20-0002-7000-8000-000000000002',
    status: 'committed',
    schemeId: '018f3a60-0003-7000-8000-000000000003',
    stateId: '018f3a70-0001-7000-8000-000000000001',
    totalRows: 380,
    validRows: 376,
    errorRows: 4,
    committedRows: 376,
    errorMessage: null,
    committedAt: '2026-11-02T11:45:00Z',
    undoneAt: null,
    createdBy: '018f3a80-0002-7000-8000-000000000002',
    createdAt: '2026-11-02T11:40:00Z',
    updatedAt: '2026-11-02T11:45:00Z',
    version: 2,
  },
  {
    id: '018f3b10-0003-7000-8000-000000000003',
    dataset: 'slis.plot',
    fileId: '018f3b20-0003-7000-8000-000000000003',
    status: 'undone',
    schemeId: '018f3a60-0005-7000-8000-000000000005',
    stateId: '018f3a70-0003-7000-8000-000000000003',
    totalRows: 50,
    validRows: 50,
    errorRows: 0,
    committedRows: 0,
    errorMessage: 'Batch rolled back by supervisor',
    committedAt: '2026-10-28T09:10:00Z',
    undoneAt: '2026-10-28T10:00:00Z',
    createdBy: '018f3a80-0001-7000-8000-000000000001',
    createdAt: '2026-10-28T09:00:00Z',
    updatedAt: '2026-10-28T10:00:00Z',
    version: 3,
  },
];

export const mockSamplePreviewRows: ImportRowResponse[] = [
  {
    id: '018f3b30-0001-7000-8000-000000000001',
    batchId: '018f3b10-0001-7000-8000-000000000001',
    rowNumber: 1,
    rawData: {
      name: 'Kadawa North Water Users Association',
      regNo: 'WUA/KRIS/2024/014',
      level: 'sector',
      schemeCode: 'KRIS',
      bankName: 'First Bank of Nigeria',
      bankAccountNumber: '3049281920',
    },
    status: 'valid',
    errors: [],
    naturalKey: 'WUA/KRIS/2024/014',
  },
  {
    id: '018f3b30-0002-7000-8000-000000000002',
    batchId: '018f3b10-0001-7000-8000-000000000001',
    rowNumber: 2,
    rawData: {
      name: 'Kura Apex Irrigation Farmers Association',
      regNo: 'WUA/KRIS/2023/008',
      level: 'apex',
      schemeCode: 'KRIS',
      bankName: 'Jaiz Bank',
      bankAccountNumber: '0019283741',
    },
    status: 'valid',
    errors: [],
    naturalKey: 'WUA/KRIS/2023/008',
  },
  {
    id: '018f3b30-0003-7000-8000-000000000003',
    batchId: '018f3b10-0001-7000-8000-000000000001',
    rowNumber: 3,
    rawData: {
      name: '',
      regNo: 'WUA/KRIS/INVALID',
      level: 'unknown_level',
      schemeCode: 'NON_EXISTENT_SCHEME',
      bankName: '',
      bankAccountNumber: '',
    },
    status: 'error',
    errors: [
      { column: 'name', message: 'WUA name is mandatory and cannot be blank' },
      { column: 'level', message: 'Level must be one of: apex, sector, unit' },
      {
        column: 'schemeCode',
        message: 'Scheme code NON_EXISTENT_SCHEME was not found in active scope',
      },
    ],
    naturalKey: 'WUA/KRIS/INVALID',
  },
];
