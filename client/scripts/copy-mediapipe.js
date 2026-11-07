
import fs from 'fs';
import path from 'path';

const src = path.resolve('node_modules/webgazer/dist/mediapipe/face_mesh');
const dest = path.resolve('public/mediapipe/face_mesh');

if (!fs.existsSync(src)) {
  throw new Error(`MediaPipe source folder not found: ${src}`);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(src, dest, { recursive: true });

console.log('MediaPipe Face Mesh assets copied successfully.');
