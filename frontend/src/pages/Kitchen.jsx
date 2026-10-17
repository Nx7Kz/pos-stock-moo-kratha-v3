import { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../lib/api';
import { TopBar } from '../components/Layout';
import { useToast, SkeletonCards, Empty } from '../components/ui';
import { qty as fmtQty, since } from '../lib/format';
import { playAlert } from '../lib/alertSound';
import SoundSwitch from '../components/SoundSwitch';

/** รอนานเกินกี่นาทีถึงเปลี่ยนสีใบออเดอร์ */
const WARN_MIN = 10;
const LATE_MIN = 20;

/**
 * หน้าจอครัว — รายการที่ยังไม่เสิร์ฟจากทุกโต๊ะ แยกเป็นใบตามโต๊ะ + รอบที่สั่ง
 * เปิดค้างไว้บนแท็บเล็ตในครัว หรือเปิดเป็นแท็บหนึ่งที่เคาน์เตอร์ก็ได้
 */
export default function Kitchen() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cat, setCat] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [undo, setUndo] = useState(null);          // { ids, label } ของการกดเสิร์ฟล่าสุด
  const seen = useRef(null);                       // id รายการที่เคยเห็นแล้ว ใช้ตัดสินว่ามีของใหม่
  const undoTimer = useRef(null);

  async function load() {
    try {
      const r = await api.get('/kitchen');
      if (seen.current && r.data.some((it) => !seen.current.has(it.id))) playAlert();
      seen.current = new Set([...(seen.current ?? []), ...r.data.map((it) => it.id)]);
      setItems(r.data);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    api.get('/menu/categories').then((r) => setCategories(r.data)).catch(() => {});
    const id = setInterval(load, 5000);
    return () => { clearInterval(id); clearTimeout(undoTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** รวมรายการเป็นใบออเดอร์: โต๊ะเดียวกัน + รอบเดียวกัน = ใบเดียว */
  const tickets = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      if (cat !== 'ALL' && it.category_code !== cat) continue;
      const key = `${it.order_id}-${it.round_no}`;
      if (!map.has(key)) {
        map.set(key, { key, table_no: it.table_no, zone: it.zone, round_no: it.round_no, at: it.created_at, byCustomer: false, items: [] });
      }
      const t = map.get(key);
      t.items.push(it);
      t.byCustomer ||= it.by_customer;
      if (it.created_at < t.at) t.at = it.created_at;
    }
    return [...map.values()].sort((a, b) => new Date(a.at) - new Date(b.at));
  }, [items, cat]);

  const countOf = (code) => items.filter((it) => code === 'ALL' || it.category_code === code).length;

  async function serve(ids, label) {
    // เอาออกจากจอทันที ไม่ต้องรอเซิร์ฟเวอร์ ครัวจะได้กดต่อได้เร็ว
    setItems((xs) => xs.filter((it) => !ids.includes(it.id)));
    try {
      await api.post('/kitchen/serve', { item_ids: ids });
      clearTimeout(undoTimer.current);
      setUndo({ ids, label });
      undoTimer.current = setTimeout(() => setUndo(null), 8000);
    } catch (e) {
      toast(e.message, 'err');
      load();
    }
  }

  async function undoServe() {
    if (!undo) return;
    clearTimeout(undoTimer.current);
    try {
      await api.post('/kitchen/unserve', { item_ids: undo.ids });
      setUndo(null);
      load();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const minutes = (iso) => (Date.now() - new Date(iso).getTime()) / 60000;

  return (
    <>
      <TopBar title="หน้าจอครัว" sub={`รอเสิร์ฟ ${items.length} รายการ · ${tickets.length} ใบ · อัปเดตทุก 5 วินาที`}>
        <SoundSwitch />
        <button className="btn" onClick={toggleFullscreen}>เต็มจอ</button>
      </TopBar>

      <div className="content stack">
        <div className="cat-tabs">
          <button className={`cat-tab${cat === 'ALL' ? ' active' : ''}`} onClick={() => setCat('ALL')}>
            ทั้งหมด ({countOf('ALL')})
          </button>
          {categories.map((c) => (
            <button key={c.id} className={`cat-tab${cat === c.code ? ' active' : ''}`} onClick={() => setCat(c.code)}>
              {c.name_th} ({countOf(c.code)})
            </button>
          ))}
        </div>

        {loading ? <SkeletonCards kind="ticket" count={4} label="กำลังโหลดออเดอร์…" /> : !tickets.length ? (
          <Empty icon="✅">ไม่มีรายการรอเสิร์ฟ</Empty>
        ) : (
          <div className="k-grid">
            {tickets.map((t) => {
              const m = minutes(t.at);
              const level = m >= LATE_MIN ? ' is-late' : m >= WARN_MIN ? ' is-warn' : '';
              const label = `โต๊ะ ${t.table_no} ${t.round_no === 1 ? 'รอบแรก' : `รอบที่ ${t.round_no}`}`;
              return (
                <div key={t.key} className={`k-ticket${level}`}>
                  <div className="k-head">
                    <span className="k-table">{t.table_no}</span>
                    <span className="k-round">{t.round_no === 1 ? 'รอบแรก' : `สั่งเพิ่มรอบ ${t.round_no}`}</span>
                    <span className="k-time">{since(t.at)}</span>
                  </div>
                  <div className="k-meta">
                    {t.zone}{t.byCustomer && ' · ลูกค้าสั่งผ่านมือถือ'}
                  </div>

                  <div className="k-items">
                    {t.items.map((it) => (
                      <button key={it.id} className="k-item" title="แตะเมื่อเสิร์ฟรายการนี้แล้ว"
                        onClick={() => serve([it.id], `${it.name_th} (${label})`)}>
                        <span className="k-qty">{fmtQty(it.qty)}×</span>
                        <span className="k-name">
                          {it.name_th}
                          {it.note && <span className="k-note">{it.note}</span>}
                        </span>
                        <span className="k-check">✓</span>
                      </button>
                    ))}
                  </div>

                  <button className="btn btn-accent btn-block btn-lg"
                    onClick={() => serve(t.items.map((it) => it.id), label)}>
                    เสิร์ฟครบทั้งใบ
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {undo && (
        <div className="k-undo">
          <span>✓ เสิร์ฟ {undo.label} แล้ว</span>
          <button className="btn btn-sm" onClick={undoServe}>ย้อนกลับ</button>
        </div>
      )}
    </>
  );
}
