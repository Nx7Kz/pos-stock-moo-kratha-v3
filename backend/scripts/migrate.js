/**
 * สร้างฐานข้อมูล + ใส่ข้อมูลตั้งต้น
 *   npm run db:migrate  -> ติดตั้งครั้งแรก: สร้างตารางและข้อมูลตั้งต้น
 *                          ถ้าฐานข้อมูลมีข้อมูลอยู่แล้วจะ "ไม่ทำอะไร" (กันเผลอลบข้อมูลร้าน)
 *   npm run db:reset    -> ล้างข้อมูลทั้งหมดแล้วสร้างใหม่ ต้องพิมพ์ชื่อฐานข้อมูลยืนยันก่อน
 *                          รันแบบไม่มีหน้าจอให้พิมพ์ (สคริปต์/CI) ให้ตั้ง CONFIRM_RESET=<ชื่อฐานข้อมูล>
 *
 * schema.sql สั่ง DROP ทุกตารางก่อนสร้างใหม่ และบัญชีผู้ใช้จะกลับเป็นรหัสเริ่มต้น
 * จึงต้องกันไว้ ไม่ให้รันทับฐานข้อมูลที่ร้านใช้งานอยู่โดยไม่ตั้งใจ
 */
import 'dotenv/config';
import fs from 'node:fs';
import readline from 'node:readline/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = (f) => path.join(dir, '..', 'db', f);

const DEFAULT_USERS = [
  { username: 'owner',  password: 'owner123', full_name: 'นายพงศพัทธ์ ดวงจิตต์',   role: 'OWNER' },
  { username: 'arin',   password: 'staff123', full_name: 'นายอริญชัย สุวรรณเกิด',   role: 'OWNER' },
  { username: 'staff1', password: 'staff123', full_name: 'นางสาวแสงรัส จองดี',      role: 'STAFF' },
  { username: 'staff2', password: 'staff123', full_name: 'พนักงานหน้าร้าน 2',       role: 'STAFF' },
];

const RESET = process.argv.includes('--reset');

/** ฐานข้อมูลนี้มีระบบติดตั้งอยู่แล้วหรือยัง (มีตารางผู้ใช้) + ข้อมูลที่จะหายถ้าล้าง */
async function existingData(client) {
  const { rows } = await client.query(`SELECT to_regclass('public.users') IS NOT NULL AS installed`);
  if (!rows[0].installed) return null;
  const count = async (table) => {
    const { rows: r } = await client.query(`SELECT to_regclass('public.${table}') IS NOT NULL AS ok`);
    return r[0].ok ? Number((await client.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n) : 0;
  };
  return { users: await count('users'), orders: await count('orders'), payments: await count('payments') };
}

/** db:reset ต้องยืนยันด้วยการพิมพ์ชื่อฐานข้อมูล */
async function confirmReset(dbName) {
  if (process.env.CONFIRM_RESET !== undefined) return process.env.CONFIRM_RESET === dbName;
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`  พิมพ์ชื่อฐานข้อมูล "${dbName}" เพื่อยืนยันการล้างข้อมูลทั้งหมด: `);
  rl.close();
  return answer.trim() === dbName;
}

async function main() {
  const client = await pool.connect();
  try {
    const dbName = (await client.query('SELECT current_database() AS db')).rows[0].db;
    const found = await existingData(client);

    if (found && !RESET) {
      console.error(`
  ฐานข้อมูล "${dbName}" ติดตั้งไว้แล้ว — ไม่ได้ทำอะไร ข้อมูลเดิมยังอยู่ครบ
    ผู้ใช้ ${found.users} บัญชี · บิล ${found.orders} ใบ · รายการรับเงิน ${found.payments} รายการ

  ถ้าต้องการล้างข้อมูลทั้งหมดแล้วเริ่มใหม่จริง ๆ ให้ใช้:  npm run db:reset
  (บิล สต็อก และรหัสผ่านที่เปลี่ยนไว้จะหายทั้งหมด กู้คืนไม่ได้ถ้าไม่มีไฟล์สำรอง)
`);
      process.exitCode = 1;
      return;
    }

    if (found && RESET) {
      console.log(`
  ⚠ กำลังจะล้างฐานข้อมูล "${dbName}": ผู้ใช้ ${found.users} บัญชี · บิล ${found.orders} ใบ · รายการรับเงิน ${found.payments} รายการ`);
      if (!(await confirmReset(dbName))) {
        console.error(`  ยกเลิก — ไม่ได้ลบอะไร (ยืนยันไม่ตรง หรือรันแบบไม่มีหน้าจอให้พิมพ์: ตั้ง CONFIRM_RESET=${dbName})
`);
        process.exitCode = 1;
        return;
      }
    }

    console.log('[1/3] สร้างโครงสร้างตาราง (schema.sql) ...');
    await client.query(fs.readFileSync(sqlPath('schema.sql'), 'utf8'));

    console.log('[2/3] ใส่ข้อมูลตั้งต้น (seed.sql) ...');
    await client.query(fs.readFileSync(sqlPath('seed.sql'), 'utf8'));

    console.log('[3/3] สร้างบัญชีผู้ใช้ ...');
    for (const u of DEFAULT_USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      await client.query(
        `INSERT INTO users (username, password_hash, full_name, role)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (username) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               full_name     = EXCLUDED.full_name,
               role          = EXCLUDED.role`,
        [u.username, hash, u.full_name, u.role]
      );
    }

    const counts = await client.query(`
      SELECT (SELECT COUNT(*) FROM dining_tables) AS tables,
             (SELECT COUNT(*) FROM categories)    AS categories,
             (SELECT COUNT(*) FROM menu_items)    AS menu_items,
             (SELECT COUNT(*) FROM ingredients)   AS ingredients,
             (SELECT COUNT(*) FROM recipes)       AS recipes,
             (SELECT COUNT(*) FROM users)         AS users`);

    console.log('\n  สร้างฐานข้อมูลเรียบร้อย');
    console.table(counts.rows[0]);
    console.log('\n  บัญชีสำหรับเข้าสู่ระบบ:');
    for (const u of DEFAULT_USERS) console.log(`    ${u.username.padEnd(8)} / ${u.password.padEnd(9)} (${u.role})`);
    console.log('');
  } finally {
    client.release();
    await pool.end();
  }
}

try {
  await main();
} catch (err) {
  console.error('\n  สร้างฐานข้อมูลไม่สำเร็จ:', err.message);
  console.error(err.detail || err.where || '');
  process.exit(1);
}
