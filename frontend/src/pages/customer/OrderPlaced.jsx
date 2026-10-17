import { useEffect } from 'react';
import { baht, qty as fmtQty } from '../../lib/format';
import ThemeToggle from '../../components/ThemeToggle';

/**
 * หน้ายืนยันหลังลูกค้ากดสั่งสำเร็จ — แทน toast เล็ก ๆ ที่หายเร็ว ลูกค้าจะได้มั่นใจว่าออเดอร์เข้าครัวแล้วจริง
 * result = คำตอบจาก POST /public/tables/:tableNo/order ({ round_no, order })
 */
export default function OrderPlaced({ tableNo, result, onMore, onBill }) {
  const { round_no: round, order } = result;
  const items = order.items.filter((i) => i.round_no === round && i.status !== 'CANCELLED');
  const roundTotal = items.reduce((s, i) => s + Number(i.line_total), 0);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="cust-page">
      <div className="cust-top">
        <div className="cust-top-inner">
          <img className="brand-logo" src="/logo-mark.png" alt="" />
          <div className="grow">
            <div className="cust-brand">บ้านน้องโฟค หมูกระทะ</div>
            <div className="tiny faint">โต๊ะ {tableNo}</div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="placed">
        <div className="placed-check" aria-hidden="true">✓</div>
        <h1 className="placed-title">ส่งออเดอร์เข้าครัวแล้ว</h1>
        <div className="placed-sub">
          โต๊ะ {tableNo} · {round > 1 ? `สั่งเพิ่มรอบที่ ${round}` : 'รอบแรก'} · {items.length} รายการ
        </div>

        <div className="card placed-card">
          {items.map((i) => (
            <div key={i.id} className="placed-line">
              <span className="placed-qty">{fmtQty(i.qty)}×</span>
              <div className="grow">
                <div className="bold small">{i.name_th}</div>
                {i.note && <div className="item-note tiny">📝 {i.note}</div>}
              </div>
              <span className="small num">{baht(i.line_total)}</span>
            </div>
          ))}
          <div className="placed-sum">
            <span>รอบนี้</span><span className="num">{baht(roundTotal)} ฿</span>
          </div>
          <div className="placed-sum placed-sum-total">
            <span>ยอดสะสมทั้งโต๊ะ</span><span className="num">{baht(order.grand_total)} ฿</span>
          </div>
        </div>

        <div className="placed-hint">
          ยังไม่ต้องจ่ายตอนนี้ — สั่งเพิ่มได้ตลอด แล้วค่อย<strong>ชำระเงินที่เคาน์เตอร์</strong>ตอนกลับ
        </div>

        <div className="placed-actions">
          <button className="btn btn-accent btn-lg btn-block" onClick={onMore}>สั่งอาหารเพิ่ม</button>
          <button className="btn btn-lg btn-block" onClick={onBill}>ดูรายการที่สั่ง / สถานะอาหาร</button>
        </div>
      </div>
    </div>
  );
}
