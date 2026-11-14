"""Keep diagnostic output from interrupting work on legacy Windows consoles."""
import sys


def configure_console_output():
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, 'reconfigure', None)
        if callable(reconfigure):
            try:
                # Retain the console's encoding, escaping unsupported characters.
                reconfigure(errors='backslashreplace')
            except (OSError, ValueError):
                pass
