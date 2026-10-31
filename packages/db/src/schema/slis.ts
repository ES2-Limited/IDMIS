import {
  pgSchema,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  date,
  check,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { standardColumns, slisReviewableColumns, geometryGeneric, geometryPoint } from './common';
import {
  appUser,
  organisation,
  state,
  ward,
  wua,
  lookupValue,
  file,
  device,
  importBatch,
} from './core';

export const slisSchema = pgSchema('slis');

// 1. Season
export const season = slisSchema.table(
  'season',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => organisation.id),
    name: text('name').notNull(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
  },
  (table) => [
    check('season_dates_check', sql`"ends_on" >= "starts_on"`),
    uniqueIndex('season_scheme_name_unique').on(table.schemeId, table.name),
    index('season_scheme_id_idx').on(table.schemeId),
  ],
);

// 2. Household
export const household = slisSchema.table(
  'household',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    ...slisReviewableColumns(
      (): AnyPgColumn => appUser.id,
      (): AnyPgColumn => device.id,
      (): AnyPgColumn => importBatch.id,
    ),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => organisation.id),
    wardId: uuid('ward_id').references(() => ward.id),
    name: text('name').notNull(),
    settlement: text('settlement'),
    size: integer('size'),
    males: integer('males'),
    females: integer('females'),
    children: integer('children'),
  },
  (table) => [
    index('household_scheme_id_idx').on(table.schemeId),
    index('household_ward_id_idx').on(table.wardId),
    index('household_status_idx').on(table.status),
  ],
);

// 3. Farmer Group
export const farmerGroup = slisSchema.table(
  'farmer_group',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => organisation.id),
    wuaId: uuid('wua_id').references(() => wua.id),
    name: text('name').notNull(),
    code: text('code'),
    groupTypeId: uuid('group_type_id').references(() => lookupValue.id),
  },
  (table) => [
    index('farmer_group_scheme_id_idx').on(table.schemeId),
    index('farmer_group_wua_id_idx').on(table.wuaId),
  ],
);

// 4. Farmer
export const farmer = slisSchema.table(
  'farmer',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    ...slisReviewableColumns(
      (): AnyPgColumn => appUser.id,
      (): AnyPgColumn => device.id,
      (): AnyPgColumn => importBatch.id,
    ),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => organisation.id),
    sectorId: uuid('sector_id').references(() => organisation.id),
    farmerCode: text('farmer_code').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    otherNames: text('other_names'),
    gender: text('gender').notNull(),
    birthYear: integer('birth_year'),
    phone: text('phone'),
    village: text('village'),
    wardId: uuid('ward_id').references(() => ward.id),
    stateId: uuid('state_id').references(() => state.id),
    householdId: uuid('household_id').references(() => household.id),
    unitWuaId: uuid('unit_wua_id').references(() => wua.id),
    farmerGroupId: uuid('farmer_group_id').references(() => farmerGroup.id),
    maritalStatusId: uuid('marital_status_id').references(() => lookupValue.id),
    nextOfKinName: text('next_of_kin_name'),
    nextOfKinPhone: text('next_of_kin_phone'),
    nextOfKinRelation: text('next_of_kin_relation'),
    photoFileId: uuid('photo_file_id').references(() => file.id),
    location: geometryPoint('location'),
  },
  (table) => [
    check('farmer_gender_check', sql`"gender" IN ('female', 'male')`),
    uniqueIndex('farmer_scheme_code_unique').on(table.schemeId, table.farmerCode),
    index('farmer_scheme_id_idx').on(table.schemeId),
    index('farmer_state_id_idx').on(table.stateId),
    index('farmer_ward_id_idx').on(table.wardId),
    index('farmer_phone_idx').on(table.phone),
    index('farmer_status_idx').on(table.status),
  ],
);

// 5. Farmer Identity Document (AES-256-GCM + HMAC-SHA256)
export const farmerIdentity = slisSchema.table(
  'farmer_identity',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    farmerId: uuid('farmer_id')
      .notNull()
      .references(() => farmer.id, { onDelete: 'cascade' }),
    documentTypeId: uuid('document_type_id')
      .notNull()
      .references(() => lookupValue.id),
    numberEnc: text('number_enc').notNull(),
    numberHash: text('number_hash').notNull(),
    numberLast4: text('number_last4').notNull(),
    bankName: text('bank_name'),
    documentFileId: uuid('document_file_id').references(() => file.id),
    uniquePerPerson: boolean('unique_per_person').notNull(),
  },
  (table) => [
    // Partial unique index enforcing strict 1:1 per person for unique document types (NIN, BVN)
    // while allowing duplicates for shared types (bank accounts). No subquery in predicate!
    uniqueIndex('farmer_identity_person_idx')
      .on(table.documentTypeId, table.numberHash)
      .where(sql`"unique_per_person" = true`),
    index('farmer_identity_farmer_id_idx').on(table.farmerId),
    index('farmer_identity_doc_type_hash_idx').on(table.documentTypeId, table.numberHash),
  ],
);

// 6. Farm
export const farm = slisSchema.table(
  'farm',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => organisation.id),
    sectorId: uuid('sector_id')
      .notNull()
      .references(() => organisation.id),
    name: text('name').notNull(),
    geom: geometryGeneric('geom'),
  },
  (table) => [
    index('farm_scheme_id_idx').on(table.schemeId),
    index('farm_sector_id_idx').on(table.sectorId),
  ],
);

// 7. Plot
export const plot = slisSchema.table(
  'plot',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    ...slisReviewableColumns(
      (): AnyPgColumn => appUser.id,
      (): AnyPgColumn => device.id,
      (): AnyPgColumn => importBatch.id,
    ),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => organisation.id),
    farmId: uuid('farm_id').references(() => farm.id),
    sectorId: uuid('sector_id')
      .notNull()
      .references(() => organisation.id),
    plotCode: text('plot_code').notNull(),
    areaHa: numeric('area_ha', { precision: 10, scale: 4 }),
    irrigationTypeId: uuid('irrigation_type_id').references(() => lookupValue.id),
    serviceType: text('service_type'),
    wardId: uuid('ward_id').references(() => ward.id),
    stateId: uuid('state_id').references(() => state.id),
    geom: geometryGeneric('geom'),
    gpsAccuracyM: numeric('gps_accuracy_m', { precision: 6, scale: 2 }),
  },
  (table) => [
    check(
      'plot_service_type_check',
      sql`"service_type" IS NULL OR "service_type" IN ('new', 'improved', 'none')`,
    ),
    uniqueIndex('plot_scheme_code_unique').on(table.schemeId, table.plotCode),
    index('plot_scheme_id_idx').on(table.schemeId),
    index('plot_sector_id_idx').on(table.sectorId),
    index('plot_ward_id_idx').on(table.wardId),
    index('plot_state_id_idx').on(table.stateId),
    index('plot_status_idx').on(table.status),
  ],
);

// 8. Plot Allocation
export const plotAllocation = slisSchema.table(
  'plot_allocation',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    ...slisReviewableColumns(
      (): AnyPgColumn => appUser.id,
      (): AnyPgColumn => device.id,
      (): AnyPgColumn => importBatch.id,
    ),
    plotId: uuid('plot_id')
      .notNull()
      .references(() => plot.id),
    farmerId: uuid('farmer_id')
      .notNull()
      .references(() => farmer.id),
    seasonId: uuid('season_id').references(() => season.id),
    tenureId: uuid('tenure_id').references(() => lookupValue.id),
    fromOn: date('from_on', { mode: 'string' }),
    toOn: date('to_on', { mode: 'string' }),
  },
  (table) => [
    check(
      'plot_alloc_dates_check',
      sql`"from_on" IS NULL OR "to_on" IS NULL OR "from_on" <= "to_on"`,
    ),
    index('plot_alloc_plot_id_idx').on(table.plotId),
    index('plot_alloc_farmer_id_idx').on(table.farmerId),
    index('plot_alloc_season_id_idx').on(table.seasonId),
    index('plot_alloc_status_idx').on(table.status),
  ],
);

// 9. Crop Production
export const cropProduction = slisSchema.table(
  'crop_production',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    ...slisReviewableColumns(
      (): AnyPgColumn => appUser.id,
      (): AnyPgColumn => device.id,
      (): AnyPgColumn => importBatch.id,
    ),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => organisation.id),
    plotId: uuid('plot_id')
      .notNull()
      .references(() => plot.id),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id),
    cropTypeId: uuid('crop_type_id')
      .notNull()
      .references(() => lookupValue.id),
    areaHa: numeric('area_ha', { precision: 10, scale: 4 }).notNull(),
    yieldT: numeric('yield_t', { precision: 12, scale: 3 }),
    plantedOn: date('planted_on', { mode: 'string' }),
    harvestedOn: date('harvested_on', { mode: 'string' }),
  },
  (table) => [
    uniqueIndex('crop_prod_plot_season_crop_unique').on(
      table.plotId,
      table.seasonId,
      table.cropTypeId,
    ),
    index('crop_prod_scheme_id_idx').on(table.schemeId),
    index('crop_prod_season_id_idx').on(table.seasonId),
    index('crop_prod_status_idx').on(table.status),
  ],
);

// 10. Water Request
export const waterRequest = slisSchema.table(
  'water_request',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    ...slisReviewableColumns(
      (): AnyPgColumn => appUser.id,
      (): AnyPgColumn => device.id,
      (): AnyPgColumn => importBatch.id,
    ),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => organisation.id),
    level: text('level').notNull(),
    wuaId: uuid('wua_id').references(() => wua.id),
    farmerId: uuid('farmer_id').references(() => farmer.id),
    seasonId: uuid('season_id').references(() => season.id),
    requestedVolumeM3: numeric('requested_volume_m3', { precision: 14, scale: 2 }),
    periodFromOn: date('period_from_on', { mode: 'string' }),
    periodToOn: date('period_to_on', { mode: 'string' }),
    decision: text('decision').notNull().default('pending'),
    decidedBy: uuid('decided_by').references(() => appUser.id),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'string' }),
    decisionNotes: text('decision_notes'),
  },
  (table) => [
    check('water_request_level_check', sql`"level" IN ('apex', 'sector', 'unit', 'individual')`),
    check('water_request_decision_check', sql`"decision" IN ('pending', 'approved', 'rejected')`),
    check(
      'water_request_one_of_check',
      sql`(("level" = 'individual' AND "farmer_id" IS NOT NULL AND "wua_id" IS NULL) OR ("level" != 'individual' AND "wua_id" IS NOT NULL AND "farmer_id" IS NULL))`,
    ),
    index('water_request_scheme_id_idx').on(table.schemeId),
    index('water_request_season_id_idx').on(table.seasonId),
    index('water_request_status_idx').on(table.status),
  ],
);

// 11. Fee Billing
export const feeBilling = slisSchema.table(
  'fee_billing',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    ...slisReviewableColumns(
      (): AnyPgColumn => appUser.id,
      (): AnyPgColumn => device.id,
      (): AnyPgColumn => importBatch.id,
    ),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => organisation.id),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id),
    wuaId: uuid('wua_id').references(() => wua.id),
    farmerId: uuid('farmer_id').references(() => farmer.id),
    amountNgn: numeric('amount_ngn', { precision: 14, scale: 2 }).notNull(),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
  },
  (table) => [
    check(
      'fee_billing_one_of_check',
      sql`(("wua_id" IS NOT NULL AND "farmer_id" IS NULL) OR ("wua_id" IS NULL AND "farmer_id" IS NOT NULL))`,
    ),
    index('fee_billing_scheme_id_idx').on(table.schemeId),
    index('fee_billing_season_id_idx').on(table.seasonId),
    index('fee_billing_status_idx').on(table.status),
  ],
);

// 12. Fee Collection
export const feeCollection = slisSchema.table(
  'fee_collection',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    ...slisReviewableColumns(
      (): AnyPgColumn => appUser.id,
      (): AnyPgColumn => device.id,
      (): AnyPgColumn => importBatch.id,
    ),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => organisation.id),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id),
    billingId: uuid('billing_id').references(() => feeBilling.id),
    wuaId: uuid('wua_id').references(() => wua.id),
    farmerId: uuid('farmer_id').references(() => farmer.id),
    amountNgn: numeric('amount_ngn', { precision: 14, scale: 2 }).notNull(),
    paidOn: date('paid_on', { mode: 'string' }).notNull(),
    receiptNo: text('receipt_no'),
    fieldReceiptRef: text('field_receipt_ref'),
  },
  (table) => [
    check(
      'fee_collection_one_of_check',
      sql`(("wua_id" IS NOT NULL AND "farmer_id" IS NULL) OR ("wua_id" IS NULL AND "farmer_id" IS NOT NULL))`,
    ),
    // Required only when device_id is present (field capture), nullable for web entries
    check(
      'fee_collection_device_receipt_check',
      sql`"device_id" IS NULL OR "field_receipt_ref" IS NOT NULL`,
    ),
    uniqueIndex('fee_collection_device_receipt_unique')
      .on(table.deviceId, table.fieldReceiptRef)
      .where(sql`"device_id" IS NOT NULL AND "field_receipt_ref" IS NOT NULL`),
    uniqueIndex('fee_collection_receipt_no_unique')
      .on(table.receiptNo)
      .where(sql`"receipt_no" IS NOT NULL`),
    index('fee_collection_scheme_id_idx').on(table.schemeId),
    index('fee_collection_season_id_idx').on(table.seasonId),
    index('fee_collection_status_idx').on(table.status),
  ],
);

// 13. Training
export const training = slisSchema.table(
  'training',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    ...slisReviewableColumns(
      (): AnyPgColumn => appUser.id,
      (): AnyPgColumn => device.id,
      (): AnyPgColumn => importBatch.id,
    ),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => organisation.id),
    topic: text('topic').notNull(),
    trainerName: text('trainer_name'),
    heldOn: date('held_on', { mode: 'string' }).notNull(),
    venue: text('venue'),
    topicsCovered: text('topics_covered'),
  },
  (table) => [
    index('training_scheme_id_idx').on(table.schemeId),
    index('training_held_on_idx').on(table.heldOn),
    index('training_status_idx').on(table.status),
  ],
);

// 14. Training Attendance
export const trainingAttendance = slisSchema.table(
  'training_attendance',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    trainingId: uuid('training_id')
      .notNull()
      .references(() => training.id, { onDelete: 'cascade' }),
    farmerId: uuid('farmer_id').references(() => farmer.id),
    staffUserId: uuid('staff_user_id').references(() => appUser.id),
    staffName: text('staff_name'),
    gender: text('gender'),
    notes: text('notes'),
  },
  (table) => [
    check(
      'training_attendance_one_of_check',
      sql`(("farmer_id" IS NOT NULL AND "staff_user_id" IS NULL AND "staff_name" IS NULL) OR ("farmer_id" IS NULL AND ("staff_user_id" IS NOT NULL OR "staff_name" IS NOT NULL)))`,
    ),
    uniqueIndex('training_attendance_farmer_unique')
      .on(table.trainingId, table.farmerId)
      .where(sql`"farmer_id" IS NOT NULL`),
    index('training_attendance_training_id_idx').on(table.trainingId),
  ],
);

// 15. Stream Flow Reading
export const streamFlowReading = slisSchema.table(
  'stream_flow_reading',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    ...slisReviewableColumns(
      (): AnyPgColumn => appUser.id,
      (): AnyPgColumn => device.id,
      (): AnyPgColumn => importBatch.id,
    ),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => organisation.id),
    stationId: uuid('station_id').notNull(), // ref: blis.station (no cross-schema FK per ADR-0002)
    readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }).notNull(),
    value: numeric('value', { precision: 14, scale: 4 }).notNull(),
    unit: text('unit').notNull().default('m3/s'),
    gaugeHeightM: numeric('gauge_height_m', { precision: 8, scale: 4 }),
    location: geometryPoint('location'),
  },
  (table) => [
    index('stream_flow_scheme_id_idx').on(table.schemeId),
    index('stream_flow_station_id_idx').on(table.stationId),
    index('stream_flow_read_at_idx').on(table.readAt),
    index('stream_flow_status_idx').on(table.status),
  ],
);

// 16. Report Refresh Log
export const reportRefresh = slisSchema.table('report_refresh', {
  id: integer('id').primaryKey().default(1),
  refreshedAt: timestamp('refreshed_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

// 17. Asynchronous Export Job
export const exportJob = slisSchema.table(
  'export_job',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id),
    dataset: text('dataset').notNull(),
    filters: jsonb('filters').$type<Record<string, unknown>>().default({}),
    status: text('status').notNull().default('queued'),
    fileId: uuid('file_id').references(() => file.id),
    rowCount: integer('row_count'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('export_job_user_id_idx').on(table.userId),
    index('export_job_status_idx').on(table.status),
  ],
);

// 18. Materialised Views (tables/views mapping in Drizzle)
export const mvFarmersByScope = slisSchema.table(
  'mv_farmers_by_scope',
  {
    schemeId: uuid('scheme_id').notNull(),
    sectorId: uuid('sector_id'),
    sectorKey: uuid('sector_key').notNull(),
    stateId: uuid('state_id'),
    stateKey: uuid('state_key').notNull(),
    gender: text('gender').notNull(),
    farmerCount: integer('farmer_count').notNull(),
  },
  (table) => [
    uniqueIndex('mv_farmers_by_scope_unique').on(
      table.schemeId,
      table.sectorKey,
      table.stateKey,
      table.gender,
    ),
  ],
);

export const mvAreaByService = slisSchema.table(
  'mv_area_by_service',
  {
    schemeId: uuid('scheme_id').notNull(),
    stateId: uuid('state_id'),
    stateKey: uuid('state_key').notNull(),
    serviceType: text('service_type'),
    serviceKey: text('service_key').notNull(),
    totalHa: numeric('total_ha', { precision: 14, scale: 4 }).notNull(),
    plotCount: integer('plot_count').notNull(),
  },
  (table) => [
    uniqueIndex('mv_area_by_service_unique').on(table.schemeId, table.stateKey, table.serviceKey),
  ],
);

export const mvCropping = slisSchema.table(
  'mv_cropping',
  {
    schemeId: uuid('scheme_id').notNull(),
    stateId: uuid('state_id'),
    stateKey: uuid('state_key').notNull(),
    seasonId: uuid('season_id').notNull(),
    cropTypeId: uuid('crop_type_id').notNull(),
    totalAreaHa: numeric('total_area_ha', { precision: 14, scale: 4 }).notNull(),
    totalYieldT: numeric('total_yield_t', { precision: 14, scale: 3 }),
    avgYieldTHa: numeric('avg_yield_t_ha', { precision: 14, scale: 4 }),
  },
  (table) => [
    uniqueIndex('mv_cropping_unique').on(
      table.schemeId,
      table.stateKey,
      table.seasonId,
      table.cropTypeId,
    ),
  ],
);

export const mvFeeRecovery = slisSchema.table(
  'mv_fee_recovery',
  {
    schemeId: uuid('scheme_id').notNull(),
    stateId: uuid('state_id'),
    stateKey: uuid('state_key').notNull(),
    seasonId: uuid('season_id').notNull(),
    wuaId: uuid('wua_id'),
    wuaKey: uuid('wua_key').notNull(),
    billedNgn: numeric('billed_ngn', { precision: 14, scale: 2 }).notNull(),
    collectedNgn: numeric('collected_ngn', { precision: 14, scale: 2 }).notNull(),
    recoveryRatePct: numeric('recovery_rate_pct', { precision: 7, scale: 2 }),
  },
  (table) => [
    uniqueIndex('mv_fee_recovery_unique').on(
      table.schemeId,
      table.stateKey,
      table.seasonId,
      table.wuaKey,
    ),
  ],
);
