TRIMING IDMIS 2.0 — Database Schema

ES2 Limited · Oct 20, 2026 · @Saifur-Rahman Yusuf

IDMIS 2.0 uses one PostgreSQL 16 database with PostGIS, split into one schema per module: core, slis, me and blis (and proc later). This doc defines every table, the conventions they share, and the reasons behind them. Definitions are written as SQL for precision; the source of truth in code is Drizzle in packages/db/schema/. The companion doc TRIMING IDMIS 2.0 — System Architecture shows how the database fits the rest of the system.

1. Concepts and conventions

1.1 Naming

Schemas and tables in snake_case, singular nouns: slis.farmer, blis.dam.

Foreign keys are <table>_id: farmer_id, scheme_id (a scheme is a row in core.organisation).

Cross-module references (no foreign key, see 1.4) are named the same way and documented with -- ref: blis.station.

Booleans start with is_ or has_; timestamps end with _at; dates end with _on.

1.2 Columns on every table

id uuid primary key, -- UUIDv7, may be generated on a phoneversion integer not null default 1, -- +1 on every update; used for conflictscreated_at timestamptz not null default now(),created_by uuid not null references core.app_user(id),updated_at timestamptz not null default now(),updated_by uuid not null references core.app_user(id),deleted_at timestamptz null -- soft delete

Tables that can be imported add import_batch_id uuid null references core.import_batch(id). Tables captured in the field add status core.record_status not null default 'draft' and device_id uuid null references core.device(id). In the definitions below, "+ std" means these columns. Scoped tables with a location (households, farmers, plots, fee collections, survey responses, stations) also carry `state_id`, filled by a trigger from `ward_id` (see 8.2).

1.3 Concepts

| Concept | What it means | Why |

Concept

What it means

Why

| UUIDv7 primary keys | Random-looking ids that still sort by creation time | A phone can create a farmer offline and keep the same id after sync; no clashes; good index performance |

UUIDv7 primary keys

Random-looking ids that still sort by creation time

A phone can create a farmer offline and keep the same id after sync; no clashes; good index performance

| version column | Optimistic concurrency: an update says which version it started from | A stale offline edit becomes a conflict instead of silently overwriting newer data |

version column

Optimistic concurrency: an update says which version it started from

A stale offline edit becomes a conflict instead of silently overwriting newer data

| Soft delete | Rows get a deleted_at instead of being removed | Audit and sync need to know a record was deleted; undo is possible |

Soft delete

Rows get a deleted_at instead of being removed

Audit and sync need to know a record was deleted; undo is possible

| Record status | draft, submitted, approved, returned (Postgres enum core.record_status) | Drives the review workflow; only approved rows count in reports and indicators |

Record status

draft, submitted, approved, returned (Postgres enum core.record_status)

Drives the review workflow; only approved rows count in reports and indicators

| Scope columns | Every business row carries scheme_id (or basin_id in BLIS) and a location (ward_id or geometry) | Lets one indexed filter answer "may this user see this row?" for scheme, RBDA and state scope |

Scope columns

Every business row carries scheme_id (or basin_id in BLIS) and a location (ward_id or geometry)

Lets one indexed filter answer "may this user see this row?" for scheme, RBDA and state scope

| Lookups vs enums | Fixed system states are Postgres enums; anything an admin may change is a row in core.lookup_value | Admins add a crop type or document type without a code release |

Lookups vs enums

Fixed system states are Postgres enums; anything an admin may change is a row in core.lookup_value

Admins add a crop type or document type without a code release

| Encrypted fields | Identity numbers are encrypted in the application (AES-256-GCM) and stored as bytea, with a separate keyed hash for exact-match search | A database dump or backup alone never reveals NIN, BVN or bank numbers |

Encrypted fields

Identity numbers are encrypted in the application (AES-256-GCM) and stored as bytea, with a separate keyed hash for exact-match search

A database dump or backup alone never reveals NIN, BVN or bank numbers

| Geometry | PostGIS geometry in SRID 4326 (WGS 84, the same as phone GPS); points for stations and farmers, polygons for plots and basins | Maps, area in hectares, "which ward is this plot in" queries |

Geometry

PostGIS geometry in SRID 4326 (WGS 84, the same as phone GPS); points for stations and farmers, polygons for plots and basins

Maps, area in hectares, "which ward is this plot in" queries

| Money | numeric(14,2) in naira | Exact arithmetic for fees; no floating-point rounding |

Money

numeric(14,2) in naira

Exact arithmetic for fees; no floating-point rounding

| Partitioning | Large time-series tables split by year (blis.measurement) | Fast queries and cheap archiving as readings grow into the millions |

Partitioning

Large time-series tables split by year (blis.measurement)

Fast queries and cheap archiving as readings grow into the millions

1.4 Foreign key rules

Inside a schema: foreign keys everywhere.

From a business schema to core: foreign keys allowed (organisations, WUAs, geography, users, files, lookups).

Between business schemas (e.g. slis → blis): no foreign key. Store the id, validate it through the other module's public service, and mark it -- ref:. This keeps each module separable.

on delete restrict by default; soft delete means hard deletes are rare and deliberate.

2. Schema map

schema map · four schemas and how they reference each other

| Schema | Owned by | Holds | References |

Schema

Owned by

Holds

References

| core | Core module | Shared reference data, users and access, files, and platform tables (audit, events, sync, imports) | — |

core

Core module

Shared reference data, users and access, files, and platform tables (audit, events, sync, imports)

—

| slis | SLIS module | Farmers, households, plots, water requests, fees, crops, trainings | core by foreign key; blis.station by id |

slis

SLIS module

Farmers, households, plots, water requests, fees, crops, trainings

core by foreign key; blis.station by id

| me | M&E module | Results framework, indicator targets and values, surveys | core by foreign key; slis.farmer and slis.household by id |

me

M&E module

Results framework, indicator targets and values, surveys

core by foreign key; slis.farmer and slis.household by id

| blis | BLIS module | Basins, stations, time series, reservoirs, dams, safety inspections | core by foreign key |

blis

BLIS module

Basins, stations, time series, reservoirs, dams, safety inspections

core by foreign key

| proc (later) | Procurement module | Plans, packages, contracts, milestones | core; me.indicator by id |

proc (later)

Procurement module

Plans, packages, contracts, milestones

core; me.indicator by id

M&E computed indicators do not join across schemas. They call SLIS and BLIS public query services, which run inside their own schemas.

3. core schema

core relationships · geography, organisations, WUAs, access

Core holds three families of tables: geography (state → LGA → ward), organisations and WUAs (each a tree through parent_id), and access (users, roles, assignments). Assignments are what make scheme, RBDA and state scope work.

create type core.org_type as enum ('pcu','rbda','scheme','sector','contractor','consultant','other');create type core.wua_level as enum ('apex','sector','unit');create type core.scope_type as enum ('national','state','rbda','scheme','sector');create type core.record_status as enum ('draft','submitted','approved','returned');create type core.module_key as enum ('core','slis','me','blis','proc');-- Geography (seeded from official lists)create table core.state ( id uuid primary key, code text not null unique, name text not null, geom geometry(MultiPolygon, 4326) -- + std);create table core.lga ( id uuid primary key, state_id uuid not null references core.state, code text not null unique, name text not null, geom geometry(MultiPolygon, 4326));create table core.ward ( id uuid primary key, lga_id uuid not null references core.lga, code text not null unique, name text not null, geom geometry(MultiPolygon, 4326));-- Organisations: PCU, RBDAs, schemes, sectors, contractorscreate table core.organisation ( id uuid primary key, type core.org_type not null, parent_id uuid references core.organisation, -- RBDA > scheme > sector code text not null unique, name text not null, short_name text, address text, phone text, email text, geom geometry(Geometry, 4326), -- scheme or sector outline is_active boolean not null default true -- + std);create table core.organisation_state ( -- a scheme can span states organisation_id uuid not null references core.organisation, state_id uuid not null references core.state, primary key (organisation_id, state_id));-- Water users associationscreate table core.wua ( id uuid primary key, level core.wua_level not null, parent_id uuid references core.wua, -- apex > sector > unit organisation_id uuid not null references core.organisation, -- scheme or sector ward_id uuid references core.ward, reg_no text, name text not null, address text, bank_name text, bank_account_enc bytea, is_operational boolean not null default false, -- indicator 10 has_maintenance_fund boolean not null default false, -- indicator 9 unique (organisation_id, reg_no) -- + std, import_batch_id);create table core.wua_officer ( id uuid primary key, wua_id uuid not null references core.wua, office text not null check (office in ('chair','secretary','treasurer','other')), full_name text not null, phone text, from_on date, to_on date -- + std);-- Accesscreate table core.app_user ( id uuid primary key, email citext not null unique, username citext unique, full_name text not null, phone text, password_hash text not null, -- Argon2id totp_secret_enc bytea, is_active boolean not null default true, failed_sign_ins integer not null default 0, locked_until timestamptz, last_sign_in_at timestamptz -- + std (created_by nullable for the first admin));create table core.role ( id uuid primary key, key text not null unique, name text not null, description text, is_system boolean not null default false);create table core.role_permission ( role_id uuid not null references core.role, permission text not null, -- 'slis.farmer.create' primary key (role_id, permission));create table core.assignment ( id uuid primary key, user_id uuid not null references core.app_user, role_id uuid not null references core.role, module core.module_key not null, scope_type core.scope_type not null, scope_state_id uuid references core.state, scope_org_id uuid references core.organisation, can_capture_offline boolean not null default false, valid_from_on date, valid_to_on date, check ( (scope_type = 'national' and scope_state_id is null and scope_org_id is null) or (scope_type = 'state' and scope_state_id is not null and scope_org_id is null) or (scope_type in ('rbda','scheme','sector') and scope_org_id is not null and scope_state_id is null) ) -- + std);-- Admin-editable lists: crop types, document types, station types, etc.create table core.lookup_type ( id uuid primary key, key text not null unique, name text not null, module core.module_key not null, is_system boolean not null default false);create table core.lookup_value ( id uuid primary key, lookup_type_id uuid not null references core.lookup_type, code text not null, label text not null, sort_order integer not null default 0, is_active boolean not null default true, unique (lookup_type_id, code));-- Files in R2create table core.file ( id uuid primary key, storage_key text not null unique, original_name text, mime_type text not null, size_bytes bigint not null, sha256 text not null, scan_status text not null default 'pending' check (scan_status in ('pending','clean','infected')), owner_entity text, owner_id uuid -- + std);-- System settings, e.g. offline_capture_days = 7create table core.setting ( key text primary key, value jsonb not null, updated_at timestamptz not null default now(), updated_by uuid references core.app_user);

4. slis schema

slis relationships · farmer and plot as anchors

Every SLIS row carries scheme_id (organisation of type scheme) for scope, and field-captured rows carry status and device_id. Water requests and fees can belong to either a WUA or a farmer, enforced with a check that exactly one is set.

create type slis.request_level as enum ('apex','sector','unit','individual');create table slis.season ( id uuid primary key, scheme_id uuid not null references core.organisation, name text not null, starts_on date not null, ends_on date not null -- + std);create table slis.household ( id uuid primary key, scheme_id uuid not null references core.organisation, ward_id uuid references core.ward, size integer, males integer, females integer, children integer -- + std, status, device_id, import_batch_id);create table slis.farmer_group ( id uuid primary key, scheme_id uuid not null references core.organisation, name text not null, group_type_id uuid references core.lookup_value -- + std);create table slis.farmer ( id uuid primary key, scheme_id uuid not null references core.organisation, sector_id uuid references core.organisation, farmer_code text not null, first_name text not null, last_name text not null, other_names text, gender text not null check (gender in ('female','male')), birth_year smallint, phone text, village text, ward_id uuid references core.ward, state_id uuid references core.state, -- set by trigger from ward_id household_id uuid references slis.household, unit_wua_id uuid references core.wua, farmer_group_id uuid references slis.farmer_group, marital_status_id uuid references core.lookup_value, next_of_kin_name text, next_of_kin_phone text, next_of_kin_relation text, photo_file_id uuid references core.file, location geometry(Point, 4326), unique (scheme_id, farmer_code) -- natural key for imports -- + std, status, device_id, import_batch_id);create table slis.farmer_identity ( -- zero or more per farmer id uuid primary key, farmer_id uuid not null references slis.farmer, document_type_id uuid not null references core.lookup_value, -- NIN, BVN, voter's card, bank account... number_enc bytea not null, -- AES-256-GCM, app-level number_hash bytea not null, -- keyed hash for exact-match search and duplicates number_last4 text, -- for masked display bank_name text, document_file_id uuid references core.file, unique (document_type_id, number_hash) -- + std, status, device_id);create table slis.farm ( id uuid primary key, scheme_id uuid not null references core.organisation, sector_id uuid not null references core.organisation, name text, geom geometry(MultiPolygon, 4326) -- + std);create table slis.plot ( id uuid primary key, scheme_id uuid not null references core.organisation, farm_id uuid references slis.farm, sector_id uuid not null references core.organisation, plot_code text not null, area_ha numeric(10,4), -- computed from geom when a boundary exists irrigation_type_id uuid references core.lookup_value, service_type text check (service_type in ('new','improved','none')), -- indicators 2b, 2c ward_id uuid references core.ward, state_id uuid references core.state, -- set by trigger from ward_id geom geometry(Geometry, 4326), -- polygon or point gps_accuracy_m numeric(6,1), unique (scheme_id, plot_code) -- + std, status, device_id, import_batch_id);create table slis.plot_allocation ( id uuid primary key, plot_id uuid not null references slis.plot, farmer_id uuid not null references slis.farmer, season_id uuid references slis.season, tenure_id uuid references core.lookup_value, from_on date, to_on date -- + std, status, device_id, import_batch_id);create table slis.crop_production ( id uuid primary key, scheme_id uuid not null references core.organisation, plot_id uuid not null references slis.plot, season_id uuid not null references slis.season, crop_type_id uuid not null references core.lookup_value, area_ha numeric(10,4) not null, yield_t numeric(12,3), unique (plot_id, season_id, crop_type_id) -- + std, status, device_id, import_batch_id);create table slis.water_request ( id uuid primary key, scheme_id uuid not null references core.organisation, level slis.request_level not null, wua_id uuid references core.wua, farmer_id uuid references slis.farmer, season_id uuid references slis.season, volume_m3 numeric(14,2), period_from_on date, period_to_on date, decision text check (decision in ('pending','approved','rejected')) default 'pending', check ((level = 'individual' and farmer_id is not null and wua_id is null) or (level <> 'individual' and wua_id is not null and farmer_id is null)) -- + std, status, device_id, import_batch_id);create table slis.fee_billing ( id uuid primary key, scheme_id uuid not null references core.organisation, season_id uuid not null references slis.season, wua_id uuid references core.wua, farmer_id uuid references slis.farmer, amount_ngn numeric(14,2) not null, check (num_nonnulls(wua_id, farmer_id) = 1) -- + std, import_batch_id);create table slis.fee_collection ( id uuid primary key, scheme_id uuid not null references core.organisation, season_id uuid not null references slis.season, wua_id uuid references core.wua, farmer_id uuid references slis.farmer, amount_ngn numeric(14,2) not null check (amount_ngn > 0), receipt_no text not null unique, paid_on date not null, check (num_nonnulls(wua_id, farmer_id) = 1) -- + std, status, device_id, import_batch_id);create table slis.training ( id uuid primary key, scheme_id uuid not null references core.organisation, topic text not null, tags text[] not null default '{}', -- e.g. {dam_safety} held_on date not null, venue text -- + std, import_batch_id);create table slis.training_attendance ( id uuid primary key, training_id uuid not null references slis.training, farmer_id uuid references slis.farmer, staff_name text, -- non-farmer attendees gender text check (gender in ('female','male')), check (num_nonnulls(farmer_id, staff_name) = 1));create unique index on slis.training_attendance (training_id, farmer_id) where farmer_id is not null;create table slis.stream_flow_reading ( id uuid primary key, scheme_id uuid not null references core.organisation, station_id uuid not null, -- ref: blis.station (no FK) read_at timestamptz not null, value numeric(14,4) not null, unit text not null -- + std, status, device_id, import_batch_id);

5. me schema

M&E stores the results framework and its numbers. An indicator's method says where its value comes from: typed by an officer, computed nightly from SLIS or BLIS through their public services (compute_key names the function), or derived from a survey. Targets and values are stored per scope (national, state or organisation), so the same indicator can be reported for the programme, a state or a single scheme.

create type me.indicator_level as enum ('pdo','intermediate');create type me.indicator_method as enum ('manual','computed','survey');create type me.value_source as enum ('manual','computed','import');create table me.results_framework ( id uuid primary key, name text not null, version text not null, starts_on date, ends_on date, is_current boolean not null default false -- + std);create table me.indicator ( id uuid primary key, framework_id uuid not null references me.results_framework, code text not null, -- '1a', '14d' name text not null, level me.indicator_level not null, unit text not null, -- 'Number', '%', 'ha', 't/ha' frequency text not null default 'annual', method me.indicator_method not null, compute_key text, -- e.g. 'slis.fee_recovery_rate' disaggregations text[] not null default '{}', -- e.g. {gender,scheme} baseline numeric(16,4), baseline_year smallint, data_source text, responsible text, unique (framework_id, code), check (method <> 'computed' or compute_key is not null) -- + std);create table me.indicator_target ( id uuid primary key, indicator_id uuid not null references me.indicator, year smallint not null, scope_type core.scope_type not null, scope_state_id uuid references core.state, scope_org_id uuid references core.organisation, value numeric(16,4) not null, unique nulls not distinct (indicator_id, year, scope_type, scope_state_id, scope_org_id) -- + std, import_batch_id);create table me.indicator_value ( id uuid primary key, indicator_id uuid not null references me.indicator, period_year smallint not null, period_quarter smallint check (period_quarter between 1 and 4), scope_type core.scope_type not null, scope_state_id uuid references core.state, scope_org_id uuid references core.organisation, disaggregation jsonb not null default '{}', -- e.g. {"gender":"female"} value numeric(16,4) not null, source me.value_source not null, computed_at timestamptz, notes text, unique nulls not distinct (indicator_id, period_year, period_quarter, scope_type, scope_state_id, scope_org_id, disaggregation) -- + std, status, import_batch_id);create table me.indicator_value_evidence ( indicator_value_id uuid not null references me.indicator_value, file_id uuid not null references core.file, primary key (indicator_value_id, file_id));-- Surveys (baseline, impact evaluation, satisfaction)create table me.survey ( id uuid primary key, name text not null, version integer not null default 1, scheme_id uuid references core.organisation, opens_on date, closes_on date -- + std);create table me.survey_question ( id uuid primary key, survey_id uuid not null references me.survey, code text not null, text text not null, answer_type text not null check (answer_type in ('text','number','single','multi','date','gps')), options jsonb, sort_order integer not null, is_required boolean not null default false, unique (survey_id, code));create table me.survey_response ( id uuid primary key, survey_id uuid not null references me.survey, scheme_id uuid references core.organisation, farmer_id uuid, -- ref: slis.farmer (no FK) household_id uuid, -- ref: slis.household (no FK) collected_at timestamptz not null, location geometry(Point, 4326) -- + std, status, device_id, import_batch_id);create table me.survey_answer ( response_id uuid not null references me.survey_response, question_id uuid not null references me.survey_question, value jsonb not null, primary key (response_id, question_id));-- Programme instrumentscreate table me.scorecard ( id uuid primary key, scheme_id uuid not null references core.organisation, period_year smallint not null, published_on date, file_id uuid references core.file -- + std);create table me.matching_grant ( id uuid primary key, scheme_id uuid not null references core.organisation, wua_id uuid references core.wua, purpose text, amount_ngn numeric(14,2), approved_on date, disbursed_on date -- + std, import_batch_id);create table me.tech_adoption ( id uuid primary key, scheme_id uuid not null references core.organisation, farmer_id uuid, -- ref: slis.farmer (no FK) technology_id uuid not null references core.lookup_value, gender text check (gender in ('female','male')), -- copied at capture for indicators 12-13 adopted_on date -- + std, status, device_id, import_batch_id);

unique nulls not distinct (PostgreSQL 15+) treats empty scope columns as equal, so there can only be one national value per indicator and period.

6. blis schema

blis relationships · basin at the centre

Derived from the fields the legacy BLIS code saved (legacy table in comments). Free-text state, LGA, owner and contractor fields became links to core. Dam-safety component ratings, which were columns in the legacy table, became rows so a new component needs no schema change.

create table blis.basin ( -- legacy trim_bl_basins id uuid primary key, code text not null unique, name text not null, alt_name text, hydrological_unit text, main_river text, rbda_id uuid references core.organisation, geom geometry(MultiPolygon, 4326) -- + std, import_batch_id);create table blis.basin_morphometry ( -- legacy trim_bl_bchar id uuid primary key, basin_id uuid not null references blis.basin, measured_on date not null, lowest_point_m numeric(10,2), highest_point_m numeric(10,2), avg_slope_pct numeric(8,3), stream_count integer, stream_length_total_km numeric(12,3), stream_length_avg_km numeric(10,3), drainage_density numeric(10,4), stream_order smallint, relief_m numeric(10,2), length_km numeric(10,3), perimeter_km numeric(10,3), unique (basin_id, measured_on) -- + std);create table blis.station ( -- legacy trim_bl_station id uuid primary key, code text not null unique, name text not null, basin_id uuid not null references blis.basin, station_type_id uuid not null references core.lookup_value, ward_id uuid references core.ward, river text, geom geometry(Point, 4326) not null, installed_on date, description text, is_active boolean not null default true -- + std, import_batch_id);create table blis.parameter ( -- legacy trim_bl_ptype id uuid primary key, code text not null unique, name text not null, default_unit text not null);create table blis.measurement ( -- legacy trim_bl_tsm id uuid not null, station_id uuid not null references blis.station, parameter_id uuid not null references blis.parameter, observed_at timestamptz not null, value numeric(16,4) not null, unit text not null, quality text not null default 'raw' check (quality in ('raw','checked','suspect')), source text not null check (source in ('manual','import','logger')), import_batch_id uuid references core.import_batch, created_at timestamptz not null default now(), created_by uuid not null references core.app_user, primary key (id, observed_at), unique (station_id, parameter_id, observed_at)) partition by range (observed_at);create table blis.measurement_2026 partition of blis.measurement for values from ('2026-01-01') to ('2027-01-01'); -- the worker creates next year's partition each Decembercreate table blis.reservoir ( -- legacy trim_bl_reserv id uuid primary key, basin_id uuid not null references blis.basin, name text not null, river text, area_km2 numeric(12,3), volume_mcm numeric(14,3), mean_depth_m numeric(8,2), max_depth_m numeric(8,2), relative_depth numeric(8,4), max_length_km numeric(10,3), max_width_km numeric(10,3), mean_elevation_m numeric(10,2), sediment_ratio numeric(10,4), fetch_km numeric(10,3), depth_ratio numeric(10,4), volume_development numeric(10,4), geom geometry(MultiPolygon, 4326) -- + std, import_batch_id);create table blis.dam ( -- legacy trim_bl_dams + trim_bl_damch id uuid primary key, code text unique, name text not null, alt_name text, basin_id uuid not null references blis.basin, reservoir_id uuid references blis.reservoir, secondary_of_dam_id uuid references blis.dam, purpose_id uuid references core.lookup_value, category_id uuid references core.lookup_value, completion_year smallint, foundation text, height_m numeric(8,2), crest_length_m numeric(10,2), body_volume_mcm numeric(12,3), spillway_type text, spillway_capacity_m3s numeric(12,2), reservoir_capacity_mcm numeric(14,3), reservoir_area_km2 numeric(12,3), reservoir_length_km numeric(10,3), hydropower_mw numeric(10,2), mean_annual_energy_gwh numeric(12,2), irrigated_area_ha numeric(12,2), catchment_km2 numeric(12,2), owner_org_id uuid references core.organisation, consultant_org_id uuid references core.organisation, contractor_org_id uuid references core.organisation, lga_id uuid references core.lga, nearest_town text, resettlement_notes text, notes text, geom geometry(Point, 4326), altitude_m numeric(8,2) -- + std, import_batch_id);create table blis.dam_safety_inspection ( -- legacy trim_bl_damsec id uuid primary key, dam_id uuid not null references blis.dam, inspected_on date not null, next_due_on date, hazard_class_id uuid references core.lookup_value, specific_hazards text, safety_contact text, staff_on_site integer, staff_qualifications text, safety_budget_ngn numeric(16,2), meets_standard boolean, -- drives indicator 5 unique (dam_id, inspected_on) -- + std, status, device_id, import_batch_id);create table blis.dam_component_condition ( inspection_id uuid not null references blis.dam_safety_inspection, component text not null check (component in ('dam_body','spillway_1','spillway_2','inlet','outlet','electrical','mechanical')), rating_id uuid not null references core.lookup_value, notes text, primary key (inspection_id, component));create table blis.bio_resource_occurrence ( -- legacy trim_bl_bior id uuid primary key, basin_id uuid not null references blis.basin, resource_id uuid not null references core.lookup_value, occurrence_id uuid not null references core.lookup_value -- + std);create table blis.water_use_priority ( -- legacy trim_bl_wusp id uuid primary key, basin_id uuid not null references blis.basin, water_use_id uuid not null references core.lookup_value, priority_id uuid not null references core.lookup_value -- + std);create table blis.stakeholder ( -- legacy trim_bl_stakeh id uuid primary key, name text not null, abbreviation text, category_id uuid references core.lookup_value, contact_name text, phone text, email text -- + std);create table blis.stakeholder_basin ( stakeholder_id uuid not null references blis.stakeholder, basin_id uuid not null references blis.basin, primary key (stakeholder_id, basin_id));create table blis.map_layer ( -- legacy trim_bl_shpfile, trim_bl_shpfilet id uuid primary key, name text not null, layer_type_id uuid not null references core.lookup_value, basin_id uuid references blis.basin, source_file_id uuid references core.file, details text, area_km2 numeric(12,3) -- + std);create table blis.map_feature ( -- shapes from an uploaded shapefile id uuid primary key, layer_id uuid not null references blis.map_layer, properties jsonb not null default '{}', geom geometry(Geometry, 4326) not null);

7. Platform tables

These live in core but serve the whole platform: who changed what, which events still need delivering, what each phone has synced, and the state of every import.

| Table | Job | Written by | Read by |

Table

Job

Written by

Read by

| audit_log | Before/after of every change | Every service, in the same transaction | Record history tab, investigations |

audit_log

Before/after of every change

Every service, in the same transaction

Record history tab, investigations

| outbox_event | Domain events waiting for delivery | Services, in the same transaction as the data | Worker dispatcher |

outbox_event

Domain events waiting for delivery

Services, in the same transaction as the data

Worker dispatcher

| change_log | Ordered list of changed rows, for sync pull | Every write to a syncable table | GET /sync/pull |

change_log

Ordered list of changed rows, for sync pull

Every write to a syncable table

GET /sync/pull

| device | Registered phones and their offline allowance | Sign-in on a phone | Sync endpoints, Sync centre |

device

Registered phones and their offline allowance

Sign-in on a phone

Sync endpoints, Sync centre

| sync_op | Result of every pushed operation, keyed by op id | POST /sync/push | Idempotent retries, support tracing |

sync_op

Result of every pushed operation, keyed by op id

POST /sync/push

Idempotent retries, support tracing

| sync_conflict | Both versions when an offline edit hits a newer server version | POST /sync/push | Conflict view |

sync_conflict

Both versions when an offline edit hits a newer server version

POST /sync/push

Conflict view

| import_batch, import_row | One uploaded file and its validated rows | Import endpoints and worker | Preview grid, commit, undo |

import_batch, import_row

One uploaded file and its validated rows

Import endpoints and worker

Preview grid, commit, undo

create table core.audit_log ( id bigint generated always as identity primary key, occurred_at timestamptz not null default now(), actor_id uuid references core.app_user, action text not null check (action in ('create','update','delete','approve','return','import','revert','sign_in','sign_in_failed','assign')), entity text not null, -- 'slis.farmer' entity_id uuid, before jsonb, after jsonb, -- encrypted fields stay encrypted here ip inet, device_id uuid); -- append-only: app role has insert, no update or deletecreate table core.outbox_event ( id bigint generated always as identity primary key, occurred_at timestamptz not null default now(), event text not null, -- 'slis.fee.recorded' payload jsonb not null, delivered_at timestamptz, attempts integer not null default 0, last_error text);create index on core.outbox_event (occurred_at) where delivered_at is null;create table core.change_log ( seq bigint generated always as identity primary key, -- the sync cursor changed_at timestamptz not null default now(), entity text not null, entity_id uuid not null, op text not null check (op in ('upsert','delete')), scheme_id uuid, state_id uuid, basin_id uuid -- copied scope keys so pull can filter fast);create index on core.change_log (scheme_id, seq);create index on core.change_log (state_id, seq);create table core.device ( id uuid primary key, user_id uuid not null references core.app_user, label text, platform text, registered_at timestamptz not null default now(), offline_grant_until timestamptz, -- capture locks after this last_pull_seq bigint, last_seen_at timestamptz, revoked_at timestamptz);create table core.sync_op ( op_id uuid primary key, -- generated on the phone device_id uuid not null references core.device, entity text not null, record_id uuid not null, received_at timestamptz not null default now(), outcome text not null check (outcome in ('accepted','rejected','conflict')), new_version integer, errors jsonb);create table core.sync_conflict ( id uuid primary key, op_id uuid not null references core.sync_op, entity text not null, record_id uuid not null, base_version integer not null, server_version integer not null, device_payload jsonb not null, server_payload jsonb not null, status text not null default 'open' check (status in ('open','resolved')), resolved_by uuid references core.app_user, resolved_at timestamptz, scheme_id uuid references core.organisation);create table core.import_batch ( id uuid primary key, dataset text not null, -- 'slis.farmer' template_version integer not null, scope_type core.scope_type not null, scope_state_id uuid, scope_org_id uuid, file_id uuid not null references core.file, status text not null check (status in ('uploaded','validating','validated','committed','reverted','failed','cancelled')), rows_total integer, rows_valid integer, rows_error integer, rows_duplicate integer, error text, committed_at timestamptz, reverted_at timestamptz -- + std);create table core.import_row ( batch_id uuid not null references core.import_batch, row_no integer not null, data jsonb not null, status text not null check (status in ('valid','error','duplicate','committed')), errors jsonb, -- [{column, message}] record_id uuid, -- set on commit primary key (batch_id, row_no));

audit_log, outbox_event and change_log use bigint identity keys rather than UUIDs. They are append-only, created only on the server, and their order matters, so a simple increasing number is the right key.

8. Indexes, constraints, scope and reporting

8.1 Extensions and database roles

| Item | Purpose |

Item

Purpose

| postgis | Geometry types, spatial indexes, area and containment queries, vector tiles (ST_AsMVT) |

postgis

Geometry types, spatial indexes, area and containment queries, vector tiles (ST_AsMVT)

| pg_trgm | Fast fuzzy search on farmer names, villages and codes |

pg_trgm

Fast fuzzy search on farmer names, villages and codes

| citext | Case-insensitive emails and usernames |

citext

Case-insensitive emails and usernames

| Role idmis_migrator | Owns the schemas; used only by the migration step |

Role idmis_migrator

Owns the schemas; used only by the migration step

| Role idmis_app | Used by api and worker: read/write on business tables, insert-only on audit_log |

Role idmis_app

Used by api and worker: read/write on business tables, insert-only on audit_log

| Role idmis_report | Read-only, for future BI tools; no access to *_enc columns |

Role idmis_report

Read-only, for future BI tools; no access to *_enc columns

8.2 Scope columns and how a query is filtered

Every scoped business row stores scheme_id, and rows with a location also store state_id. A trigger fills state_id from ward_id (ward → LGA → state), or from the scheme's state when the scheme sits in one state only, so state filters never need a join. The api resolves the caller's assignments once per request into lists of visible scheme ids and state ids, and every repository adds the same filter:

-- $1 = visible scheme ids (from scheme, sector or RBDA assignments)-- $2 = visible state ids (from state assignments)-- national scope skips the filter entirelyselect f.id, f.farmer_code, f.first_name, f.last_name, f.statusfrom slis.farmer fwhere f.deleted_at is null and (f.scheme_id = any($1::uuid[]) or f.state_id = any($2::uuid[]))order by f.created_at desclimit 50;

Organisation-level rows (WUAs, schemes, sectors) use core.organisation_state instead, so a State Coordinator sees every scheme sited in the state, whichever RBDA runs it.

8.3 Version check on update

update slis.farmerset phone = $3, updated_by = $4where id = $1 and version = $2 -- the version the client started fromreturning version; -- trigger has already bumped version and updated_at-- zero rows returned = someone changed it first → 409 (or a sync conflict)

A trigger on every table sets updated_at = now() and version = version + 1, so the rule holds even if a developer forgets.

8.4 Key indexes

| Table | Index | Serves |

Table

Index

Serves

| All scoped tables | (scheme_id) where deleted_at is null, (state_id) where deleted_at is null | The scope filter on every list |

All scoped tables

(scheme_id) where deleted_at is null, (state_id) where deleted_at is null

The scope filter on every list

| slis.farmer | unique (scheme_id, farmer_code); GIN trigram on first_name || ' ' || last_name; (phone) | Import upserts, name search, duplicate check |

slis.farmer

unique (scheme_id, farmer_code); GIN trigram on first_name || ' ' || last_name; (phone)

Import upserts, name search, duplicate check

| slis.farmer_identity | unique (document_type_id, number_hash) | Exact-match search and duplicate detection on encrypted numbers |

slis.farmer_identity

unique (document_type_id, number_hash)

Exact-match search and duplicate detection on encrypted numbers

| slis.plot | unique (scheme_id, plot_code); GiST (geom) | Imports, maps, "plots in this ward" |

slis.plot

unique (scheme_id, plot_code); GiST (geom)

Imports, maps, "plots in this ward"

| slis.fee_collection | (scheme_id, season_id); unique (receipt_no) | Fee recovery indicator, receipt look-up |

slis.fee_collection

(scheme_id, season_id); unique (receipt_no)

Fee recovery indicator, receipt look-up

| blis.station, blis.basin, core.ward | GiST (geom) | Maps and spatial joins |

blis.station, blis.basin, core.ward

GiST (geom)

Maps and spatial joins

| blis.measurement | unique (station_id, parameter_id, observed_at) per partition | Charts and time-series imports |

blis.measurement

unique (station_id, parameter_id, observed_at) per partition

Charts and time-series imports

| me.indicator_value | unique on indicator, period, scope, disaggregation | One value per slot; matrix report |

me.indicator_value

unique on indicator, period, scope, disaggregation

One value per slot; matrix report

| core.change_log | (scheme_id, seq), (state_id, seq) | Sync pull per device scope |

core.change_log

(scheme_id, seq), (state_id, seq)

Sync pull per device scope

| core.assignment | (user_id) where valid_to_on is null or valid_to_on >= current_date | Building the permission set on each request |

core.assignment

(user_id) where valid_to_on is null or valid_to_on >= current_date

Building the permission set on each request

8.5 Reporting views

Standard reports and computed indicators read from materialised views inside each schema. The worker refreshes them with refresh materialized view concurrently nightly, and after imports or approvals that affect them.

| View | Columns | Feeds |

View

Columns

Feeds

| slis.mv_farmers_by_scope | scheme, sector, state, gender, approved farmer count | Indicators 1a, 1b; scheme and state dashboards |

slis.mv_farmers_by_scope

scheme, sector, state, gender, approved farmer count

Indicators 1a, 1b; scheme and state dashboards

| slis.mv_area_by_service | scheme, state, service type, irrigated hectares | Indicators 2a–2c |

slis.mv_area_by_service

scheme, state, service type, irrigated hectares

Indicators 2a–2c

| slis.mv_cropping | scheme, season, cropped area, irrigable area, intensity; yield by crop | Indicators 3, 14a–d |

slis.mv_cropping

scheme, season, cropped area, irrigable area, intensity; yield by crop

Indicators 3, 14a–d

| slis.mv_fee_recovery | scheme, WUA, season, billed, collected, rate | Indicator 4; WUA reports |

slis.mv_fee_recovery

scheme, WUA, season, billed, collected, rate

Indicator 4; WUA reports

| blis.mv_latest_reading | station, parameter, last value, observed at | BLIS map colours, station list |

blis.mv_latest_reading

station, parameter, last value, observed at

BLIS map colours, station list

| blis.mv_dam_status | dam, last inspection, meets standard, next due | Indicator 5; dam safety map |

blis.mv_dam_status

dam, last inspection, meets standard, next due

Indicator 5; dam safety map

| me.mv_indicator_matrix | indicator, year, scope, target, actual, status | Indicator matrix report |

me.mv_indicator_matrix

indicator, year, scope, target, actual, status

Indicator matrix report

9. Decisions

| # | Decision | Alternatives considered | Why | Trade-off we accept |

#

Decision

Alternatives considered

Why

Trade-off we accept

| 1 | One database, one schema per module | One database per module; one flat schema | Clear ownership and permissions per module, while keeping simple backups and transactions | Discipline needed so modules don't query each other's schemas |

1

One database, one schema per module

One database per module; one flat schema

Clear ownership and permissions per module, while keeping simple backups and transactions

Discipline needed so modules don't query each other's schemas

| 2 | No foreign keys between business schemas | Full foreign keys everywhere | Modules stay separable; a module can be switched off or moved out | Cross-module ids are checked by the application, not the database |

2

No foreign keys between business schemas

Full foreign keys everywhere

Modules stay separable; a module can be switched off or moved out

Cross-module ids are checked by the application, not the database

| 3 | UUIDv7 primary keys, generated by the client or server | Auto-increment integers; UUIDv4 | Offline phones create final ids; time-ordered for index performance | 16-byte keys, larger than integers |

3

UUIDv7 primary keys, generated by the client or server

Auto-increment integers; UUIDv4

Offline phones create final ids; time-ordered for index performance

16-byte keys, larger than integers

| 4 | version column + trigger for concurrency | Last write wins; timestamps | Detects stale offline edits reliably; drives sync conflicts | Every update must send the version it read |

4

version column + trigger for concurrency

Last write wins; timestamps

Detects stale offline edits reliably; drives sync conflicts

Every update must send the version it read

| 5 | Soft delete with deleted_at | Hard delete | Sync must propagate deletes; audit and undo stay possible | Every query and index must exclude deleted rows |

5

Soft delete with deleted_at

Hard delete

Sync must propagate deletes; audit and undo stay possible

Every query and index must exclude deleted rows

| 6 | Denormalised scheme_id and state_id on scoped rows | Join through ward → LGA → state on every query | One indexed filter answers every scope; fast lists and sync pulls | Trigger keeps the copy in step; moving a ward between LGAs needs a backfill |

6

Denormalised scheme_id and state_id on scoped rows

Join through ward → LGA → state on every query

One indexed filter answers every scope; fast lists and sync pulls

Trigger keeps the copy in step; moving a ward between LGAs needs a backfill

| 7 | Admin-editable lists in core.lookup_value; system states as enums | Enums for everything; free text | Admins add crop or document types without a release; system states stay strict | Lookup ids are less readable in raw SQL |

7

Admin-editable lists in core.lookup_value; system states as enums

Enums for everything; free text

Admins add crop or document types without a release; system states stay strict

Lookup ids are less readable in raw SQL

| 8 | Identity documents in their own table, encrypted per value with a keyed hash | Columns on farmer; database-level encryption only | Any number of documents per farmer, any type; numbers unreadable in dumps; still searchable by exact number | No partial-number search |

8

Identity documents in their own table, encrypted per value with a keyed hash

Columns on farmer; database-level encryption only

Any number of documents per farmer, any type; numbers unreadable in dumps; still searchable by exact number

No partial-number search

| 9 | PostGIS geometry in SRID 4326 | Latitude and longitude columns | True areas, containment and maps; matches phone GPS | Area in hectares needs a geography cast or projection |

9

PostGIS geometry in SRID 4326

Latitude and longitude columns

True areas, containment and maps; matches phone GPS

Area in hectares needs a geography cast or projection

| 10 | blis.measurement partitioned by year | One unpartitioned table | Time series will grow fastest; partitions keep queries and archiving cheap | The worker must create next year's partition in advance |

10

blis.measurement partitioned by year

One unpartitioned table

Time series will grow fastest; partitions keep queries and archiving cheap

The worker must create next year's partition in advance

| 11 | Materialised views for reports and indicators | Live queries; a separate warehouse | Fast dashboards; one source for computed indicators | Figures lag until the next refresh (nightly or after imports and approvals) |

11

Materialised views for reports and indicators

Live queries; a separate warehouse

Fast dashboards; one source for computed indicators

Figures lag until the next refresh (nightly or after imports and approvals)

| 12 | Append-only audit_log with insert-only permission | Audit through application logs | Tamper-resistant history inside the database | Table grows steadily; archived yearly to R2 |

12

Append-only audit_log with insert-only permission

Audit through application logs

Tamper-resistant history inside the database

Table grows steadily; archived yearly to R2

| 13 | Dam component ratings as rows, not columns | Keep the legacy column-per-component layout | New components need no schema change; ratings trend per component | Reports pivot rows back into columns |

13

Dam component ratings as rows, not columns

Keep the legacy column-per-component layout

New components need no schema change; ratings trend per component

Reports pivot rows back into columns

| 14 | Fresh schema, no legacy data migration | Map legacy MySQL tables across | Client decision; legacy tables lack keys and consistent types | Legacy history stays in the old system for reference |

14

Fresh schema, no legacy data migration

Map legacy MySQL tables across

Client decision; legacy tables lack keys and consistent types

Legacy history stays in the old system for reference
