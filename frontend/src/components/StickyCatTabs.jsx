import { useRef, useState, useLayoutEffect } from 'react';

/**
 * แถบหมวดหมู่ที่ติดขอบบนเวลาเลื่อนดูเมนู
 * ติดอยู่ใต้แถบหัวหน้าจอ (.topbar ของพนักงาน / .cust-top ของลูกค้า) วัดความสูงจริง เผื่อหัวตัดบรรทัดบนมือถือ
 */
export default function StickyCatTabs({ categories, cat, onChange }) {
  const ref = useRef(null);
  const [top, setTop] = useState(0);

  useLayoutEffect(() => {
    const head = document.querySelector('.cust-top, .topbar');
    if (!head) return;
    const measure = () => setTop(head.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(head);
    return () => ro.disconnect();
  }, []);

  function pick(code, btn) {
    onChange(code);
    btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    // เลื่อนลงไปในรายการแล้วค่อยเปลี่ยนหมวด -> พากลับไปรายการแรกของหมวดใหม่ ไม่ต้องเลื่อนขึ้นเอง
    requestAnimationFrame(() => {
      const el = ref.current;
      const list = el?.nextElementSibling;
      if (!list) return;
      const gap = list.getBoundingClientRect().top - el.getBoundingClientRect().bottom;
      if (gap < 0) window.scrollTo({ top: Math.max(0, window.scrollY + gap - 8) });
    });
  }

  const tab = (code, label) => (
    <button key={code} className={`cat-tab${cat === code ? ' active' : ''}`} onClick={(e) => pick(code, e.currentTarget)}>
      {label}
    </button>
  );

  return (
    <div ref={ref} className="cat-tabs sticky" style={{ top }}>
      {tab('ALL', 'ทั้งหมด')}
      {categories.map((c) => tab(c.code, c.name_th))}
    </div>
  );
}
