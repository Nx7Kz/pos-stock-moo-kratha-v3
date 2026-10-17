/**
 * ฝั่งลูกค้า — พนักงานเปิดโต๊ะแล้วให้ QR พร้อมรหัส 4 หลัก ลูกค้าสแกนแล้วสั่งอาหารเองได้ ไม่ต้องล็อกอิน
 *
 * ทุกปลายทางที่แตะบิลต้องแนบ header `X-Table-Code` ให้ตรงกับรหัสของบิลที่เปิดอยู่
 * รหัสจะใช้ไม่ได้ทันทีที่ปิดบิล (ชำระเงิน / ยกเลิก) ลูกค้าโต๊ะก่อนหน้าจึงสั่งกวนไม่ได้
 */
import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { AppError, wrap } from '../utils.js';
import { recalcOrder, getOrderFull, syncTableStatus, getSettings } from '../services/orderService.js';
import { addItem, nextRound, dedupeAlerts } from './orders.js';

const router = Router();

// ------------------------------------------------ กันการสุ่มเดารหัส 4 หลัก
const MAX_WRONG = 10;
const WINDOW_MS = 10 * 60 * 1000;
const wrongTries = new Map();   // table_no -> { count, resetAt }

function tooManyTries(tableNo) {
  const t = wrongTries.get(tableNo);
  if (!t || t.resetAt < Date.now()) return false;
  return t.count >= MAX_WRONG;
}

function recordWrong(tableNo) {
  const now = Date.now();
  const t = wrongTries.get(tableNo);
  if (!t || t.resetAt < now) wrongTries.set(tableNo, { count: 1, resetAt: now + WINDOW_MS });
  else t.count += 1;
}

/**
 * หาบิลที่เปิดอยู่ของโต๊ะ และตรวจรหัสโต๊ะที่ลูกค้าส่งมา
 * details.reason ใช้บอกหน้าเว็บว่าควรแสดงอะไร: TABLE_NOT_OPEN | CODE_REQUIRED | CODE_INVALID | TOO_MANY_TRIES
 */
async function openSession(client, req, { lock = false } = {}) {
  const tableNo = req.params.tableNo;
  const code = String(req.get('X-Table-Code') || '').trim();

  const { rows: tbl } = await client.query(
    'SELECT id, table_no, zone, seats FROM dining_tables WHERE table_no = $1',
    [tableNo]
  );
  if (!tbl[0]) throw new AppError(404, `ไม่พบโต๊ะ ${tableNo}`);

  const { rows } = await client.query(
    `SELECT * FROM orders WHERE table_id = $1 AND status IN ('OPEN','BILLING')${lock ? ' FOR UPDATE' : ''}`,
    [tbl[0].id]
  );
  const order = rows[0];
  if (!order) {
    throw new AppError(404, 'โต๊ะนี้ยังไม่ได้เปิด กรุณาแจ้งพนักงานเพื่อเปิดโต๊ะ', { reason: 'TABLE_NOT_OPEN' });
  }
  if (tooManyTries(tableNo)) {
    throw new AppError(429, 'กรอกรหัสผิดหลายครั้งเกินไป กรุณาแจ้งพนักงาน', { reason: 'TOO_MANY_TRIES' });
  }
  if (!code) {
    throw new AppError(403, 'กรุณากรอกรหัสโต๊ะ 4 หลักที่ได้จากพนักงาน', { reason: 'CODE_REQUIRED' });
  }
  if (!order.access_code || code !== order.access_code) {
    recordWrong(tableNo);
    throw new AppError(403, 'รหัสโต๊ะไม่ถูกต้อง', { reason: 'CODE_INVALID' });
  }
  return { table: tbl[0], order };
}

/** GET /api/public/menu — เมนูอาหารสำหรับลูกค้า (เฉพาะที่เปิดขายและวัตถุดิบพอ) */
router.get('/menu', wrap(async (req, res) => {
  const { rows: categories } = await query('SELECT id, code, name_th FROM categories ORDER BY sort_order');
  const { rows: items } = await query(
    `SELECT m.id, m.sku, m.name_th, m.description, m.price, m.unit, m.image_url,
            c.code AS category_code, c.name_th AS category_name,
            COALESCE((SELECT FLOOR(MIN(i.qty_on_hand / r.qty_per_unit))::int
                        FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id
                       WHERE r.menu_item_id = m.id), 999) AS max_servable
       FROM menu_items m JOIN categories c ON c.id = m.category_id
      WHERE m.is_available
        AND ($1::text IS NULL OR c.code = $1)
        AND ($2::text IS NULL OR m.name_th ILIKE '%' || $2 || '%')
      ORDER BY c.sort_order, m.sku`,
    [req.query.category || null, req.query.q || null]
  );

  for (const it of items) it.sold_out = it.max_servable <= 0;
  res.json({ ok: true, categories, count: items.length, data: items });
}));

/** GET /api/public/tables/:tableNo — ตรวจรหัสโต๊ะ + สรุปย่อของบิลที่เปิดอยู่ */
router.get('/tables/:tableNo', wrap(async (req, res) => {
  const data = await withTransaction(async (client) => {
    const { table, order } = await openSession(client, req);
    return {
      table_no: table.table_no,
      zone: table.zone,
      seats: table.seats,
      status: order.status,
      order_no: order.order_no,
      guest_count: order.guest_count,
      opened_at: order.opened_at,
      current_total: order.grand_total,
    };
  });
  res.json({ ok: true, data });
}));

/**
 * POST /api/public/tables/:tableNo/order — ลูกค้าสั่งอาหารเอง
 * header: X-Table-Code   body: { items: [{ menu_sku | menu_item_id, qty, note }] }
 * ต้องให้พนักงานเปิดโต๊ะก่อน ลูกค้าเปิดบิลเองไม่ได้
 */
router.post('/tables/:tableNo/order', wrap(async (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items) || !items.length) {
    throw new AppError(400, 'กรุณาเลือกรายการอาหารอย่างน้อย 1 รายการ');
  }

  const data = await withTransaction(async (client) => {
    const { order } = await openSession(client, req, { lock: true });
    if (order.status === 'BILLING') {
      throw new AppError(409, 'โต๊ะนี้เรียกเช็คบิลแล้ว หากต้องการสั่งเพิ่มกรุณาแจ้งพนักงาน');
    }

    const roundNo = await nextRound(client, order.id);
    const alerts = [];
    for (const it of items) alerts.push(...await addItem(client, order, it, null, roundNo, { byCustomer: true }));

    await recalcOrder(client, order.id);
    await syncTableStatus(client, order.table_id);
    return {
      round_no: roundNo,
      order: await getOrderFull(client, order.id),
      stock_alerts: dedupeAlerts(alerts),
    };
  });

  res.status(201).json({
    ok: true,
    message: data.round_no === 1 ? 'รับออเดอร์เรียบร้อย' : `สั่งเพิ่มรอบที่ ${data.round_no} เรียบร้อย`,
    ...data,
  });
}));

/** GET /api/public/tables/:tableNo/bill — สรุปรายการและยอดเงินของโต๊ะ */
router.get('/tables/:tableNo/bill', wrap(async (req, res) => {
  const data = await withTransaction(async (client) => {
    const { order: open } = await openSession(client, req);
    const settings = await getSettings(client);
    const order = await getOrderFull(client, open.id);
    return {
      order_no: order.order_no,
      table_no: order.table_no,
      status: order.status,
      guest_count: order.guest_count,
      opened_at: order.opened_at,
      items: order.items
        .filter((i) => i.status !== 'CANCELLED')
        .map((i) => ({
          id: i.id, name_th: i.name_th, category_name: i.category_name,
          qty: Number(i.qty), unit_price: Number(i.unit_price),
          line_total: Number(i.line_total), round_no: i.round_no, note: i.note,
          status: i.status,   // ORDERED = รอทำ, SERVED = เสิร์ฟแล้ว
        })),
      subtotal: order.subtotal,
      discount: order.discount,
      service_charge: order.service_charge,
      vat_amount: order.vat_amount,
      grand_total: order.grand_total,
      shop_name: settings.shop_name,
    };
  });
  res.json({ ok: true, data });
}));

/** POST /api/public/tables/:tableNo/bill — ลูกค้ากดเช็คบิลเอง แล้วไปชำระที่เคาน์เตอร์ */
router.post('/tables/:tableNo/bill', wrap(async (req, res) => {
  const data = await withTransaction(async (client) => {
    const { order } = await openSession(client, req, { lock: true });
    if (order.status === 'BILLING') throw new AppError(409, 'โต๊ะนี้เช็คบิลไปแล้ว');

    await client.query(`UPDATE orders SET status = 'BILLING', billing_at = now() WHERE id = $1`, [order.id]);
    await recalcOrder(client, order.id);
    await syncTableStatus(client, order.table_id);
    return getOrderFull(client, order.id);
  });
  res.json({ ok: true, message: 'เช็คบิลแล้ว กรุณาชำระเงินที่เคาน์เตอร์', data });
}));

export default router;
