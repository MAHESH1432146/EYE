
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

function mediaPipePlugin() {
  return {
    name: 'mediapipe-face-mesh-fix',

    enforce: 'pre',

    load(id) {
      if (
        id.includes('@mediapipe/face_mesh') &&
        path.basename(id) === 'face_mesh.js'
      ) {
        let code = fs.readFileSync(id, 'utf8');

        if (!code.includes('exports.FaceMesh = FaceMesh')) {
          code += '\nexports.FaceMesh = FaceMesh;\n';
        }

        return {
          code,
          map: null
        };
      }

      return null;
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    mediaPipePlugin()
  ],

  optimizeDeps: {
    exclude: ['@mediapipe/face_mesh']
  },

  server: {
    port: 5173,
    host: true
  }
});
