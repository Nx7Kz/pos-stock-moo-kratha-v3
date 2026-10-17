/**
 * สำรองข้อมูลร้าน: npm run db:backup
 *
 * ได้โฟลเดอร์ backups/<วันที่_เวลา>/
 *   database.dump   ฐานข้อมูลทั้งหมด (บิล สต็อก ผู้ใช้/รหัสผ่าน ตั้งค่า) แบบ pg_dump custom format (บีบอัดแล้ว)
 *   uploads/        รูปเมนูที่ร้านอัปโหลดเอง
 *   info.txt        สรุปว่าในไฟล์สำรองมีข้อมูลเท่าไร
 *
 * เก็บย้อนหลัง BACKUP_KEEP ชุดล่าสุด (ค่าเริ่มต้น 30) ชุดที่เก่ากว่านั้นลบทิ้งอัตโนมัติ
 * ไฟล์สำรองมีข้อมูลการขายและรหัสผ่าน (เข้ารหัสแล้ว) — ห้ามขึ้น GitHub (อยู่ใน .gitignore แล้ว)
 */
import { runBackup, prune } from './dbtools.js';

try {
  const r = await runBackup();
  const p = prune();
  console.log(`
  สำรองข้อมูลเรียบร้อย
    โฟลเดอร์: ${r.dir}
    ขนาด: ${(r.size / 1024).toFixed(0)} KB · ${r.tables} ตาราง · รูปเมนู ${r.images} รูป
    ข้อมูล: ${r.summary}
    เก็บไว้ ${p.kept} ชุด${p.removed ? ` (ลบชุดเก่า ${p.removed} ชุด)` : ''}

  แนะนำ: คัดลอกโฟลเดอร์ backups ไปเก็บนอกเครื่องด้วย (OneDrive / Google Drive / แฟลชไดรฟ์)
         เครื่องเสียทั้งเครื่อง ไฟล์สำรองในเครื่องก็หายไปด้วย
`);
} catch (e) {
  console.error(`\n  สำรองข้อมูลไม่สำเร็จ: ${e.message}\n`);
  process.exitCode = 1;
}
