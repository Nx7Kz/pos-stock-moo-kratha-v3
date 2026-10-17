import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useToast, Sk, SkeletonCards, Empty, Modal } from '../../components/ui';
import { baht } from '../../lib/format';
import { setCode, clearCode, publicOpts, sessionProblem, loadCart, loadCartNotes, saveCart, clearCart } from './session';
import CodeGate from './CodeGate';
import OrderPlaced from './OrderPlaced';
import MenuThumb from '../../components/MenuThumb';
import ThemeToggle from '../../components/ThemeToggle';
import StickyCatTabs from '../../components/StickyCatTabs';

export default function CustomerMenu() {
  const { tableNo } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [table, setTable] = useState(null);
  const [cat, setCat] = useState('ALL');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState(() => loadCart(tableNo));   // ยังอยู่แม้รีเฟรชหน้า
  const [notes, setNotes] = useState(() => loadCartNotes(tableNo));   // { menu_item_id: "ไม่ใส่พริก" }
  const [bump, setBump] = useState(0);                          // เพิ่มของทีไร ตะกร้าเด้งที
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [placed, setPlaced] = useState(null);     // สั่งสำเร็จ -> โชว์หน้ายืนยัน
  const [problem, setProblem] = useState(null);   // รหัสผิด / ยังไม่มีรหัส / โต๊ะยังไม่เปิด

  /** error เรื่องรหัสโต๊ะ -> เปลี่ยนไปหน้ากรอกรหัส, error อื่นแสดงเป็น toast */
  function handleError(e) {
    const p = sessionProblem(e);
    if (!p) return toast(e.message, 'err');
    if (p.reason === 'CODE_INVALID' || p.reason === 'TABLE_NOT_OPEN') clearCode(tableNo);
    // บิลปิดไปแล้ว ของในตะกร้าเป็นของมื้อก่อน ทิ้งไป
    if (p.reason === 'TABLE_NOT_OPEN') { clearCart(tableNo); setCart({}); setNotes({}); }
    setProblem(p);
    setConfirmOpen(false);
  }

  /** ตรวจรหัสโต๊ะ + ยอดสะสม (อัปเดตหลังสั่งอาหาร) */
  async function loadTable() {
    try {
      const t = await api.get(`/public/tables/${tableNo}`, publicOpts(tableNo));
      setTable(t.data);
      setProblem(null);
    } catch (e) {
      handleError(e);
    }
  }

  async function load() {
    try {
      const m = await api.get('/public/menu', { noAuth: true });
      setMenu(m.data);
      setCategories(m.categories);
      await loadTable();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // สแกน QR จากใบเปิดโต๊ะ -> ลิงก์มีรหัสมาด้วย จำไว้แล้วลบออกจากแถบที่อยู่
    const code = params.get('code');
    if (code) {
      setCode(tableNo, code);
      setParams({}, { replace: true });
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableNo]);

  useEffect(() => { saveCart(tableNo, cart, notes); }, [tableNo, cart, notes]);

  async function enterCode(code) {
    setCode(tableNo, code);
    await loadTable();
  }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.filter((m) => (cat === 'ALL' || m.category_code === cat) && (!q || m.name_th.toLowerCase().includes(q)));
  }, [menu, cat, search]);

  const lines = Object.entries(cart)
    .map(([id, q]) => ({ item: menu.find((m) => m.id === Number(id)), qty: q }))
    .filter((l) => l.item);
  const total = lines.reduce((s, l) => s + Number(l.item.price) * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  const add = (m) => {
    setCart((c) => ({ ...c, [m.id]: (c[m.id] || 0) + 1 }));
    setBump((b) => b + 1);
  };
  const setQty = (id, q) => {
    setCart((c) => {
      const n = { ...c };
      if (q <= 0) delete n[id]; else n[id] = q;
      return n;
    });
    if (q <= 0) setNote(id, '');
    if (q > (cart[id] || 0)) setBump((b) => b + 1);
  };

  const setNote = (id, text) =>
    setNotes((n) => {
      const next = { ...n };
      if (text) next[id] = text; else delete next[id];
      return next;
    });

  async function submit() {
    if (!lines.length) return;
    setBusy(true);
    try {
      const r = await api.post(`/public/tables/${tableNo}/order`,
        { items: lines.map((l) => ({ menu_item_id: l.item.id, qty: l.qty, note: notes[l.item.id]?.trim() || undefined })) },
        publicOpts(tableNo));
      // โชว์หน้ายืนยันชัด ๆ แล้วกลับมาสั่งเพิ่มได้เรื่อย ๆ ไปจ่ายเงินที่เคาน์เตอร์ตอนกลับ
      setPlaced(r);
      setCart({});
      setNotes({});
      clearCart(tableNo);
      setConfirmOpen(false);
      loadTable();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <MenuSkeleton tableNo={tableNo} />;
  if (problem) return <CodeGate tableNo={tableNo} problem={problem} onSubmit={enterCode} onRetry={loadTable} />;
  if (placed) {
    return (
      <OrderPlaced tableNo={tableNo} result={placed}
        onMore={() => setPlaced(null)}
        onBill={() => nav(`/customer/${tableNo}/bill`)} />
    );
  }

  const isBilling = table?.status === 'BILLING';

  return (
    <div className="cust-page">
      <div className="cust-top">
        <div className="cust-top-inner">
          <img className="brand-logo" src="/logo-mark.png" alt="" />
          <div className="grow">
            <div className="cust-brand">บ้านน้องโฟค หมูกระทะ</div>
            <div className="tiny faint">
              โต๊ะ {tableNo}
              {table?.order_no && ` · ยอดสะสม ${baht(table.current_total)} ฿`}
            </div>
          </div>
          <ThemeToggle />
          <button className="btn btn-sm" onClick={() => nav(`/customer/${tableNo}/bill`)}>รายการที่สั่ง</button>
        </div>
      </div>

      <div className="cust-shell">
        <div className="content stack">
          {isBilling ? (
            <div className="alert alert-warn">
              <span>🧾</span>
              <div>เช็คบิลแล้ว — กรุณาแจ้ง <strong>โต๊ะ {tableNo}</strong> และชำระเงินที่เคาน์เตอร์ หากต้องการสั่งเพิ่มกรุณาแจ้งพนักงาน</div>
            </div>
          ) : (
            <div className="alert alert-info">
              <span>ℹ</span>
              <div>สั่งได้เลย ยังไม่ต้องจ่าย — สั่งเพิ่มได้ตลอด แล้วค่อย<strong>ชำระเงินที่เคาน์เตอร์</strong>ตอนกลับ</div>
            </div>
          )}

          <input className="input" placeholder="ค้นหาเมนู…" value={search} onChange={(e) => setSearch(e.target.value)} />

          <StickyCatTabs categories={categories} cat={cat} onChange={setCat} />

          {!shown.length ? <Empty icon="🔍">ไม่พบเมนูที่ค้นหา</Empty> : (
            <div className="menu-grid">
              {shown.map((m) => {
                const inCart = cart[m.id] || 0;
                const canAdd = !m.sold_out && !isBilling;
                // แตะตรงไหนของการ์ดก็เพิ่มลงตะกร้าได้ ไม่ต้องเล็งที่ปุ่ม
                const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
                return (
                  <div key={m.id} className={`menu-card cust-card${inCart > 0 ? ' in-cart' : ''}${m.sold_out ? ' sold-out' : ''}`}
                    role="button" tabIndex={canAdd ? 0 : -1} aria-disabled={!canAdd}
                    onClick={() => canAdd && add(m)}
                    onKeyDown={(e) => canAdd && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), add(m))}>
                    <MenuThumb item={m} />
                    {inCart > 0 && <span key={`b${inCart}`} className="thumb-count pop">{inCart}</span>}
                    <div className="menu-body">
                      <div className="menu-name">{m.name_th}</div>
                      {m.description && <div className="menu-desc">{m.description}</div>}
                      <div className="menu-foot">
                        <span className="menu-price">{baht(m.price)}</span>
                        {m.sold_out ? (
                          <span className="pill pill-danger">หมด</span>
                        ) : inCart > 0 ? (
                          <div className="qty-box qty-lg">
                            <button className="qty-btn" aria-label="ลดจำนวน" onClick={stop(() => setQty(m.id, inCart - 1))}>−</button>
                            <span key={inCart} className="qty-num pop">{inCart}</span>
                            <button className="qty-btn" aria-label="เพิ่มจำนวน" onClick={stop(() => setQty(m.id, inCart + 1))} disabled={isBilling}>+</button>
                          </div>
                        ) : (
                          <button className="btn btn-accent add-btn" onClick={stop(() => add(m))} disabled={isBilling}>+ เพิ่ม</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {count > 0 && (
        <div className="cust-cart">
          <div className="cust-cart-inner">
            <div key={bump} className="cart-icon bump" aria-label={`ตะกร้า ${count} ชิ้น`}>
              🛒<span className="cart-count">{count}</span>
            </div>
            <div className="grow">
              <div className="bold">ตะกร้า {count} ชิ้น</div>
              <div className="tiny faint">ยังไม่ได้สั่ง</div>
            </div>
            <div key={`t${bump}`} className="bold pop" style={{ fontSize: 19 }}>{baht(total)} ฿</div>
            <button className="btn btn-accent btn-lg" onClick={() => setConfirmOpen(true)} disabled={isBilling}>
              ดูตะกร้า
            </button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <Modal
          title={`ยืนยันสั่งอาหาร · โต๊ะ ${tableNo}`}
          onClose={() => !busy && setConfirmOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmOpen(false)} disabled={busy}>เลือกเพิ่ม</button>
              <button className="btn btn-accent" onClick={submit} disabled={busy || !lines.length}>
                {busy ? 'กำลังส่ง…' : `ยืนยันสั่ง ${baht(total)} ฿`}
              </button>
            </>
          }
        >
          <div className="stack-sm">
            {lines.map((l) => (
              <div key={l.item.id} className="cart-line">
                <div className="row">
                  <div className="grow">
                    <div className="bold small">{l.item.name_th}</div>
                    <div className="tiny faint">{baht(l.item.price)} × {l.qty}</div>
                  </div>
                  <div className="qty-box">
                    <button className="qty-btn" onClick={() => setQty(l.item.id, l.qty - 1)} disabled={busy}>−</button>
                    <span className="qty-num">{l.qty}</span>
                    <button className="qty-btn" onClick={() => setQty(l.item.id, l.qty + 1)} disabled={busy}>+</button>
                  </div>
                </div>
                <input className="input input-sm note-input" maxLength={100} disabled={busy}
                  placeholder="หมายเหตุ เช่น ไม่ใส่พริก (ไม่บังคับ)"
                  value={notes[l.item.id] || ''} onChange={(e) => setNote(l.item.id, e.target.value)} />
              </div>
            ))}
            {!lines.length && <div className="muted small">ตะกร้าว่าง</div>}
            <div className="tiny faint mt">ยังไม่ต้องชำระตอนนี้ ยอดจะรวมไว้ในบิลของโต๊ะ ชำระที่เคาน์เตอร์ตอนกลับ</div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** หน้าตาจำลองระหว่างโหลดเมนู: หัวร้านจริง + กล่องเทาแทนเมนู */
function MenuSkeleton({ tableNo }) {
  return (
    <div className="cust-page">
      <div className="cust-top">
        <div className="cust-top-inner">
          <img className="brand-logo" src="/logo-mark.png" alt="" />
          <div className="grow">
            <div className="cust-brand">บ้านน้องโฟค หมูกระทะ</div>
            <div className="tiny faint">โต๊ะ {tableNo}</div>
          </div>
        </div>
      </div>
      <div className="cust-shell">
        <div className="content stack">
          <Sk h={50} r={10} />
          <Sk h={40} r={8} />
          <div className="row">{[64, 80, 104, 84].map((w, i) => <Sk key={i} w={w} h={34} r={17} />)}</div>
          <SkeletonCards kind="menu" count={6} label="กำลังโหลดเมนู…" />
        </div>
      </div>
    </div>
  );
}
