import asyncio
import importlib
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from api.test_server import request_app


class UpdatePrepareTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        import queue_db
        self.queue = queue_db
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        p = patch.object(queue_db, 'DB_FILE', str(Path(folder.name, 'queue.db')))
        p.start(); self.addCleanup(p.stop)
        queue_db.init_db()
        self.server = importlib.import_module('api.server')
        self.photo = Path(folder.name, 'photo.jpg')
        self.photo.write_bytes(b'photo')

    async def test_prepare_pauses_claims_and_cancel_resumes_without_losing_job(self):
        job = self.queue.add_to_queue(str(self.photo))
        status, _, body = await request_app(self.server.app, 'POST', '/system/update/prepare', {})
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)['ready'])
        self.assertIsNone(self.queue.get_next())
        status, _, _ = await request_app(self.server.app, 'POST', '/capture', {})
        self.assertEqual(status, 503)
        status, _, _ = await request_app(self.server.app, 'GET', '/')
        self.assertEqual(status, 200)
        status, _, _ = await request_app(self.server.app, 'POST', '/system/update/cancel', {})
        self.assertEqual(status, 200)
        self.assertEqual(self.queue.get_next()[0], job)

    async def test_prepare_waits_for_upload_already_processing(self):
        self.queue.add_to_queue(str(self.photo))
        self.queue.get_next()
        status, _, body = await request_app(self.server.app, 'POST', '/system/update/prepare', {})
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(body)['ready'])
        self.assertEqual(json.loads(body)['processing'], 1)

    async def test_pause_also_prevents_a_pending_delivery_from_starting(self):
        import delivery_jobs
        job = delivery_jobs.stage_delivery('event', None, '', str(self.photo), [])
        await request_app(self.server.app, 'POST', '/system/update/prepare', {})
        with patch.object(delivery_jobs, 'create_drive_folder') as create:
            result = delivery_jobs.process_delivery(job)
        self.assertTrue(result['queued'])
        create.assert_not_called()

    async def test_crashed_updater_pause_expires(self):
        self.queue.add_to_queue(str(self.photo))
        await request_app(self.server.app, 'POST', '/system/update/prepare', {})
        self.assertIsNone(self.queue.get_next())
        with patch('queue_db.time.time', return_value=10**12):
            self.assertIsNotNone(self.queue.get_next())

    async def test_prepare_waits_for_request_already_running(self):
        entered, release = threading.Event(), threading.Event()
        def work(*args):
            entered.set()
            release.wait(2)
            return {'success': True}
        with patch.object(self.server, 'remove_background', side_effect=work):
            task = asyncio.create_task(request_app(self.server.app, 'POST', '/photobooth/sticker/remove-background', {'image_data': 'test'}))
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 1))
                _, _, body = await request_app(self.server.app, 'POST', '/system/update/prepare', {})
                self.assertFalse(json.loads(body)['ready'])
                self.assertEqual(json.loads(body)['active_requests'], 1)
            finally:
                release.set()
                await task
        _, _, body = await request_app(self.server.app, 'POST', '/system/update/prepare', {})
        self.assertTrue(json.loads(body)['ready'])

    async def test_prepare_waits_for_auto_watch_processing_then_blocks_new_processing(self):
        from detect import detect
        entered, release = threading.Event(), threading.Event()
        def work(*args, **kwargs):
            entered.set(); release.wait(2)
        with patch.object(detect, 'process_image', side_effect=work):
            detect.process_auto_watch_file(str(self.photo))
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 1))
                _, _, body = await request_app(self.server.app, 'POST', '/system/update/prepare', {})
                self.assertFalse(json.loads(body)['ready'])
                self.assertFalse(detect.process_auto_watch_file(str(self.photo) + '-next'))
            finally:
                release.set()
                for _ in range(40):
                    with detect.AUTO_PROCESS_LOCK:
                        if not detect.AUTO_PROCESSING_FILES: break
                    await asyncio.sleep(.01)

    async def test_prepare_cannot_report_ready_between_registration_and_processing(self):
        from detect import detect
        entered, release = threading.Event(), threading.Event()
        launch = detect.process_auto_watch_file
        def delayed_launch(*args, **kwargs):
            entered.set(); release.wait(2)
            return launch(*args, **kwargs)
        with patch.object(detect, 'AUTO_WATCH_CONFIG_FILE', str(self.photo.parent / 'watch.json')), \
             patch.object(detect, 'process_auto_watch_file', side_effect=delayed_launch), \
             patch.object(detect, 'process_image'):
            detect.save_auto_watch_config(str(self.photo.parent), enabled=True, auto_upload_enabled=True)
            registration = threading.Thread(target=detect.register_auto_watch_file, args=(str(self.photo),))
            registration.start()
            task = None
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 1))
                task = asyncio.create_task(request_app(self.server.app, 'POST', '/system/update/prepare', {}))
                await asyncio.sleep(.05)
                if task.done():
                    self.assertFalse(json.loads(task.result()[2])['ready'], 'Ready cannot be reported before an accepted registration reaches processing')
            finally:
                release.set()
                await asyncio.to_thread(registration.join, 2)
                if task: await task

    async def test_cancel_is_not_undone_by_prepare_waiting_for_detector_lock(self):
        from detect import detect
        entered, release = threading.Event(), threading.Event()
        def registration():
            with detect.AUTO_PROCESS_LOCK:
                entered.set(); release.wait(2)
        worker = threading.Thread(target=registration)
        worker.start()
        prepare = None
        try:
            self.assertTrue(await asyncio.to_thread(entered.wait, 1))
            prepare = asyncio.create_task(request_app(self.server.app, 'POST', '/system/update/prepare', {}))
            await asyncio.sleep(.05)
            await request_app(self.server.app, 'POST', '/system/update/cancel', {})
        finally:
            release.set()
            await asyncio.to_thread(worker.join, 2)
            if prepare: await prepare
        self.assertFalse(self.queue.update_is_paused())
