import sqlite3
import threading
import time
import os

from upload.upload_oauth import upload_to_drive

DB_FILE = "backend/database/queue.db"
system_running = True
os.makedirs("backend/database", exist_ok=True)

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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()


# =========================
# ADD TO QUEUE
# =========================
def add_to_queue(file_path):

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO queue (file_path, status, retry)
        VALUES (?, 'pending', 0)
    """, (file_path,))

    conn.commit()
    conn.close()

    print(f"📥 QUEUE ADD: {file_path}")


# =========================
# MARK DONE
# =========================
def mark_done(queue_id):

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    cur.execute("""
        DELETE FROM queue WHERE id = ?
    """, (queue_id,))

    conn.commit()
    conn.close()


# =========================
# INCREASE RETRY
# =========================
def increase_retry(queue_id, retry):

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    cur.execute("""
        UPDATE queue
        SET retry = ?,
            status = CASE WHEN ? >= 3 THEN 'failed' ELSE 'pending' END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (retry, retry, queue_id))

    conn.commit()
    conn.close()


# =========================
# DEAD JOB RECOVERY
# =========================
def recover_dead_jobs(timeout_seconds=120):

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cur = conn.cursor()

    cur.execute("""
        UPDATE queue
        SET status = 'pending',
            updated_at = CURRENT_TIMESTAMP,
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
# SAFE ATOMIC GET NEXT JOB (ANTI DOUBLE UPLOAD)
# =========================
def get_next():

    with lock:

        conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        cur = conn.cursor()

        # ambil 1 job
        cur.execute("""
            SELECT id, file_path, retry
            FROM queue
            WHERE status = 'pending'
            ORDER BY id ASC
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
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'pending'
        """, (queue_id,))

        conn.commit()

        # validasi lock berhasil
        cur.execute("""
            SELECT id, file_path, retry
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

        # recover job mati
        recover_dead_jobs(120)

        item = get_next()

        if not item:
            time.sleep(1)
            continue

        queue_id, file_path, retry = item

        try:
            print(f"🚀 UPLOADING [{queue_id}]: {file_path}")

            file_id = upload_to_drive(file_path)

            # =========================
            # SUCCESS → DELETE FILE
            # =========================
            if file_id:

                if os.path.exists(file_path):
                    os.remove(file_path)
                    print(f"🗑 Deleted: {file_path}")

                mark_done(queue_id)

                print(f"✅ DONE: {file_path}")

            else:
                raise Exception("Upload failed (no file_id)")

        except Exception as e:
            print(f"❌ UPLOAD FAILED: {e}")

            increase_retry(queue_id, retry + 1)

            time.sleep(2)


# =========================
# START MULTI WORKER
# =========================
def start_upload_worker(worker_count=3):

    init_db()

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