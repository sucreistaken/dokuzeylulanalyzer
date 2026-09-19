import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        // Varsayilan olarak Vite yalnizca localhost'a baglanir ve ayni agdaki
        // telefon/baska bilgisayar erisemez. true = tum arayuzler (0.0.0.0).
        host: true,
        port: 5173,
    },
    preview: {
        host: true,
        port: 4173,
    },
})
