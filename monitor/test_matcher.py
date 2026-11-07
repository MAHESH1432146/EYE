import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from matcher import matches_any  # noqa: E402

SETTINGS = ["process:systemsettings", "process:applicationframehost + title:settings", "process:explorer + title:control panel"]
FILES = ["process:explorer + titled: + !title:program manager"]


class MatcherTests(unittest.TestCase):
    def test_settings(self):
        self.assertTrue(matches_any(SETTINGS, {"app": "SystemSettings.exe", "title": "Settings", "path": r"C:\Windows\ImmersiveControlPanel\SystemSettings.exe"}))
        self.assertTrue(matches_any(SETTINGS, {"app": "ApplicationFrameHost.exe", "title": "Settings", "path": r"C:\Windows\System32\ApplicationFrameHost.exe"}))

    def test_unrelated_applications_are_ignored(self):
        self.assertFalse(matches_any(SETTINGS, {"app": "chrome.exe", "title": "Settings - Chrome", "path": r"C:\Program Files\Google\Chrome\chrome.exe"}))
        self.assertFalse(matches_any(SETTINGS, {"app": "SettingSyncHost.exe", "title": "", "path": r"C:\Windows\System32\SettingSyncHost.exe"}))

    def test_file_explorer_excludes_the_desktop_shell(self):
        self.assertTrue(matches_any(FILES, {"app": "explorer.exe", "title": "Documents", "path": r"C:\Windows\explorer.exe"}))
        self.assertFalse(matches_any(FILES, {"app": "explorer.exe", "title": "Program Manager", "path": r"C:\Windows\explorer.exe"}))

    def test_window_rule_rejects_bare_processes(self):
        self.assertFalse(matches_any(["process:finder + window:"], {"app": "Finder", "title": "", "proc": True}))


if __name__ == "__main__":
    unittest.main()
