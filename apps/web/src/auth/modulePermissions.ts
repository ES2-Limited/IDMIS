import { permissions } from '@idmis/contracts';

/**
 * Operational permissions required to enter each top-level module.
 * Shared reference-read permissions (e.g. `core.organisation.read`,
 * `slis.farmer.read`, `slis.plot.read`, `blis.map.read`) are intentionally
 * excluded so cross-module lookups do not unlock other modules.
 */
export const MODULE_PERMISSIONS = {
  core: [permissions.CORE_USER_READ, permissions.CORE_AUDIT_READ, permissions.CORE_IMPORT_RUN],
  slis: [
    permissions.SLIS_FARMER_CREATE,
    permissions.SLIS_FARMER_UPDATE,
    permissions.SLIS_PLOT_MANAGE,
    permissions.SLIS_WATER_REQUEST_READ,
    permissions.SLIS_REVIEW_SUBMIT,
  ],
  me: [permissions.ME_INDICATOR_READ, permissions.ME_SURVEY_MANAGE, permissions.ME_VALUE_SUBMIT],
  blis: [
    permissions.BLIS_BASIN_READ,
    permissions.BLIS_DAM_MANAGE,
    permissions.BLIS_STATION_MANAGE,
    permissions.BLIS_INSPECTION_RECORD,
  ],
  field: [
    permissions.SLIS_SYNC_PUSH,
    permissions.SLIS_FARMER_CREATE,
    permissions.BLIS_INSPECTION_RECORD,
  ],
} as const;
