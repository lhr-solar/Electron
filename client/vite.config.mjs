import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

function resolveBasePath() {
    const raw = (process.env.VITE_BASE_PATH || '/').trim()
    if (!raw || raw === '/') return '/'
    const withLeading = raw.startsWith('/') ? raw : `/${raw}`
    return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}

const basePath = resolveBasePath()

// https://vitejs.dev/config/
export default defineConfig({
    base: basePath,
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(rootDir, 'src'),
        },
    },
    server: {
        port: 3001,
        open: '/',
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
                    vendor: ['radix-ui', 'motion', 'sonner'],
                    'lucide-react': ['lucide-react'],
                },
            },
        },
    },
    optimizeDeps: {
        include: ['react', 'react-dom', 'lucide-react'],
    },
})
