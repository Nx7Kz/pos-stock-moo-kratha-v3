import crypto from 'node:crypto';
import { AppError } from '../utils.js';

export function notFound(req, res) {
  res.status(404).json({ ok: false, error: `ไม่พบปลายทาง ${req.method} ${req.originalUrl}` });
}

/**
 * ข้อความภายในของเซิร์ฟเวอร์ (SQL, ชื่อตาราง/คอลัมน์, path ไฟล์) ห้ามส่งให้หน้าเว็บ
 * ส่งแค่ข้อความสั้น ๆ + รหัสอ้างอิง แล้วเก็บรายละเอียดเต็มไว้ใน log ของเซิร์ฟเวอร์
 * (ระบบเปิดออกอินเทอร์เน็ตผ่าน tunnel ได้ คนนอกจึงเห็น response ได้)
 */
function logged(req, err) {
  const ref = crypto.randomBytes(3).toString('hex');
  console.error(`[error ${ref}] ${req.method} ${req.originalUrl}`, err);
  return ref;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ ok: false, error: err.message, details: err.details });
  }

  // body ที่ส่งมาอ่านไม่ได้ / ใหญ่เกิน (จาก express.json)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'ข้อมูลที่ส่งมาไม่ใช่ JSON ที่ถูกต้อง' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'ข้อมูลที่ส่งมาใหญ่เกินไป' });
  }

  // แปลงข้อผิดพลาดของ PostgreSQL ให้อ่านรู้เรื่อง (ไม่แนบรายละเอียดภายในของฐานข้อมูล)
  switch (err.code) {
    case '23505': // unique_violation
      if (err.constraint === 'uq_orders_open_per_table') {
        return res.status(409).json({ ok: false, error: 'โต๊ะนี้มีบิลที่ยังไม่ปิดอยู่แล้ว' });
      }
      logged(req, err);
      return res.status(409).json({ ok: false, error: 'ข้อมูลซ้ำกับที่มีอยู่ในระบบ (เช่น รหัสหรือชื่อผู้ใช้นี้มีแล้ว)' });
    case '23503': // foreign_key_violation
      logged(req, err);
      return res.status(409).json({ ok: false, error: 'อ้างอิงข้อมูลที่ไม่มีอยู่จริง หรือข้อมูลนี้ยังถูกใช้งานอยู่' });
    case '23514': // check_violation
      logged(req, err);
      return res.status(400).json({ ok: false, error: 'ค่าที่ส่งมาไม่อยู่ในเงื่อนไขที่กำหนด' });
    case '22P02': // invalid_text_representation เช่น ส่งตัวอักษรมาในช่องที่ต้องเป็นตัวเลข
    case '22003': // numeric_value_out_of_range
      logged(req, err);
      return res.status(400).json({ ok: false, error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
    default:
      break;
  }

  const ref = logged(req, err);
  res.status(500).json({ ok: false, error: `เกิดข้อผิดพลาดภายในระบบ (รหัสอ้างอิง ${ref})` });
}
