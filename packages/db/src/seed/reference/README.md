# Public Geography Reference Data

This directory contains standardized administrative reference data for Nigeria's States, Local Government Areas (LGAs), and Wards used by TRIMING IDMIS 2.0.

---

## 1. Sources & Provenance

### Source 1: Administrative Boundaries (States & LGAs)

- **Source**: United Nations Office for the Coordination of Humanitarian Affairs (UN OCHA) / Humanitarian Data Exchange (HDX)
- **Dataset**: Nigeria - Subnational Administrative Boundaries (COD-AB) (`cod-ab-nga`)
- **Official URL**: [https://data.humdata.org/dataset/cod-ab-nga](https://data.humdata.org/dataset/cod-ab-nga)
- **Direct Resource**: `nga_admin_boundaries.xlsx`
- **Licence**: [Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO)](http://creativecommons.org/licenses/by/3.0/igo/legalcode)
- **Version**: `v01` (validity date: 2019-04-17)
- **Extraction Date**: 2026-11-09
- **Required Attribution**:
  > _Source: UN OCHA (Nigeria - Subnational Administrative Boundaries / COD-AB), licensed under Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO)._

### Source 2: Operational Wards

- **Source**: Center for International Earth Science Information Network (CIESIN), Columbia University / Geo-Referenced Infrastructure and Demographic Data for Development (GRID3)
- **Dataset**: GRID3 NGA - Operational Wards v3.0 (`grid3-nga-operational-wards-v3-0`)
- **Official URL**: [https://data.humdata.org/dataset/grid3-nga-operational-wards-v3-0](https://data.humdata.org/dataset/grid3-nga-operational-wards-v3-0)
- **Direct Resource**: `grid3_nga_operational_wards_v3_0.gpkg`
- **Licence**: Creative Commons Attribution-ShareAlike 4.0 International ([CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/))
- **Version**: `v3.0` (release date: 2026-06-30)
- **Extraction Date**: 2026-11-09
- **Required Attribution**:
  > _Source: Center for International Earth Science Information Network (CIESIN), Columbia University. 2026. GRID3 NGA - Operational Wards v3.0. Palisades, NY: Geo-Referenced Infrastructure and Demographic Data for Development (GRID3). Licensed under CC BY-SA 4.0._

---

## 2. Methodology & Matching

1. **States & LGAs**:
   - 37 States (36 States + Federal Capital Territory) were extracted directly from COD-AB `nga_admin1`.
   - 774 LGAs were extracted directly from COD-AB `nga_admin2`.
   - Official OCHA P-codes (`NG001` to `NG037` for states; `NG001001` to `NG037014` for LGAs) are adopted as our standardized reference codes.

2. **Ward Matching & Stable Identifier Assignment**:
   - GRID3 v3.0 operational wards were matched to COD-AB LGAs by state and LGA name.
   - For TRIMING programme states (Gombe, Jigawa, Kano, Sokoto, Zamfara), naming discrepancies between GRID3 and COD-AB are explicitly resolved using `reference/lga-name-aliases.csv` (`grid3_lga_name,state_code,cod_ab_lga_pcode`), with no fuzzy matching.
   - 5,691 wards successfully matched to COD-AB LGAs across 24 states (including 100% of wards across all 5 TRIMING programme states).
   - Stable Ward Identifiers: Rather than generating alphabetical sequential codes that would shift upon ward additions or renames, each ward code uses GRID3's feature identifier from the v3.0 source (`OBJECTID`, documented as `fid` in the CIESIN/GRID3 Codebook). Format: `G3-<grid3_ward_id>` (e.g. `G3-1` to `G3-5872`). `lga_code` retains the official OCHA LGA P-code (e.g. `NG020001`).
   - 181 wards in non-TRIMING states could not be matched automatically and are catalogued in `unmatched-wards.csv` without guessing.

3. **Frozen Snapshot Notice & Seed Safety Rules**:
   - The v3.0 extraction in `wards.json` is a **frozen baseline snapshot**. Because `OBJECTID` is software-generated in spatial exports, **do not re-extract from a newer GRID3 version without explicit code remapping and verification**; doing so could silently turn one ward into another.
   - Any new, missing, or corrected wards must be introduced through the standard administrative **Ward Import** (`dataset = ward`) rather than automated re-extraction.
   - Seed safety guards enforced in `seedReferenceData`:
     - **Prohibited Parent Changes**: An existing ward whose LGA would change (or an existing LGA whose State would change) immediately aborts the seed run with an error listing the offending codes before any writes persist.
     - **Rename Protection**: An existing ward or LGA whose name would change is rejected with an error listing the code and old/new names, unless `REFERENCE_ALLOW_RENAMES=yes` is explicitly provided. When enabled, all applied renames are audited and printed.

---

## 3. Coverage Summary

| State                     | LGAs Loaded | Wards Loaded | Wards Unmatched | Notes                       |
| :------------------------ | :---------- | :----------- | :-------------- | :-------------------------- |
| Abia                      | 17          | 220          | 30              |                             |
| Adamawa                   | 21          | 226          | 0               |                             |
| Akwa Ibom                 | 31          | 0            | 0               | No GRID3 v3.0 coverage      |
| Anambra                   | 21          | 0            | 0               | No GRID3 v3.0 coverage      |
| Bauchi                    | 20          | 323          | 0               |                             |
| Bayelsa                   | 8           | 105          | 0               |                             |
| Benue                     | 23          | 0            | 0               | No GRID3 v3.0 coverage      |
| Borno                     | 27          | 310          | 0               |                             |
| Cross River               | 18          | 0            | 0               | No GRID3 v3.0 coverage      |
| Delta                     | 25          | 268          | 0               |                             |
| Ebonyi                    | 13          | 0            | 0               | No GRID3 v3.0 coverage      |
| Edo                       | 18          | 0            | 0               | No GRID3 v3.0 coverage      |
| Ekiti                     | 16          | 0            | 0               | No GRID3 v3.0 coverage      |
| Enugu                     | 17          | 258          | 0               |                             |
| Federal Capital Territory | 6           | 50           | 12              |                             |
| Gombe                     | 11          | 114          | 0               | **TRIMING Programme State** |
| Imo                       | 27          | 0            | 0               | No GRID3 v3.0 coverage      |
| Jigawa                    | 27          | 288          | 0               | **TRIMING Programme State** |
| Kaduna                    | 23          | 234          | 21              |                             |
| Kano                      | 44          | 484          | 0               | **TRIMING Programme State** |
| Katsina                   | 34          | 361          | 0               |                             |
| Kebbi                     | 21          | 225          | 0               |                             |
| Kogi                      | 21          | 229          | 10              |                             |
| Kwara                     | 16          | 193          | 0               |                             |
| Lagos                     | 20          | 0            | 0               | No GRID3 v3.0 coverage      |
| Nasarawa                  | 13          | 133          | 14              |                             |
| Niger                     | 25          | 264          | 11              |                             |
| Ogun                      | 20          | 216          | 21              |                             |
| Ondo                      | 18          | 0            | 0               | No GRID3 v3.0 coverage      |
| Osun                      | 30          | 290          | 42              |                             |
| Oyo                       | 33          | 341          | 10              |                             |
| Plateau                   | 17          | 0            | 0               | No GRID3 v3.0 coverage      |
| Rivers                    | 23          | 0            | 0               | No GRID3 v3.0 coverage      |
| Sokoto                    | 23          | 244          | 0               | **TRIMING Programme State** |
| Taraba                    | 16          | 0            | 0               | No GRID3 v3.0 coverage      |
| Yobe                      | 17          | 168          | 10              |                             |
| Zamfara                   | 14          | 147          | 0               | **TRIMING Programme State** |
| **Total**                 | **774**     | **5,691**    | **181**         |                             |
