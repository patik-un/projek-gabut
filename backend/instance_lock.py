"""Hold an OS lock for the backend lifetime; stale files are safe to reuse."""
import os
from pathlib import Path


def acquire_instance_lock(data_dir):
    path = Path(data_dir, 'database', 'instance.lock')
    path.parent.mkdir(parents=True, exist_ok=True)
    file = open(path, 'a+b')
    try:
        if os.name == 'nt':
            import msvcrt
            if path.stat().st_size == 0:
                file.write(b'0'); file.flush()
            file.seek(0)
            msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as error:
        file.close()
        raise RuntimeError('Backend sudah berjalan untuk folder data ini') from error
    return file
