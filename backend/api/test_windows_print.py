import importlib
import json
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from PIL import Image


class WindowsPaperSizeTest(unittest.TestCase):
    def setUp(self):
        self.server = importlib.import_module('api.server')
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.photo = Path(folder.name, 'photo.jpg')
        Image.new('RGB', (400, 600)).save(self.photo)
        self.mode = types.SimpleNamespace(Fields=0x10000, PaperSize=9,
            PaperWidth=2100, PaperLength=2970, FormName='A4', Scale=150, Orientation=1)
        self.printer, self.gui, self.ui = MagicMock(), MagicMock(), MagicMock()
        self.printer.GetPrinter.return_value = {'pDevMode': self.mode, 'pPortName': 'USB001'}
        self.printer.DocumentProperties.return_value = 1
        self.con = types.SimpleNamespace(DM_ORIENTATION=1, DM_PAPERSIZE=2,
            DM_PAPERLENGTH=4, DM_PAPERWIDTH=8, DM_SCALE=16, DM_FORMNAME=0x10000,
            DMORIENT_PORTRAIT=1, DM_IN_BUFFER=8, DM_OUT_BUFFER=2,
            DC_PAPERS=2, DC_PAPERSIZE=3, HORZRES=8, VERTRES=10,
            LOGPIXELSX=88, LOGPIXELSY=90, PHYSICALWIDTH=110, PHYSICALHEIGHT=111)
        self.printer.DeviceCapabilities.side_effect = lambda name, port, cap: {
            2: (9, 256, 257),
            3: ({'x': 2100, 'y': 2970}, {'x': 1016, 'y': 1524}, {'x': 889, 'y': 1270}),
        }[cap]
        self.dc = self.ui.CreateDCFromHandle.return_value
        self.caps = {8: 1200, 10: 1800, 88: 300, 90: 300, 110: 1200, 111: 1800}
        self.dc.GetDeviceCaps.side_effect = self.caps.__getitem__
        self.dib = MagicMock()
        runtime = (self.printer, self.gui, self.ui, self.con, types.SimpleNamespace(Dib=self.dib))
        p = patch.object(self.server, 'load_windows_print_runtime', return_value=runtime)
        p.start(); self.addCleanup(p.stop)

    def test_4r_uses_driver_photo_form_instead_of_default_a4(self):
        self.assertIsNone(self.server.print_file_windows('EPSON L3250', self.photo, '4r'))
        self.assertEqual(self.mode.PaperSize, 256)
        self.assertEqual(self.mode.Scale, 100)
        self.assertFalse(self.mode.Fields & self.con.DM_FORMNAME)
        self.printer.DocumentProperties.assert_called_once_with(0,
            self.printer.OpenPrinter.return_value, 'EPSON L3250', self.mode, self.mode, 10)
        self.dib.return_value.draw.assert_called_once_with(self.dc.GetHandleOutput(), (0, 0, 1200, 1800))
        self.printer.SetPrinter.assert_not_called()

    def test_3r_uses_its_own_driver_form(self):
        self.caps.update({8: 1050, 10: 1500, 110: 1050, 111: 1500})
        self.assertIsNone(self.server.print_file_windows('EPSON L3250', self.photo, '3r'))
        self.assertEqual(self.mode.PaperSize, 257)
        self.assertEqual((self.mode.PaperWidth, self.mode.PaperLength), (889, 1270))

    def test_a4_driver_fallback_stops_before_submitting_a_print_job(self):
        self.caps.update({8: 2480, 10: 3508, 110: 2480, 111: 3508})
        response = self.server.print_file_windows('EPSON L3250', self.photo, '4r')
        self.assertEqual(getattr(response, 'status_code', None), 500)
        self.assertIn('4R', json.loads(response.body)['message'])
        self.dc.StartDoc.assert_not_called()
        self.dib.assert_not_called()
        self.dc.DeleteDC.assert_called_once()
        self.printer.ClosePrinter.assert_called_once()

    def test_different_horizontal_and_vertical_dpi_preserve_physical_photo_ratio(self):
        self.caps.update({8: 1200, 10: 3600, 90: 600, 111: 3600})
        self.assertIsNone(self.server.print_file_windows('EPSON L3250', self.photo, '4r'))
        self.dib.return_value.draw.assert_called_once_with(self.dc.GetHandleOutput(), (0, 0, 1200, 3600))

    def test_custom_paper_dimensions_work_when_driver_has_no_photo_form(self):
        self.printer.DeviceCapabilities.side_effect = None
        self.printer.DeviceCapabilities.return_value = ()
        self.assertIsNone(self.server.print_file_windows('EPSON L3250', self.photo, '4r'))
        self.assertEqual(self.mode.PaperSize, 0)
        self.assertEqual((self.mode.PaperWidth, self.mode.PaperLength), (1016, 1524))

    def test_driver_rejection_does_not_create_or_submit_a_job(self):
        self.printer.DocumentProperties.return_value = -1
        response = self.server.print_file_windows('EPSON L3250', self.photo, '4r')
        self.assertEqual(getattr(response, 'status_code', None), 500)
        self.gui.CreateDC.assert_not_called()
        self.dc.StartDoc.assert_not_called()

    def test_driver_without_scaling_support_can_print_at_correct_physical_size(self):
        def normalize(*args):
            self.mode.Fields &= ~self.con.DM_SCALE
            self.mode.Scale = 0
            return 1
        self.printer.DocumentProperties.side_effect = normalize
        self.assertIsNone(self.server.print_file_windows('EPSON L3250', self.photo, '4r'))
        self.dc.EndDoc.assert_called_once()
