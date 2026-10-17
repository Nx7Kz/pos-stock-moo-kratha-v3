import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import { pool, query, withTransaction } from './db.js';
import { validateSettings } from './settings.js';
import { wrap } from './utils.js';
import { MEDIA_DIR, syncUploadedImages } from './media.js';
import { notFound, errorHandler } from './middleware/error.js';
import { authRequired, requireRole } from './middleware/auth.js';

import authRoutes from './routes/auth.js';
import tableRoutes from './routes/tables.js';
import menuRoutes from './routes/menu.js';
import ingredientRoutes from './routes/ingredients.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import stockRoutes from './routes/stock.js';
import reportRoutes from './routes/reports.js';
import publicRoutes from './routes/public.js';
import kitchenRoutes from './routes/kitchen.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }));
// อัปโหลดรูปเมนูส่งมาเป็น base64 ใน JSON ต้องรับก้อนใหญ่กว่าปกติ (ต้องมาก่อน parser ตัวหลัก)
app.use('/api/menu/:id/image', express.json({ limit: '4mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

/** GET /api/health — ใช้ทดสอบว่า API และฐานข้อมูลพร้อมใช้งาน */
app.get('/api/health', wrap(async (_req, res) => {
  const { rows } = await query('SELECT now() AS server_time, version() AS pg_version');
  res.json({
    ok: true,
    service: 'POS & Stock API — ร้านย่างให้หมูกระทะ บ้านน้องโฟค กาญจนบุรี',
    version: '1.0.0',
    database: { connected: true, server_time: rows[0].server_time, version: rows[0].pg_version.split(',')[0] },
  });
}));

/** GET /api/settings — ค่าตั้งค่าร้าน */
app.get('/api/settings', authRequired, wrap(async (_req, res) => {
  const { rows } = await query('SELECT key, value, description FROM settings ORDER BY key');
  res.json({ ok: true, data: Object.fromEntries(rows.map((r) => [r.key, r.value])), raw: rows });
}));

/** PATCH /api/settings — แก้ค่าตั้งค่าร้าน (เจ้าของร้านเท่านั้น) */
app.patch('/api/settings', authRequired, requireRole('OWNER'), wrap(async (req, res) => {
  // ตรวจทุกค่าก่อน (ผิดข้อเดียวไม่บันทึกเลย) แล้วบันทึกพร้อมกันในทรานแซกชันเดียว
  const entries = validateSettings(req.body);
  await withTransaction(async (client) => {
    for (const [key, value] of entries) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1,$2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value]
      );
    }
  });
  const { rows } = await query('SELECT key, value FROM settings ORDER BY key');
  res.json({ ok: true, updated: entries.length, data: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
}));

app.use('/api/auth',        authRoutes);
app.use('/api/tables',      tableRoutes);
app.use('/api/menu',        menuRoutes);
app.use('/api/ingredients', ingredientRoutes);
app.use('/api/orders',      orderRoutes);
app.use('/api/payments',    paymentRoutes);
app.use('/api/stock',       stockRoutes);
app.use('/api/reports',     reportRoutes);
app.use('/api/public',      publicRoutes);
app.use('/api/kitchen',     kitchenRoutes);

// รูปเมนู: /media/samples = รูปตัวอย่างที่มากับระบบ, /media/uploads = รูปที่ร้านอัปโหลดเอง
app.use('/media', express.static(MEDIA_DIR, { maxAge: '7d' }));
app.use('/media', (_req, res) => res.status(404).json({ ok: false, error: 'ไม่พบไฟล์รูป' }));

// เสิร์ฟหน้าเว็บที่ build แล้ว (frontend/dist) จากพอร์ตเดียวกับ API
// ใช้ตอนเปิดระบบออกอินเทอร์เน็ต (เช่น Cloudflare Tunnel) แทน Vite dev server
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir, { index: false }));
  // เส้นทางของ React Router (เช่น /customer/T01) ให้ส่ง index.html กลับไป
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`\n  POS & Stock API`);
  console.log(`  ร้านย่างให้หมูกระทะ บ้านน้องโฟค กาญจนบุรี`);
  console.log(`  http://localhost:${PORT}/api/health\n`);
  // รูปเมนูที่อัปโหลดไว้ใน media/uploads (มากับ git) -> ผูกกับเมนูตามรหัส
  syncUploadedImages(query)
    .then((n) => n && console.log(`  รูปเมนู: ใช้รูปที่อัปโหลดไว้ ${n} เมนู\n`))
    .catch((e) => console.error('  ซิงก์รูปเมนูไม่สำเร็จ:', e.message));
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[${sig}] ปิดเซิร์ฟเวอร์...`);
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}

export default app;
