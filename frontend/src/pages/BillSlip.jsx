import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { TopBar } from '../components/Layout';
import { useToast, Spinner, QrImage, BarcodeImage } from '../components/ui';
import { baht, qty as fmtQty, dateTime } from '../lib/format';
import { printSlipNode } from '../lib/printSlip';

/**
 * ใบเช็คบิล — พิมพ์ให้ลูกค้าดูก่อนจ่ายเงิน
 *
 * ต่างจากใบเสร็จ (/receipt) ตรงที่ใบนี้ออกตอนยังไม่จ่าย จึงมี
 *   · QR พร้อมเพย์ที่ล็อกยอดไว้แล้ว ลูกค้าสแกนจ่ายได้เลยไม่ต้องพิมพ์ยอดเอง
 *   · บาร์โค้ดเลขที่บิล ยิงที่หน้า "บิลทั้งหมด" แล้วเปิดบิลนี้ขึ้นมาได้ทันที
 * บิลที่จ่ายครบแล้วจะไม่มี QR (ฝั่งเซิร์ฟเวอร์ไม่ส่งมาให้) กันลูกค้าสแกนจ่ายซ้ำ
 */
export default function BillSlip() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [b, setB] = useState(null);
  const slipRef = useRef(null);
  const [params] = useSearchParams();
  const printed = useRef(false);

  useEffect(() => {
    api.get(`/payments/bill-slip/${id}`).then((r) => setB(r.data)).catch((e) => toast(e.message, 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // มาจากการยิงบาร์โค้ดที่โต๊ะ (?print=1) -> เปิดหน้าต่างพิมพ์ให้เลย ไม่ต้องกดปุ่มอีกที
  // printed กันเปิดซ้ำ เพราะ useEffect จะทำงานอีกรอบเมื่อ React รีเรนเดอร์
  useEffect(() => {
    if (!b || printed.current || params.get('print') !== '1') return;
    printed.current = true;
    printSlipNode(slipRef.current);
  }, [b, params]);

  if (!b) return <><TopBar title="ใบเช็คบิล" /><Spinner /></>;

  return (
    <>
      <TopBar title="ใบเช็คบิล" sub={`${b.order_no} · โต๊ะ ${b.table_no}`}>
        <button className="btn" onClick={() => nav(`/order/${id}`)}>กลับหน้าบิล</button>
        <button className="btn btn-accent" onClick={() => nav(`/payment/${id}`)}>รับชำระเงิน</button>
        <button className="btn btn-primary" onClick={() => printSlipNode(slipRef.current)}>พิมพ์ใบเช็คบิล</button>
      </TopBar>

      <div className="content">
        <div className="receipt bill-slip" ref={slipRef}>
          <div className="receipt-center">
            <div style={{ fontWeight: 700, fontSize: 14 }}>{b.shop.name}</div>
            <div>{b.shop.branch}</div>
            <div className="tiny">โทร. {b.shop.phone}</div>
            <div className="bill-slip-title">ใบเช็คบิล</div>
          </div>

          <hr />

          <div className="receipt-row"><span>เลขที่บิล</span><span className="bold">{b.order_no}</span></div>
          {b.receipt_no && <div className="receipt-row"><span>เลขที่ใบเสร็จ</span><span className="bold">{b.receipt_no}</span></div>}
          <div className="receipt-row"><span>โต๊ะ</span><span>{b.table_no} · {b.guest_count} ท่าน</span></div>
          <div className="receipt-row"><span>เปิดบิล</span><span>{dateTime(b.opened_at)}</span></div>

          <hr />

          {b.items.map((it) => (
            <div key={it.id} style={{ padding: '3px 0' }}>
              <div className="receipt-item">
                <span>{it.name_th}</span>
                <span className="num">{baht(it.line_total)}</span>
              </div>
              <div className="tiny faint">{fmtQty(it.qty)} × {baht(it.unit_price)}</div>
            </div>
          ))}

          <hr />

          <div className="receipt-row"><span>ยอดรวม</span><span className="num">{baht(b.subtotal)}</span></div>
          {Number(b.discount) > 0 && (
            <div className="receipt-row"><span>ส่วนลด</span><span className="num">−{baht(b.discount)}</span></div>
          )}
          {Number(b.service_charge) > 0 && (
            <div className="receipt-row"><span>ค่าบริการ</span><span className="num">{baht(b.service_charge)}</span></div>
          )}
          {Number(b.vat_amount) > 0 && (
            <div className="receipt-row">
              <span>ภาษีมูลค่าเพิ่ม {b.vat_rate}%{b.vat_included ? ' (รวมในราคา)' : ''}</span>
              <span className="num">{baht(b.vat_amount)}</span>
            </div>
          )}

          <hr />
          <div className="receipt-row big"><span>ยอดสุทธิ</span><span className="num">{baht(b.grand_total)}</span></div>
          {b.paid_amount > 0 && (
            <>
              <div className="receipt-row"><span>รับชำระแล้ว</span><span className="num">−{baht(b.paid_amount)}</span></div>
              <div className="receipt-row big"><span>ยอดค้างชำระ</span><span className="num">{baht(b.due)}</span></div>
            </>
          )}
          <hr />

          {b.qr_payload ? (
            <div className="receipt-center bill-slip-pay">
              <div className="bold">สแกนจ่ายด้วยพร้อมเพย์</div>
              <QrImage payload={b.qr_payload} size={150} />
              <div className="bill-slip-due">{baht(b.due)} บาท</div>
              <div className="tiny faint">พร้อมเพย์ {b.promptpay_id} · ยอดเงินล็อกไว้ในคิวอาร์แล้ว</div>
            </div>
          ) : (
            <div className="receipt-center bold">ชำระเงินเรียบร้อยแล้ว</div>
          )}

          <hr />

          <div className="receipt-center">
            <BarcodeImage value={b.order_no} />
            <div className="tiny faint">{b.order_no}</div>
          </div>

          <div className="receipt-center tiny" style={{ marginTop: 8 }}>
            <div>ขอบคุณที่ใช้บริการ</div>
          </div>
        </div>
      </div>
    </>
  );
}
