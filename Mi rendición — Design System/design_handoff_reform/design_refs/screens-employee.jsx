/* screens-employee.jsx — Estado (dashboard) + Nueva rendición (AI capture flow)
   Exports: EstadoScreen, NuevaScreen, ReportRow */

const { useState: useStateE, useEffect: useEffectE } = React;

function ReportRow({ r, i = 0, onClick }) {
  const s = STATUS[r.status];
  const [hover, setHover] = useStateE(false);
  const dateLabel = r.submitted ? `Enviada ${r.submitted}` : `Borrador · ${r.created}`;
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--white)',
        borderRadius: 'var(--r-lg)', boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        padding: '14px 16px', borderLeft: `3px solid ${s.solid}`, cursor: 'pointer',
        transform: hover ? 'translateY(-2px)' : 'none',
        transition: 'transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out)',
        animation: `ds-slidein var(--dur) var(--ease-expo) ${i * 0.05}s both` }}>
      <div style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', background: s.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={r.status === 'reimbursed' ? 'banknote' : r.status === 'rejected' ? 'x-circle' : r.status === 'approved' ? 'check-circle-2' : r.status === 'draft' ? 'file-pen' : 'clock'} size={20} color={s.fg} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
        <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 2 }}>{dateLabel} · {r.items} ítems{r.ref ? ` · Ref ${r.ref}` : ''}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
        <StatusPill status={r.status} />
        <Amount value={r.total} size={15} />
        {r.status === 'partially_approved' && (
          <span style={{ fontSize: 11, color: 'var(--ok-fg)', fontFamily: 'var(--font-mono)' }}>Aprob. {fmtCLP(r.approved)}</span>
        )}
      </div>
    </div>
  );
}

function HeroBalance() {
  const approved = useCountUp(415400, []);
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-xl)',
      background: 'linear-gradient(135deg, var(--ink-900), var(--teal-800))', padding: '26px 28px',
      boxShadow: 'var(--shadow-md)' }}>
      <div style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(94,234,212,.20), transparent 70%)', top: -110, right: -60 }} />
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--teal-300)', letterSpacing: '.02em' }}>Por cobrar · aprobado sin reembolsar</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 44, color: '#fff', letterSpacing: '-0.025em', marginTop: 4 }}>{fmtCLP(approved)}</div>
        <div style={{ display: 'flex', gap: 36, marginTop: 18 }}>
          <div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)' }}>En revisión</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 18, color: '#fff', marginTop: 2 }}>{fmtCLP(404200)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)' }}>Borradores</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 18, color: '#fff', marginTop: 2 }}>{fmtCLP(28600)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EstadoScreen({ onNueva }) {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <HeroBalance />
      <button onClick={onNueva} style={{ position: 'relative', overflow: 'hidden', width: '100%',
        border: 'none', cursor: 'pointer', borderRadius: 'var(--r-lg)', background: 'var(--brand)',
        color: '#fff', padding: '17px', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11,
        boxShadow: 'var(--shadow-brand)', transition: 'background var(--dur-fast)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--brand)'}>
        <Icon name="scan-line" size={22} /> Toma la foto y listo
      </button>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--fg-subtle)', margin: '4px 0 12px' }}>Rendiciones recientes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {REPORTS.map((r, i) => <ReportRow key={r.id} r={r} i={i} />)}
        </div>
      </div>
    </div>
  );
}

/* ---- Nueva rendición · AI capture flow ---- */
function NuevaScreen() {
  const [phase, setPhase] = useStateE('idle'); // idle → scanning → filled
  const [items, setItems] = useStateE([]);
  const [form, setForm] = useStateE({ desc: '', amount: '', currency: 'CLP', cat: 'Alimentación', merchant: '', doc: 'Boleta' });

  function scan() {
    setPhase('scanning');
    setTimeout(() => {
      setForm({ desc: 'Almuerzo con cliente', amount: '38900', currency: 'CLP', cat: 'Alimentación', merchant: 'Tiramisú Restaurant', doc: 'Boleta' });
      setPhase('filled');
    }, 2200);
  }
  function addItem() {
    if (!form.amount) return;
    setItems([...items, { ...form, amount: parseInt(form.amount, 10) }]);
    setForm({ desc: '', amount: '', currency: 'CLP', cat: 'Alimentación', merchant: '', doc: 'Boleta' });
    setPhase('idle');
  }
  const total = items.reduce((s, it) => s + it.amount, 0);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Capture */}
      <div onClick={phase === 'idle' ? scan : undefined}
        style={{ position: 'relative', overflow: 'hidden', border: `2px dashed ${phase === 'filled' ? 'var(--ok-solid)' : 'var(--teal-300)'}`,
          background: phase === 'filled' ? 'var(--ok-bg)' : 'var(--teal-50)', borderRadius: 'var(--r-lg)',
          padding: 22, textAlign: 'center', cursor: phase === 'idle' ? 'pointer' : 'default',
          transition: 'all var(--dur) var(--ease-out)' }}>
        {phase === 'scanning' && <div style={{ position: 'absolute', left: 0, right: 0, height: '40%', top: '-40%',
          background: 'linear-gradient(180deg, transparent, rgba(94,234,212,.5), transparent)', animation: 'ds-scan 1.6s var(--ease-out) infinite' }} />}
        <div style={{ position: 'relative' }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', margin: '0 auto 12px', display: 'grid', placeItems: 'center',
            background: phase === 'filled' ? 'var(--ok-solid)' : 'var(--brand)', boxShadow: 'var(--shadow-brand)' }}>
            <Icon name={phase === 'filled' ? 'check' : phase === 'scanning' ? 'loader' : 'scan-line'} size={26} color="#fff"
              style={phase === 'scanning' ? { animation: 'ds-spin 1s linear infinite' } : {}} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: phase === 'filled' ? 'var(--ok-fg)' : 'var(--brand-pressed)' }}>
            {phase === 'idle' ? 'Toma la foto y listo' : phase === 'scanning' ? 'Extrayendo datos con IA…' : 'Foto procesada ✓'}
          </div>
          <div style={{ fontSize: 12, color: phase === 'filled' ? 'var(--ok-fg)' : 'var(--teal-700)', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            {phase !== 'filled' && <Icon name="sparkles" size={13} />}
            {phase === 'filled' ? 'Datos pre-cargados — revisa y confirma' : 'La IA extrae monto, fecha y comercio · JPG · PDF'}
          </div>
        </div>
      </div>

      {/* Form (after scan) */}
      {phase === 'filled' && (
        <div style={{ background: 'var(--white)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)',
          borderTop: '3px solid var(--brand)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
          animation: 'ds-slidein var(--dur) var(--ease-expo) both' }}>
          <h3 style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 16, color: 'var(--fg-strong)', margin: 0 }}>Agregar ítem</h3>
          <Field label="Descripción" value={form.desc} onChange={v => setForm({ ...form, desc: v })} placeholder="Ej: Almuerzo con cliente" />
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
            <Field label="Monto" value={form.amount} onChange={v => setForm({ ...form, amount: v })} mono placeholder="0" />
            <Select label="Moneda" value={form.currency} onChange={v => setForm({ ...form, currency: v })} options={['CLP', 'USD', 'EUR', 'ARS', 'BRL']} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select label="Categoría" value={form.cat} onChange={v => setForm({ ...form, cat: v })} options={CATEGORIES.map(c => c.name)} />
            <Select label="Tipo documento" value={form.doc} onChange={v => setForm({ ...form, doc: v })} options={['Boleta', 'Factura', 'Factura Exenta', 'Ticket', 'Otro']} />
          </div>
          <Field label="Proveedor" value={form.merchant} onChange={v => setForm({ ...form, merchant: v })} placeholder="Nombre del comercio" />
          <div style={{ display: 'flex', gap: 12 }}>
            <Btn variant="secondary" style={{ flex: 1 }} onClick={() => setPhase('idle')}>Cancelar</Btn>
            <Btn variant="primary" style={{ flex: 1 }} icon="plus" onClick={addItem}>Agregar ítem</Btn>
          </div>
        </div>
      )}

      {/* Items list */}
      {items.length > 0 && (
        <div style={{ background: 'var(--white)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)', padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--fg-subtle)' }}>Ítems de la rendición ({items.length})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < items.length - 1 ? '1px solid var(--divider)' : 'none', animation: 'ds-slidein var(--dur) var(--ease-expo) both' }}>
                <div style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: 'var(--teal-50)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon name={(CATEGORIES.find(c => c.name === it.cat) || {}).icon || 'receipt'} size={17} color="var(--brand)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-strong)' }}>{it.desc || 'Sin descripción'}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>{it.merchant} · {it.doc}</div>
                </div>
                <Amount value={it.amount} size={15} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTop: '2px solid var(--ink-100)' }}>
            <span style={{ fontWeight: 700, color: 'var(--fg-strong)', fontSize: 15 }}>Total rendición</span>
            <Amount value={total} size={22} color="var(--brand)" />
          </div>
          <Btn variant="primary" size="lg" icon="send" style={{ width: '100%', marginTop: 16 }}>Enviar a aprobación</Btn>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { EstadoScreen, NuevaScreen, ReportRow, HeroBalance });
