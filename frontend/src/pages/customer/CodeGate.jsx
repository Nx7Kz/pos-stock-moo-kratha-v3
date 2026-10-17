import { useState } from 'react';

/**
 * หน้ากรอกรหัสโต๊ะ 4 หลัก — แสดงเมื่อลูกค้าสแกน QR ติดโต๊ะ (ไม่มีรหัสในลิงก์)
 * หรือรหัสเดิมใช้ไม่ได้แล้ว (ปิดบิลไปแล้ว / พนักงานเปลี่ยนรหัส)
 */
export default function CodeGate({ tableNo, problem, onSubmit, onRetry }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const notOpen = problem?.reason === 'TABLE_NOT_OPEN';
  const locked = problem?.reason === 'TOO_MANY_TRIES';
  const showError = problem && problem.reason !== 'CODE_REQUIRED' && !notOpen;

  async function submit(e) {
    e.preventDefault();
    if (code.length !== 4) return;
    setBusy(true);
    try {
      await onSubmit(code);
    } finally {
      setBusy(false);
      setCode('');
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-head">
          <img className="login-logo-img" src="/logo.jpg" alt="บ้านน้องโฟค" style={{ width: 120 }} />
          <h1>ร้านย่างให้หมูกระทะ บ้านน้องโฟค</h1>
          <p className="bold" style={{ fontSize: 24, color: '#fff', marginTop: 10, fontFamily: 'var(--font-head)' }}>โต๊ะ {tableNo}</p>
        </div>

        <div className="card">
          <div className="card-body stack">
            {notOpen ? (
              <>
                <div className="alert alert-warn">
                  <span>🪑</span>
                  <div>โต๊ะนี้ยังไม่ได้เปิด กรุณาแจ้งพนักงานเพื่อเปิดโต๊ะ แล้วรับรหัส 4 หลัก</div>
                </div>
                <button className="btn btn-block" onClick={onRetry}>ลองใหม่อีกครั้ง</button>
              </>
            ) : (
              <form className="stack" onSubmit={submit}>
                <div className="field">
                  <label htmlFor="table-code">กรอกรหัสโต๊ะ 4 หลักที่ได้จากพนักงาน</label>
                  <input id="table-code" className="input code-input" inputMode="numeric" autoComplete="one-time-code"
                    maxLength={4} value={code} autoFocus disabled={locked}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                </div>
                {showError && (
                  <div className="alert alert-danger"><span>⚠</span><span>{problem.message}</span></div>
                )}
                <button className="btn btn-accent btn-block btn-lg" disabled={busy || locked || code.length !== 4}>
                  {busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่เมนู'}
                </button>
                <div className="tiny faint center">รหัสอยู่บนใบ QR ที่พนักงานให้ตอนเปิดโต๊ะ</div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
