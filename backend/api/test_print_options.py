import importlib
import json
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from api.test_server import request_app, valid_jpeg


class PrintOptionsApiTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.server = importlib.import_module('api.server')
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.folder = Path(folder.name)
        p = patch.object(self.server, 'PHOTOBOOTH_STRIP_DIR', folder.name)
        p.start(); self.addCleanup(p.stop)

    async def test_invalid_options_rejected_before_creating_file_or_job(self):
        for field, values in {
            'copies': [True, False, 0, 11, 1.5, '2', None],
            'orientation': ['diagonal', '', None, 1],
            'fit': ['stretch', '', None, 1],
            'paper_size': ['a4', '', None, 1],
        }.items():
            for value in values:
                with self.subTest(field=field, value=value), patch.object(self.server.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0)) as submit:
                    status, _, _ = await request_app(self.server.app, 'POST', '/photobooth/print', {
                        'printer_name': 'Photo Printer', 'data_base64': valid_jpeg(), field: value})
                    self.assertEqual(status, 400)
                    self.assertEqual(list(self.folder.iterdir()), [])
                    submit.assert_not_called()

    async def test_options_reach_actual_cups_job(self):
        with patch.object(self.server.sys, 'platform', 'darwin'), patch.object(self.server.subprocess, 'run',
                return_value=types.SimpleNamespace(returncode=0)) as submit:
            status, _, body = await request_app(self.server.app, 'POST', '/photobooth/print', {
                'printer_name': 'Photo Printer; echo unsafe', 'data_base64': valid_jpeg(),
                'copies': 10, 'orientation': 'landscape', 'fit': 'fill', 'paper_size': '3r'})
        self.assertEqual(status, 200)
        command = submit.call_args.args[0]
        self.assertEqual(command[:-1], ['lpr', '-P', 'Photo Printer; echo unsafe', '-#', '10',
            '-o', 'media=Custom.3.5x5in', '-o', 'orientation-requested=4', '-o', 'fill'])
        self.assertTrue(Path(command[-1]).is_file())
        result = json.loads(body)
        self.assertEqual((result['copies'], result['orientation'], result['fit']), (10, 'landscape', 'fill'))

    async def test_legacy_request_defaults_to_one_portrait_fitted_4r_job(self):
        with patch.object(self.server.sys, 'platform', 'darwin'), patch.object(self.server.subprocess, 'run',
                return_value=types.SimpleNamespace(returncode=0)) as submit:
            status, _, _ = await request_app(self.server.app, 'POST', '/photobooth/print', {
                'printer_name': 'Photo Printer', 'data_base64': valid_jpeg()})
        self.assertEqual(status, 200)
        self.assertEqual(submit.call_args.args[0][:-1], ['lpr', '-P', 'Photo Printer', '-#', '1',
            '-o', 'media=Custom.4x6in', '-o', 'orientation-requested=3', '-o', 'fit-to-page'])
