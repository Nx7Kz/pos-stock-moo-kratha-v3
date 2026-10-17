import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import QR from 'qrcode';
import JsBarcode from 'jsbarcode';

/* ------------------------------------------------------------------ toast */
const ToastCtx = createContext(() => {});
let toastSeq = 0;
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((message, kind = 'info') => {
    const id = ++toastSeq;
    setItems((xs) => [...xs, { id, message, kind }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === 'err' ? 5200 : 3200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------------ modal */
/** กดพื้นหลังมืดรอบหน้าต่าง (ไม่ใช่ตัวหน้าต่าง) เพื่อปิด — แป้นพิมพ์ใช้ Esc แทน */
function useBackdropClose(ref, onClose) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onDown = (e) => e.target === el && onClose?.();
    el.addEventListener('mousedown', onDown);
    return () => el.removeEventListener('mousedown', onDown);
  });
}

export function Modal({ title, onClose, children, footer, wide }) {
  const overlay = useRef(null);
  useBackdropClose(overlay, onClose);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" ref={overlay}>
      <div className={`modal${wide ? ' wide' : ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="x-btn" onClick={onClose} aria-label="ปิด">&times;</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- confirm */
// หน้าต่างยืนยันของระบบ ใช้แทน window.confirm() ของเบราว์เซอร์
// const confirm = useConfirm();  if (!(await confirm({ title, message, confirmLabel, danger }))) return;
const ConfirmCtx = createContext(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);   // { title, message, confirmLabel, cancelLabel, danger, resolve }

  const ask = useCallback((opts) => new Promise((resolve) => setReq({ ...opts, resolve })), []);
  const answer = (ok) => { req.resolve(ok); setReq(null); };
  const overlay = useRef(null);
  useBackdropClose(overlay, () => answer(false));

  useEffect(() => {
    if (!req) return;
    // จับ Esc ก่อนหน้าต่างอื่นที่เปิดอยู่ข้างใต้ จะได้ปิดแค่กล่องยืนยัน
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      answer(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {req && (
        <div className="overlay confirm-overlay" ref={overlay}>
          <div className="modal confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="modal-body">
              <div className={`confirm-icon${req.danger ? ' danger' : ''}`} aria-hidden="true">{req.danger ? '!' : '?'}</div>
              <h3 id="confirm-title" className="confirm-title">{req.title}</h3>
              {req.message && <div className="confirm-msg">{req.message}</div>}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => answer(false)}>{req.cancelLabel || 'ยกเลิก'}</button>
              <button autoFocus className={`btn ${req.danger ? 'btn-danger-solid' : 'btn-accent'}`} onClick={() => answer(true)}>
                {req.confirmLabel || 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

/* --------------------------------------------------------------- QR image */
export function QrImage({ payload, size = 240 }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!payload) return;
    QR.toDataURL(payload, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [payload, size]);

  if (!src) return <div className="empty" style={{ width: size, height: size }}>กำลังสร้าง QR…</div>;
  return <img src={src} alt="QR พร้อมเพย์" style={{ width: size, height: size }} />;
}

/* ----------------------------------------------------------------- barcode */
/**
 * บาร์โค้ด Code128 สำหรับยิงด้วยเครื่องสแกน
 * วาดเป็น data URL แทนการใส่ลง <svg> ตรง ๆ เพราะตอนสั่งพิมพ์เราก๊อปโหนดไปพิมพ์ (cloneNode)
 * ซึ่งก๊อป <canvas> ไปแล้วจะได้ผืนว่าง แต่ <img> ติดไปทั้งรูป
 */
export function BarcodeImage({ value, width = 2, height = 50 }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    if (!value) return setSrc('');
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, String(value), {
        format: 'CODE128', width, height, margin: 0,
        displayValue: false,   // เลขที่บิลพิมพ์เป็นข้อความไทยอยู่ใต้บาร์โค้ดแล้ว
      });
      setSrc(canvas.toDataURL('image/png'));
    } catch {
      setSrc('');   // ค่าที่ Code128 เข้ารหัสไม่ได้ -> ไม่ต้องแสดงบาร์โค้ด ใบยังใช้ได้ปกติ
    }
  }, [value, width, height]);

  if (!src) return null;
  return <img className="barcode" src={src} alt={`บาร์โค้ด ${value}`} />;
}

/* ---------------------------------------------------------------- helpers */
export function Empty({ icon = '🍽️', children }) {
  return (
    <div className="empty">
      <div className="empty-big">{icon}</div>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- skeleton */
// กล่องเทาจำลองหน้าตาระหว่างโหลดข้อมูล (แทนข้อความ "กำลังโหลด…")
// label ใช้เป็นข้อความสำหรับโปรแกรมอ่านหน้าจอ
export function Sk({ w = '100%', h = 12, r, style, className = '' }) {
  // h = null -> ให้ CSS กำหนดความสูงเอง (เช่นช่องรูปที่ใช้ aspect-ratio)
  return <span className={`sk ${className}`} style={{ width: w, ...(h === null ? {} : { height: h }), borderRadius: r, ...style }} />;
}

/** แบบทั่วไป: การ์ดที่มีหัวข้อ + บรรทัดข้อความ */
export function Spinner({ label = 'กำลังโหลด…', lines = 5 }) {
  return (
    <output className="sk-wrap" aria-label={label}>
      <div className="card sk-card">
        <Sk w="38%" h={16} />
        {Array.from({ length: lines }, (_, i) => <Sk key={i} w={`${92 - ((i * 17) % 35)}%`} />)}
      </div>
    </output>
  );
}

/** แถวตัวเลขสรุปด้านบนหน้า */
export function SkeletonStats({ count = 4 }) {
  return (
    <div className="stats" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="stat"><Sk w="45%" h={11} /><Sk w="35%" h={24} style={{ margin: '8px 0 6px' }} /><Sk w="60%" h={10} /></div>
      ))}
    </div>
  );
}

/** ตาราง: หัวตาราง + แถวข้อมูล */
export function SkeletonTable({ rows = 8, cols = 6, label = 'กำลังโหลดข้อมูล…' }) {
  return (
    <output className="card sk-table" aria-label={label}>
      <div className="sk-row sk-head">{Array.from({ length: cols }, (_, c) => <Sk key={c} w={c === 1 ? '28%' : '10%'} h={10} />)}</div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="sk-row">
          {Array.from({ length: cols }, (_, c) => <Sk key={c} w={c === 1 ? `${22 + ((r * 7) % 14)}%` : '9%'} h={c === 1 ? 13 : 11} />)}
        </div>
      ))}
    </output>
  );
}

/** การ์ดโครงร่าง 1 ใบตามชนิด */
function SkeletonCard({ kind, index }) {
  if (kind === 'table') {
    return (
      <div className="sk-tcard">
        <div className="row-between"><Sk w={46} h={20} /><Sk w={54} h={20} r={12} /></div>
        <Sk w={50} h={10} />
        <Sk w="60%" h={10} style={{ marginTop: 'auto' }} />
      </div>
    );
  }
  if (kind === 'ticket') {
    return (
      <div className="sk-tcard" style={{ minHeight: 190 }}>
        <div className="row-between"><Sk w={70} h={22} /><Sk w={48} h={16} /></div>
        {Array.from({ length: 3 + (index % 2) }, (_, j) => <Sk key={j} h={38} r={8} />)}
      </div>
    );
  }
  return (
    <div className="sk-mcard">
      <Sk h={null} r={0} className="sk-thumb" />
      <div className="sk-mbody"><Sk w="75%" h={13} /><Sk w="55%" h={10} /><Sk w="35%" h={15} style={{ marginTop: 6 }} /></div>
    </div>
  );
}

/**
 * การ์ดหลายใบในตาราง grid
 * kind: 'table' = การ์ดโต๊ะในผังร้าน, 'menu' = การ์ดเมนูมีรูป, 'ticket' = ใบสั่งในหน้าจอครัว
 */
export function SkeletonCards({ kind = 'menu', count = 8, className = '', label = 'กำลังโหลด…' }) {
  const grid = { table: 'floor-grid', menu: 'menu-grid', ticket: 'k-grid' }[kind];
  return (
    <output className={`${grid} ${className}`} aria-label={label}>
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} kind={kind} index={i} />)}
    </output>
  );
}

/** เรียก API แล้วคืน { data, loading, error, reload } */
export function useApi(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const alive = useRef(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    alive.current = true;
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((d) => alive.current && setState({ data: d, loading: false, error: null }))
      .catch((e) => alive.current && setState({ data: null, loading: false, error: e }));
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
