import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 3001,
        proxy: {
            // Proxy API requests to the FastAPI backend
            '/api': {
                target: 'http://localhost:4000',
                changeOrigin: true,
            },
            // Proxy Socket.IO requests
            '/socket.io': {
                target: 'ws://localhost:4000',
                ws: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        target: 'esnext',
        minify: 'esbuild',
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: {
                    react: ['react', 'react-dom'],
                    mantine: ['@mantine/core', '@mantine/hooks', '@mantine/notifications'],
                    'lucide-react': ['lucide-react'],
                },
            },
        },
    },
    optimizeDeps: {
        include: ['react', 'react-dom', 'lucide-react'],
    },
})
