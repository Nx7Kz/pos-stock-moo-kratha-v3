/**
 * หน้าจอครัว — รายการอาหารที่ยังไม่ได้เสิร์ฟจากทุกโต๊ะที่เปิดอยู่
 * รายการใหม่มีสถานะ ORDERED พอครัวส่งของแล้วกด "เสิร์ฟแล้ว" จะเปลี่ยนเป็น SERVED
 */
import { Router } from 'express';
import { query } from '../db.js';
import { AppError, wrap } from '../utils.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

/** GET /api/kitchen — คิวรายการที่รอเสิร์ฟ เรียงจากสั่งก่อน */
router.get('/', authRequired, wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT oi.id, oi.order_id, oi.round_no, oi.qty, oi.note, oi.by_customer, oi.created_at,
            m.name_th, m.unit, c.code AS category_code, c.name_th AS category_name,
            o.order_no, t.table_no, t.zone
       FROM order_items oi
       JOIN orders o        ON o.id = oi.order_id
       JOIN dining_tables t ON t.id = o.table_id
       JOIN menu_items m    ON m.id = oi.menu_item_id
       JOIN categories c    ON c.id = m.category_id
      WHERE oi.status = 'ORDERED' AND o.status IN ('OPEN','BILLING')
      ORDER BY oi.created_at, oi.id`
  );
  res.json({ ok: true, count: rows.length, data: rows });
}));

/** อ่าน item_ids จาก body ให้เป็น array ของตัวเลข */
function itemIds(body) {
  const ids = Array.isArray(body?.item_ids) ? body.item_ids.map(Number).filter(Number.isInteger) : [];
  if (!ids.length) throw new AppError(400, 'ต้องระบุ item_ids อย่างน้อย 1 รายการ');
  return ids;
}

/** POST /api/kitchen/serve — ครัวส่งอาหารแล้ว  body: { item_ids: [..] } */
router.post('/serve', authRequired, wrap(async (req, res) => {
  const { rows } = await query(
    `UPDATE order_items oi SET status = 'SERVED'
       FROM orders o
      WHERE o.id = oi.order_id AND o.status IN ('OPEN','BILLING')
        AND oi.status = 'ORDERED' AND oi.id = ANY($1::int[])
      RETURNING oi.id`,
    [itemIds(req.body)]
  );
  res.json({ ok: true, served: rows.length, item_ids: rows.map((r) => r.id) });
}));

/** POST /api/kitchen/unserve — ย้อนกลับเมื่อกดเสิร์ฟพลาด  body: { item_ids: [..] } */
router.post('/unserve', authRequired, wrap(async (req, res) => {
  const { rows } = await query(
    `UPDATE order_items oi SET status = 'ORDERED'
       FROM orders o
      WHERE o.id = oi.order_id AND o.status IN ('OPEN','BILLING')
        AND oi.status = 'SERVED' AND oi.id = ANY($1::int[])
      RETURNING oi.id`,
    [itemIds(req.body)]
  );
  res.json({ ok: true, restored: rows.length, item_ids: rows.map((r) => r.id) });
}));

export default router;
