import base64
import importlib
import json
import os
import tempfile
import types
import asyncio
import time
import threading
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from api.test_server import request_app, valid_jpeg


class AuditApiRegressionTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.server = importlib.import_module('api.server')
        p = patch('queue_db.DB_FILE', str(Path(self.folder.name, 'queue.db')))
        p.start(); self.addCleanup(p.stop)
        self.strips = Path(self.folder.name, 'strips')
        self.strips.mkdir()
        for key in ['PHOTOBOOTH_STRIP_DIR', 'OUTPUT_DIR']:
            p = patch.object(self.server, key, str(self.strips))
            p.start(); self.addCleanup(p.stop)

    async def test_upload_folder_name_cannot_escape_strip_directory(self):
        from upload.upload_oauth import DriveUploadError
        with patch.object(self.server, 'create_drive_folder', side_effect=DriveUploadError('offline')):
            await request_app(self.server.app, 'POST', '/photobooth/drive-upload', {
                'folder_name': '../escape', 'filename': 'test.jpg',
                'parent_drive_folder_id': 'test', 'data_base64': valid_jpeg(),
            })
        self.assertFalse(Path(self.folder.name, 'escape_test.jpg').exists())

    async def test_capture_rejects_non_image_before_writing_file(self):
        status, _, _ = await request_app(self.server.app, 'POST', '/capture', {
            'data_base64': base64.b64encode(b'not an image').decode(),
        })
        self.assertEqual(status, 400)
        self.assertEqual(list(self.strips.iterdir()), [])

    async def test_windows_locked_old_photos_do_not_fill_the_new_session(self):
        old = self.strips / 'old.jpg'
        old.write_bytes(base64.b64decode(valid_jpeg()))
        remove = os.remove
        def remove_except_locked(path):
            if str(path) == str(old):
                raise PermissionError('Windows: file is being used by another process')
            return remove(path)
        headers = [(b'x-event-booth-session', b'locked-photo-test')]
        try:
            with patch.object(self.server.os, 'remove', side_effect=remove_except_locked):
                status, _, _ = await request_app(self.server.app, 'POST', '/photobooth/session/start', {}, headers=headers)
            self.assertEqual(status, 200)
            _, _, photos = await request_app(self.server.app, 'GET', '/captures', headers=headers)
            photos = json.loads(photos)
            self.assertEqual(photos, [])
            _, _, latest = await request_app(self.server.app, 'GET', '/latest-capture', headers=headers)
            self.assertIsNone(json.loads(latest)['image_url'])
            for _ in range(3):
                status, _, _ = await request_app(self.server.app, 'POST', '/capture',
                    {'max_photo_count': 3, 'data_base64': valid_jpeg()}, headers=headers)
                self.assertEqual(status, 200)
            _, _, photos = await request_app(self.server.app, 'GET', '/captures', headers=headers)
            photos = json.loads(photos)
            self.assertEqual(len(photos), 3)
            self.assertNotIn('old.jpg', [photo['filename'] for photo in photos])
            status, _, _ = await request_app(self.server.app, 'POST', '/capture',
                {'max_photo_count': 3, 'data_base64': valid_jpeg()}, headers=headers)
            self.assertEqual(status, 409)
        finally:
            await request_app(self.server.app, 'POST', '/photobooth/session/finish', {}, headers=headers)
        self.assertFalse(old.exists(), 'Cleanup retries old files once the Windows lock is released')

    async def test_capture_rejects_non_object_payload(self):
        status, _, _ = await request_app(self.server.app, 'POST', '/capture', [])
        self.assertEqual(status, 400)

    async def test_packaged_backend_requires_instance_credential(self):
        with patch.dict(os.environ, {'EVENT_BOOTH_API_TOKEN': 'private-instance-token'}):
            status, _, _ = await request_app(self.server.app, 'POST', '/camera/start', origin='http://tauri.localhost')
            self.assertEqual(status, 401)
            status, _, _ = await request_app(self.server.app, 'POST', '/camera/start', origin='http://tauri.localhost',
                                            headers=[(b'x-event-booth-token', b'private-instance-token')])
            self.assertEqual(status, 200)

    async def test_other_tab_cannot_reset_active_session(self):
        headers = [(b'x-event-booth-session', b'tab-a')]
        status, _, _ = await request_app(self.server.app, 'POST', '/photobooth/session/start', {}, headers=headers)
        self.assertEqual(status, 200)
        try:
            status, _, _ = await request_app(self.server.app, 'POST', '/photobooth/session/start', {},
                                            headers=[(b'x-event-booth-session', b'tab-b')])
            self.assertEqual(status, 409)
        finally:
            await request_app(self.server.app, 'POST', '/photobooth/session/finish', {}, headers=headers)

    async def test_expired_tab_lease_can_be_recovered(self):
        with patch.object(self.server, 'session_owner', 'abandoned-tab'), patch.object(self.server, 'session_owner_expires', 0, create=True):
            status, _, _ = await request_app(self.server.app, 'POST', '/photobooth/session/start', {},
                                            headers=[(b'x-event-booth-session', b'new-tab')])
            try:
                self.assertEqual(status, 200)
            finally:
                await request_app(self.server.app, 'POST', '/photobooth/session/finish', {},
                                  headers=[(b'x-event-booth-session', b'new-tab')])

    async def test_concurrent_capture_cannot_exceed_session_photo_limit(self):
        decode = self.server.decode_base64_image
        def slow_decode(data):
            time.sleep(.05)
            return decode(data)
        with patch.object(self.server, 'decode_base64_image', side_effect=slow_decode):
            responses = await asyncio.gather(*[request_app(self.server.app, 'POST', '/capture',
                {'max_photo_count': 1, 'data_base64': valid_jpeg()}) for _ in range(2)])
        self.assertEqual(sorted(response[0] for response in responses), [200, 409])
        self.assertEqual(len(list(self.strips.iterdir())), 1)

    async def test_capture_preflight_is_allowed_during_owned_session(self):
        with patch.object(self.server, 'session_owner', 'tab-a'), \
             patch.object(self.server, 'session_owner_expires', time.monotonic() + 120):
            status, _, _ = await request_app(self.server.app, 'OPTIONS', '/capture', origin='http://localhost:1420', headers=[
                (b'access-control-request-method', b'POST'),
                (b'access-control-request-headers', b'content-type,x-event-booth-session'),
            ])
        self.assertEqual(status, 200)

    async def test_waiting_capture_does_not_exhaust_worker_pool(self):
        import anyio.to_thread
        limiter = anyio.to_thread.current_default_thread_limiter()
        previous = limiter.total_tokens
        limiter.total_tokens = 2
        entered, release = threading.Event(), threading.Event()
        decode = self.server.decode_base64_image
        def slow_decode(data):
            entered.set()
            release.wait(timeout=2)
            return decode(data)
        tasks = []
        try:
            with patch.object(self.server, 'decode_base64_image', side_effect=slow_decode):
                tasks = [asyncio.create_task(request_app(self.server.app, 'POST', '/capture',
                    {'max_photo_count': 1, 'data_base64': valid_jpeg()})) for _ in range(2)]
                await asyncio.to_thread(entered.wait, .5)
                await asyncio.sleep(.05)
                response = await asyncio.wait_for(request_app(self.server.app, 'GET', '/'), timeout=.3)
                self.assertEqual(response[0], 200)
        finally:
            release.set()
            await asyncio.gather(*tasks, return_exceptions=True)
            limiter.total_tokens = previous

    def test_old_sdk_stream_cleanup_cannot_stop_replacement_stream(self):
        manager = MagicMock()
        manager.selected = 'sony_crsdk'
        manager.preview_jpeg.return_value = b'jpeg'
        with patch.object(self.server, 'camera_manager', manager), patch.object(self.server.time, 'sleep'):
            old = self.server.generate_camera_frames()
            new = self.server.generate_camera_frames()
            next(old)
            self.server.stop_camera_stream()
            next(new)
            old.close()
            try:
                self.assertIn(b'jpeg', next(new))
            finally:
                new.close()

    async def test_camera_provider_selection_and_capture_use_existing_manager(self):
        manager = MagicMock()
        manager.selected = 'sony_crsdk'
        manager.status.return_value = {'selected': 'sony_crsdk', 'providers': []}
        manager.select.return_value = manager.status.return_value
        with patch.object(self.server, 'camera_manager', manager, create=True):
            status, _, body = await request_app(self.server.app, 'POST', '/camera/provider', {'provider': 'sony_crsdk'})
            self.assertEqual(status, 200)
            manager.select.assert_called_once_with('sony_crsdk')
            status, _, body = await request_app(self.server.app, 'POST', '/capture', {})
            self.assertEqual(status, 200)
            manager.capture.assert_called_once()

    def test_windows_print_targets_selected_printer_and_requested_paper(self):
        from PIL import Image
        image_path = self.strips / 'print.jpg'
        Image.new('RGB', (200, 300)).save(image_path)
        devmode = types.SimpleNamespace(Fields=0, PaperSize=0, PaperWidth=0, PaperLength=0, Orientation=0)
        printer = MagicMock()
        printer.GetPrinter.return_value = {'pDevMode': devmode}
        printer.DeviceCapabilities.return_value = ()
        printer.DocumentProperties.return_value = 1
        gui, ui, con = MagicMock(), MagicMock(), types.SimpleNamespace(
            DM_PAPERSIZE=2, DM_PAPERLENGTH=4, DM_PAPERWIDTH=8, DM_ORIENTATION=1,
            DMORIENT_PORTRAIT=1, HORZRES=8, VERTRES=10, DM_FORMNAME=0x10000, DM_SCALE=16,
            DM_IN_BUFFER=8, DM_OUT_BUFFER=2, DC_PAPERS=2, DC_PAPERSIZE=3,
            LOGPIXELSX=88, LOGPIXELSY=90, PHYSICALWIDTH=110, PHYSICALHEIGHT=111,
        )
        dc = ui.CreateDCFromHandle.return_value
        dc.GetDeviceCaps.side_effect = {8: 1050, 10: 1500, 88: 300, 90: 300, 110: 1050, 111: 1500}.__getitem__
        with patch.dict('sys.modules', {'pywintypes': types.ModuleType('pywintypes'), 'win32print': printer, 'win32gui': gui, 'win32ui': ui, 'win32con': con}), \
             patch('PIL.ImageWin.Dib') as dib:
            self.assertIsNone(self.server.print_file_windows('Photo Printer', str(image_path), '3r'))
        printer.OpenPrinter.assert_called_once_with('Photo Printer')
        printer.SetDefaultPrinter.assert_not_called()
        self.assertEqual((devmode.PaperWidth, devmode.PaperLength), (889, 1270))
        gui.CreateDC.assert_called_once_with('WINSPOOL', 'Photo Printer', devmode)
        dib.return_value.draw.assert_called_once()
        dc.EndDoc.assert_called_once()

    def test_printer_discovery_checks_native_runtime_before_reporting_printers(self):
        printer = MagicMock()
        printer.EnumPrinters.return_value = [{'pPrinterName': 'EPSON L3250 Series', 'Status': 0}]
        printer.GetDefaultPrinter.return_value = 'EPSON L3250 Series'
        # These represent native extensions whose C-level import requires pywintypes.
        modules = {'pywintypes': None, 'win32print': printer, 'win32gui': MagicMock(),
                   'win32ui': MagicMock(), 'win32con': MagicMock()}
        with patch.dict('sys.modules', modules):
            response = self.server.get_printers_windows()
        self.assertEqual(getattr(response, 'status_code', None), 500)
        body = json.loads(response.body)
        self.assertEqual(body['error_code'], 'WINDOWS_PRINT_RUNTIME_MISSING')
        self.assertIn('pywintypes', body['message'])

    def test_windows_printer_discovery_returns_epson_when_runtime_is_available(self):
        printer = MagicMock()
        printer.EnumPrinters.return_value = [{'pPrinterName': 'EPSON L3250 Series', 'Status': 0}]
        printer.GetDefaultPrinter.return_value = 'EPSON L3250 Series'
        modules = {'pywintypes': types.ModuleType('pywintypes'), 'win32print': printer,
                   'win32gui': MagicMock(), 'win32ui': MagicMock(), 'win32con': MagicMock()}
        with patch.dict('sys.modules', modules):
            result = self.server.get_printers_windows()
        self.assertTrue(result['success'])
        self.assertEqual(result['printers'][0]['name'], 'EPSON L3250 Series')
        self.assertEqual(result['default_printer'], 'EPSON L3250 Series')


class QueueAuditRegressionTest(unittest.TestCase):
    def setUp(self):
        import queue_db
        self.queue = queue_db
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        p = patch.object(queue_db, 'DB_FILE', str(Path(self.folder.name, 'queue.db')))
        p.start(); self.addCleanup(p.stop)
        self.photo = Path(self.folder.name, 'photo.jpg')
        self.photo.write_bytes(b'photo')

    def test_completed_content_is_not_uploaded_twice_to_same_destination(self):
        first = self.queue.add_to_queue(str(self.photo), drive_folder_id='a')
        self.queue.mark_done(first, drive_file_id='drive-id')
        self.assertEqual(self.queue.add_to_queue(str(self.photo), drive_folder_id='a'), first)
        self.assertNotEqual(self.queue.add_to_queue(str(self.photo), drive_folder_id='b'), first)

    def test_database_failure_does_not_delete_local_photo(self):
        with patch.object(self.queue, 'mark_done', side_effect=RuntimeError('database failed')):
            with self.assertRaises(RuntimeError):
                self.queue.complete_uploaded_job(1, str(self.photo), 'drive-id')
        self.assertTrue(self.photo.exists())

    def test_cleanup_failure_does_not_requeue_successful_upload(self):
        first = self.queue.add_to_queue(str(self.photo))
        with patch.object(self.queue.os, 'remove', side_effect=PermissionError('locked')):
            self.queue.complete_uploaded_job(first, str(self.photo), 'drive-id')
        self.assertIsNone(self.queue.get_next())
