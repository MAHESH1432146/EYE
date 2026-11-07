// Server-side OS detection from the User-Agent header; returns 'windows' | 'macos' | 'linux' | null.
export function detectOSFromUA(ua = '') {
  if (/Android|iPhone|iPad|iPod|CrOS/i.test(ua)) return null; // mobile and ChromeOS are not valid study platforms
  if (/Windows NT|Win64|Win32/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  if (/Linux|X11|Ubuntu/i.test(ua)) return 'linux';
  return null;
}
