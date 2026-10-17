import { AppError, money } from '../utils.js';

/** อ่านค่าตั้งค่าระบบทั้งหมดเป็น object */
export async function getSettings(client) {
  const { rows } = await client.query('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * คำนวณยอดบิลใหม่จากรายการอาหารในออเดอร์ แล้วเขียนกลับลงตาราง orders
 * เรียกทุกครั้งที่มีการเพิ่ม / แก้ไข / ยกเลิกรายการ
 */
export async function recalcOrder(client, orderId) {
  const settings = await getSettings(client);
  const vatRate = Number(settings.vat_rate || 0) / 100;
  const vatIncluded = String(settings.vat_included) === 'true';
  const serviceRate = Number(settings.service_rate || 0) / 100;

  const { rows: sumRows } = await client.query(
    `SELECT COALESCE(SUM(line_total), 0) AS subtotal
       FROM order_items WHERE order_id = $1 AND status <> 'CANCELLED'`,
    [orderId]
  );
  const subtotal = money(sumRows[0].subtotal);

  const { rows: orderRows } = await client.query('SELECT discount FROM orders WHERE id = $1', [orderId]);
  if (!orderRows[0]) throw new AppError(404, `ไม่พบออเดอร์ id=${orderId}`);
  // ยอดรวมลดลงทีหลัง (ยกเลิก/ลดจำนวนรายการ) จนต่ำกว่าส่วนลดที่ใส่ไว้ -> ปรับส่วนลดลงเท่ายอดรวม
  // ใบเสร็จจะได้ไม่แสดงส่วนลดมากกว่าค่าอาหาร
  const discount = money(Math.min(Number(orderRows[0].discount), subtotal));

  const net = money(Math.max(subtotal - discount, 0));
  const serviceCharge = money(net * serviceRate);
  const base = money(net + serviceCharge);

  // vat_included = true  -> ราคาขายรวม VAT แล้ว, ถอด VAT ออกมาแสดง
  // vat_included = false -> บวก VAT เพิ่มจากยอดสุทธิ
  let vatAmount = 0;
  if (vatRate !== 0) vatAmount = vatIncluded ? money(base - base / (1 + vatRate)) : money(base * vatRate);
  const grandTotal = vatIncluded ? base : money(base + vatAmount);

  const { rows } = await client.query(
    `UPDATE orders
        SET subtotal = $2, service_charge = $3, vat_amount = $4, grand_total = $5, discount = $6
      WHERE id = $1
      RETURNING *`,
    [orderId, subtotal, serviceCharge, vatAmount, grandTotal, discount]
  );
  return rows[0];
}

/**
 * กันยอดบิลลดลงต่ำกว่าเงินที่รับไปแล้ว (รับเงินบางส่วน แล้วลดจำนวน / ยกเลิกรายการ / ให้ส่วนลด)
 * ถ้าปล่อยไว้ บิลจะค้าง: ยอดคงเหลือเป็น 0 แต่สถานะยังไม่ปิด และรับเงินเพิ่มไม่ได้
 * เรียกหลัง recalcOrder ในทรานแซกชันเดียวกัน -> throw แล้วการแก้ไขทั้งหมดถูกย้อนกลับ
 */
export async function assertNotBelowPaid(client, orderId) {
  const { rows } = await client.query(
    `SELECT o.grand_total, COALESCE((SELECT SUM(amount) FROM payments p WHERE p.order_id = o.id), 0) AS paid
       FROM orders o WHERE o.id = $1`,
    [orderId]
  );
  const paid = Number(rows[0]?.paid || 0);
  const total = Number(rows[0]?.grand_total || 0);
  if (paid > 0 && total < paid - 0.001) {
    throw new AppError(409,
      `รับชำระไปแล้ว ${money(paid)} บาท ยอดบิลใหม่ (${money(total)} บาท) ต่ำกว่าเงินที่รับไว้ไม่ได้`,
      { reason: 'BELOW_PAID', paid: money(paid), grand_total: money(total) });
  }
}

/** ดึงออเดอร์ 1 ใบพร้อมรายการอาหาร โต๊ะ และการชำระเงิน */
export async function getOrderFull(client, orderId) {
  const { rows } = await client.query(
    `SELECT o.*, t.table_no, t.zone, t.seats,
            u1.full_name AS opened_by_name, u2.full_name AS closed_by_name
       FROM orders o
       JOIN dining_tables t ON t.id = o.table_id
       LEFT JOIN users u1 ON u1.id = o.opened_by
       LEFT JOIN users u2 ON u2.id = o.closed_by
      WHERE o.id = $1`,
    [orderId]
  );
  const order = rows[0];
  if (!order) throw new AppError(404, `ไม่พบออเดอร์ id=${orderId}`);

  const { rows: items } = await client.query(
    `SELECT oi.*, m.sku, m.name_th, m.unit, c.code AS category_code, c.name_th AS category_name
       FROM order_items oi
       JOIN menu_items m  ON m.id = oi.menu_item_id
       JOIN categories c  ON c.id = m.category_id
      WHERE oi.order_id = $1
      ORDER BY oi.round_no, oi.id`,
    [orderId]
  );

  const { rows: payments } = await client.query(
    `SELECT p.*, u.full_name AS cashier_name
       FROM payments p LEFT JOIN users u ON u.id = p.cashier_id
      WHERE p.order_id = $1 ORDER BY p.id`,
    [orderId]
  );

  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  return {
    ...order,
    items,
    payments,
    paid_amount: money(paid),
    outstanding: money(Math.max(Number(order.grand_total) - paid, 0)),
  };
}

/** เปลี่ยนสถานะโต๊ะให้สอดคล้องกับสถานะบิล */
export async function syncTableStatus(client, tableId) {
  const { rows } = await client.query(
    `SELECT status FROM orders WHERE table_id = $1 AND status IN ('OPEN','BILLING') LIMIT 1`,
    [tableId]
  );
  let status = 'FREE';
  if (rows[0]) status = rows[0].status === 'BILLING' ? 'BILLING' : 'OCCUPIED';
  await client.query('UPDATE dining_tables SET status = $2 WHERE id = $1', [tableId, status]);
  return status;
}
