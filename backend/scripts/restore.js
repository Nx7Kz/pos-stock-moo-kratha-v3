/**
 * คืนค่าข้อมูลร้านจากไฟล์สำรอง
 *   npm run db:restore                      -> แสดงรายการไฟล์สำรองที่มี
 *   npm run db:restore -- latest            -> คืนค่าจากชุดล่าสุด
 *   npm run db:restore -- "<โฟลเดอร์สำรอง>"  -> คืนค่าจากชุดที่ระบุ
 *
 * ต้องพิมพ์ชื่อฐานข้อมูลยืนยันก่อน (รันแบบไม่มีหน้าจอให้พิมพ์: ตั้ง CONFIRM_RESTORE=<ชื่อฐานข้อมูล>)
 * ก่อนคืนค่าจะสำรองข้อมูลปัจจุบันให้อัตโนมัติ (โฟลเดอร์ลงท้าย _before-restore) — คืนผิดชุดก็ย้อนกลับได้
 * ควรปิด backend ก่อนคืนค่า แล้วเปิดใหม่หลังเสร็จ (ระบบจะผูกรูปเมนูที่อัปโหลดให้เองตอนเปิด)
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { DB, BACKUP_DIR, UPLOAD_DIR, DUMP_FILE, dockerExec, dbSummary, listBackups, copyDir, runBackup } from './dbtools.js';

function resolveSource(arg) {
  if (arg === 'latest') {
    const all = listBackups().filter((n) => !n.endsWith('_before-restore'));
    return all.length ? path.join(BACKUP_DIR, all[all.length - 1]) : null;
  }
  const p = path.resolve(arg);
  if (fs.existsSync(path.join(p, DUMP_FILE))) return p;
  const inBackups = path.join(BACKUP_DIR, arg);
  return fs.existsSync(path.join(inBackups, DUMP_FILE)) ? inBackups : null;
}

async function confirm() {
  if (process.env.CONFIRM_RESTORE !== undefined) return process.env.CONFIRM_RESTORE === DB.name;
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`  พิมพ์ชื่อฐานข้อมูล "${DB.name}" เพื่อยืนยันการคืนค่า (ข้อมูลปัจจุบันจะถูกแทนที่): `);
  rl.close();
  return answer.trim() === DB.name;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    const all = listBackups();
    console.log(`\n  ไฟล์สำรองใน ${BACKUP_DIR}:`);
    if (!all.length) console.log('    (ยังไม่มี — สร้างด้วย npm run db:backup)');
    for (const n of all) {
      const info = path.join(BACKUP_DIR, n, 'info.txt');
      const line = fs.existsSync(info) ? (fs.readFileSync(info, 'utf8').split('\n').find((l) => l.startsWith('ข้อมูล:')) || '') : '';
      console.log(`    ${n}   ${line.replace('ข้อมูล: ', '')}`);
    }
    console.log('\n  คืนค่า: npm run db:restore -- latest   หรือ   npm run db:restore -- <ชื่อโฟลเดอร์>\n');
    return;
  }

  const src = resolveSource(arg);
  if (!src) throw new Error(`ไม่พบไฟล์สำรอง "${arg}" (ดูรายการด้วย npm run db:restore)`);
  const infoFile = path.join(src, 'info.txt');
  console.log(`\n  คืนค่าจาก: ${src}`);
  if (fs.existsSync(infoFile)) console.log(fs.readFileSync(infoFile, 'utf8').split('\n').slice(0, 3).map((l) => `    ${l}`).join('\n'));
  // ฐานข้อมูลว่าง (เช่นเครื่องใหม่ที่ยังไม่ติดตั้ง) ไม่มีอะไรให้สำรองก่อน -> คืนค่าได้เลย
  const installed = (await dockerExec(['psql', '-U', DB.user, '-d', DB.name, '-Atc',
    "SELECT to_regclass('public.orders') IS NOT NULL"])).trim() === 't';
  console.log(`  ข้อมูลปัจจุบันใน "${DB.name}": ${installed ? await dbSummary() : '(ว่าง ยังไม่ได้ติดตั้ง)'}\n`);

  if (!(await confirm())) {
    console.error(`  ยกเลิก — ไม่ได้เปลี่ยนอะไร (ยืนยันไม่ตรง หรือรันแบบไม่มีหน้าจอให้พิมพ์: ตั้ง CONFIRM_RESTORE=${DB.name})\n`);
    process.exitCode = 1;
    return;
  }

  // สำรองสถานะปัจจุบันก่อน เผื่อคืนค่าผิดชุด
  const safety = installed ? await runBackup('before-restore') : null;
  if (safety) console.log(`  สำรองข้อมูลปัจจุบันไว้ก่อนแล้ว: ${safety.dir}`);

  // --clean ลบของเดิมแล้วสร้างใหม่ทั้งหมด, --single-transaction ถ้าพลาดกลางทางจะไม่เปลี่ยนอะไรเลย
  await dockerExec(
    ['pg_restore', '-U', DB.user, '-d', DB.name, '--clean', '--if-exists', '--no-owner', '--single-transaction'],
    { stdinFile: path.join(src, DUMP_FILE) }
  );
  const images = copyDir(path.join(src, 'uploads'), UPLOAD_DIR);

  console.log(`
  คืนค่าเรียบร้อย
    ข้อมูลตอนนี้: ${await dbSummary()}
    รูปเมนูที่คืนมา: ${images} รูป
${safety ? `    ถ้าคืนผิดชุด: npm run db:restore -- "${path.basename(safety.dir)}"\n` : ''}
  เปิด backend ใหม่ (npm run dev) และทุกคนต้องเข้าสู่ระบบใหม่
`);
}

try {
  await main();
} catch (e) {
  console.error(`\n  คืนค่าไม่สำเร็จ: ${e.message}\n  (ข้อมูลเดิมไม่ถูกเปลี่ยน ถ้าพลาดระหว่างคืนค่า ระบบย้อนกลับให้ทั้งหมด)\n`);
  process.exitCode = 1;
}
