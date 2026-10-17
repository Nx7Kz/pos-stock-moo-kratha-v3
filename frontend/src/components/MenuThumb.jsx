import { useState } from 'react';
import Icon from './Icon';

/** หมวดเมนู -> ไอคอนที่แสดงแทนรูป */
const CAT_ICON = { BBQ: 'grill', SNACK: 'snack', DRINK: 'drink', ICE: 'ice' };

/**
 * ช่องรูปของการ์ดเมนู: มีรูปแสดงรูป ไม่มีรูป (หรือโหลดรูปไม่ได้) แสดงไอคอนหมวดบนพื้นสีอ่อน
 */
export default function MenuThumb({ item, className = '' }) {
  const [broken, setBroken] = useState(false);
  const cat = item.category_code || 'OTHER';
  return (
    <div className={`menu-thumb cat-${cat.toLowerCase()} ${className}`}>
      {item.image_url && !broken ? (
        <img src={item.image_url} alt={item.name_th} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Icon name={CAT_ICON[cat] || 'menu'} size={34} className="icon menu-thumb-icon" />
      )}
    </div>
  );
}
