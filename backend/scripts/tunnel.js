/**
 * เปิดเว็บร้านให้ลูกค้านอกวง WiFi สแกน QR ได้: npm run tunnel
 *
 * ต่อ Cloudflare Tunnel เข้าหน้าเว็บ (พอร์ต 5173) แล้วบันทึกลิงก์ที่ได้ลงตั้งค่า
 * customer_base_url ให้อัตโนมัติ — QR ที่สร้างหลังจากนี้จะชี้ไปลิงก์นั้นทันที
 *
 * ลิงก์ quick tunnel เปลี่ยนทุกครั้งที่เปิดใหม่ (ฟรี ไม่ต้องมีโดเมน/บัญชี)
 * ปิดหน้าต่างนี้ = ลูกค้านอกร้านเข้าไม่ได้ ต้องเปิดใหม่แล้ว QR เดิมที่พิมพ์ไว้จะใช้ไม่ได้
 *
 * ต้องมี cloudflared ในเครื่อง: winget install --id Cloudflare.cloudflared
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { query, pool } from '../src/db.js';

const PORT = Number(process.env.WEB_PORT || 5173);

// winget ลง cloudflared ไว้ใน Program Files ซึ่งมักไม่อยู่ใน PATH ของหน้าต่างที่เปิดค้างอยู่
const INSTALLED = [
  'C:/Program Files (x86)/cloudflared/cloudflared.exe',
  'C:/Program Files/cloudflared/cloudflared.exe',
];
const exe = INSTALLED.find(existsSync) || 'cloudflared';

const child = spawn(exe, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.on('error', (e) => {
  const why = e.code === 'ENOENT'
    ? 'ไม่พบ cloudflared — ติดตั้งด้วยคำสั่ง: winget install --id Cloudflare.cloudflared'
    : e.message;
  console.error(`\n  เปิด tunnel ไม่สำเร็จ: ${why}\n`);
  process.exitCode = 1;
});

let saved = false;

/** บันทึกลิงก์ลงตั้งค่าโดยตรง ไม่ต้องล็อกอิน (สคริปต์นี้รันบนเครื่องที่มีสิทธิ์ฐานข้อมูลอยู่แล้ว) */
async function saveBase(url) {
  if (saved) return;
  saved = true;
  try {
    await query(
      `INSERT INTO settings (key, value) VALUES ('customer_base_url', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [url],
    );
    console.log(`
  เปิดให้ลูกค้านอกร้านสแกนได้แล้ว
    ลิงก์: ${url}
    บันทึกเป็นที่อยู่ใน QR ให้แล้ว — เปิดบิลใหม่แล้วพิมพ์ใบ QR ได้เลย

  ปิดหน้าต่างนี้เมื่อเลิกใช้ (ลิงก์จะใช้ไม่ได้ทันที และครั้งหน้าจะได้ลิงก์ใหม่)
`);
  } catch (e) {
    console.error(`
  ต่อ tunnel ได้แล้วที่ ${url}
  แต่บันทึกลงตั้งค่าไม่สำเร็จ: ${e.message}
  ใส่ลิงก์เองได้ที่หน้า QR > ตั้งค่าที่อยู่เว็บใน QR
`);
  }
}

const watch = (chunk) => {
  const text = chunk.toString();
  const url = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0];
  if (url) saveBase(url);
};

child.stdout.on('data', watch);
child.stderr.on('data', watch);   // cloudflared พิมพ์ลิงก์ออก stderr

child.on('exit', async (code) => {
  await pool.end().catch(() => {});
  if (!saved) console.error(`\n  tunnel ปิดตัวก่อนได้ลิงก์ (exit ${code})\n`);
  process.exitCode = code ?? 0;
});

// ปิดหน้าต่าง/Ctrl+C แล้วให้ cloudflared ปิดตามไปด้วย ไม่ค้างเป็น process ลอย
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill());
