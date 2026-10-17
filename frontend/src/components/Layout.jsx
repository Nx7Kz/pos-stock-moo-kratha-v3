import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { api, auth } from '../lib/api';
import Icon from './Icon';
import ThemeToggle from './ThemeToggle';
import { useToast } from './ui';
import { useBarcodeScan, billRoute } from '../lib/billScan';

const NAV = [
  { section: 'ขายหน้าร้าน' },
  { to: '/', end: true, ico: 'floor', label: 'ผังร้านค้า' },
  { to: '/kitchen', ico: 'kitchen', label: 'หน้าจอครัว' },
  { to: '/orders', ico: 'receipt', label: 'บิลทั้งหมด' },
  { section: 'คลังและเมนู' },
  { to: '/stock', ico: 'stock', label: 'คลังวัตถุดิบ', badge: 'low' },
  { to: '/menu', ico: 'menu', label: 'จัดการเมนู' },
  { section: 'รายงาน' },
  { to: '/reports', ico: 'report', label: 'รายงาน' },
];

// เมนูซ้ายพับเหลือแต่ไอคอนได้ (ใช้บนแท็บเล็ต) จำค่าไว้ในเครื่อง
// ยังไม่เคยเลือกเอง -> จอแท็บเล็ต (กว้างไม่เกิน 1180px) เริ่มแบบพับ, จอคอมเริ่มแบบกาง
const COLLAPSE_KEY = 'sidebar_collapsed';
function initialCollapsed() {
  try {
    const saved = localStorage.getItem(COLLAPSE_KEY);
    if (saved !== null) return saved === '1';
  } catch { /* ไม่เป็นไร */ }
  return window.innerWidth <= 1180;
}

export default function Layout() {
  const nav = useNavigate();
  const toast = useToast();
  const user = auth.user;
  const [lowCount, setLowCount] = useState(0);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  // ยิงบาร์โค้ดเลขที่บิลที่หน้าไหนก็ได้ ไม่ต้องคลิกช่องก่อน -> เปิดใบเช็คบิลพร้อมสั่งพิมพ์
  const onScan = useCallback(async (code) => {
    try {
      const r = await api.get(`/orders/by-no/${encodeURIComponent(code)}`);
      nav(billRoute(r.data));
    } catch (e) {
      toast(`${e.message} (ยิงมา: ${code})`, 'err');
    }
  }, [nav, toast]);

  useBarcodeScan(onScan);

  function toggle() {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* ไม่เป็นไร */ }
      return !c;
    });
  }

  // ดึงจำนวนวัตถุดิบใกล้หมดมาแสดงเป็น badge และรีเฟรชทุก 60 วินาที
  useEffect(() => {
    let alive = true;
    const load = () =>
      api.get('/stock/low')
        .then((r) => alive && setLowCount(r.count))
        .catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const logout = () => { auth.clear(); nav('/login'); };

  return (
    <div className="shell">
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <img className="brand-logo" src="/logo-mark.png" alt="บ้านน้องโฟค" />
            <span className="brand-name hide-collapsed">บ้านน้องโฟค</span>
            <button className="collapse-btn" onClick={toggle}
              title={collapsed ? 'กางเมนู' : 'พับเมนู'} aria-label={collapsed ? 'กางเมนู' : 'พับเมนู'}>
              <Icon name={collapsed ? 'chevrons-right' : 'chevrons-left'} size={16} />
            </button>
          </div>
          <div className="brand-sub hide-collapsed">POS &amp; Stock · กาญจนบุรี</div>
        </div>

        <nav className="nav">
          {NAV.map((item, i) =>
            item.section ? (
              <div key={i} className="nav-label">{item.section}</div>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.end} title={collapsed ? item.label : undefined}
                className={({ isActive }) => (isActive ? 'active' : '')}>
                <span className="ico"><Icon name={item.ico} /></span>
                <span className="nav-text">{item.label}</span>
                {item.badge === 'low' && lowCount > 0 && <span className="nav-badge">{lowCount}</span>}
              </NavLink>
            )
          )}
          <div className="nav-label">ฝั่งลูกค้า</div>
          <a href="/customer/T01" target="_blank" rel="noreferrer" title={collapsed ? 'หน้าลูกค้า (ตัวอย่าง)' : undefined}>
            <span className="ico"><Icon name="phone" /></span>
            <span className="nav-text">หน้าลูกค้า (ตัวอย่าง)</span>
          </a>
        </nav>

        <div className="sidebar-foot">
          <div className="row-between">
            <div className="hide-collapsed" style={{ minWidth: 0 }}>
              <div className="who" title={user?.full_name}>{user?.full_name ?? '-'}</div>
              <div className="who-role">{user?.role === 'OWNER' ? 'เจ้าของร้าน' : 'พนักงาน'}</div>
            </div>
            <div className="foot-actions">
              <ThemeToggle />
              <button className="btn btn-sm" onClick={logout} title={collapsed ? `ออกจากระบบ (${user?.full_name ?? ''})` : undefined}>ออก</button>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}

/** แถบหัวเรื่องของแต่ละหน้า */
export function TopBar({ title, sub, children }) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {children && <div className="topbar-actions">{children}</div>}
    </header>
  );
}
