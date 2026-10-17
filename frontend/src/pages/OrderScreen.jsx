import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { TopBar } from '../components/Layout';
import { Modal, useToast, useConfirm, Spinner, Sk, SkeletonCards, Empty } from '../components/ui';
import StickyCatTabs from '../components/StickyCatTabs';
import MenuThumb from '../components/MenuThumb';
import CustomerQrModal from '../components/CustomerQrModal';
import { baht, qty as fmtQty, since, TABLE_STATUS } from '../lib/format';

/** ส่วนลดต้องเป็นตัวเลข 0 ถึงยอดรวม (หลังบ้านตรวจซ้ำอีกชั้น) คืนข้อความผิดพลาด หรือ '' ถ้าถูกต้อง */
function discountProblem(discount, subtotal) {
  const n = Number(discount);
  if (String(discount).trim() === '' || !Number.isFinite(n)) return 'กรอกส่วนลดเป็นตัวเลข';
  if (n < 0) return 'ส่วนลดต้องไม่ติดลบ';
  if (n > Number(subtotal)) return `ส่วนลดเกินยอดรวม — ใส่ได้สูงสุด ${baht(subtotal)} บาท`;
  return '';
}

const CLOSED_LABEL = { PAID: 'ชำระเงินแล้ว', VOID: 'ยกเลิกแล้ว' };

/** ป้ายท้ายการ์ดเมนู: หมด / เหลือน้อย / หน่วย */
function StockHint({ item, out }) {
  if (out) return <span className="pill pill-danger">วัตถุดิบหมด</span>;
  if (item.max_servable !== null && item.max_servable <= 5) return <span className="pill pill-billing">เหลือ {item.max_servable}</span>;
  return <span className="tiny faint">{item.unit}</span>;
}

export default function OrderScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [order, setOrder] = useState(null);
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cat, setCat] = useState('ALL');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState({});          // { menu_item_id: qty } รายการที่ยังไม่ส่งครัว
  const [notes, setNotes] = useState({});        // { menu_item_id: "ไม่ใส่พริก" }
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [qrOpen, setQrOpen] = useState(false);

  async function loadOrder() {
    const r = await api.get(`/orders/${id}`);
    // เปิดดูบิลแล้ว -> ป้าย "ออเดอร์ใหม่" ของโต๊ะนี้บนผังร้านหายไป
    api.post(`/orders/${id}/seen`).catch(() => {});
    setOrder(r.data);
    setDiscount(Number(r.data.discount));
    return r.data;
  }

  async function loadMenu() {
    const [m, c] = await Promise.all([api.get('/menu?with_stock=true&available=true'), api.get('/menu/categories')]);
    setMenu(m.data);
    setCategories(c.data);
  }

  useEffect(() => {
    Promise.all([loadOrder(), loadMenu()])
      .catch((e) => toast(e.message, 'err'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const shownMenu = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.filter(
      (m) =>
        (cat === 'ALL' || m.category_code === cat) &&
        (!q || m.name_th.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q))
    );
  }, [menu, cat, search]);

  const cartLines = useMemo(
    () => Object.entries(cart).map(([mid, q]) => ({ item: menu.find((m) => m.id === Number(mid)), qty: q })).filter((l) => l.item),
    [cart, menu]
  );
  const cartTotal = cartLines.reduce((s, l) => s + Number(l.item.price) * l.qty, 0);

  const addToCart = (m) => setCart((c) => ({ ...c, [m.id]: (c[m.id] || 0) + 1 }));
  const setCartQty = (mid, q) =>
    setCart((c) => {
      const next = { ...c };
      if (q <= 0) delete next[mid];
      else next[mid] = q;
      return next;
    });
  const setNote = (mid, text) =>
    setNotes((n) => {
      const next = { ...n };
      if (text) next[mid] = text; else delete next[mid];
      return next;
    });

  /** ส่งรายการในตะกร้าเข้าบิล — ระบบหลังบ้านจะตัดสต็อกตาม BOM ทันที */
  async function sendToKitchen() {
    if (!cartLines.length) return;
    setBusy(true);
    try {
      const r = await api.post(`/orders/${id}/items`, {
        items: cartLines.map((l) => ({ menu_item_id: l.item.id, qty: l.qty, note: notes[l.item.id]?.trim() || undefined })),
      });
      setOrder(r.order);
      setCart({});
      setNotes({});
      setAlerts(r.stock_alerts || []);
      toast(`บันทึก ${cartLines.length} รายการ · ตัดสต็อกเรียบร้อย`, 'ok');
      loadMenu();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  async function changeQty(item, nextQty) {
    setBusy(true);
    try {
      if (nextQty <= 0) {
        const r = await api.del(`/orders/${id}/items/${item.id}`);
        setOrder(r.data);
        toast('ยกเลิกรายการและคืนสต็อกแล้ว', 'ok');
      } else {
        const r = await api.patch(`/orders/${id}/items/${item.id}`, { qty: nextQty });
        setOrder(r.order);
      }
      loadMenu();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  async function saveDiscount() {
    setBusy(true);
    try {
      const r = await api.patch(`/orders/${id}`, { discount: Number(discount) || 0 });
      setOrder(r.data);
      setDiscountOpen(false);
      toast('บันทึกส่วนลดแล้ว', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  async function voidBill() {
    if (!(await confirm({
      title: `ยกเลิกบิลโต๊ะ ${order.table_no} ทั้งใบ?`,
      message: `บิล ${order.order_no}\nวัตถุดิบทุกรายการจะถูกคืนเข้าคลัง และย้อนกลับไม่ได้`,
      confirmLabel: 'ยกเลิกบิล',
      cancelLabel: 'ไม่ยกเลิก',
      danger: true,
    }))) return;
    setBusy(true);
    try {
      await api.post(`/orders/${id}/void`, { reason: 'ยกเลิกโดยพนักงานหน้าร้าน' });
      toast('ยกเลิกบิลและคืนสต็อกแล้ว', 'ok');
      nav('/');
    } catch (e) {
      toast(e.message, 'err');
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <>
        <TopBar title="สั่งอาหาร" />
        <div className="order-layout">
          <div className="order-left stack">
            <Sk w={260} h={36} r={7} />
            <div className="row">{[64, 80, 110, 84, 70].map((w, i) => <Sk key={i} w={w} h={32} r={16} />)}</div>
            <SkeletonCards kind="menu" count={8} className="staff-sk" label="กำลังโหลดเมนู…" />
          </div>
          <aside className="order-right"><Spinner lines={6} /></aside>
        </div>
      </>
    );
  }
  if (!order) return <><TopBar title="สั่งอาหาร" /><Empty icon="⚠️">ไม่พบบิลนี้</Empty></>;

  const liveItems = order.items.filter((i) => i.status !== 'CANCELLED');
  const discountError = discountProblem(discount, order.subtotal);
  const isClosed = order.status === 'PAID' || order.status === 'VOID';
  const st = TABLE_STATUS[order.status === 'BILLING' ? 'BILLING' : 'OCCUPIED'];

  return (
    <>
      <TopBar
        title={`โต๊ะ ${order.table_no} · ${order.order_no}`}
        sub={`${order.zone} · ${order.guest_count} ท่าน · เปิดมาแล้ว ${since(order.opened_at)}`}
      >
        <span className={`pill ${isClosed ? 'pill-muted' : st.cls}`}>
          <i className="dot" />
          {CLOSED_LABEL[order.status] ?? st.label}
        </span>
        {!isClosed && (
          <button className="btn" onClick={() => setQrOpen(true)}>
            QR ลูกค้า{order.access_code ? ` · ${order.access_code}` : ''}
          </button>
        )}
        <button className="btn" onClick={() => nav('/')}>กลับผังร้าน</button>
      </TopBar>

      <div className="order-layout">
        {/* ------------------------------------------------ ฝั่งซ้าย: เมนู */}
        <div className="order-left">
          {alerts.length > 0 && (
            <div className="alert alert-warn" style={{ marginBottom: 14 }}>
              <span>⚠</span>
              <div>
                <strong>วัตถุดิบใกล้หมด</strong> — {alerts.map((a) => `${a.name_th} (เหลือ ${fmtQty(a.balance_after)} ${a.unit})`).join(', ')}
              </div>
            </div>
          )}

          <div className="row wrap" style={{ marginBottom: 12 }}>
            <input className="input grow" style={{ maxWidth: 260 }} placeholder="ค้นหาเมนู…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <StickyCatTabs categories={categories} cat={cat} onChange={setCat} />

          {isClosed ? (
            <Empty icon="🧾">บิลนี้ปิดแล้ว ไม่สามารถสั่งเพิ่มได้</Empty>
          ) : (
            <div className="menu-grid">
              {shownMenu.map((m) => {
                const out = m.max_servable !== null && m.max_servable <= 0;
                return (
                  <button key={m.id} className="menu-card staff-card" onClick={() => addToCart(m)} disabled={out}>
                    <MenuThumb item={m} />
                    <div className="menu-name">{m.name_th}</div>
                    {m.description && <div className="menu-desc">{m.description}</div>}
                    <div className="menu-foot">
                      <span className="menu-price">{baht(m.price)}</span>
                      <StockHint item={m} out={out} />
                    </div>
                  </button>
                );
              })}
              {!shownMenu.length && <Empty icon="🔍">ไม่พบเมนูที่ค้นหา</Empty>}
            </div>
          )}
        </div>

        {/* --------------------------------------------- ฝั่งขวา: สรุปบิล */}
        <aside className="order-right">
          <div className="panel-head">
            <div className="panel-title">สรุปรายการ</div>
            <div className="panel-sub">{liveItems.length} รายการในบิล</div>
          </div>

          <div className="panel-body">
            {/* ตะกร้าที่ยังไม่ส่ง */}
            {cartLines.length > 0 && (
              <>
                <div className="nav-label" style={{ padding: '8px 16px 4px' }}>รอยืนยัน</div>
                {cartLines.map((l) => (
                  <div key={l.item.id} className="line" style={{ background: 'var(--accent-soft)' }}>
                    <div className="line-main">
                      <div className="line-name">{l.item.name_th}</div>
                      <div className="line-meta">{baht(l.item.price)} × {l.qty}</div>
                      <input className="input input-sm note-input" maxLength={100}
                        placeholder="หมายเหตุ เช่น ไม่ใส่พริก"
                        value={notes[l.item.id] || ''} onChange={(e) => setNote(l.item.id, e.target.value)} />
                    </div>
                    <div className="qty-box">
                      <button className="qty-btn" onClick={() => setCartQty(l.item.id, l.qty - 1)}>−</button>
                      <span className="qty-num">{l.qty}</span>
                      <button className="qty-btn" onClick={() => setCartQty(l.item.id, l.qty + 1)}>+</button>
                    </div>
                    <div className="line-amt">{baht(Number(l.item.price) * l.qty)}</div>
                  </div>
                ))}
                <div style={{ padding: '10px 16px' }}>
                  <button className="btn btn-accent btn-block" onClick={sendToKitchen} disabled={busy}>
                    {busy ? 'กำลังบันทึก…' : `ยืนยันสั่ง ${cartLines.length} รายการ · ${baht(cartTotal)} ฿`}
                  </button>
                </div>
              </>
            )}

            {/* รายการที่ส่งครัวแล้ว แยกตามรอบ */}
            {liveItems.length === 0 && !cartLines.length ? (
              <Empty icon="🥢">ยังไม่มีรายการ<br />เลือกเมนูจากด้านซ้ายได้เลย</Empty>
            ) : (
              groupByRound(liveItems).map(([round, items]) => (
                <div key={round}>
                  <div className="nav-label" style={{ padding: '10px 16px 4px' }}>
                    {round === 1 ? 'รอบแรก' : `สั่งเพิ่มรอบที่ ${round}`}
                  </div>
                  {items.map((it) => (
                    <div key={it.id} className="line">
                      <div className="line-main">
                        <div className="line-name">{it.name_th}</div>
                        <div className="line-meta">
                          {baht(it.unit_price)} × {fmtQty(it.qty)}
                          {it.note && <span className="item-note"> · 📝 {it.note}</span>}
                          {it.status === 'SERVED' && <span className="served-tag"> · ✓ เสิร์ฟแล้ว</span>}
                        </div>
                      </div>
                      {!isClosed && (
                        <div className="qty-box">
                          <button className="qty-btn" disabled={busy}
                            onClick={() => changeQty(it, Number(it.qty) - 1)}>−</button>
                          <span className="qty-num">{fmtQty(it.qty)}</span>
                          <button className="qty-btn" disabled={busy}
                            onClick={() => changeQty(it, Number(it.qty) + 1)}>+</button>
                        </div>
                      )}
                      <div className="line-amt">{baht(it.line_total)}</div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="panel-foot">
            <div className="sum-row"><span>ยอดรวม</span><span>{baht(order.subtotal)}</span></div>
            {Number(order.discount) > 0 && (
              <div className="sum-row"><span>ส่วนลด</span><span>−{baht(order.discount)}</span></div>
            )}
            {Number(order.service_charge) > 0 && (
              <div className="sum-row"><span>ค่าบริการ</span><span>{baht(order.service_charge)}</span></div>
            )}
            {Number(order.vat_amount) > 0 && (
              <div className="sum-row"><span>ภาษีมูลค่าเพิ่ม</span><span>{baht(order.vat_amount)}</span></div>
            )}
            <div className="sum-row total"><span>ยอดสุทธิ</span><span>{baht(order.grand_total)} ฿</span></div>
            {!isClosed && Number(order.paid_amount) > 0 && (
              <>
                <div className="sum-row"><span>รับชำระแล้ว</span><span>−{baht(order.paid_amount)}</span></div>
                <div className="sum-row bold"><span>คงเหลือ</span><span>{baht(order.outstanding)} ฿</span></div>
              </>
            )}

            {!isClosed && (
              <div className="stack-sm mt">
                <div className="row">
                  <button className="btn grow" onClick={() => setDiscountOpen(true)} disabled={busy}>ส่วนลด</button>
                  <button className="btn btn-danger grow" onClick={voidBill} disabled={busy || Number(order.paid_amount) > 0}
                    title={Number(order.paid_amount) > 0 ? `รับชำระไปแล้ว ${baht(order.paid_amount)} บาท ยกเลิกทั้งบิลไม่ได้ ให้ยกเลิกเฉพาะรายการที่ไม่ได้ทาน` : undefined}>
                    ยกเลิกบิล
                  </button>
                </div>
                <button className="btn btn-block" disabled={busy || !liveItems.length}
                  onClick={() => nav(`/bill/${order.id}`)}>
                  พิมพ์ใบเช็คบิล (มี QR ให้ลูกค้าสแกนจ่าย)
                </button>
                <button className="btn btn-primary btn-block btn-lg" disabled={busy || !liveItems.length}
                  onClick={() => nav(`/payment/${order.id}`)}>
                  เช็คบิล / ชำระเงิน
                </button>
              </div>
            )}

            {order.status === 'PAID' && (
              <button className="btn btn-block mt" onClick={() => nav(`/receipt/${order.id}`)}>ดูใบเสร็จ</button>
            )}
          </div>
        </aside>
      </div>

      {qrOpen && <CustomerQrModal order={order} onClose={() => setQrOpen(false)} onChanged={setOrder} />}

      {discountOpen && (
        <Modal
          title="ส่วนลด"
          onClose={() => setDiscountOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setDiscountOpen(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={saveDiscount} disabled={busy || !!discountError}>บันทึก</button>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label htmlFor="discount-amount">จำนวนเงินส่วนลด (บาท)</label>
              <input id="discount-amount" className="input" type="number" min="0" max={Number(order.subtotal)} step="1" value={discount}
                onChange={(e) => setDiscount(e.target.value)} autoFocus />
              {discountError && <div className="tiny" style={{ color: 'var(--danger)' }}>{discountError}</div>}
            </div>
            <div className="row wrap">
              {[0, 20, 50, 100].filter((v) => v <= Number(order.subtotal)).map((v) => (
                <button key={v} className="btn btn-sm" onClick={() => setDiscount(v)}>{v === 0 ? 'ไม่ลด' : `${v} ฿`}</button>
              ))}
            </div>
            <div className="muted small">ยอดก่อนลด {baht(order.subtotal)} บาท · ลดได้สูงสุด {baht(order.subtotal)} บาท</div>
          </div>
        </Modal>
      )}
    </>
  );
}

/** จัดกลุ่มรายการอาหารตามรอบการสั่ง เพื่อแยก "สั่งเพิ่มระหว่างทาน" */
function groupByRound(items) {
  const map = new Map();
  for (const it of items) {
    if (!map.has(it.round_no)) map.set(it.round_no, []);
    map.get(it.round_no).push(it);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}
