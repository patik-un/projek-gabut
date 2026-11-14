import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class DeliveryJobsTest(unittest.TestCase):
    def test_permanent_drive_failure_is_reported_and_not_retried_by_worker(self):
        import queue_db
        import delivery_jobs as jobs
        from upload.upload_oauth import DriveUploadError
        with tempfile.TemporaryDirectory() as folder, patch.object(queue_db, 'DB_FILE', str(Path(folder, 'queue.db'))):
            photo = Path(folder, 'photo.jpg'); photo.write_bytes(b'photo')
            job = jobs.stage_delivery('job', 'missing-parent', '', str(photo), [])
            with patch.object(jobs, 'create_drive_folder', side_effect=DriveUploadError('Folder tujuan tidak ditemukan', retryable=False)):
                result = jobs.process_delivery(job)
            self.assertTrue(result.get('failed'))
            self.assertFalse(result['queued'])
            self.assertIn('Folder tujuan tidak ditemukan', jobs.delivery_status(job)['message'])
            self.assertTrue(photo.exists())
            with patch.object(jobs, 'create_drive_folder') as retry:
                jobs.process_pending_deliveries()
                self.assertEqual(jobs.process_delivery(job), result)
            retry.assert_not_called()

    def test_attachment_changes_create_a_distinct_delivery(self):
        import queue_db
        import delivery_jobs as jobs
        with tempfile.TemporaryDirectory() as folder, patch.object(queue_db, 'DB_FILE', str(Path(folder, 'queue.db'))):
            photo = Path(folder, 'photo.jpg'); photo.write_bytes(b'photo')
            gif = Path(folder, 'animation.gif'); gif.write_bytes(b'gif-v1')
            first = jobs.stage_delivery('job', 'parent', '', str(photo), [str(gif)])
            gif.write_bytes(b'gif-v2')
            second = jobs.stage_delivery('job', 'parent', '', str(photo), [str(gif)])
            self.assertNotEqual(first, second)

    def test_partial_enqueue_failure_does_not_release_files_to_upload_worker(self):
        import queue_db
        import delivery_jobs as jobs
        with tempfile.TemporaryDirectory() as folder, patch.object(queue_db, 'DB_FILE', str(Path(folder, 'queue.db'))):
            photo = Path(folder, 'photo.jpg'); photo.write_bytes(b'photo')
            gif = Path(folder, 'animation.gif'); gif.write_bytes(b'gif')
            job = jobs.stage_delivery('job', 'parent', '', str(photo), [str(gif)])
            enqueue = queue_db.add_to_queue
            count = 0
            def fail_attachment(path, **kwargs):
                nonlocal count
                count += 1
                if count == 2:
                    raise RuntimeError('interrupted')
                return enqueue(path, **kwargs)
            with patch.object(jobs, 'create_drive_folder', return_value={'id':'folder-id'}):
                self.assertTrue(jobs.process_delivery(job, enqueue=fail_attachment)['queued'])
            self.assertIsNone(queue_db.get_next())
            self.assertTrue(photo.exists())
            with patch.object(jobs, 'create_drive_folder') as create_again:
                self.assertFalse(jobs.process_delivery(job, force=True)['queued'])
            create_again.assert_not_called()
            self.assertIsNotNone(queue_db.get_next())

    def test_offline_delivery_survives_restart_and_keeps_folder_for_retry(self):
        import queue_db
        import delivery_jobs as jobs
        with tempfile.TemporaryDirectory() as folder, patch.object(queue_db, 'DB_FILE', str(Path(folder, 'queue.db'))):
            photo = Path(folder, 'photo.jpg'); photo.write_bytes(b'photo')
            job = jobs.stage_delivery('job', 'parent', '', str(photo), [])
            with patch.object(jobs, 'create_drive_folder', side_effect=OSError('offline')):
                result = jobs.process_delivery(job)
            self.assertTrue(result['queued'])
            self.assertTrue(photo.exists())
            with patch.object(jobs, 'create_drive_folder', return_value={'id':'folder-id'}) as create:
                result = jobs.process_delivery(job, force=True)
            self.assertFalse(result['queued'])
            self.assertEqual(result['folder_id'], 'folder-id')
            self.assertIsNotNone(queue_db.get_next())
            with patch.object(jobs, 'create_drive_folder') as create_again:
                self.assertEqual(jobs.process_delivery(job), result)
            create_again.assert_not_called()
