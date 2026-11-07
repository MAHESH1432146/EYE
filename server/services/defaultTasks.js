// Instructions the participant carries out on their own computer. Timing and gaze are measured while they do it.
// `app` names the application that must become active for the desktop app to verify the task automatically.
// Rule syntax is documented in services/eyeTracking/targets.js (matchesRule).
export const APP_TARGETS = {
  fileManager: {
    windows: ['process:explorer + titled: + !title:program manager'],
    macos: ['process:finder + window:'],
    linux: ['process:nautilus + window:', 'process:org.gnome.nautilus + window:', 'process:dolphin + window:', 'process:nemo + window:', 'process:thunar + window:', 'process:pcmanfm + window:'],
  },
  settings: {
    windows: ['process:systemsettings', 'process:applicationframehost + title:settings', 'process:explorer + title:control panel'],
    macos: ['process:system settings + window:', 'process:system preferences + window:'],
    linux: ['process:gnome-control-center + window:', 'process:systemsettings + window:', 'process:unity-control-center + window:', 'process:cinnamon-settings + window:'],
  },
};

// Best-effort target for tasks created before target applications existed; null when the wording names no specific application.
export function inferTargetKey(instruction) {
  const s = String(instruction || '').toLowerCase();
  if (/\b(file|files|folder|folders|rename|extract)\b/.test(s)) return 'fileManager';
  if (/\bsettings?\b|display|network|\bsound\b|date and time|personali[sz]ation|appearance|installed applications/.test(s)) return 'settings';
  return null;
}

export const DEFAULT_TASKS = [
  ['Find and open the file manager.', 'file management', 'easy', 'fileManager'],
  ["Find and open the operating system's application launcher.", 'navigation', 'easy', null],
  ['Find and open the system settings.', 'settings', 'easy', 'settings'],
  ['Rename any file or folder using the file manager.', 'file management', 'medium', 'fileManager'],
  ['Create a new folder.', 'file management', 'medium', 'fileManager'],
  ['Find and open the display settings.', 'settings', 'medium', 'settings'],
  ['Launch an application of your choice.', 'navigation', 'easy', null],
  ['Open the properties or information window of a file.', 'file management', 'medium', 'fileManager'],
  ['Find the size of a file.', 'file management', 'hard', 'fileManager'],
  ['Find and open the network settings.', 'settings', 'medium', 'settings'],
  ['Use the system search to find an application.', 'navigation', 'easy', null],
  ['Find and open the personalization or appearance settings.', 'settings', 'medium', 'settings'],
  ['Find and open the date and time settings.', 'settings', 'medium', 'settings'],
  ['Find and open the sound settings.', 'settings', 'medium', 'settings'],
  ['Find where installed applications are managed.', 'applications', 'hard', 'settings'],
  ['Find the shutdown or restart option (do not click it).', 'system', 'easy', null],
].map(([instruction, category, difficulty, app], i) => ({ taskNumber: i + 1, instruction, category, difficulty, app }));
