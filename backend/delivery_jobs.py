"""Durable folder creation and upload staging, retried by the upload worker."""
import hashlib
import json
import sqlite3
import time
from contextlib import closing

import queue_db
from upload.upload_oauth import DriveUploadError, create_drive_folder, share_drive_file


def connection():
    queue_db.init_db()
    conn = sqlite3.connect(queue_db.DB_FILE, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute('''CREATE TABLE IF NOT EXISTS delivery_jobs (
        id TEXT PRIMARY KEY, folder_name TEXT, parent_id TEXT, email TEXT,
        paths TEXT, folder TEXT, result TEXT, state TEXT DEFAULT 'pending',
        next_attempt REAL DEFAULT 0, last_error TEXT
    )''')
    conn.commit()
    return conn


def stage_delivery(folder_name, parent_id, email, strip_path, attachment_paths):
    digests = []
    for path in [strip_path, *attachment_paths]:
        with open(path, 'rb') as file:
            digests.append(hashlib.sha256(file.read()).hexdigest())
    key = hashlib.sha256(json.dumps([folder_name, parent_id, email, digests]).encode()).hexdigest()
    with closing(connection()) as conn, conn:
        conn.execute('''INSERT OR IGNORE INTO delivery_jobs
            (id, folder_name, parent_id, email, paths) VALUES (?, ?, ?, ?, ?)''',
            (key, folder_name, parent_id, email, json.dumps([strip_path, *attachment_paths])))
    return key


def process_delivery(job_id, force=False, create_folder=None, share=None, enqueue=None):
    create_folder = create_folder or create_drive_folder
    share = share or share_drive_file
    enqueue = enqueue or queue_db.add_to_queue
    with closing(connection()) as conn, conn:
        conn.execute('BEGIN IMMEDIATE')
        row = conn.execute('SELECT * FROM delivery_jobs WHERE id=?', (job_id,)).fetchone()
        if row is None:
            raise ValueError('Delivery job tidak ditemukan')
        if row['state'] == 'done' or (row['state'] == 'failed' and not force):
            return json.loads(row['result'])
        if queue_db.update_is_paused(conn):
            return {'queued': True, 'delivery_id': job_id}
        if row['next_attempt'] > time.time() and (row['state'] == 'processing' or not force):
            return {'queued': True, 'delivery_id': job_id}
        conn.execute("UPDATE delivery_jobs SET state='processing', next_attempt=? WHERE id=?", (time.time() + 900, job_id))
    try:
        folder = json.loads(row['folder']) if row['folder'] else create_folder(row['folder_name'], parent_folder_id=row['parent_id'])
        # Persist folder identity before sharing or queueing files.
        with closing(connection()) as conn, conn:
            conn.execute('UPDATE delivery_jobs SET folder=? WHERE id=?', (json.dumps(folder), job_id))
        warning = None
        if row['email']:
            try:
                share(folder['id'], row['email'])
            except Exception as error:
                warning = str(error)
        paths = json.loads(row['paths'])
        ids = [enqueue(path, drive_folder_id=folder['id'], source='photobooth', status='staged') for path in paths]
        result = {'queued': False, 'delivery_id': job_id, 'folder_id': folder['id'],
                  'folder_url': folder.get('webViewLink'), 'shared_to': row['email'] if row['email'] and not warning else None,
                  'share_warning': warning, 'queue_id': ids[0], 'gif_queue_ids': ids[1:]}
        with closing(connection()) as conn, conn:
            conn.execute("UPDATE delivery_jobs SET state='done', result=?, last_error=NULL WHERE id=?", (json.dumps(result), job_id))
            # Release uploads only after the complete delivery plan is durable.
            conn.executemany("UPDATE queue SET status='pending' WHERE id=? AND status='staged'", [(item,) for item in ids])
        return result
    except Exception as error:
        permanent = isinstance(error, DriveUploadError) and not error.retryable
        result = {'queued': False, 'failed': True, 'delivery_id': job_id,
                  'message': f'Hasil tersimpan lokal. Pengiriman Drive gagal: {error}'} if permanent else None
        with closing(connection()) as conn, conn:
            conn.execute("UPDATE delivery_jobs SET state=?, next_attempt=?, last_error=?, result=? WHERE id=?",
                         ('failed' if permanent else 'pending', time.time() + 30, str(error),
                          json.dumps(result) if result else None, job_id))
        if permanent:
            return result
        return {'queued': True, 'delivery_id': job_id, 'message': 'Tersimpan lokal; pengiriman Drive akan dicoba ulang otomatis.'}


def process_pending_deliveries():
    with closing(connection()) as conn:
        row = conn.execute("SELECT id FROM delivery_jobs WHERE state IN ('pending', 'processing') AND next_attempt<=? ORDER BY next_attempt LIMIT 1", (time.time(),)).fetchone()
    if row:
        process_delivery(row['id'])


def delivery_status(job_id):
    with closing(connection()) as conn:
        row = conn.execute('SELECT state, result FROM delivery_jobs WHERE id=?', (job_id,)).fetchone()
    if row is None:
        return None
    return json.loads(row['result']) if row['state'] in ('done', 'failed') else {'queued': True, 'delivery_id': job_id}
