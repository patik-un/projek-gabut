import os


def get_backend_dir(current_file):
    configured_dir = os.environ.get("EVENT_BOOTH_BACKEND_DATA_DIR")

    if configured_dir:
        return os.path.abspath(os.path.expanduser(configured_dir))

    return os.path.abspath(
        os.path.join(
            os.path.dirname(os.path.abspath(current_file)),
            ".."
        )
    )
