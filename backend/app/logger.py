import logging
import concurrent.futures

# Use a single thread pool for log publishing to avoid overwhelming connection pools
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)

class SupabaseLogHandler(logging.Handler):
    """Custom logging handler to send logs to Supabase asynchronously."""
    
    def emit(self, record):
        try:
            # Format the exception traceback if present
            trace = self.formatException(record.exc_info) if record.exc_info else None
            
            # Use format message to get the evaluated message
            message = record.getMessage()

            def _insert_log():
                from app.supabase_client import supabase
                if not supabase:
                    return

                try:
                    supabase.table("system_logs").insert({
                        "level": record.levelname,
                        "logger_name": record.name,
                        "message": message,
                        "trace": trace,
                        "metadata": {
                            "filename": record.filename,
                            "lineno": record.lineno,
                            "funcName": record.funcName
                        }
                    }).execute()
                except Exception:
                    # Fail silently so logging error doesn't kill the app
                    pass 

            _executor.submit(_insert_log)
        except Exception:
            self.handleError(record)

def setup_logging():
    """Add Supabase handler to the root logger."""
    root_logger = logging.getLogger()
    
    # Check if handler is already added to prevent duplicates during reloads
    has_supabase_handler = any(isinstance(h, SupabaseLogHandler) for h in root_logger.handlers)
    
    if not has_supabase_handler:
        supabase_handler = SupabaseLogHandler()
        # Ensure we only log important things to DB to save space, but you can change this to DEBUG
        supabase_handler.setLevel(logging.INFO)
        # Apply standard formatter if needed, but we structure it during insert anyway
        root_logger.addHandler(supabase_handler)
