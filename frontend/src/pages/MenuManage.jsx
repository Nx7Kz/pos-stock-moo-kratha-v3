import { useState, useEffect } from 'react';
import { api, auth } from '../lib/api';
import { TopBar } from '../components/Layout';
import { Modal, useToast, Spinner, SkeletonTable, Empty } from '../components/ui';
import { baht, qty as fmtQty, GROUP_LABEL } from '../lib/format';
import MenuThumb from '../components/MenuThumb';
import { resizeImage } from '../lib/image';

export default function MenuManage() {
  const toast = useToast();
  const isOwner = auth.user?.role === 'OWNER';

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cat, setCat] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [m, c] = await Promise.all([api.get('/menu?with_stock=true'), api.get('/menu/categories')]);
      setItems(m.data);
      setCategories(c.data);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const q = search.trim().toLowerCase();
  const shown = items.filter(
    (m) => (cat === 'ALL' || m.category_code === cat) && (!q || m.name_th.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q))
  );

  return (
    <>
      <TopBar title="จัดการเมนูอาหาร" sub="ราคาขาย สถานะการขาย และสูตรอาหาร (BOM) ที่ใช้ตัดสต็อก">
        {isOwner && <button className="btn btn-accent" onClick={() => setCreating(true)}>+ เพิ่มเมนูใหม่</button>}
      </TopBar>

      <div className="content stack">
        <div className="row wrap">
          <input className="input" style={{ maxWidth: 260 }} placeholder="ค้นหาเมนู…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="cat-tabs" style={{ margin: 0 }}>
            <button className={`cat-tab${cat === 'ALL' ? ' active' : ''}`} onClick={() => setCat('ALL')}>
              ทั้งหมด ({items.length})
            </button>
            {categories.map((c) => (
              <button key={c.id} className={`cat-tab${cat === c.code ? ' active' : ''}`} onClick={() => setCat(c.code)}>
                {c.name_th} ({c.item_count})
              </button>
            ))}
          </div>
        </div>

        {loading ? <SkeletonTable rows={10} cols={8} label="กำลังโหลดเมนู…" /> : (
          <div className="card">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 64 }}>รูป</th><th>รหัส</th><th>ชื่อเมนู</th><th>หมวดหมู่</th>
                    <th className="num">ราคาขาย</th><th className="num">สูตร BOM</th>
                    <th className="num">ทำได้สูงสุด</th><th>สถานะ</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((m) => (
                    <tr key={m.id}>
                      <td><MenuThumb item={m} className="tbl-thumb" /></td>
                      <td className="tiny faint">{m.sku}</td>
                      <td>
                        <div className="bold">{m.name_th}</div>
                        {m.description && <div className="tiny faint">{m.description}</div>}
                      </td>
                      <td className="small muted">{m.category_name}</td>
                      <td className="num bold">{baht(m.price)}</td>
                      <td className="num small">
                        {m.recipe_count > 0
                          ? <span className="muted">{m.recipe_count} วัตถุดิบ</span>
                          : <span className="pill pill-billing">ยังไม่มีสูตร</span>}
                      </td>
                      <td className="num">
                        {m.max_servable === null ? <span className="faint tiny">—</span>
                          : m.max_servable <= 0 ? <span className="pill pill-danger">วัตถุดิบหมด</span>
                          : <span className={m.max_servable <= 5 ? 'bold' : ''}
                              style={m.max_servable <= 5 ? { color: 'var(--billing)' } : undefined}>{m.max_servable}</span>}
                      </td>
                      <td>
                        <span className={`pill ${m.is_available ? 'pill-free' : 'pill-muted'}`}>
                          {m.is_available ? 'เปิดขาย' : 'ปิดขาย'}
                        </span>
                      </td>
                      <td><button className="btn btn-sm" onClick={() => setDetail(m.id)}>ดูสูตร</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!shown.length && <Empty icon="🔍">ไม่พบเมนูที่ค้นหา</Empty>}
            </div>
          </div>
        )}
      </div>

      {detail && <RecipeModal id={detail} isOwner={isOwner} onClose={() => setDetail(null)} onSaved={() => { setDetail(null); load(); }}
        onImageChanged={(row) => setItems((xs) => xs.map((x) => (x.id === row.id ? { ...x, image_url: row.image_url } : x)))} />}
      {creating && <CreateMenuModal categories={categories} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}
    </>
  );
}

/* ------------------------------------------- ดู/แก้สูตรอาหาร BOM ของเมนู */
function RecipeModal({ id, isOwner, onClose, onSaved, onImageChanged }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [lines, setLines] = useState([]);
  const [price, setPrice] = useState('');
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.get(`/menu/${id}`), api.get('/ingredients')])
      .then(([m, ing]) => {
        setData(m.data);
        setPrice(String(m.data.price));
        setAvailable(m.data.is_available);
        setLines(m.data.recipe.map((r) => ({ ingredient_id: String(r.ingredient_id), qty_per_unit: String(r.qty_per_unit) })));
        setIngredients(ing.data);
      })
      .catch((e) => toast(e.message, 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const foodCost = lines.reduce((s, l) => {
    const ing = ingredients.find((x) => x.id === Number(l.ingredient_id));
    return s + (Number(l.qty_per_unit) || 0) * Number(ing?.cost_per_unit || 0);
  }, 0);

  async function save() {
    // ช่องราคาว่างห้ามถูกนับเป็น 0 บาท
    if (String(price).trim() === '' || !Number.isFinite(Number(price)) || Number(price) < 0) {
      return toast('กรอกราคาขายเป็นตัวเลข 0 ขึ้นไป', 'err');
    }
    setBusy(true);
    try {
      // ราคา + สถานะขาย + สูตร ส่งไปพร้อมกัน บันทึกทั้งหมดหรือไม่บันทึกเลย (ไม่ค้างครึ่งเดียว)
      await api.put(`/menu/${id}/recipe`, {
        price: Number(price),
        is_available: available,
        recipe: lines
          .filter((l) => l.ingredient_id && Number(l.qty_per_unit) > 0)
          .map((l) => ({ ingredient_id: Number(l.ingredient_id), qty_per_unit: Number(l.qty_per_unit) })),
      });
      toast('บันทึกเมนูและสูตรอาหารเรียบร้อย', 'ok');
      onSaved();
    } catch (e) {
      toast(e.message, 'err');
      setBusy(false);
    }
  }

  if (!data) return <Modal title="สูตรอาหาร" onClose={onClose}><Spinner /></Modal>;

  const margin = (Number(price) || 0) - foodCost;
  const marginPct = Number(price) > 0 ? (margin / Number(price)) * 100 : 0;

  return (
    <Modal
      wide
      title={`${data.name_th} · สูตรอาหาร (BOM)`}
      onClose={onClose}
      footer={
        isOwner ? (
          <>
            <button className="btn" onClick={onClose} disabled={busy}>ปิด</button>
            <button className="btn btn-accent" onClick={save} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          </>
        ) : <button className="btn" onClick={onClose}>ปิด</button>
      }
    >
      <div className="stack">
        <MenuImageEditor item={data} isOwner={isOwner}
          onChanged={(row) => { setData((d) => ({ ...d, image_url: row.image_url })); onImageChanged?.(row); }} />

        <div className="alert alert-info">
          <span>ℹ</span>
          <div>ทุกครั้งที่ขายเมนูนี้ 1 {data.unit} ระบบจะตัดวัตถุดิบตามสูตรด้านล่างออกจากคลังทันที</div>
        </div>

        <div className="grid-3">
          <div className="field">
            <label>ราคาขาย (บาท)</label>
            <input className="input" type="number" min="0" step="1" value={price}
              onChange={(e) => setPrice(e.target.value)} disabled={!isOwner} />
          </div>
          <div className="stat" style={{ boxShadow: 'none' }}>
            <div className="stat-label">ต้นทุนวัตถุดิบ</div>
            <div className="stat-value sm">{baht(foodCost)}</div>
          </div>
          <div className="stat" style={{ boxShadow: 'none' }}>
            <div className="stat-label">กำไรต่อ{data.unit}</div>
            <div className="stat-value sm" style={{ color: margin >= 0 ? 'var(--free)' : 'var(--danger)' }}>
              {baht(margin)}
            </div>
            <div className="stat-note">{marginPct.toFixed(1)}% ของราคาขาย</div>
          </div>
        </div>

        <label className="row" style={{ gap: 7 }}>
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} disabled={!isOwner} />
          <span className="small">เปิดขายเมนูนี้</span>
        </label>

        <div className="stack-sm">
          <label className="bold small">วัตถุดิบที่ใช้ (ต่อ 1 {data.unit})</label>
          {lines.map((l, i) => {
            const ing = ingredients.find((x) => x.id === Number(l.ingredient_id));
            return (
              <div key={i} className="row">
                <select className="select grow" value={l.ingredient_id} disabled={!isOwner}
                  onChange={(e) => setLine(i, { ingredient_id: e.target.value })}>
                  <option value="">— เลือกวัตถุดิบ —</option>
                  {ingredients.map((r) => (
                    <option key={r.id} value={r.id}>{GROUP_LABEL[r.grp]} · {r.name_th}</option>
                  ))}
                </select>
                <input className="input" style={{ width: 100 }} type="number" min="0" step="0.0001" disabled={!isOwner}
                  value={l.qty_per_unit} onChange={(e) => setLine(i, { qty_per_unit: e.target.value })} />
                <span className="tiny faint" style={{ width: 40 }}>{ing?.unit ?? ''}</span>
                <span className="tiny faint num" style={{ width: 62, textAlign: 'right' }}>
                  {ing ? baht((Number(l.qty_per_unit) || 0) * Number(ing.cost_per_unit)) : ''}
                </span>
                {isOwner && (
                  <button className="btn btn-sm btn-danger" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>×</button>
                )}
              </div>
            );
          })}
          {!lines.length && <div className="muted small">ยังไม่มีสูตร — เมนูนี้จะไม่ตัดสต็อกเมื่อขาย</div>}
          {isOwner && (
            <button className="btn btn-sm" onClick={() => setLines((ls) => [...ls, { ingredient_id: '', qty_per_unit: '' }])}>
              + เพิ่มวัตถุดิบ
            </button>
          )}
        </div>

        {data.recipe.length > 0 && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>วัตถุดิบที่ใช้</th><th className="num">ใช้ต่อหน่วย</th><th className="num">คงเหลือในคลัง</th></tr></thead>
              <tbody>
                {data.recipe.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name_th}</td>
                    <td className="num">{fmtQty(r.qty_per_unit)} {r.unit}</td>
                    <td className="num">
                      {fmtQty(r.qty_on_hand)} {r.unit}
                      {Number(r.qty_on_hand) <= Number(r.min_qty) && <span className="pill pill-danger" style={{ marginLeft: 6 }}>ใกล้หมด</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------- เพิ่มเมนูใหม่ */
function CreateMenuModal({ categories, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ sku: '', name_th: '', category_code: 'BBQ', price: '', unit: 'จาน', description: '' });
  const [image, setImage] = useState(null);   // data URL ของรูปที่ย่อแล้ว รอส่งตอนกดบันทึก
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((v) => ({ ...v, ...patch }));

  async function save() {
    if (!f.sku || !f.name_th || f.price === '') return toast('กรอก รหัส ชื่อเมนู และราคาให้ครบ', 'err');
    setBusy(true);
    try {
      const r = await api.post('/menu', { ...f, price: Number(f.price) });
      if (image) {
        try {
          await api.post(`/menu/${r.data.id}/image`, { data: image });
        } catch (e) {
          // เมนูสร้างแล้ว แค่รูปไม่ผ่าน -> ใส่รูปใหม่ได้ภายหลังจากปุ่ม "ดูสูตร"
          toast(`เพิ่มเมนูแล้ว แต่อัปโหลดรูปไม่สำเร็จ: ${e.message}`, 'err');
          return onDone();
        }
      }
      toast('เพิ่มเมนูเรียบร้อย — อย่าลืมกำหนดสูตร BOM', 'ok');
      onDone();
    } catch (e) {
      toast(e.message, 'err');
      setBusy(false);
    }
  }

  async function pickImage(file) {
    if (!file) return;
    try {
      setImage(await resizeImage(file));   // ย่อรูปไว้ก่อน ส่งจริงตอนกดบันทึก
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  return (
    <Modal
      title="เพิ่มเมนูใหม่"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button className="btn btn-accent" onClick={save} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </>
      }
    >
      <div className="stack">
        <div className="img-editor">
          <MenuThumb item={{ image_url: image, category_code: f.category_code, name_th: f.name_th }}
            key={image || f.category_code} className="img-editor-thumb" />
          <div className="stack-sm">
            <div className="bold small">รูปเมนู <span className="faint">(ไม่บังคับ)</span></div>
            <div className="tiny faint">{image ? 'รูปนี้จะบันทึกพร้อมเมนู' : 'ยังไม่มีรูป — จะแสดงไอคอนหมวดแทน'}</div>
            <div className="row wrap">
              <label className={`btn btn-sm${busy ? ' disabled' : ''}`}>
                {image ? 'เปลี่ยนรูป' : 'ใส่รูป'}
                <input type="file" accept="image/*" hidden disabled={busy}
                  onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {image && <button className="btn btn-sm btn-danger" onClick={() => setImage(null)} disabled={busy}>เอารูปออก</button>}
            </div>
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label>รหัสเมนู (SKU)</label>
            <input className="input" value={f.sku} onChange={(e) => set({ sku: e.target.value })} placeholder="MN-B20" />
          </div>
          <div className="field">
            <label>หมวดหมู่</label>
            <select className="select" value={f.category_code} onChange={(e) => set({ category_code: e.target.value })}>
              {categories.map((c) => <option key={c.id} value={c.code}>{c.name_th}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>ชื่อเมนู</label>
          <input className="input" value={f.name_th} onChange={(e) => set({ name_th: e.target.value })} />
        </div>
        <div className="field">
          <label>คำอธิบาย</label>
          <input className="input" value={f.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>ราคาขาย (บาท)</label>
            <input className="input" type="number" min="0" value={f.price} onChange={(e) => set({ price: e.target.value })} />
          </div>
          <div className="field">
            <label>หน่วย</label>
            <input className="input" value={f.unit} onChange={(e) => set({ unit: e.target.value })} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------ รูปเมนู: ใส่ / เปลี่ยน / ลบ */
function MenuImageEditor({ item, isOwner, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    try {
      const data = await resizeImage(file);   // ย่อก่อนส่ง รูปจากมือถือจะได้ไม่หนัก
      const r = await api.post(`/menu/${item.id}/image`, { data });
      toast(r.message, 'ok');
      onChanged(r.data);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const r = await api.del(`/menu/${item.id}/image`);
      toast(r.message, 'ok');
      onChanged(r.data);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="img-editor">
      <MenuThumb item={item} key={item.image_url || 'none'} className="img-editor-thumb" />
      <div className="stack-sm">
        <div className="bold small">รูปเมนู</div>
        <div className="tiny faint">
          {item.image_url ? 'ลูกค้าจะเห็นรูปนี้ในหน้าเมนู' : 'ยังไม่มีรูป — ตอนนี้แสดงไอคอนหมวดแทน'}
          {item.image_url?.startsWith('/media/samples/') && ' (รูปตัวอย่าง)'}
        </div>
        {isOwner && (
          <div className="row wrap">
            <label className={`btn btn-sm${busy ? ' disabled' : ''}`}>
              {busy ? 'กำลังอัปโหลด…' : item.image_url ? 'เปลี่ยนรูป' : 'ใส่รูป'}
              <input type="file" accept="image/*" hidden disabled={busy}
                onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {item.image_url && (
              <button className="btn btn-sm btn-danger" onClick={remove} disabled={busy}>ลบรูป</button>
            )}
          </div>
        )}
        {isOwner && <div className="tiny faint">ถ่ายจากมือถือได้เลย ระบบย่อรูปให้อัตโนมัติ</div>}
      </div>
    </div>
  );
}
