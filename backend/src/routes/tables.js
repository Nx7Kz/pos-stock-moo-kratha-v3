import os from 'node:os';
import { Router } from 'express';
import { query } from '../db.js';
import { AppError, wrap } from '../utils.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/tables — ผังสถานะโต๊ะทั้ง 20 โต๊ะ
 * query: ?status=FREE|OCCUPIED|BILLING  ?zone=...
 */
router.get('/', authRequired, wrap(async (req, res) => {
  const { status, zone } = req.query;
  const { rows } = await query(
    `SELECT * FROM v_table_status
      WHERE ($1::text IS NULL OR status::text = $1)
        AND ($2::text IS NULL OR zone = $2)
      ORDER BY sort_order`,
    [status || null, zone || null]
  );

  const summary = rows.reduce(
    (acc, r) => {
      acc.total += 1;
      acc[r.status] = (acc[r.status] || 0) + 1;
      acc.open_amount += Number(r.current_total || 0);
      return acc;
    },
    { total: 0, FREE: 0, OCCUPIED: 0, BILLING: 0, open_amount: 0 }
  );

  res.json({ ok: true, summary, data: rows });
}));

/**
 * GET /api/tables/qr-info — ข้อมูลสำหรับสร้าง QR สั่งอาหารประจำโต๊ะ
 * คืนที่อยู่เว็บที่ตั้งไว้ และ IP ของเครื่องเซิร์ฟเวอร์ในวง LAN
 * (มือถือลูกค้าเปิด localhost ไม่ได้ จึงต้องใช้ IP ของเครื่องแทน)
 */
router.get('/qr-info', authRequired, wrap(async (_req, res) => {
  const { rows } = await query(`SELECT value FROM settings WHERE key = 'customer_base_url'`);
  // การ์ดเครือข่ายเสมือน (WSL, Hyper-V, Docker, VirtualBox, VMware) มือถือเข้าไม่ถึง จึงเรียงไว้ท้ายสุด
  const isVirtual = (name) => /vEthernet|WSL|Hyper-V|Docker|VirtualBox|VMware|Loopback/i.test(name);
  const lan = Object.entries(os.networkInterfaces())
    .flatMap(([name, addrs]) => (addrs || []).map((a) => ({ ...a, name })))
    .filter((a) => a.family === 'IPv4' && !a.internal)
    .sort((a, b) => isVirtual(a.name) - isVirtual(b.name))
    .map((a) => a.address);
  res.json({ ok: true, data: { customer_base_url: rows[0]?.value || null, lan_addresses: lan } });
}));

/** GET /api/tables/:id — สถานะโต๊ะเดียว */
router.get('/:id', authRequired, wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM v_table_status WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new AppError(404, 'ไม่พบโต๊ะที่ระบุ');
  res.json({ ok: true, data: rows[0] });
}));

/** PATCH /api/tables/:id — แก้ไขข้อมูลโต๊ะ (จำนวนที่นั่ง / โซน) */
router.patch('/:id', authRequired, requireRole('OWNER'), wrap(async (req, res) => {
  const { zone, seats, status } = req.body || {};
  if (status && !['FREE', 'OCCUPIED', 'BILLING'].includes(status)) {
    throw new AppError(400, 'status ต้องเป็น FREE, OCCUPIED หรือ BILLING');
  }
  const { rows } = await query(
    `UPDATE dining_tables SET
       zone   = COALESCE($2, zone),
       seats  = COALESCE($3, seats),
       status = COALESCE($4::table_status, status)
     WHERE id = $1 RETURNING *`,
    [req.params.id, zone ?? null, seats ?? null, status ?? null]
  );
  if (!rows[0]) throw new AppError(404, 'ไม่พบโต๊ะที่ระบุ');
  res.json({ ok: true, data: rows[0] });
}));

/** GET /api/tables/:id/order — บิลที่เปิดค้างอยู่ของโต๊ะนี้ */
router.get('/:id/order', authRequired, wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT id FROM orders WHERE table_id = $1 AND status IN ('OPEN','BILLING')`,
    [req.params.id]
  );
  if (!rows[0]) return res.json({ ok: true, data: null, message: 'โต๊ะนี้ยังไม่มีบิลที่เปิดอยู่' });
  res.redirect(307, `/api/orders/${rows[0].id}`);
}));

export default router;
