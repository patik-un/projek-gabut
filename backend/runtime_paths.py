import os


def get_backend_dir(current_file):
    configured_dir = os.environ.get("EVENT_BOOTH_BACKEND_DATA_DIR")

    if configured_dir:
        return os.path.abspath(os.path.expanduser(configured_dir))

    # This module lives at the backend root. Callers can be either root
    # modules (queue_db.py) or nested packages (api/server.py).
    return os.path.dirname(os.path.abspath(__file__))
