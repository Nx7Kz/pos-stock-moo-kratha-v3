import { AppError } from './utils.js';

/**
 * กติกาของค่าตั้งค่าร้าน — ตรวจก่อนบันทึก กันค่าผิดรูปแบบทำให้ทั้งร้านใช้งานไม่ได้
 * (เช่น vat_rate เป็นตัวอักษร -> คำนวณยอดบิลได้ NaN แล้วเปิดบิล/รับเงินไม่ได้ทุกโต๊ะ)
 * แต่ละตัวคืนค่าที่จัดรูปแบบแล้ว (string) หรือ throw ข้อความบอกว่าผิดอะไร
 */
const text = (max, { required = false } = {}) => (v) => {
  const s = String(v ?? '').trim();
  if (required && !s) throw new Error('ห้ามเว้นว่าง');
  if (s.length > max) throw new Error(`ยาวเกิน ${max} ตัวอักษร`);
  return s;
};

const percent = (v) => {
  const s = String(v ?? '').trim();
  if (s === '' || !Number.isFinite(Number(s))) throw new Error('ต้องเป็นตัวเลข');
  const n = Number(s);
  if (n < 0 || n > 100) throw new Error('ต้องอยู่ระหว่าง 0 ถึง 100');
  return String(n);
};

const bool = (v) => {
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === 'false') return s;
  throw new Error('ต้องเป็น true หรือ false');
};

const RULES = {
  shop_name:         text(120, { required: true }),
  shop_branch:       text(120),
  shop_address:      text(300),
  shop_phone:        text(40),
  shop_taxid:        (v) => {
    const s = String(v ?? '').replace(/[\s-]/g, '');
    if (s && !/^\d{13}$/.test(s)) throw new Error('ต้องเป็นตัวเลข 13 หลัก (หรือเว้นว่าง)');
    return s;
  },
  vat_rate:          percent,
  vat_included:      bool,
  service_rate:      percent,
  low_stock_alert:   bool,
  // พร้อมเพย์: เบอร์มือถือ 10 หลัก หรือเลขประจำตัวผู้เสียภาษี 13 หลัก (ตามที่ตัวสร้าง QR รองรับ)
  promptpay_id:      (v) => {
    const s = String(v ?? '').replace(/[\s-]/g, '');
    if (!/^(\d{10}|\d{13})$/.test(s)) throw new Error('ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขประจำตัวผู้เสียภาษี 13 หลัก');
    return s;
  },
  // ที่อยู่เว็บที่ใส่ใน QR ให้ลูกค้าเปิด (ว่าง = ให้ระบบเลือกเอง)
  customer_base_url: (v) => {
    let s = String(v ?? '').trim();
    while (s.endsWith('/')) s = s.slice(0, -1);
    if (s && !/^https?:\/\/[^\s/]+(\/[^\s]*)?$/i.test(s)) throw new Error('ต้องขึ้นต้นด้วย http:// หรือ https://');
    return s;
  },
};

/**
 * ตรวจค่าที่จะบันทึกทั้งชุด: ผิดข้อเดียวก็ไม่บันทึกเลยสักค่า
 * คืน [[key, value], ...] ที่จัดรูปแบบแล้ว
 */
export function validateSettings(body) {
  const entries = Object.entries(body || {});
  if (!entries.length) throw new AppError(400, 'ไม่มีค่าที่ต้องการแก้ไข');

  const errors = {};
  const clean = [];
  for (const [key, value] of entries) {
    const rule = RULES[key];
    if (!rule) { errors[key] = 'ไม่รู้จักค่าตั้งค่านี้'; continue; }
    try {
      clean.push([key, rule(value)]);
    } catch (error_) {
      errors[key] = error_.message;
    }
  }
  const bad = Object.keys(errors);
  if (bad.length) {
    const detail = bad.map((k) => k + ' ' + errors[k]).join(', ');
    throw new AppError(400, `ค่าตั้งค่าไม่ถูกต้อง: ${detail}`, { errors });
  }
  return clean;
}
