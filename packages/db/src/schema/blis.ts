import {
  pgSchema,
  uuid,
  text,
  boolean,
  smallint,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  check,
  unique,
  uniqueIndex,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  standardColumns,
  slisReviewableColumns,
  geometryPoint,
  geometryMultiPolygon,
  geometryGeneric,
} from './common';
import { appUser, organisation, ward, lga, lookupValue, file, importBatch, device } from './core';

export const blisSchema = pgSchema('blis');

// 1. Basin
export const basin = blisSchema.table(
  'basin',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    altName: text('alt_name'),
    hydrologicalUnit: text('hydrological_unit'),
    mainRiver: text('main_river'),
    rbdaId: uuid('rbda_id').references((): AnyPgColumn => organisation.id),
    geom: geometryMultiPolygon('geom'),
    importBatchId: uuid('import_batch_id').references((): AnyPgColumn => importBatch.id),
  },
  (table) => [
    index('basin_geom_gist_idx').using('gist', table.geom),
    index('basin_rbda_id_idx').on(table.rbdaId),
  ],
);

// 2. Basin Morphometry
export const basinMorphometry = blisSchema.table(
  'basin_morphometry',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    basinId: uuid('basin_id')
      .notNull()
      .references((): AnyPgColumn => basin.id),
    measuredOn: date('measured_on', { mode: 'string' }).notNull(),
    lowestPointM: numeric('lowest_point_m', { precision: 10, scale: 2 }),
    highestPointM: numeric('highest_point_m', { precision: 10, scale: 2 }),
    avgSlopePct: numeric('avg_slope_pct', { precision: 8, scale: 3 }),
    streamCount: integer('stream_count'),
    streamLengthTotalKm: numeric('stream_length_total_km', { precision: 12, scale: 3 }),
    streamLengthAvgKm: numeric('stream_length_avg_km', { precision: 10, scale: 3 }),
    drainageDensity: numeric('drainage_density', { precision: 10, scale: 4 }),
    streamOrder: smallint('stream_order'),
    reliefM: numeric('relief_m', { precision: 10, scale: 2 }),
    lengthKm: numeric('length_km', { precision: 10, scale: 3 }),
    perimeterKm: numeric('perimeter_km', { precision: 10, scale: 3 }),
  },
  (table) => [
    unique('basin_morphometry_basin_date_unique').on(table.basinId, table.measuredOn),
    index('basin_morphometry_basin_id_idx').on(table.basinId),
  ],
);

// 3. Station
export const station = blisSchema.table(
  'station',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    basinId: uuid('basin_id')
      .notNull()
      .references((): AnyPgColumn => basin.id),
    stationTypeId: uuid('station_type_id')
      .notNull()
      .references((): AnyPgColumn => lookupValue.id),
    wardId: uuid('ward_id').references((): AnyPgColumn => ward.id),
    river: text('river'),
    geom: geometryPoint('geom').notNull(),
    installedOn: date('installed_on', { mode: 'string' }),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    importBatchId: uuid('import_batch_id').references((): AnyPgColumn => importBatch.id),
  },
  (table) => [
    index('station_geom_gist_idx').using('gist', table.geom),
    index('station_basin_id_idx').on(table.basinId),
    index('station_type_id_idx').on(table.stationTypeId),
  ],
);

// 4. Parameter
export const parameter = blisSchema.table('parameter', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  defaultUnit: text('default_unit').notNull(),
});

// 5. Measurement (Range partitioned by observed_at)
export const measurement = blisSchema.table(
  'measurement',
  {
    id: uuid('id').notNull(),
    stationId: uuid('station_id')
      .notNull()
      .references((): AnyPgColumn => station.id),
    parameterId: uuid('parameter_id')
      .notNull()
      .references((): AnyPgColumn => parameter.id),
    observedAt: timestamp('observed_at', { withTimezone: true, mode: 'string' }).notNull(),
    value: numeric('value', { precision: 16, scale: 4 }).notNull(),
    unit: text('unit').notNull(),
    quality: text('quality').notNull().default('raw'),
    source: text('source').notNull(),
    importBatchId: uuid('import_batch_id').references((): AnyPgColumn => importBatch.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references((): AnyPgColumn => appUser.id),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.observedAt] }),
    unique('measurement_station_param_observed_unique').on(
      table.stationId,
      table.parameterId,
      table.observedAt,
    ),
    check('measurement_quality_check', sql`"quality" IN ('raw', 'checked', 'suspect')`),
    check('measurement_source_check', sql`"source" IN ('manual', 'import', 'logger')`),
    index('measurement_observed_at_idx').on(table.observedAt),
    index('measurement_station_id_idx').on(table.stationId),
  ],
);

// 6. Reservoir
export const reservoir = blisSchema.table(
  'reservoir',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    basinId: uuid('basin_id')
      .notNull()
      .references((): AnyPgColumn => basin.id),
    name: text('name').notNull(),
    river: text('river'),
    areaKm2: numeric('area_km2', { precision: 12, scale: 3 }),
    volumeMcm: numeric('volume_mcm', { precision: 14, scale: 3 }),
    meanDepthM: numeric('mean_depth_m', { precision: 8, scale: 2 }),
    maxDepthM: numeric('max_depth_m', { precision: 8, scale: 2 }),
    relativeDepth: numeric('relative_depth', { precision: 8, scale: 4 }),
    maxLengthKm: numeric('max_length_km', { precision: 10, scale: 3 }),
    maxWidthKm: numeric('max_width_km', { precision: 10, scale: 3 }),
    meanElevationM: numeric('mean_elevation_m', { precision: 10, scale: 2 }),
    sedimentRatio: numeric('sediment_ratio', { precision: 10, scale: 4 }),
    fetchKm: numeric('fetch_km', { precision: 10, scale: 3 }),
    depthRatio: numeric('depth_ratio', { precision: 10, scale: 4 }),
    volumeDevelopment: numeric('volume_development', { precision: 10, scale: 4 }),
    geom: geometryMultiPolygon('geom'),
    importBatchId: uuid('import_batch_id').references((): AnyPgColumn => importBatch.id),
  },
  (table) => [
    index('reservoir_geom_gist_idx').using('gist', table.geom),
    index('reservoir_basin_id_idx').on(table.basinId),
  ],
);

// 7. Dam
export const dam = blisSchema.table(
  'dam',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    code: text('code').unique(),
    name: text('name').notNull(),
    altName: text('alt_name'),
    basinId: uuid('basin_id')
      .notNull()
      .references((): AnyPgColumn => basin.id),
    reservoirId: uuid('reservoir_id').references((): AnyPgColumn => reservoir.id),
    secondaryOfDamId: uuid('secondary_of_dam_id').references((): AnyPgColumn => dam.id),
    purposeId: uuid('purpose_id').references((): AnyPgColumn => lookupValue.id),
    categoryId: uuid('category_id').references((): AnyPgColumn => lookupValue.id),
    completionYear: smallint('completion_year'),
    foundation: text('foundation'),
    heightM: numeric('height_m', { precision: 8, scale: 2 }),
    crestLengthM: numeric('crest_length_m', { precision: 10, scale: 2 }),
    bodyVolumeMcm: numeric('body_volume_mcm', { precision: 12, scale: 3 }),
    spillwayType: text('spillway_type'),
    spillwayCapacityM3s: numeric('spillway_capacity_m3s', { precision: 12, scale: 2 }),
    reservoirCapacityMcm: numeric('reservoir_capacity_mcm', { precision: 14, scale: 3 }),
    reservoirAreaKm2: numeric('reservoir_area_km2', { precision: 12, scale: 3 }),
    reservoirLengthKm: numeric('reservoir_length_km', { precision: 10, scale: 3 }),
    hydropowerMw: numeric('hydropower_mw', { precision: 10, scale: 2 }),
    meanAnnualEnergyGwh: numeric('mean_annual_energy_gwh', { precision: 12, scale: 2 }),
    irrigatedAreaHa: numeric('irrigated_area_ha', { precision: 12, scale: 2 }),
    catchmentKm2: numeric('catchment_km2', { precision: 12, scale: 2 }),
    ownerOrgId: uuid('owner_org_id').references((): AnyPgColumn => organisation.id),
    consultantOrgId: uuid('consultant_org_id').references((): AnyPgColumn => organisation.id),
    contractorOrgId: uuid('contractor_org_id').references((): AnyPgColumn => organisation.id),
    lgaId: uuid('lga_id').references((): AnyPgColumn => lga.id),
    nearestTown: text('nearest_town'),
    resettlementNotes: text('resettlement_notes'),
    notes: text('notes'),
    geom: geometryPoint('geom'),
    altitudeM: numeric('altitude_m', { precision: 8, scale: 2 }),
    importBatchId: uuid('import_batch_id').references((): AnyPgColumn => importBatch.id),
  },
  (table) => [
    index('dam_geom_gist_idx').using('gist', table.geom),
    index('dam_basin_id_idx').on(table.basinId),
    index('dam_reservoir_id_idx').on(table.reservoirId),
  ],
);

// 8. Dam Safety Inspection
export const damSafetyInspection = blisSchema.table(
  'dam_safety_inspection',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    ...slisReviewableColumns(
      (): AnyPgColumn => appUser.id,
      (): AnyPgColumn => device.id,
      (): AnyPgColumn => importBatch.id,
    ),
    damId: uuid('dam_id')
      .notNull()
      .references((): AnyPgColumn => dam.id),
    inspectedOn: date('inspected_on', { mode: 'string' }).notNull(),
    nextDueOn: date('next_due_on', { mode: 'string' }),
    hazardClassId: uuid('hazard_class_id').references((): AnyPgColumn => lookupValue.id),
    specificHazards: text('specific_hazards'),
    safetyContact: text('safety_contact'),
    staffOnSite: integer('staff_on_site'),
    staffQualifications: text('staff_qualifications'),
    safetyBudgetNgn: numeric('safety_budget_ngn', { precision: 16, scale: 2 }),
    meetsStandard: boolean('meets_standard'),
  },
  (table) => [
    unique('dam_safety_inspection_dam_date_unique').on(table.damId, table.inspectedOn),
    index('dam_safety_inspection_dam_id_idx').on(table.damId),
    index('dam_safety_inspection_status_idx').on(table.status),
  ],
);

// 9. Dam Component Condition
export const damComponentCondition = blisSchema.table(
  'dam_component_condition',
  {
    inspectionId: uuid('inspection_id')
      .notNull()
      .references((): AnyPgColumn => damSafetyInspection.id, { onDelete: 'cascade' }),
    component: text('component').notNull(),
    ratingId: uuid('rating_id')
      .notNull()
      .references((): AnyPgColumn => lookupValue.id),
    notes: text('notes'),
  },
  (table) => [
    primaryKey({ columns: [table.inspectionId, table.component] }),
    check(
      'dam_component_condition_component_check',
      sql`"component" IN ('dam_body', 'spillway_1', 'spillway_2', 'inlet', 'outlet', 'electrical', 'mechanical')`,
    ),
  ],
);

// 10. Bio Resource Occurrence
export const bioResourceOccurrence = blisSchema.table(
  'bio_resource_occurrence',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    basinId: uuid('basin_id')
      .notNull()
      .references((): AnyPgColumn => basin.id),
    resourceId: uuid('resource_id')
      .notNull()
      .references((): AnyPgColumn => lookupValue.id),
    occurrenceId: uuid('occurrence_id')
      .notNull()
      .references((): AnyPgColumn => lookupValue.id),
  },
  (table) => [index('bio_resource_occurrence_basin_id_idx').on(table.basinId)],
);

// 11. Water Use Priority
export const waterUsePriority = blisSchema.table(
  'water_use_priority',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    basinId: uuid('basin_id')
      .notNull()
      .references((): AnyPgColumn => basin.id),
    waterUseId: uuid('water_use_id')
      .notNull()
      .references((): AnyPgColumn => lookupValue.id),
    priorityId: uuid('priority_id')
      .notNull()
      .references((): AnyPgColumn => lookupValue.id),
  },
  (table) => [index('water_use_priority_basin_id_idx').on(table.basinId)],
);

// 12. Stakeholder
export const stakeholder = blisSchema.table(
  'stakeholder',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    name: text('name').notNull(),
    abbreviation: text('abbreviation'),
    categoryId: uuid('category_id').references((): AnyPgColumn => lookupValue.id),
    contactName: text('contact_name'),
    phone: text('phone'),
    email: text('email'),
  },
  (table) => [index('stakeholder_category_id_idx').on(table.categoryId)],
);

// 13. Stakeholder Basin
export const stakeholderBasin = blisSchema.table(
  'stakeholder_basin',
  {
    stakeholderId: uuid('stakeholder_id')
      .notNull()
      .references((): AnyPgColumn => stakeholder.id, { onDelete: 'cascade' }),
    basinId: uuid('basin_id')
      .notNull()
      .references((): AnyPgColumn => basin.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.stakeholderId, table.basinId] }),
    index('stakeholder_basin_basin_id_idx').on(table.basinId),
  ],
);

// 14. Map Layer
export const mapLayer = blisSchema.table(
  'map_layer',
  {
    ...standardColumns((): AnyPgColumn => appUser.id),
    name: text('name').notNull(),
    layerTypeId: uuid('layer_type_id')
      .notNull()
      .references((): AnyPgColumn => lookupValue.id),
    basinId: uuid('basin_id').references((): AnyPgColumn => basin.id),
    sourceFileId: uuid('source_file_id').references((): AnyPgColumn => file.id),
    details: text('details'),
    areaKm2: numeric('area_km2', { precision: 12, scale: 3 }),
  },
  (table) => [
    index('map_layer_basin_id_idx').on(table.basinId),
    index('map_layer_type_id_idx').on(table.layerTypeId),
  ],
);

// 15. Map Feature
export const mapFeature = blisSchema.table(
  'map_feature',
  {
    id: uuid('id').primaryKey(),
    layerId: uuid('layer_id')
      .notNull()
      .references((): AnyPgColumn => mapLayer.id, { onDelete: 'cascade' }),
    properties: jsonb('properties')
      .notNull()
      .default(sql`'{}'::jsonb`),
    geom: geometryGeneric('geom').notNull(),
  },
  (table) => [
    index('map_feature_geom_gist_idx').using('gist', table.geom),
    index('map_feature_layer_id_idx').on(table.layerId),
  ],
);

// 16. Materialised View: blis.mv_latest_reading
export const mvLatestReading = blisSchema.table(
  'mv_latest_reading',
  {
    stationId: uuid('station_id').notNull(),
    parameterId: uuid('parameter_id').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true, mode: 'string' }).notNull(),
    value: numeric('value', { precision: 16, scale: 4 }).notNull(),
    unit: text('unit').notNull(),
    quality: text('quality').notNull(),
  },
  (table) => [uniqueIndex('mv_latest_reading_unique').on(table.stationId, table.parameterId)],
);

// 17. Materialised View: blis.mv_dam_status
export const mvDamStatus = blisSchema.table(
  'mv_dam_status',
  {
    damId: uuid('dam_id').notNull(),
    inspectionId: uuid('inspection_id').notNull(),
    inspectedOn: date('inspected_on', { mode: 'string' }).notNull(),
    meetsStandard: boolean('meets_standard').notNull(),
    hazardClassId: uuid('hazard_class_id'),
    hazardClass: text('hazard_class'),
    nextDueOn: date('next_due_on', { mode: 'string' }),
    isOverdue: boolean('is_overdue').notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (table) => [uniqueIndex('mv_dam_status_dam_id_unique').on(table.damId)],
);
