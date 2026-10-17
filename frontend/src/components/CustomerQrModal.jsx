import { useState, useEffect, useRef } from 'react';
import { api, auth } from '../lib/api';
import { getQrInfo, customerUrl, isLocalHost, lanUrl } from '../lib/customerUrl';
import { dateTime } from '../lib/format';
import { Modal, QrImage, BarcodeImage, useToast, useConfirm } from './ui';
import { printSlipNode } from '../lib/printSlip';

/**
 * QR สั่งอาหารของบิลที่เปิดอยู่ พร้อมรหัสโต๊ะ 4 หลัก
 * พิมพ์เป็นใบเล็ก ๆ วางที่โต๊ะ หรือให้ลูกค้าสแกนจากจอได้เลย
 */
export default function CustomerQrModal({ order, onClose, onChanged, extraActions }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [base, setBase] = useState('');
  const [lan, setLan] = useState([]);
  const [editBase, setEditBase] = useState(null);   // ช่องแก้ที่อยู่เว็บ (null = ปิดอยู่)
  const isOwner = auth.user?.role === 'OWNER';
  const [shopName, setShopName] = useState('');
  const [busy, setBusy] = useState(false);
  const slipRef = useRef(null);

  useEffect(() => {
    getQrInfo()
      .then((q) => {
        setBase(q.base);
        setLan(q.lan);
        // QR ชี้ localhost มือถือเปิดไม่ได้ -> เปิดช่องแก้ให้เจ้าของร้านเลย
        if (isLocalHost(q.base) && isOwner) setEditBase(q.base);
      })
      .catch((e) => toast(e.message, 'err'));
    api.get('/settings').then((r) => setShopName(r.data.shop_name || '')).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const code = order.access_code;
  // QR ไม่ฝังรหัส ลูกค้าต้องพิมพ์รหัส 4 หลักจากใบนี้เอง (กันคนถ่ายรูป QR ไปสั่งทีหลัง)
  const url = base && code ? customerUrl(base, order.table_no) : '';

  async function regenerate() {
    if (code && !(await confirm({
      title: `เปลี่ยนรหัสโต๊ะ ${order.table_no}?`,
      message: `รหัสเดิม ${code} จะใช้ไม่ได้ทันที\nลูกค้าที่โต๊ะนี้ต้องกรอกรหัสใหม่ก่อนสั่งอาหาร`,
      confirmLabel: 'เปลี่ยนรหัส',
    }))) return;
    setBusy(true);
    try {
      const r = await api.post(`/orders/${order.id}/access-code`);
      toast(r.message, 'ok');
      onChanged?.(r.data);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  /** บันทึกที่อยู่เว็บที่ใส่ใน QR (เช่นลิงก์ Cloudflare ที่เปลี่ยนทุกครั้งที่เปิด tunnel ใหม่) */
  async function saveBase() {
    let clean = editBase.trim();
    while (clean.endsWith('/')) clean = clean.slice(0, -1);
    if (!/^https?:\/\/[^\s/]+/i.test(clean)) return toast('ที่อยู่เว็บต้องขึ้นต้นด้วย http:// หรือ https://', 'err');
    setBusy(true);
    try {
      await api.patch('/settings', { customer_base_url: clean });
      setBase(clean);
      setEditBase(null);
      toast('บันทึกที่อยู่เว็บแล้ว QR อัปเดตให้แล้ว', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`QR สั่งอาหาร · โต๊ะ ${order.table_no}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={regenerate} disabled={busy}>{code ? 'เปลี่ยนรหัส' : 'สร้างรหัส'}</button>
          <span className="grow" />
          {extraActions}
          <button className="btn btn-primary" onClick={() => printSlipNode(slipRef.current)} disabled={!url}>พิมพ์ใบ QR</button>
        </>
      }
    >
      {!code ? (
        <div className="alert alert-warn">
          <span>⚠</span>
          <div>บิลนี้ยังไม่มีรหัสโต๊ะ กด <strong>สร้างรหัส</strong> เพื่อให้ลูกค้าสแกนสั่งอาหารเองได้</div>
        </div>
      ) : (
        <div className="stack">
          <div className="qr-slip" ref={slipRef}>
            {shopName && <div className="qr-card-shop">{shopName}</div>}
            <div className="qr-card-table">โต๊ะ {order.table_no}</div>
            {url ? <QrImage payload={url} size={200} /> : <div className="empty">กำลังสร้าง QR…</div>}
            <div className="qr-slip-code-label">รหัสโต๊ะ</div>
            <div className="qr-slip-code">{code}</div>
            <div className="qr-card-hint">สแกนแล้วกรอกรหัสโต๊ะ · ชำระเงินที่เคาน์เตอร์</div>

            {/* บาร์โค้ดสำหรับพนักงาน ยิงที่โต๊ะแล้วเปิดบิลดูยอดที่ลูกค้ากินไปได้ทันที */}
            <div className="qr-slip-barcode">
              <BarcodeImage value={order.order_no} height={36} />
              <div className="tiny faint">{order.order_no} · {dateTime(order.opened_at)}</div>
            </div>
          </div>

          {base && isLocalHost(base) && (
            <div className="alert alert-danger no-print">
              <span>⚠</span>
              <div>
                QR ชี้ไปที่ localhost มือถือลูกค้าจะเปิดไม่ได้ —{' '}
                {isOwner ? 'ใส่ที่อยู่เว็บที่มือถือเปิดได้ในช่องด้านล่าง' : 'ให้เจ้าของร้านตั้งที่อยู่เว็บก่อน'}
              </div>
            </div>
          )}

          {isOwner && (editBase === null ? (
            <button className="link-btn no-print" onClick={() => setEditBase(base)}>
              ⚙ ตั้งค่าที่อยู่เว็บใน QR {base && <span className="faint">({base})</span>}
            </button>
          ) : (
            <div className="base-editor no-print">
              <label className="small bold" htmlFor="qr-base">ที่อยู่เว็บที่มือถือลูกค้าเปิดได้</label>
              <div className="row">
                <input id="qr-base" className="input grow" value={editBase} onChange={(e) => setEditBase(e.target.value)}
                  placeholder="เช่น https://xxxx.trycloudflare.com" />
                <button className="btn btn-accent" onClick={saveBase} disabled={busy || !editBase.trim()}>บันทึก</button>
              </div>
              {lan.length > 0 && (
                <div className="row wrap tiny">
                  <span className="faint">ใช้ WiFi ร้าน:</span>
                  {lan.map((ip) => (
                    <button key={ip} className="btn btn-sm" onClick={() => setEditBase(lanUrl(ip))}>{lanUrl(ip)}</button>
                  ))}
                </div>
              )}
              <div className="tiny faint">
                ใช้ Cloudflare Tunnel ให้ใส่ลิงก์ https://….trycloudflare.com ที่ได้ตอนเปิด tunnel (ลิงก์เปลี่ยนทุกครั้งที่เปิดใหม่)
              </div>
              <button className="link-btn" onClick={() => setEditBase(null)} disabled={busy}>ปิด</button>
            </div>
          ))}
          <div className="tiny faint center no-print">
            ลูกค้าสแกน QR แล้วกรอกรหัสนี้ · ใช้ได้จนกว่าจะปิดบิล
          </div>
        </div>
      )}
    </Modal>
  );
}
