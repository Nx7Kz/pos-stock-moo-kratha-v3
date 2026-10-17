import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from './utils.js';

/**
 * รูปเมนู: backend/media
 *   samples/  รูปตัวอย่างที่มากับระบบ
 *   uploads/  รูปที่ร้านอัปโหลดเอง — ขึ้น git ด้วย ตั้งชื่อไฟล์ตามรหัสเมนู (mn-b04.jpg)
 *             เครื่องที่ clone ไปใหม่จึงจับคู่รูปกับเมนูได้เองโดยไม่ต้องพึ่งฐานข้อมูล
 */
export const MEDIA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../media');
const UPLOAD_DIR = path.join(MEDIA_DIR, 'uploads');

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const EXTS = Object.values(TYPES);
const MAX_BYTES = 2 * 1024 * 1024;

/** รหัสเมนู -> ชื่อไฟล์ที่ปลอดภัย (MN-B04 -> mn-b04) */
const fileBase = (sku) => String(sku).toLowerCase().replace(/[^a-z0-9_-]/g, '_');

/** URL ของไฟล์ + ?v=เวลาแก้ไฟล์ ให้เบราว์เซอร์โหลดรูปใหม่ทันทีเมื่อเปลี่ยนรูป (ชื่อไฟล์เดิม) */
const urlOf = (name) => {
  const v = Math.floor(fs.statSync(path.join(UPLOAD_DIR, name)).mtimeMs);
  return `/media/uploads/${name}?v=${v}`;
};

/** ไฟล์รูปที่อัปโหลดไว้ของเมนูนี้ (ถ้ามี) */
function findUpload(sku) {
  const base = fileBase(sku);
  return EXTS.map((ext) => `${base}.${ext}`).find((n) => fs.existsSync(path.join(UPLOAD_DIR, n))) || null;
}

/**
 * บันทึกรูปที่ส่งมาเป็น data URL (data:image/jpeg;base64,...) เป็นไฟล์ <รหัสเมนู>.<นามสกุล>
 * เขียนทับรูปเดิมของเมนูนี้ แล้วคืน URL สำหรับใส่ใน image_url
 */
export function saveImage(dataUrl, sku) {
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || !TYPES[m[1]]) throw new AppError(400, 'รองรับเฉพาะรูป JPG, PNG หรือ WEBP');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_BYTES) throw new AppError(413, 'รูปใหญ่เกิน 2 MB');

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  removeUpload(sku);   // เผื่อรูปเดิมเป็นนามสกุลอื่น (เช่น .png) จะได้ไม่เหลือค้างสองไฟล์
  const name = `${fileBase(sku)}.${TYPES[m[1]]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return urlOf(name);
}

/** ลบรูปที่อัปโหลดไว้ของเมนูนี้ (ไม่แตะรูปตัวอย่าง) */
export function removeUpload(sku) {
  const base = fileBase(sku);
  for (const ext of EXTS) fs.rmSync(path.join(UPLOAD_DIR, `${base}.${ext}`), { force: true });
}

/**
 * ตอนเปิดระบบ: เมนูไหนมีรูปใน uploads/ ให้ใช้รูปนั้น
 * (เช่น clone ไปเครื่องใหม่ ฐานข้อมูลใหม่ยังชี้รูปตัวอย่างอยู่ -> เปลี่ยนเป็นรูปที่ร้านอัปโหลดไว้)
 */
export async function syncUploadedImages(query) {
  if (!fs.existsSync(UPLOAD_DIR)) return 0;
  const { rows } = await query('SELECT id, sku, image_url FROM menu_items');
  let changed = 0;
  for (const m of rows) {
    const name = findUpload(m.sku);
    if (!name) continue;
    const url = urlOf(name);
    if (m.image_url !== url) {
      await query('UPDATE menu_items SET image_url = $2 WHERE id = $1', [m.id, url]);
      changed++;
    }
  }
  return changed;
}
