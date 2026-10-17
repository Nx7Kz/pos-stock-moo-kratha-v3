import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { TopBar } from '../components/Layout';
import BillScanBox from '../components/BillScanBox';
import { Modal, useToast, SkeletonCards, SkeletonStats } from '../components/ui';
import CustomerQrModal from '../components/CustomerQrModal';
import { baht, num, since, TABLE_STATUS } from '../lib/format';
import { playAlert } from '../lib/alertSound';
import SoundSwitch from '../components/SoundSwitch';

export default function FloorPlan() {
  const nav = useNavigate();
  const toast = useToast();
  const [tables, setTables] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(null);   // โต๊ะที่กำลังจะเปิดบิล
  const [guests, setGuests] = useState(2);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null);     // บิลที่เพิ่งเปิด รอให้ลูกค้าสแกน QR
  const lastNew = useRef(null);                     // order_id -> จำนวนออเดอร์ใหม่ รอบที่แล้ว

  async function load() {
    try {
      const r = await api.get('/tables');
      // ลูกค้าสั่งอาหารเพิ่มผ่านมือถือ (ออเดอร์ใหม่มากกว่ารอบที่แล้ว) -> เสียงเตือน
      if (lastNew.current && r.data.some((t) => t.new_items > (lastNew.current.get(t.order_id) ?? 0))) {
        playAlert();
      }
      lastNew.current = new Map(r.data.filter((t) => t.order_id).map((t) => [t.order_id, t.new_items]));
      setTables(r.data);
      setSummary(r.summary);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  }

  // รีเฟรชผังอัตโนมัติทุก 5 วินาที ให้เห็นออเดอร์ใหม่จากลูกค้าเกือบทันที
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clickTable(t) {
    if (t.order_id) nav(`/order/${t.order_id}`);
    else { setOpening(t); setGuests(t.seats); }
  }

  async function openBill() {
    setBusy(true);
    try {
      const r = await api.post('/orders', { table_id: opening.id, guest_count: guests });
      toast(`เปิดโต๊ะ ${opening.table_no} แล้ว · รหัส ${r.order.access_code}`, 'ok');
      setOpening(null);
      setIssued(r.order);   // โชว์ QR + รหัสให้ลูกค้าสแกนสั่งอาหารเอง
      load();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  const shown = filter === 'ALL' ? tables : tables.filter((t) => t.status === filter);

  // แบ่งโต๊ะตามโซน เรียงโซนตามลำดับโต๊ะแรกของโซนนั้น (ในร้าน -> นอกร้าน -> ระเบียง)
  const zones = [];
  for (const t of tables) {
    let z = zones.find((x) => x.name === t.zone);
    if (!z) zones.push((z = { name: t.zone, all: [], shown: [] }));
    z.all.push(t);
    if (shown.includes(t)) z.shown.push(t);
  }
  const countIn = (list, status) => list.filter((t) => t.status === status).length;

  // โต๊ะที่เช็คบิลแล้ว เรียงตามลำดับที่กดเช็คบิล (รอก่อนได้ก่อน)
  const billing = tables
    .filter((t) => t.status === 'BILLING' && t.order_id)
    .sort((a, b) => new Date(a.billing_at ?? a.opened_at) - new Date(b.billing_at ?? b.opened_at));

  return (
    <>
      <TopBar title="ผังร้านค้า" sub="สถานะโต๊ะทั้ง 20 โต๊ะ · อัปเดตอัตโนมัติทุก 5 วินาที">
        <BillScanBox />
        <SoundSwitch />
        <button className="btn" onClick={load}>รีเฟรช</button>
      </TopBar>

      <div className="content stack">
        {billing.length > 0 && (
          <div className="billing-strip">
            <div className="bs-title">🧾 รอชำระเงิน {billing.length} โต๊ะ</div>
            <div className="bs-list">
              {billing.map((t) => (
                <button key={t.id} className="bs-item" onClick={() => nav(`/payment/${t.order_id}`)}
                  title="ไปหน้ารับชำระเงินของโต๊ะนี้">
                  <span className="bs-table">{t.table_no}</span>
                  <span className="bs-amount">{baht(t.current_total)} ฿</span>
                  <span className="bs-wait">{waitLabel(t.billing_at ?? t.opened_at)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!summary && loading && <SkeletonStats />}
        {summary && (
          <div className="stats">
            <Stat label="โต๊ะว่าง" value={summary.FREE} note={`จากทั้งหมด ${summary.total} โต๊ะ`} />
            <Stat label="กำลังใช้งาน" value={summary.OCCUPIED} note="กำลังรับประทาน" />
            <Stat label="รอชำระเงิน" value={summary.BILLING} note="เรียกเช็คบิลแล้ว" />
            <Stat label="ยอดค้างชำระ" value={`${baht(summary.open_amount)} ฿`} small note="รวมทุกโต๊ะที่เปิดอยู่" />
          </div>
        )}

        <div className="row wrap">
          {[
            ['ALL', `ทั้งหมด (${tables.length})`],
            ['FREE', `ว่าง (${summary?.FREE ?? 0})`],
            ['OCCUPIED', `กำลังใช้งาน (${summary?.OCCUPIED ?? 0})`],
            ['BILLING', `รอชำระเงิน (${summary?.BILLING ?? 0})`],
          ].map(([k, label]) => (
            <button key={k} className={`cat-tab${filter === k ? ' active' : ''}`} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonCards kind="table" count={10} label="กำลังโหลดผังโต๊ะ…" />
        ) : (
          zones.filter((z) => z.shown.length).map((z) => (
            <section key={z.name} className="zone">
              <div className="zone-head">
                <h2>{z.name}</h2>
                <span className="zone-count">
                  <span className="zc zc-free">ว่าง {countIn(z.all, 'FREE')}</span>
                  <span className="zc zc-busy">ใช้งาน {countIn(z.all, 'OCCUPIED')}</span>
                  <span className="zc zc-billing">รอชำระ {countIn(z.all, 'BILLING')}</span>
                </span>
              </div>
              <div className="floor-grid">
                {z.shown.map((t) => {
                  const st = TABLE_STATUS[t.status];
                  return (
                    <button key={t.id} className={`table-card ${st.card}${t.new_items > 0 ? ' has-new' : ''}`}
                      onClick={() => clickTable(t)}>
                      <div className="table-head">
                        <div>
                          <div className="table-no">{t.table_no}</div>
                          <div className="table-zone">{t.seats} ที่นั่ง</div>
                        </div>
                        <span className={`pill ${st.cls}`}><i className="dot" />{st.label}</span>
                      </div>

                      {t.new_items > 0 && (
                        <div><span className="new-badge">🔔 ออเดอร์ใหม่ {t.new_items} รายการ</span></div>
                      )}

                      <div className="table-foot">
                        {t.order_id ? (
                          <>
                            <div>
                              <div className="table-total">{baht(t.current_total)} ฿</div>
                              <div className="table-meta">{num(t.item_count)} รายการ · {t.guest_count} ท่าน</div>
                            </div>
                            <div className="table-meta">{since(t.opened_at)}</div>
                          </>
                        ) : (
                          <div className="table-meta">แตะเพื่อเปิดบิลใหม่</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
        {!loading && !shown.length && <div className="empty">ไม่มีโต๊ะในสถานะนี้</div>}
      </div>

      {opening && (
        <Modal
          title={`เปิดบิลโต๊ะ ${opening.table_no}`}
          onClose={() => !busy && setOpening(null)}
          footer={
            <>
              <button className="btn" onClick={() => setOpening(null)} disabled={busy}>ยกเลิก</button>
              <button className="btn btn-accent" onClick={openBill} disabled={busy}>
                {busy ? 'กำลังเปิดโต๊ะ…' : 'เปิดโต๊ะ + ออก QR'}
              </button>
            </>
          }
        >
          <div className="stack">
            <div className="muted small">{opening.zone} · รองรับ {opening.seats} ที่นั่ง</div>
            <div className="field">
              <label>จำนวนลูกค้า</label>
              <div className="row">
                <button className="qty-btn" onClick={() => setGuests((g) => Math.max(1, g - 1))}>−</button>
                <span className="qty-num" style={{ fontSize: 19, minWidth: 44 }}>{guests}</span>
                <button className="qty-btn" onClick={() => setGuests((g) => g + 1)}>+</button>
                <span className="muted small">ท่าน</span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {issued && (
        <CustomerQrModal
          order={issued}
          onClose={() => setIssued(null)}
          onChanged={setIssued}
          extraActions={
            <button className="btn" onClick={() => nav(`/order/${issued.id}`)}>สั่งอาหารให้ลูกค้า</button>
          }
        />
      )}
    </>
  );
}

/** เวลาที่รอจ่ายตั้งแต่กดเช็คบิล */
function waitLabel(iso) {
  return Date.now() - new Date(iso).getTime() < 60000 ? 'เพิ่งเช็คบิล' : `รอ ${since(iso)}`;
}

function Stat({ label, value, note, small }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${small ? ' sm' : ''}`}>{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}
