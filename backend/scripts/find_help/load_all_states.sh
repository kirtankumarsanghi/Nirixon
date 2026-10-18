#!/usr/bin/env bash
# One command to load facilities for ALL states/UTs, then rebuild the database.
# Run on your own machine with internet. Resumable: re-run and finished states are skipped.
#
# Needs a POSIX shell (Linux/macOS/WSL/Git Bash). On Windows PowerShell, run the two Python
# commands from backend/ instead:
#   python scripts/find_help/fetch_osm_facilities.py
#   python scripts/find_help/import_reference_data.py
set -e
cd "$(dirname "$0")/../.."   # -> backend/
python scripts/find_help/fetch_osm_facilities.py "$@"   # all states/UTs from OpenStreetMap (about 1-2 hours)
# Optional: add government directories you downloaded, e.g.
#   python scripts/find_help/import_government_csv.py ~/Downloads/national_hospital_directory.csv --source "data.gov.in National Hospital Directory"
python scripts/find_help/import_reference_data.py
echo
echo "Coverage per state -> data/find_help/coverage.csv"
