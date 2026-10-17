import { useEffect, useRef } from 'react';
import { fixThaiKeyboard } from './thaiKeyboard';

/** เลขที่บิล/ใบเสร็จของระบบ: ตัวอักษร 2 ตัว + ตัวเลข 12 ตัว (เช่น OD20260925-0032) */
const BILL_NO = /^[A-Z]{2}\d{12}$/;

/** ตัดเครื่องหมายคั่นออกให้เหลือแต่ตัวอักษรกับตัวเลข — เครื่องสแกนส่ง '-' มาเป็นอักขระอื่นได้ */
export const normalizeBillNo = (s) => fixThaiKeyboard(String(s)).toUpperCase().replace(/[^A-Z0-9]/g, '');

/** ข้อความนี้เป็นเลขที่บิลครบรูปแบบแล้วหรือยัง (ใช้ตัดสินใจว่าจะค้นเลยโดยไม่รอ Enter) */
export const isBillNo = (s) => BILL_NO.test(normalizeBillNo(s));

/** หน้าที่ควรไปหลังค้นบิลเจอ */
export const billRoute = (o) =>
  // ยังไม่จ่าย -> ใบเช็คบิลที่มี QR พร้อมเพย์ แล้วสั่งพิมพ์ให้เลย
  // จ่ายแล้ว -> ใบเสร็จ (ยิงซ้ำเพื่อพิมพ์ใบเสร็จใหม่ให้ลูกค้า)
  o.status === 'PAID' ? `/receipt/${o.id}` : `/bill/${o.id}?print=1`;

/**
 * อ่านตัวอักษรจาก "ปุ่มจริง" บนคีย์บอร์ด (event.code) ไม่ใช่ตัวอักษรที่ได้ (event.key)
 *
 * event.key ขึ้นกับภาษาที่ Windows ใช้อยู่ ยิงตอนภาษาไทยจะได้ ฯฏ/จ... แล้วต้องมาไล่แปลงกลับ
 * ซึ่งพึ่งไม่ได้ — เครื่องสแกนรุ่นนี้ส่งเลข 3 ออกมาเป็น '-' ทำให้เลขหายไปทั้งตัว
 * ส่วน event.code บอกตำแหน่งปุ่มบนแป้น (KeyO, Digit3) เหมือนกันทุกภาษา จึงไม่มีปัญหานี้เลย
 */
function charFromKey(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);            // KeyO -> O
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);          // Digit3 -> 3
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);         // เครื่องสแกนบางรุ่นส่งมาทางแป้นตัวเลข
  return '';   // เครื่องหมายคั่นไม่ต้องเก็บ ตอนเทียบก็ตัดทิ้งอยู่แล้ว
}

/**
 * ดักการยิงบาร์โค้ดทั้งหน้าจอ โดยไม่ต้องคลิกช่องไหนก่อน
 *
 * เครื่องสแกนทำงานเหมือนคีย์บอร์ด แต่ "พิมพ์" เร็วกว่าคนมาก (ห่างกันไม่กี่มิลลิวินาที)
 * จึงเก็บปุ่มที่กดรัว ๆ ต่อกันไว้ พอได้เลขครบรูปแบบก็ค้นเลย
 * ไม่ต้องรอ Enter เพราะเครื่องสแกนบางรุ่นไม่ได้ส่ง Enter มาให้
 *
 * ถ้าเคอร์เซอร์อยู่ในช่องกรอกอยู่แล้วจะไม่ดัก ปล่อยให้ช่องนั้นรับไปตามปกติ
 * (ไม่งั้นพนักงานพิมพ์ชื่อเมนูอยู่แล้วโดนแย่งไปค้นบิล)
 */
export function useBarcodeScan(onScan, { gapMs = 60 } = {}) {
  const buf = useRef('');
  const last = useRef(0);

  useEffect(() => {
    function onKeyDown(e) {
      const el = e.target;
      const typing = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable;
      if (typing || e.ctrlKey || e.altKey || e.metaKey) return;

      const now = Date.now();
      if (now - last.current > gapMs) buf.current = '';   // เว้นนานแปลว่าเป็นการกดของคน ไม่ใช่เครื่องสแกน
      last.current = now;

      const ch = charFromKey(e.code);
      if (!ch) return;

      buf.current = (buf.current + ch).slice(-64);
      // ดูเฉพาะ 14 ตัวท้าย เผื่อมีปุ่มอื่นค้างอยู่ในบัฟเฟอร์ก่อนหน้า
      const code = buf.current.slice(-14);
      if (BILL_NO.test(code)) {
        buf.current = '';
        onScan(code);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onScan, gapMs]);
}
