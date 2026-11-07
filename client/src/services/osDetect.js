export const OS_NAME = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

// Returns 'windows' | 'macos' | 'linux' | null (mobile / ChromeOS / unknown).
export function detectClientOS() {
  const ua = navigator.userAgent || '';
  const platform = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
  if (/android|iphone|ipad|ipod|cros/i.test(ua) || platform === 'android' || platform === 'chrome os') return null;
  if (platform.startsWith('win') || /Windows NT|Win64|Win32/i.test(ua)) return 'windows';
  if (platform.includes('mac') || /Macintosh|Mac OS X/i.test(ua)) return 'macos';
  if (platform.includes('linux') || platform.includes('x11') || /Linux|X11|Ubuntu/i.test(ua)) return 'linux';
  return null;
}

export function osCheckMessage(detected, selected) {
  if (!detected) return { ok: false, text: 'Your operating system could not be identified as Windows, macOS or Linux, so this study cannot be completed on this device.' };
  if (detected === selected) return { ok: true, text: `${OS_NAME[detected]} detected successfully. You can proceed with the task.` };
  return { ok: false, text: `Operating System Mismatch! Your current operating system is ${OS_NAME[detected]}, but you selected ${OS_NAME[selected]}. Please choose the correct operating system to perform this task.` };
}
