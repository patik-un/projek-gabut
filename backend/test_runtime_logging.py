import io
import sys
import unittest
from unittest.mock import patch

from runtime_logging import configure_console_output


class ConsoleEncodingTest(unittest.TestCase):
    def test_legacy_windows_console_cannot_interrupt_an_operation_when_logging_unicode(self):
        output = io.BytesIO()
        stream = io.TextIOWrapper(output, encoding='cp1252', errors='strict')
        with patch.object(sys, 'stdout', stream):
            configure_console_output()
            print('⚠️ File terkunci; sesi baru siap 📷', flush=True)
        self.assertIn(b'File terkunci; sesi baru siap', output.getvalue())
        self.assertEqual(stream.encoding, 'cp1252')

    def test_no_console_and_in_memory_streams_are_supported(self):
        with patch.object(sys, 'stdout', None), patch.object(sys, 'stderr', io.StringIO()):
            configure_console_output()
