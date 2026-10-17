import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from './ui';
import { fixThaiKeyboard } from '../lib/thaiKeyboard';
import { isBillNo, billRoute } from '../lib/billScan';

/**
 * ช่องค้นบิลจากเลขที่ — พิมพ์เลขเองหรือยิงบาร์โค้ดลงช่องนี้ก็ได้
 *
 * การยิงบาร์โค้ดจริง ๆ ไม่ต้องใช้ช่องนี้แล้ว เพราะ Layout ดักไว้ทั้งหน้าจอ (ดู lib/billScan.js)
 * ช่องนี้เหลือไว้เผื่อกรณีบาร์โค้ดเลือนจนยิงไม่ติด พนักงานพิมพ์เลขเอาเองได้
 */
export default function BillScanBox({ autoFocus = false, width = 210 }) {
  const nav = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState('');
  const ref = useRef(null);
  const busy = useRef(false);

  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  async function lookup(raw) {
    // แปลงภาษาให้ด้วย เผื่อพิมพ์/ยิงตอน Windows อยู่ภาษาไทย ซึ่งจะได้ ฯฏ/จ... แทน OD20...
    const c = fixThaiKeyboard(raw).trim();
    if (!c || busy.current) return;
    busy.current = true;
    try {
      const r = await api.get(`/orders/by-no/${encodeURIComponent(c)}`);
      setCode('');
      nav(billRoute(r.data));
    } catch (err) {
      const t = raw.trim();
      toast(t && t !== c ? `${err.message} (พิมพ์มา: ${t})` : err.message, 'err');
      ref.current?.select();
    } finally {
      busy.current = false;
    }
  }

  /** ได้เลขครบรูปแบบแล้วค้นเลย ไม่ต้องรอ Enter (เครื่องสแกนบางรุ่นไม่ส่ง Enter) */
  function onChange(e) {
    const v = e.target.value;
    setCode(v);
    if (isBillNo(v)) lookup(v);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); lookup(code); }}>
      <input ref={ref} className="input" style={{ width }} value={code}
        onChange={onChange}
        placeholder="ยิงบาร์โค้ด / พิมพ์เลขที่บิล" />
    </form>
  );
}
