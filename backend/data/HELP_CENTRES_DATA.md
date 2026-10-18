# Help Centres Data & Import Guide

This directory holds the data files for the **Find Nearest Help** feature (`GET /api/help/nearby`).

## Data File Location & Replacement Instructions

To replace sample data with your own verified regional or national health centres:

1. **Production File Path:**
   `backend/data/help_centres.json`
   *(If this file exists, the system automatically imports it and marks `is_sample = false`)*

2. **Sample File Path (Fallback):**
   `backend/data/help_centres.sample.json`
   *(Loaded if `help_centres.json` does not exist; records are marked with `is_sample = true`)*

---

## Schema Requirements

Each centre entry in JSON must contain the following fields:

```json
{
  "name": "District Early Intervention Centre (DEIC), Safdarjung Hospital",
  "address": "Ring Road, Opposite AIIMS, Safdarjung Enclave",
  "district": "South Delhi",
  "state": "Delhi",
  "pin": "110029",
  "latitude": 28.5684,
  "longitude": 77.2062,
  "phone": "+91-11-26165060",
  "type": "DEIC",
  "source_url": "https://delhihealth.gov.in/deic-safdarjung",
  "last_verified_date": "2026-03-15"
}
```

### Field Definitions:
- **`name`** *(string, required)*: Facility or team name.
- **`address`** *(string, required)*: Physical address.
- **`district`** *(string, required)*: Administrative district.
- **`state`** *(string, required)*: State or Union Territory.
- **`pin`** *(string, required)*: 6-digit Indian PIN postal code.
- **`latitude`** *(float, required)*: GPS latitude in decimal degrees.
- **`longitude`** *(float, required)*: GPS longitude in decimal degrees.
- **`phone`** *(string, required)*: Telephone or contact number.
- **`type`** *(string, required)*: One of:
  - `"DEIC"`: District Early Intervention Centre (under 6 years)
  - `"RBSK team"`: Rashtriya Bal Swasthya Karyakram mobile screening unit (under 6 years)
  - `"district hospital"`: General district hospital pediatric unit (ages 6 to 12)
  - `"rehabilitation"`: Specialized pediatric therapy / rehabilitation (ages 6 to 12)
  - `"school resource"`: Inclusive education & school resource centre (ages 6 to 12)
  - `"other"`: Other public / charitable health centre
- **`source_url`** *(string, required)*: Official government / directory link. **Centres without a verified source URL are never displayed.**
- **`last_verified_date`** *(string, required)*: Date of last verification (format `YYYY-MM-DD`).

---

## Age Routing Rules
- **Under 6 years old (`age < 6`):**
  Routes to **DEICs** and **RBSK teams** for early intervention.
- **Ages 6 to 12 (`6 <= age <= 12`):**
  Routes to **District Hospitals**, **Rehabilitation units**, and **School Resources** (**NOT DEICs**).
- **If no centre is found:**
  API returns official helplines (1098, 14416, 104) and Chief Medical Officer (CMO) district guidance.
