"""Google Sheets service using gspread with service account."""

import gspread
from google.oauth2.service_account import Credentials
from typing import List, Dict, Any, Optional
import logging

from app.config import settings

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]

# Sheet name constants — must match exact Google Sheets tab names
UPCOMING_CLASSES_SHEET = "upcoming_classes"
PAST_CLASSES_SHEET = "past_classes"
UNAVAILABILITY_SHEET = "unavailability_requests"
CLASS_ADDITION_SHEET = "class_addition_requests"
ID_MAPPING_SHEET = "ID mapping"
BATCH_METRICS_SHEET = "batch_metrics"
POLICIES_SHEET = "policies"

# ... (existing code) ...


class SheetsService:
    """Manages all interactions with Google Sheets."""

    def __init__(self):
        self._client: Optional[gspread.Client] = None
        self._spreadsheet: Optional[gspread.Spreadsheet] = None
    
    def get_id_mapping(self) -> Dict[str, str]:
        """
        Fetch the ID mapping sheet and return a dictionary mapping Email -> Member ID.
        Assumes columns: Email, Name, Member ID.
        """
        try:
            records = self.get_all_records(ID_MAPPING_SHEET)
            mapping = {}
            for r in records:
                # Normalize keys (handle potential case/spacing variations if user manually created sheet)
                email = str(r.get("Email", "")).strip().lower()
                member_id = str(r.get("Member ID", "")).strip()
                if email and member_id:
                    mapping[email] = member_id
            return mapping
        except Exception as e:
            logger.error(f"Error fetching ID mapping: {e}")
            return {}

    def initialize(self):
        """Initialize the gspread client using JSON string or service account file."""
        try:
            import os
            import json

            # 1. Try JSON string from env var (best for Render/Heroku)
            if settings.google_credentials_json:
                try:
                    logger.info("Initializing Sheets using GOOGLE_CREDENTIALS_JSON...")
                    creds_dict = json.loads(settings.google_credentials_json)
                    creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
                    self._client = gspread.authorize(creds)
                    self._spreadsheet = self._client.open_by_key(settings.spreadsheet_id)
                    logger.info("Google Sheets service initialized successfully (JSON).")
                    self._ensure_tracking_columns()
                    return
                except Exception as e:
                    logger.error(f"Failed to load credentials from JSON: {e}")
                    # Fall through to file method if JSON fails

            # 2. Try Service Account File
            sa_path = settings.google_service_account_file
            if not os.path.isabs(sa_path):
                backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                sa_path = os.path.join(backend_dir, sa_path)

            logger.info(f"Using service account file: {sa_path} (exists: {os.path.exists(sa_path)})")
            
            if not os.path.exists(sa_path):
                 # If neither method works
                if not settings.google_credentials_json:
                     raise FileNotFoundError(f"Service account file not found: {sa_path} and GOOGLE_CREDENTIALS_JSON not set.")
                
            creds = Credentials.from_service_account_file(sa_path, scopes=SCOPES)
            self._client = gspread.authorize(creds)
            self._spreadsheet = self._client.open_by_key(settings.spreadsheet_id)
            logger.info("Google Sheets service initialized successfully (File).")

            # Ensure tracking columns exist in request sheets
            self._ensure_tracking_columns()
        except Exception as e:
            import traceback
            logger.error(f"Failed to initialize Google Sheets service: {e}\n{traceback.format_exc()}")
            raise

    # ── Tracking column auto-setup ──────────────────────────────────
    TRACKING_COLS = ["request_id", "status", "locked_by", "locked_at"]

    def _ensure_tracking_columns(self):
        """Add request_id/status/locked_by/locked_at headers if missing."""
        for sheet_name in (UNAVAILABILITY_SHEET, CLASS_ADDITION_SHEET):
            try:
                ws = self.spreadsheet.worksheet(sheet_name)
                headers = ws.row_values(1)
                missing = [c for c in self.TRACKING_COLS if c not in headers]
                if missing:
                    start_col = len(headers) + 1
                    for i, col_name in enumerate(missing):
                        ws.update_cell(1, start_col + i, col_name)
                    logger.info(
                        f"Added missing tracking columns to '{sheet_name}': {missing}"
                    )
            except Exception as e:
                logger.warning(f"Could not verify tracking columns in '{sheet_name}': {e}")

    @property
    def spreadsheet(self) -> gspread.Spreadsheet:
        if self._spreadsheet is None:
            self.initialize()
        return self._spreadsheet

    def get_all_records(self, sheet_name: str) -> List[Dict[str, Any]]:
        """Get all records from a sheet as list of dicts."""
        try:
            worksheet = self.spreadsheet.worksheet(sheet_name)
            records = worksheet.get_all_records()
            return records
        except gspread.WorksheetNotFound:
            logger.error(f"Sheet '{sheet_name}' not found in spreadsheet.")
            return []
        except Exception as e:
            logger.error(f"Error reading sheet '{sheet_name}': {e}")
            return []

    def get_all_classes(self) -> List[Dict[str, Any]]:
        """Fetch classes from both upcoming and past sheets and combine them."""
        upcoming = self.get_all_records(UPCOMING_CLASSES_SHEET)
        past = self.get_all_records(PAST_CLASSES_SHEET)
        return upcoming + past

    def get_unavailability_requests(self) -> List[Dict[str, Any]]:
        return self.get_all_records(UNAVAILABILITY_SHEET)

    def get_class_addition_requests(self) -> List[Dict[str, Any]]:
        return self.get_all_records(CLASS_ADDITION_SHEET)

    def get_batch_metrics(self, batch_name: str) -> Optional[Dict[str, Any]]:
        """Look up a single batch's metrics row from batch_metrics sheet."""
        try:
            records = self.get_all_records(BATCH_METRICS_SHEET)
            for row in records:
                if str(row.get("sb_names", "")).strip().lower() == batch_name.strip().lower():
                    return row
        except Exception as e:
            logger.warning(f"Could not fetch batch metrics for '{batch_name}': {e}")
        return None

    def get_id_mapping(self) -> Dict[str, str]:
        """
        Fetch the ID mapping sheet and return a dictionary mapping Email -> Member ID.
        Assumes columns: Email, Name, Member ID.
        """
        try:
            records = self.get_all_records(ID_MAPPING_SHEET)
            mapping = {}
            for r in records:
                # Normalize keys (handle potential case/spacing variations if user manually created sheet)
                email = str(r.get("Email", "")).strip().lower()
                member_id = str(r.get("Member ID", "")).strip()
                if email and member_id:
                    mapping[email] = member_id
            return mapping
        except Exception as e:
            logger.error(f"Error fetching ID mapping: {e}")
            return {}

    def append_row(self, sheet_name: str, row_data: List[Any]) -> None:
        """Append a single row to the specified sheet."""
        try:
            worksheet = self.spreadsheet.worksheet(sheet_name)
            worksheet.append_row(row_data, value_input_option="USER_ENTERED")
            logger.info(f"Row appended to '{sheet_name}'.")
        except Exception as e:
            logger.error(f"Error appending row to '{sheet_name}': {e}")
            raise

    def find_row_by_value(self, sheet_name: str, col_index: int, value: str) -> Optional[int]:
        """Find the row number (1-indexed) where column col_index has the given value."""
        try:
            worksheet = self.spreadsheet.worksheet(sheet_name)
            col_values = worksheet.col_values(col_index)
            for i, v in enumerate(col_values, start=1):
                if v == value:
                    return i
            return None
        except Exception as e:
            logger.error(f"Error searching column {col_index} in '{sheet_name}': {e}")
            return None

    def update_cells(self, sheet_name: str, row: int, updates: Dict[int, Any]) -> None:
        """Update multiple cells in a row. updates = {col_index: value}."""
        try:
            worksheet = self.spreadsheet.worksheet(sheet_name)
            for col, value in updates.items():
                worksheet.update_cell(row, col, value)
            logger.info(f"Updated row {row} in '{sheet_name}': cols {list(updates.keys())}")
        except Exception as e:
            logger.error(f"Error updating row {row} in '{sheet_name}': {e}")
            raise

    def get_header_indices(self, sheet_name: str) -> Dict[str, int]:
        """Get a mapping of column header → 1-indexed column number."""
        try:
            worksheet = self.spreadsheet.worksheet(sheet_name)
            headers = worksheet.row_values(1)
            return {h: i + 1 for i, h in enumerate(headers)}
        except Exception as e:
            logger.error(f"Error reading headers from '{sheet_name}': {e}")
            return {}

    def delete_row(self, sheet_name: str, row_number: int) -> None:
        """Delete a specific row by 1-based row number (header = row 1)."""
        try:
            worksheet = self.spreadsheet.worksheet(sheet_name)
            worksheet.delete_rows(row_number)
            logger.info(f"Deleted row {row_number} from '{sheet_name}'.")
        except Exception as e:
            logger.error(f"Error deleting row {row_number} from '{sheet_name}': {e}")
            raise

# Singleton instance
sheets_service = SheetsService()
