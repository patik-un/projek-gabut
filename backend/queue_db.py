import sqlite3
import threading
import time
import os
import traceback
import hashlib

from upload.upload_oauth import DriveUploadError, upload_to_drive
from runtime_paths import get_backend_dir

BASE_DIR = get_backend_dir(__file__)
DATABASE_DIR = os.path.join(BASE_DIR, "database")
DB_FILE = os.path.join(DATABASE_DIR, "queue.db")
MAX_QUEUE_RETRY = 5
RETRY_DELAYS = [30, 120, 300, 900, 1800]

system_running = True
os.makedirs(DATABASE_DIR, exist_ok=True)

# =========================
# GLOBAL LOCK (ANTI RACE CONDITION)
# =========================
lock = threading.Lock()


# =========================
# INIT DB
# =========================
def init_db():

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT,
            status TEXT DEFAULT 'pending',
            retry INTEGER DEFAULT 0,
            drive_folder_id TEXT,
            source TEXT DEFAULT 'photobooth',
            batch_id TEXT,
            last_error TEXT,
            dedupe_key TEXT,
            next_attempt_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            upload_started_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS upload_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            queue_id INTEGER,
            file_path TEXT,
            dedupe_key TEXT,
            drive_folder_id TEXT,
            source TEXT,
            batch_id TEXT,
            drive_file_id TEXT,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("PRAGMA table_info(queue)")
    columns = [column[1] for column in cur.fetchall()]

    if "drive_folder_id" not in columns:
        cur.execute("""
            ALTER TABLE queue
            ADD COLUMN drive_folder_id TEXT
        """)

    if "source" not in columns:
        cur.execute("""
            ALTER TABLE queue
            ADD COLUMN source TEXT DEFAULT 'photobooth'
        """)

    if "batch_id" not in columns:
        cur.execute("""
            ALTER TABLE queue
            ADD COLUMN batch_id TEXT
        """)

    if "last_error" not in columns:
        cur.execute("""
            ALTER TABLE queue
            ADD COLUMN last_error TEXT
        """)

    if "dedupe_key" not in columns:
        cur.execute("""
            ALTER TABLE queue
            ADD COLUMN dedupe_key TEXT
        """)

    if "next_attempt_at" not in columns:
        cur.execute("""
            ALTER TABLE queue
            ADD COLUMN next_attempt_at TIMESTAMP
        """)

    if "upload_started_at" not in columns:
        cur.execute("""
            ALTER TABLE queue
            ADD COLUMN upload_started_at TIMESTAMP
        """)

    cur.execute("""
        UPDATE queue
        SET source = 'photobooth'
        WHERE source IS NULL OR source = ''
    """)

    cur.execute("""
        UPDATE queue
        SET dedupe_key = file_path || '|' || COALESCE(drive_folder_id, '') || '|' || COALESCE(source, '')
        WHERE dedupe_key IS NULL OR dedupe_key = ''
    """)

    cur.execute("""
        UPDATE queue
        SET next_attempt_at = CURRENT_TIMESTAMP
        WHERE next_attempt_at IS NULL
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_queue_ready
        ON queue(status, next_attempt_at, updated_at)
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_queue_dedupe
        ON queue(dedupe_key)
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_upload_history_dedupe
        ON upload_history(dedupe_key, uploaded_at)
    """)

    conn.commit()
    conn.close()


def make_dedupe_key(file_path, drive_folder_id=None, source="photobooth"):
    normalized_path = os.path.abspath(file_path)
    file_identity = normalized_path

    if os.path.exists(normalized_path):
        digest = hashlib.sha256()

        with open(normalized_path, "rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(chunk)

        file_identity = digest.hexdigest()

    raw_key = "|".join([
        file_identity,
        drive_folder_id or "",
        source or ""
    ])

    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def wait_until_file_stable(path, timeout=10):
    start = time.time()
    last_size = -1

    while time.time() - start < timeout:
        if not os.path.exists(path):
            time.sleep(0.25)
            continue

        size = os.path.getsize(path)

        if size > 0 and size == last_size:
            return True

        last_size = size
        time.sleep(0.5)

    return False


def retry_delay_for(retry_count):
    index = min(max(retry_count - 1, 0), len(RETRY_DELAYS) - 1)

    return RETRY_DELAYS[index]


# =========================
# ADD TO QUEUE
# =========================
def add_to_queue(
    file_path,
    drive_folder_id=None,
    source="photobooth",
    status="pending",
    batch_id=None
):

    init_db()
    dedupe_key = make_dedupe_key(
        file_path,
        drive_folder_id=drive_folder_id,
        source=source
    )

    with lock:
        conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        cur = conn.cursor()

        cur.execute("""
            SELECT id, status
            FROM queue
            WHERE dedupe_key = ?
            LIMIT 1
        """, (dedupe_key,))

        existing = cur.fetchone()

        if existing:
            conn.close()
            print("🧷 QUEUE DEDUPE: file sudah ada di queue")
            print(f"   Queue ID : {existing[0]}")
            print(f"   Status   : {existing[1]}")
            print(f"   File     : {file_path}")
            return existing[0]

        cur.execute("""
            INSERT INTO queue (
                file_path,
                status,
                retry,
                drive_folder_id,
                source,
                batch_id,
                dedupe_key,
                next_attempt_at
            )
            VALUES (?, ?, 0, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            file_path,
            status,
            drive_folder_id,
            source,
            batch_id,
            dedupe_key
        ))

        queue_id = cur.lastrowid
        conn.commit()
        conn.close()

    print(f"📥 QUEUE ADD: {file_path}")

    return queue_id


def get_queue_file_path(queue_id):
    init_db()

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    cur.execute("""
        SELECT file_path
        FROM queue
        WHERE id = ?
    """, (queue_id,))

    row = cur.fetchone()
    conn.close()

    return row[0] if row else None


def get_active_queue_file_paths(source=None):
    init_db()

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    if source:
        cur.execute("""
            SELECT file_path
            FROM queue
            WHERE source = ?
        """, (source,))
    else:
        cur.execute("""
            SELECT file_path
            FROM queue
        """)

    paths = {
        os.path.abspath(row[0])
        for row in cur.fetchall()
        if row[0]
    }

    conn.close()

    return paths


# =========================
# COMMIT BATCH
# =========================
def commit_batch(batch_id):

    init_db()

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    cur.execute("""
        UPDATE queue
        SET status = 'pending',
            last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE batch_id = ?
        AND source = 'auto_upload'
        AND status = 'staged'
    """, (batch_id,))

    committed = cur.rowcount

    conn.commit()
    conn.close()

    return committed


# =========================
# DELETE BATCH
# =========================
def delete_batch(batch_id):

    init_db()

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    cur.execute("""
        DELETE FROM queue
        WHERE batch_id = ?
        AND source = 'auto_upload'
        AND status = 'staged'
    """, (batch_id,))

    deleted = cur.rowcount

    conn.commit()
    conn.close()

    return deleted


# =========================
# CLEAR QUEUE
# =========================
def clear_queue(source):

    init_db()

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, file_path
        FROM queue
        WHERE source = ?
        AND status != 'processing'
    """, (source,))

    rows = cur.fetchall()

    cur.execute("""
        DELETE FROM queue
        WHERE source = ?
        AND status != 'processing'
    """, (source,))

    deleted = cur.rowcount

    conn.commit()
    conn.close()

    for _, file_path in rows:
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError as error:
                print(f"⚠️ Gagal hapus file queue: {file_path} ({error})")

    return deleted


# =========================
# RETRY FAILED QUEUE
# =========================
def retry_failed_queue(source):

    init_db()

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    cur.execute("""
        UPDATE queue
        SET status = 'pending',
            retry = 0,
            last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE source = ?
        AND status = 'failed'
    """, (source,))

    retried = cur.rowcount

    conn.commit()
    conn.close()

    return retried


# =========================
# MARK DONE
# =========================
def mark_done(queue_id, drive_file_id=None):

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, file_path, dedupe_key, drive_folder_id, source, batch_id
        FROM queue
        WHERE id = ?
    """, (queue_id,))

    row = cur.fetchone()

    if row:
        cur.execute("""
            INSERT INTO upload_history (
                queue_id,
                file_path,
                dedupe_key,
                drive_folder_id,
                source,
                batch_id,
                drive_file_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            row[0],
            row[1],
            row[2],
            row[3],
            row[4],
            row[5],
            drive_file_id
        ))

    cur.execute("""
        DELETE FROM queue WHERE id = ?
    """, (queue_id,))

    conn.commit()
    conn.close()


# =========================
# INCREASE RETRY
# =========================
def increase_retry(queue_id, retry, last_error=None, force_failed=False):

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    next_status = "failed" if force_failed or retry >= MAX_QUEUE_RETRY else "pending"
    delay_seconds = 0 if next_status == "failed" else retry_delay_for(retry)

    cur.execute("""
        UPDATE queue
        SET retry = ?,
            status = ?,
            last_error = ?,
            next_attempt_at = datetime('now', ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (
        retry,
        next_status,
        last_error,
        f"+{delay_seconds} seconds",
        queue_id
    ))

    conn.commit()
    conn.close()


# =========================
# DEAD JOB RECOVERY
# =========================
def recover_dead_jobs(timeout_seconds=120, recover_all=False):

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    if recover_all:
        cur.execute("""
        UPDATE queue
        SET status = 'pending',
            last_error = NULL,
            next_attempt_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'processing'
        """)
    else:
        cur.execute("""
        UPDATE queue
        SET status = 'pending',
            updated_at = CURRENT_TIMESTAMP,
            last_error = NULL,
            next_attempt_at = CURRENT_TIMESTAMP,
            retry = retry + 1
        WHERE status = 'processing'
            AND (strftime('%s','now') - strftime('%s', updated_at)) > ?
        """, (timeout_seconds,))

    affected = cur.rowcount

    conn.commit()
    conn.close()

    if affected > 0:
        print(f"♻️ Recovered {affected} dead jobs")


# =========================
# RETRY OLD FAILED JOBS AFTER RETRY POLICY CHANGE
# =========================
def recover_retryable_failed_jobs(max_retry=10):

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    cur.execute("""
        UPDATE queue
        SET status = 'pending',
            last_error = NULL,
            next_attempt_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'failed'
        AND retry < ?
        AND file_path IS NOT NULL
    """, (max_retry,))

    affected = cur.rowcount

    conn.commit()
    conn.close()

    if affected > 0:
        print(f"♻️ Recovered {affected} retryable failed jobs")


# =========================
# SAFE ATOMIC GET NEXT JOB (ANTI DOUBLE UPLOAD)
# =========================
def get_next():

    with lock:

        conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        cur = conn.cursor()

        # ambil 1 job
        cur.execute("""
            SELECT id, file_path, retry, drive_folder_id, source, batch_id
            FROM queue
            WHERE status = 'pending'
            AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)
            ORDER BY retry ASC, updated_at ASC, id ASC
            LIMIT 1
        """)

        row = cur.fetchone()

        if not row:
            conn.close()
            return None

        queue_id = row[0]

        # LOCK JOB
        cur.execute("""
            UPDATE queue
            SET status = 'processing',
                upload_started_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'pending'
        """, (queue_id,))

        conn.commit()

        # validasi lock berhasil
        cur.execute("""
            SELECT id, file_path, retry, drive_folder_id, source, batch_id
            FROM queue
            WHERE id = ? AND status = 'processing'
        """, (queue_id,))

        locked = cur.fetchone()

        conn.close()
        return locked


# =========================
# WORKER LOOP
# =========================
def upload_worker():

    print(f"🔥 Worker started: {threading.current_thread().name}")

    while system_running:
        queue_id = None
        retry = 0
        file_path = None
        source = None
        drive_folder_id = None

        try:
            # Recover only jobs that have been stuck for a long time.
            # Large uploads can easily take more than 30 seconds.
            recover_dead_jobs(900)

            item = get_next()

            if not item:
                time.sleep(1)
                continue

            queue_id, file_path, retry, drive_folder_id, source, batch_id = item

            print("🚀 QUEUE UPLOAD START")
            print(f"   Queue ID  : {queue_id}")
            print(f"   Source    : {source}")
            print(f"   Retry     : {retry}/{MAX_QUEUE_RETRY}")
            print(f"   Batch ID  : {batch_id or '-'}")
            print(f"   Folder ID : {drive_folder_id or 'default'}")
            print(f"   File      : {file_path}")

            if not os.path.exists(file_path):
                raise FileNotFoundError(f"File queue tidak ditemukan: {file_path}")

            if not wait_until_file_stable(file_path):
                raise DriveUploadError(
                    "File belum stabil atau masih sedang ditulis",
                    retryable=True
                )

            file_id = upload_to_drive(
                file_path,
                drive_folder_id=drive_folder_id
            )

            # =========================
            # SUCCESS → DELETE FILE
            # =========================
            if file_id:

                if os.path.exists(file_path):
                    os.remove(file_path)
                    print(f"🗑 Deleted: {file_path}")

                mark_done(queue_id, drive_file_id=file_id)

                print("✅ QUEUE UPLOAD DONE")
                print(f"   Queue ID : {queue_id}")
                print(f"   File ID  : {file_id}")
                print(f"   File     : {file_path}")

            else:
                raise Exception(
                    "Google Drive upload gagal: tidak ada file_id setelah semua retry"
                )

        except BaseException as e:
            is_permanent_drive_error = (
                isinstance(e, DriveUploadError)
                and not e.retryable
            )
            next_retry = MAX_QUEUE_RETRY if is_permanent_drive_error else retry + 1
            will_fail_final = next_retry >= MAX_QUEUE_RETRY
            error_message = f"{type(e).__name__}: {e}"

            print("❌ QUEUE UPLOAD FAILED")
            print(f"   Queue ID  : {queue_id}")
            print(f"   Source    : {source or '-'}")
            print(f"   File      : {file_path or '-'}")
            print(f"   Folder ID : {drive_folder_id or 'default'}")
            print(f"   Error     : {error_message}")
            print(f"   Next      : {'FAILED final' if will_fail_final else f'Retry {next_retry}/{MAX_QUEUE_RETRY}'}")
            traceback.print_exc()

            if queue_id is not None:
                increase_retry(
                    queue_id,
                    next_retry,
                    last_error=error_message,
                    force_failed=is_permanent_drive_error
                )

            time.sleep(2)


# =========================
# START MULTI WORKER
# =========================
def start_upload_worker(worker_count=1):

    init_db()
    recover_dead_jobs(recover_all=True)
    recover_retryable_failed_jobs()

    threads = []

    for i in range(worker_count):

        t = threading.Thread(
            target=upload_worker,
            daemon=True
        )

        t.start()
        threads.append(t)

    print(f"🔥 SQLite Queue Started with {worker_count} Workers")

    return threads
