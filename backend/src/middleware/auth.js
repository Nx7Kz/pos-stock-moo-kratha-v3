import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils.js';
import { query } from '../db.js';

/**
 * กุญแจสำหรับเซ็น JWT
 *
 * โค้ดนี้เป็นโปรเจกต์เปิด ใครก็อ่านได้ ถ้าปล่อยให้ใช้ค่าเริ่มต้นที่เขียนไว้ในไฟล์
 * ใครก็ปลอม token เป็นเจ้าของร้านได้ทันที จึงบังคับว่าตอนใช้งานจริงต้องตั้ง
 * JWT_SECRET เองเสมอ ไม่เช่นนั้นเซิร์ฟเวอร์จะไม่ยอมเริ่มทำงาน
 */
const SECRET = (() => {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ไม่ได้ตั้งค่า JWT_SECRET — ห้ามใช้งานจริงโดยไม่กำหนดกุญแจของตัวเอง ' +
      '(คัดลอก backend/.env.example เป็น backend/.env แล้วใส่ค่าสุ่มยาว ๆ)'
    );
  }

  console.warn(
    '\n  คำเตือน: ไม่พบ JWT_SECRET จึงใช้ค่าเริ่มต้นสำหรับการพัฒนาเท่านั้น' +
    '\n  ก่อนนำขึ้นใช้งานจริง ให้สร้างไฟล์ backend/.env แล้วกำหนด JWT_SECRET ของตัวเอง\n'
  );
  return 'dev-only-insecure-secret';
})();

/**
 * ลายนิ้วมือของรหัสผ่านปัจจุบัน (ไม่ใช่ตัวรหัสผ่าน) ใส่ไว้ใน token
 * เปลี่ยนรหัสผ่านเมื่อไร token ที่ออกก่อนหน้านั้นจะใช้ไม่ได้ทันที
 */
const pwVersion = (passwordHash) =>
  crypto.createHash('sha256').update(String(passwordHash)).digest('hex').slice(0, 16);

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, name: user.full_name, pv: pwVersion(user.password_hash) },
    SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );
}

/**
 * ต้องล็อกอินก่อนถึงจะเรียกได้
 * ตรวจกับฐานข้อมูลทุกครั้ง (ไม่เชื่อข้อมูลใน token อย่างเดียว) ทำให้มีผลทันทีเมื่อ
 *   - ปิดบัญชีผู้ใช้ (is_active = false)   -> 401 เด้งออกจากระบบ
 *   - เปลี่ยนสิทธิ์ (role)                   -> ใช้สิทธิ์ใหม่ทันที
 *   - เปลี่ยนรหัสผ่าน                        -> token เดิมใช้ไม่ได้ ต้องเข้าสู่ระบบใหม่
 */
export async function authRequired(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AppError(401, 'ต้องเข้าสู่ระบบก่อนใช้งาน (ไม่พบ Bearer token)'));

  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return next(new AppError(401, 'Token ไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่'));
  }

  try {
    const { rows } = await query(
      'SELECT id, username, full_name, role, is_active, password_hash FROM users WHERE id = $1', [payload.sub]
    );
    const u = rows[0];
    if (!u || !u.is_active) return next(new AppError(401, 'บัญชีนี้ถูกปิดใช้งานแล้ว กรุณาติดต่อเจ้าของร้าน'));
    if (payload.pv !== pwVersion(u.password_hash)) {
      return next(new AppError(401, 'รหัสผ่านถูกเปลี่ยนแล้ว กรุณาเข้าสู่ระบบใหม่'));
    }
    req.user = { id: u.id, username: u.username, role: u.role, name: u.full_name };
    next();
  } catch (e) {
    next(e);
  }
}

/** จำกัดสิทธิ์ตามบทบาท เช่น requireRole('OWNER') */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new AppError(401, 'ต้องเข้าสู่ระบบก่อนใช้งาน'));
  if (!roles.includes(req.user.role)) {
    return next(new AppError(403, `ต้องมีสิทธิ์ ${roles.join(' หรือ ')} จึงจะใช้งานเมนูนี้ได้`));
  }
  next();
};
