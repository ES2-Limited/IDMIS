# TRIMING IDMIS 2.0 — Role-Based User Guide

This guide provides operational walkthroughs, workflows, and responsibilities for each persona operating on the TRIMING Irrigation Data Management Information System (IDMIS).

---

## 1. Field Collector (Offline & PWA Mobile App)

### Responsibilities

- Offline farmer profiling and identification (NIN/BVN encryption on capture).
- Digital plot boundary mapping (GPS walk mode & manual polygon vertices).
- Collection of physical fee receipts, water delivery requests, and field surveys.
- Offline record caching with automatic sync resolution when connectivity resumes.

### Key Workflows

1. **Field Station Dashboard (`/field`)**:
   - Access rapid-access tiles for Farmer Registration, Plot Mapping, Water Order, Fee Collection, and Surveys.
2. **Offline Data Capture (`/field/capture`)**:
   - Submit new records with immediate local SQLite/IndexedDB persistence.
   - Status indicators display `saved_on_device` immediately.
3. **Sync Centre (`/field/sync`)**:
   - View pending mutations, triggering manual bi-directional push/pull sync.

---

## 2. Scheme Data Officer

### Responsibilities

- Day-to-day command sector management within assigned scheme boundary (e.g. KRIS, BIS, HVIP).
- Processing water distribution requests and canal discharge allocation schedules.
- Reviewing farmer applications and mediating plot boundary conflict cases.
- Batch spreadsheet imports of legacy farmer or WUA records.

### Key Workflows

1. **Farmer Registry (`/slis/farmers`)**:
   - Filter, verify, and approve farmer households and land tenure rights.
2. **Review & Conflicts Queue (`/slis/review`)**:
   - Compare side-by-side polygon overlaps or duplicate identities; sign off on approved boundaries or return with notes.
3. **Water Requests Ledger (`/slis/water`)**:
   - Schedule discharge dates, gate turns, and seasonal delivery volumes.

---

## 3. M&E Officer (Monitoring & Evaluation)

### Responsibilities

- Maintenance of the 18-Indicator Results Framework.
- Quarterly telemetry entry across output, intermediate outcome, and project development indicators.
- Administering farmer and WUA field surveys.
- Tracking matching grant disbursements and technology adoption.

### Key Workflows

1. **Results Framework (`/me/indicators`)**:
   - View indicator baselines, cumulative targets, and disaggregation criteria.
2. **Quarterly Data Entry (`/me/entry`)**:
   - Enter quarterly realized figures with digital sign-off and validation checks.
3. **Target vs. Actual Matrix (`/me/matrix`)**:
   - Inspect multi-year progress bars, annual variances, and print-ready formal reports.

---

## 4. Basin Hydrology & Dam Safety Officer

### Responsibilities

- Monitoring hydrometric station telemetry (river discharge, reservoir level, rainfall).
- Statutory visual dam surveillance and engineering component inspections.
- Morphometry and catchment polygon boundary oversight.

### Key Workflows

1. **Interactive GIS Workspace (`/blis`)**:
   - Toggle vector layers (basins, dams, telemetry stations, canal networks).
   - Upload new shapefiles (`.zip`) or GeoJSON datasets with bounding box previews.
2. **Dams & Reservoirs (`/blis/dams`)**:
   - Track storage capacities, dead pool thresholds, and crest elevations.
3. **Dam Safety Inspections (`/blis/inspections`)**:
   - Record component grades (embankment, spillway, instrumentation), hazard classes, and scheduling next surveillance intervals.

---

## 5. State Coordinator & Programme Management

### Responsibilities

- High-level multi-scheme oversight across state RBDAs.
- Monitoring farmer enrollment velocity, command area utilization, and Irrigation Service Fee (ISF) collection recovery.
- Executive reporting to the Federal Ministry of Water Resources and Sanitation.

### Key Workflows

1. **Role Dashboards (`/`)**:
   - Filter by National, State, or Scheme scope.
   - Interactive drill-down metric cards clicking directly into underlying registries.
2. **Organisations Tree (`/core/organisations`)**:
   - Manage RBDA institutional hierarchies, sectors, and WUA federations.
3. **Audit Log & User Management (`/core/users`)**:
   - Enforce RBAC security permissions and geographical tenant scopes.
