/**
 * เครื่องมือร่วมของสคริปต์สำรอง / คืนค่าฐานข้อมูล
 * ใช้ pg_dump / pg_restore ที่อยู่ในคอนเทนเนอร์ Docker ของฐานข้อมูล (ไม่ต้องติดตั้ง PostgreSQL ในเครื่อง)
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DB = {
  container: process.env.DB_CONTAINER || 'pos_stock_db',
  user: process.env.PGUSER || 'pos_admin',
  name: process.env.PGDATABASE || 'pos_stock',
};
/** โฟลเดอร์เก็บไฟล์สำรอง: ตั้ง BACKUP_DIR ให้ชี้ไป OneDrive / แฟลชไดรฟ์ ได้ (แนะนำ: เก็บนอกเครื่องด้วย) */
export const BACKUP_DIR = path.resolve(BACKEND_DIR, process.env.BACKUP_DIR || 'backups');
export const UPLOAD_DIR = path.join(BACKEND_DIR, 'media', 'uploads');
export const DUMP_FILE = 'database.dump';

/** รันคำสั่งใน docker; ส่ง/รับข้อมูลผ่านไฟล์ (stdin/stdout) ได้ */
export function dockerExec(args, { stdinFile, stdoutFile } = {}) {
  return new Promise((resolve, reject) => {
    // สคริปต์รันในเครื่องผู้ดูแลเท่านั้น ใช้ docker จาก PATH ของเครื่อง
    const p = spawn('docker', ['exec', '-i', DB.container, ...args], { // NOSONAR
      stdio: [stdinFile ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    // เขียนลงไฟล์: ต้องรอให้ไฟล์เขียนเสร็จจริง (finish) ไม่ใช่แค่โปรเซสจบ ไม่งั้นไฟล์สำรองอาจขาดท้าย
    const written = stdoutFile
      ? new Promise((ok, bad) => p.stdout.pipe(fs.createWriteStream(stdoutFile)).on('finish', ok).on('error', bad))
      : (p.stdout.on('data', (d) => { out += d; }), Promise.resolve());
    p.stderr.on('data', (d) => { err += d; });
    if (stdinFile) fs.createReadStream(stdinFile).pipe(p.stdin);
    p.on('error', (e) => reject(new Error(`เรียก docker ไม่ได้ (${e.message}) — เปิด Docker Desktop และฐานข้อมูลแล้วหรือยัง`)));
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(err.trim() || `คำสั่งจบด้วยรหัส ${code}`));
      written.then(() => resolve(out), reject);
    });
  });
}

/** จำนวนข้อมูลสำคัญในฐานข้อมูล ใช้แสดงผลและเทียบหลังคืนค่า */
export async function dbSummary() {
  const sql = `SELECT (SELECT COUNT(*) FROM orders) || ' บิล · ' ||
                      (SELECT COUNT(*) FROM payments) || ' รายการรับเงิน · ' ||
                      (SELECT COUNT(*) FROM stock_movements) || ' รายการเคลื่อนไหวสต็อก · ' ||
                      (SELECT COUNT(*) FROM users) || ' ผู้ใช้'`;
  return (await dockerExec(['psql', '-U', DB.user, '-d', DB.name, '-Atc', sql])).trim();
}

/** โฟลเดอร์สำรองทั้งหมด เรียงจากเก่าไปใหม่ */
export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter((n) => fs.existsSync(path.join(BACKUP_DIR, n, DUMP_FILE)))
    .sort();
}

/** คัดลอกโฟลเดอร์ (รูปเมนูที่อัปโหลด) */
export function copyDir(from, to) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(from)) {
    const src = path.join(from, f);
    if (fs.statSync(src).isFile()) { fs.copyFileSync(src, path.join(to, f)); n++; }
  }
  return n;
}

/** เวลาไทย เช่น 2026-09-25_0930 (ใช้ตั้งชื่อโฟลเดอร์สำรอง) */
export function stamp(d = new Date()) {
  const t = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}_${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}`;
}

// ------------------------------------------------------------ สำรองข้อมูล
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 30);

/** สำรอง 1 ชุด คืน path ของโฟลเดอร์ (ใช้ซ้ำใน restore.js ก่อนคืนค่า) */
export async function runBackup(label = '') {
  const dir = path.join(BACKUP_DIR, stamp() + (label ? `_${label}` : ''));
  fs.mkdirSync(dir, { recursive: true });
  const dump = path.join(dir, DUMP_FILE);

  await dockerExec(['pg_dump', '-U', DB.user, '-d', DB.name, '-Fc', '--no-owner'], { stdoutFile: dump });

  // ตรวจว่าไฟล์สำรองอ่านกลับได้จริง (ไฟล์เสีย = สำรองไม่สำเร็จ)
  const size = fs.statSync(dump).size;
  if (size < 1000) throw new Error(`ไฟล์สำรองเล็กผิดปกติ (${size} bytes)`);
  const list = await dockerExec(['pg_restore', '-l'], { stdinFile: dump });
  const tables = (list.match(/ TABLE DATA /g) || []).length;
  if (tables < 10) throw new Error(`ไฟล์สำรองไม่ครบ (พบข้อมูล ${tables} ตาราง)`);

  const images = copyDir(UPLOAD_DIR, path.join(dir, 'uploads'));
  const summary = await dbSummary();
  fs.writeFileSync(path.join(dir, 'info.txt'), [
    `สำรองเมื่อ: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
    `ฐานข้อมูล: ${DB.name}`,
    `ข้อมูล: ${summary}`,
    `ตารางในไฟล์สำรอง: ${tables} · รูปเมนูที่อัปโหลด: ${images} รูป`,
    `คืนค่า: npm run db:restore -- "${dir}"`,
    '',
  ].join('\n'));

  return { dir, size, tables, images, summary };
}

/** ลบชุดสำรองเก่าเกิน KEEP ชุด */
export function prune() {
  const all = listBackups();
  const old = all.slice(0, Math.max(0, all.length - KEEP));
  for (const name of old) fs.rmSync(path.join(BACKUP_DIR, name), { recursive: true, force: true });
  return { kept: all.length - old.length, removed: old.length };
}

