import fs from 'fs';

const src = 'node_modules/webgazer/dist/mediapipe/face_mesh';
if (fs.existsSync(src)) fs.cpSync(src, 'public/mediapipe/face_mesh', { recursive: true });
