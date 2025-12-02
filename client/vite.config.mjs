import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Optional: Configure the dev server port
    port: 3000,
  },
  build: {
    // Optional: Change the output directory
    outDir: 'build',
  },
})
