# BLIS Dam Safety Standards Evaluation Rule (Provisional)

## Overview

In TRIMING IDMIS 2.0 (BLIS), whether a dam safety inspection meets national and international safety standards (`meets_standard`) is computed automatically by the system. Client-supplied values for `meets_standard` are ignored to guarantee integrity and enforce separation of duties.

This document details the provisional business logic used to determine `meets_standard = true | false` pending formal client sign-off.

---

## Provisional Rule Specification

An inspection is evaluated against its associated `dam_component_condition` records across the 7 recognized dam structural components:

- `dam_body`
- `spillway_1`
- `spillway_2`
- `inlet`
- `outlet`
- `electrical`
- `mechanical`

Each component condition is rated with one of four lookup ratings:

- `good`: Fully operational, negligible wear, compliant.
- `fair`: Minor non-structural defects, functioning as designed.
- `poor`: Significant deterioration, reduced reliability, defect remediation required.
- `critical`: Severe structural defect, immediate safety hazard, failure risk.

### Decision Criteria

The server computes `meets_standard = true` if and only if **BOTH** of the following conditions are satisfied:

1. **Mandatory Structural Components Assessed**:
   The inspection must evaluate and record ratings for at least:
   - `dam_body`
   - `spillway_1`

2. **No Critical or Poor Component Conditions**:
   **No** evaluated component may have a condition rating of `'poor'` or `'critical'`. Every rated component must be `'good'` or `'fair'`.

If either condition is not met (e.g. missing `spillway_1`, missing `dam_body`, or any rated component is `'poor'` or `'critical'`), the server evaluates `meets_standard = false`.

---

## Downstream Impacts

1. **Materialised View (`blis.mv_dam_status`)**:
   Tracks the latest approved inspection per dam, reflecting its `meets_standard` status.
2. **Outbox Events**:
   Emits `blis.dam.inspected` when an inspection is approved.
3. **M&E Results Framework Indicator 5 (`blis.dams_safe`)**:
   Counts dams whose latest approved inspection on or before the period end satisfies `meets_standard = true`.
