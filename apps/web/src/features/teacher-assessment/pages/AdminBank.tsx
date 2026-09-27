import { useMemo, useState } from 'react';
import { useAdminItems } from '../api/queries';
import { useModuleSession } from '../guards/RequireModuleAccess';
import { BankTable, ItemKeyPanel } from '../components/admin/BankTable';
import { ModuleHeader } from '../components/shell/ModuleHeader';
import { DIMENSIONS, GRADE_BANDS, ITEMS_PER_ATTEMPT } from '../model/bands';
import { COPY } from '../model/copy';

export default function AdminBank() {
  const { me } = useModuleSession();
  const [band, setBand] = useState('All');
  const [dim, setDim] = useState('All');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const items = useAdminItems(band, dim);
  const all = items.data ?? [];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? all.filter((i) => (i.item_id + ' ' + i.scenario + ' ' + i.options.map((o) => o.text).join(' ')).toLowerCase().includes(s)) : all;
  }, [all, q]);
  const selected = all.find((i) => i.item_id === sel) ?? null;
  const live = all.filter((i) => i.active).length;

  function exportJson() {
    const blob = new Blob([JSON.stringify(rows, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'teacher-assessment-items.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="ta">
      <ModuleHeader mode={COPY.modeAdmin} tabs="admin" me={me} />
      <main className="bankshell">
        <div className="pagehead">
          <div><h1>Question bank</h1><div className="sub">Teacher Assessment · situational judgement items · 6 grade bands × 7 dimensions</div></div>
          <div className="acts"><button className="btn ghost sm" onClick={exportJson} disabled={!rows.length}>Export JSON</button></div>
        </div>
        <div className="statrow">
          <div><b>{all.length}</b><span>items {band !== 'All' || dim !== 'All' ? 'in filter' : 'in bank'}</span></div>
          <div><b>{live}</b><span>live / servable</span></div>
          <div><b>{all.length - live}</b><span>archived</span></div>
          <div><b>{ITEMS_PER_ATTEMPT}</b><span>served per assessment</span></div>
          <div><b>4</b><span>ranked options each</span></div>
        </div>
        <div className="banksplit">
          <div>
            <div className="searchrow">
              <input className="inp" placeholder="Search scenarios, options, item IDs…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" />
              <select className="sel" value={band} onChange={(e) => setBand(e.target.value)} aria-label="Grade band">
                <option value="All">All grade bands</option>
                {GRADE_BANDS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
              <select className="sel" value={dim} onChange={(e) => setDim(e.target.value)} aria-label="Dimension">
                <option value="All">All dimensions</option>
                {DIMENSIONS.map((d) => <option key={d.id} value={d.name}>{d.short}</option>)}
              </select>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3t)' }}>{rows.length} of {all.length} shown</span>
            </div>
            {items.isPending ? <p className="loading">Loading the bank…</p> : items.isError ? <p className="syncnote" role="alert">Could not load the bank.</p> :
              <BankTable rows={rows} selected={sel} onSelect={setSel} />}
            <p className="foot-note">Keys are visible to institution admins only and never sent to a teacher's browser. Completed assessments keep
              the key that was live when they were taken; each profile stores its scoring version.</p>
          </div>
          <ItemKeyPanel item={selected} onClose={() => setSel(null)} />
        </div>
      </main>
    </div>
  );
}
