"""Prevent a native-managed backend surviving a terminated desktop process."""
import os


def managed_parent_alive(expected_pid):
    if expected_pid is None:
        return True  # A standalone backend has its own lifecycle.
    try:
        expected = int(expected_pid)
    except (ValueError, TypeError):
        return False
    return expected > 1 and os.getppid() == expected
