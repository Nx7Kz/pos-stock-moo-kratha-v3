import { useState, useEffect } from 'react';
import Icon from './Icon';
import { currentTheme, setTheme as applyTheme, onSystemThemeChange } from '../lib/theme';

/** ปุ่มสลับโหมดสว่าง / มืด */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme);
  useEffect(() => onSystemThemeChange(() => setTheme(currentTheme())), []);

  const next = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? 'เปลี่ยนเป็นโหมดมืด' : 'เปลี่ยนเป็นโหมดสว่าง';
  return (
    <button className="btn btn-sm theme-btn" onClick={() => { applyTheme(next); setTheme(next); }}
      title={label} aria-label={label}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
    </button>
  );
}
