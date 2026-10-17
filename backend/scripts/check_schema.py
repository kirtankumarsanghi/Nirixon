import sqlite3
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.models import Base

db_path = backend_dir / "nirixon_dev.db"
conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [r[0] for r in cursor.fetchall()]

missing_by_table = {}
for table_name, table in Base.metadata.tables.items():
    if table_name in tables:
        cursor.execute(f"PRAGMA table_info({table_name});")
        existing_cols = {r[1] for r in cursor.fetchall()}
        model_cols = set(table.columns.keys())
        missing = model_cols - existing_cols
        if missing:
            missing_by_table[table_name] = missing
    else:
        missing_by_table[table_name] = "TABLE_MISSING"

print("SCHEMA COMPARISON RESULTS:")
for tbl, cols in missing_by_table.items():
    print(f"  {tbl}: {cols}")
if not missing_by_table:
    print("  ALL TABLES AND COLUMNS MATCH PERFECTLY!")
