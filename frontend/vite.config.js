import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // เปิดให้มือถือในวง WiFi เดียวกันเข้าได้ (ลูกค้าสแกน QR ที่โต๊ะ)
    host: true,
    // ลูกค้านอกวง WiFi เข้าผ่าน Cloudflare Tunnel — ไม่ใส่ไว้ Vite จะตอบ "Blocked request"
    allowedHosts: ['.trycloudflare.com'],
    // เรียก /api ได้ตรง ๆ โดยไม่ติด CORS ระหว่างพัฒนา
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/media': { target: 'http://localhost:4000', changeOrigin: true },   // รูปเมนู
    },
  },
});
