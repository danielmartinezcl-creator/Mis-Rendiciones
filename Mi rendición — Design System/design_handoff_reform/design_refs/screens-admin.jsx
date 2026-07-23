/* screens-admin.jsx — Admin dashboard (reformed: dark KPI panel, trend chart, alert timeline),
   Rendiciones, Aprobaciones
   Exports: AdminScreen, RendicionesScreen, AprobacionesScreen */

const { useState: useStateA } = React;

/* ---- Hero KPI strip (Option D: dark teal, flat) ---- */
function HeroKpiStrip() {
  const total = useCountUp(16132500, []);
  const pending = useCountUp(4182000, []);
  const unreimb = useCountUp(2640500, []);
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-xl)',
      background: 'linear-gradient(130deg, #0B1120 0%, #0F766E 100%)', padding: '22px 26px', boxShadow: 'var(--shadow-md)',
      animation: 'ds-slidein var(--dur) var(--ease-expo) both' }}>
      {/* ambient glow */}
      <div style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%',
        right: -60, top: -100, pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(20,184,166,.14), transparent 65%)' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--teal-400)', letterSpacing: '.04em', marginBottom: 5 }}>
            Movimiento total del mes
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 34,
            color: '#fff', letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' }}>
            {fmtCLP(total)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 36 }}>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginBottom: 3 }}>Por aprobar</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 17,
              color: '#F59E0B', fontVariantNumeric: 'tabular-nums' }}>{fmtCLP(pending)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginBottom: 3 }}>Sin reembolsar</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 17,
              color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>{fmtCLP(unreimb)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Light metric card (flat white, color only on icon + number) ---- */
function LightMetricCard({ icon, label, count, amount, color, unit, delay }) {
  const cnt = useCountUp(count, []);
  const amt = useCountUp(amount, []);
  const [hover, setHover] = useStateA(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: '#fff', borderRadius: 'var(--r-lg)',
        boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        padding: '18px 20px', cursor: 'default',
        transform: hover ? 'translateY(-2px)' : 'none',
        transition: 'transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out)',
        animation: `ds-slidein var(--dur) var(--ease-expo) ${delay}s both` }}>
      {/* icon */}
      <div style={{ width: 42, height: 42, borderRadius: 'var(--r-sm)', marginBottom: 14,
        background: color + '18', display: 'grid', placeItems: 'center' }}>
        <Icon name={icon} size={21} color={color} />
      </div>
      {/* count */}
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32,
        color, letterSpacing: '-0.025em', lineHeight: 1, marginBottom: 4 }}>{cnt}</div>
      {/* label */}
      <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', fontWeight: 500, marginBottom: 8 }}>{label}</div>
      {/* amount */}
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14,
        color: 'var(--fg-strong)', fontVariantNumeric: 'tabular-nums' }}>{fmtCLP(amt)}</div>
    </div>
  );
}

/* ---- Animated SVG trend chart ---- */
function TrendChart() {
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'];
  const values = [2800000, 3200000, 2400000, 4100000, 3800000, 5200000];
  const W = 280, H = 96;
  const PAD = { t: 10, r: 10, b: 22, l: 6 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const minV = Math.min(...values), range = Math.max(...values) - minV;
  const pts = values.map((v, i) => ({
    x: PAD.l + (i / (values.length - 1)) * cW,
    y: PAD.t + cH - ((v - minV) / range * cH),
  }));
  // Smooth bezier path
  function makePath(pts) {
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], c = pts[i];
      const dx = (c.x - p.x) * 0.38;
      d += ` C ${p.x + dx},${p.y} ${c.x - dx},${c.y} ${c.x},${c.y}`;
    }
    return d;
  }
  const line = makePath(pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  const area = `${line} L ${last.x},${H - PAD.b} L ${first.x},${H - PAD.b} Z`;
  const growth = Math.round((values[values.length - 1] - values[0]) / values[0] * 100);

  return (
    <div style={{ background: 'var(--white)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)', padding: '18px 20px',
      animation: 'ds-slidein var(--dur) var(--ease-expo) .24s both' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-strong)' }}>Tendencia de gasto</div>
          <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 2 }}>Últimos 6 meses</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--ok-fg)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="trending-up" size={13} color="var(--ok-fg)" />+{growth}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 1 }}>vs Ene</div>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#14B8A6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* grid lines */}
        {[0.25, 0.5, 0.75].map((f, i) => (
          <line key={i} x1={PAD.l} y1={PAD.t + cH * f} x2={W - PAD.r} y2={PAD.t + cH * f}
            stroke="var(--ink-100)" strokeWidth="1" />
        ))}
        {/* area */}
        <path d={area} fill="url(#tg)" />
        {/* line — draws itself */}
        <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ strokeDasharray: 600, strokeDashoffset: 600, animation: 'drawLine .95s var(--ease-expo) .35s forwards' }} />
        {/* dots */}
        {pts.map((p, i) => {
          const isLast = i === pts.length - 1;
          return (
            <circle key={i} cx={p.x} cy={p.y} r={isLast ? 5 : 3.5}
              fill={isLast ? 'var(--brand)' : '#fff'}
              stroke="var(--brand)" strokeWidth="2"
              style={{ opacity: 0, animation: `ds-fade var(--dur-fast) ease ${.35 + i * .09}s forwards` }} />
          );
        })}
        {/* month labels */}
        {pts.map((p, i) => (
          <text key={i} x={p.x} y={H} textAnchor="middle"
            style={{ fontSize: 8, fill: 'var(--fg-subtle)', fontFamily: 'var(--font-ui)' }}>
            {months[i]}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ---- Alert timeline ---- */
const ALERTS = [
  { icon: 'trending-up', color: '#F59E0B', bg: 'var(--warn-bg)', fg: 'var(--warn-fg)',
    title: 'Gasto inusualmente alto',
    desc: '"Feria logística · Stand" de Diego Fuentes supera en 38% el promedio de Operaciones.',
    time: 'hace 2 h', action: 'Revisar', actionIcon: 'arrow-right', urgent: true },
  { icon: 'hourglass', color: '#0EA5E9', bg: 'var(--info-bg)', fg: 'var(--info-fg)',
    title: 'Reembolso pendiente +15 días',
    desc: '"Marketing redes · Mayo" fue aprobada el 13/05 y sigue sin reembolsar.',
    time: 'hace 3 d', action: 'Reembolsar', actionIcon: 'banknote', urgent: true },
  { icon: 'file-plus', color: 'var(--draft-solid)', bg: 'var(--draft-bg)', fg: 'var(--draft-fg)',
    title: 'Nueva rendición enviada',
    desc: 'Camila Soto envió "Viaje Santiago · ACME" por $ 235.400.',
    time: 'hace 1 h', action: 'Ver detalle', actionIcon: 'eye', urgent: false },
];

function AlertTimeline() {
  const urgent = ALERTS.filter(a => a.urgent).length;
  return (
    <div style={{ background: 'var(--white)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)', padding: '18px 20px',
      animation: 'ds-slidein var(--dur) var(--ease-expo) .32s both', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-strong)' }}>Alertas inteligentes</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bad-bg)',
          color: 'var(--bad-fg)', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--r-full)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bad-solid)',
            display: 'inline-block', animation: 'alertPulse 1.6s ease infinite' }} />
          {urgent} urgentes
        </span>
      </div>
      {/* Timeline */}
      <div style={{ position: 'relative', flex: 1 }}>
        {/* vertical track */}
        <div style={{ position: 'absolute', left: 18, top: 8, bottom: 8, width: 2,
          background: 'linear-gradient(to bottom, var(--brand), var(--ink-150))', borderRadius: 2 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {ALERTS.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: i < ALERTS.length - 1 ? 20 : 0,
              animation: `ds-slidein var(--dur) var(--ease-expo) ${.32 + i * 0.1}s both` }}>
              {/* Node */}
              <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, zIndex: 1, position: 'relative',
                background: a.bg, border: `2px solid ${a.color}`, display: 'grid', placeItems: 'center',
                boxShadow: a.urgent ? `0 0 0 4px ${a.color}22` : 'none' }}>
                <Icon name={a.icon} size={16} color={a.fg} />
              </div>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-strong)', lineHeight: 1.2 }}>{a.title}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--fg-subtle)', flexShrink: 0 }}>{a.time}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5, margin: '5px 0 8px' }}>{a.desc}</p>
                <button style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                  color: a.fg, fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-ui)',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  transition: 'opacity var(--dur-fast)' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '.7'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  {a.action} <Icon name={a.actionIcon} size={12} color={a.fg} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminScreen() {
  const metrics = [
    { icon: 'clock',          label: 'Pendiente de aprobación',  count: 12, amount: 4182000, color: '#F59E0B', unit: 'rendiciones' },
    { icon: 'check-circle-2', label: 'Aprobadas sin reembolsar', count: 7,  amount: 2640500, color: '#10B981', unit: 'rendiciones' },
    { icon: 'banknote',       label: 'Reembolsadas este mes',    count: 23, amount: 9310000, color: '#0EA5E9', unit: 'reembolsos'   },
  ];
  return (
    <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <HeroKpiStrip />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {metrics.map((m, i) => (
          <LightMetricCard key={i} {...m} delay={0.08 + i * 0.08} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 16 }}>
        <TrendChart />
        <AlertTimeline />
      </div>
    </div>
  );
}

/* ---- Rendiciones (admin table w/ filters + expandable detail) ---- */
const FILTER_STATUSES = ['submitted', 'pending_l2', 'approved', 'partially_approved', 'rejected', 'reimbursed'];

function RendicionesScreen() {
  const [sel, setSel] = useStateA([]);
  const [openId, setOpenId] = useStateA(null);
  const list = sel.length ? ALL_REPORTS.filter(r => sel.includes(r.status)) : ALL_REPORTS;
  const totals = list.reduce((a, r) => ({ total: a.total + r.total, approved: a.approved + r.approved }), { total: 0, approved: 0 });
  const pend = list.filter(r => r.status === 'approved' || r.status === 'partially_approved').reduce((s, r) => s + r.approved, 0);

  return (
    <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{list.length} de {ALL_REPORTS.length} resultados</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" size="sm" icon="sheet">Excel</Btn>
          <Btn variant="secondary" size="sm" icon="file-text">PDF</Btn>
        </div>
      </div>

      {/* KPI hero strip — same gradient as dashboard */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-xl)',
        background: 'linear-gradient(130deg, #0B1120 0%, #0F766E 100%)',
        padding: '20px 26px', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ position: 'absolute', width: 240, height: 240, borderRadius: '50%',
          right: -60, top: -80, pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(94,234,212,.14), transparent 65%)' }} />
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0 }}>
          {[
            { l: 'Total rendido',      v: totals.total,   c: '#fff' },
            { l: 'Total aprobado',     v: totals.approved, c: '#5EEAD4' },
            { l: 'Pendiente reembolso', v: pend,           c: '#7DD3FC' },
          ].map((k, i) => (
            <div key={i} style={{ padding: '0 0 0', borderLeft: i > 0 ? '1px solid rgba(255,255,255,.1)' : 'none', paddingLeft: i > 0 ? 24 : 0 }}>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.5)', fontWeight: 500, marginBottom: 6 }}>{k.l}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 22,
                color: k.c, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                {fmtCLP(k.v)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--white)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)', padding: 16 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--fg-subtle)', marginBottom: 10 }}>Filtrar por estado</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {FILTER_STATUSES.map(st => {
            const on = sel.includes(st);
            const s = STATUS[st];
            return (
              <button key={st} onClick={() => setSel(on ? sel.filter(x => x !== st) : [...sel, st])}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 'var(--r-full)',
                  border: on ? `1.5px solid ${s.solid}` : '1.5px solid transparent',
                  background: on ? s.bg : 'var(--ink-100)', color: on ? s.fg : 'var(--fg-muted)',
                  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  transition: 'all var(--dur-fast) var(--ease-spring)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.solid }} />{s.label}
              </button>
            );
          })}
          {sel.length > 0 && <button onClick={() => setSel([])} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--brand)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-ui)' }}>Limpiar</button>}
        </div>
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((r, i) => {
          const open = openId === r.id;
          const canReimb = r.status === 'approved' || r.status === 'partially_approved';
          return (
            <div key={r.id} style={{ background: 'var(--white)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
              animation: `ds-slidein var(--dur) var(--ease-expo) ${i * 0.04}s both` }}>
              <div style={{ padding: '15px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg-strong)' }}>{r.title}</span>
                      <StatusPill status={r.status} />
                      {r.flag === 'high' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--warn-fg)', background: 'var(--warn-bg)', padding: '2px 8px', borderRadius: 'var(--r-full)' }}><Icon name="trending-up" size={12} />Alto</span>}
                      {r.flag === 'unreimbursed' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--info-fg)', background: 'var(--info-bg)', padding: '2px 8px', borderRadius: 'var(--r-full)' }}><Icon name="hourglass" size={12} />+15d</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 3 }}><b style={{ color: 'var(--fg-muted)' }}>{r.submitter}</b> · {r.dept} · Enviada {r.submitted}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <Amount value={r.total} size={15} />
                      {r.approved > 0 && r.approved !== r.total && <div style={{ fontSize: 11, color: 'var(--ok-fg)', fontFamily: 'var(--font-mono)' }}>Aprob. {fmtCLP(r.approved)}</div>}
                    </div>
                    <Btn variant="secondary" size="sm" icon={open ? 'chevron-up' : 'chevron-down'} onClick={() => setOpenId(open ? null : r.id)}>{open ? 'Cerrar' : 'Detalle'}</Btn>
                  </div>
                </div>
                {canReimb && <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid var(--divider)' }}>
                  <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--info-fg)', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-ui)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="banknote" size={15} />Marcar como reembolsada
                  </button>
                </div>}
              </div>
              {open && (
                <div style={{ borderTop: '1px solid var(--divider)', background: 'var(--ink-50)', padding: 16, animation: 'ds-fade var(--dur) ease' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--fg-subtle)', marginBottom: 10 }}>Ítems ({SAMPLE_ITEMS.length})</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ textAlign: 'left', color: 'var(--fg-subtle)' }}>
                      <th style={{ padding: '0 0 8px', fontWeight: 600, fontSize: 11.5 }}>Descripción</th>
                      <th style={{ padding: '0 0 8px', fontWeight: 600, fontSize: 11.5 }}>Categoría</th>
                      <th style={{ padding: '0 0 8px', fontWeight: 600, fontSize: 11.5, textAlign: 'right' }}>Monto</th>
                      <th style={{ padding: '0 0 8px', fontWeight: 600, fontSize: 11.5, textAlign: 'right' }}>Estado</th>
                    </tr></thead>
                    <tbody>
                      {SAMPLE_ITEMS.map((it, j) => (
                        <tr key={j} style={{ borderTop: '1px solid var(--ink-150)' }}>
                          <td style={{ padding: '9px 0', color: 'var(--fg)' }}>{it.desc}</td>
                          <td style={{ padding: '9px 0', color: 'var(--fg-muted)' }}>{it.cat}</td>
                          <td style={{ padding: '9px 0', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--fg-strong)' }}>{fmtCLP(it.amount)}</td>
                          <td style={{ padding: '9px 0', textAlign: 'right' }}><StatusPill status={it.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Aprobaciones · detail w/ approve/reject ---- */
function AprobacionesScreen() {
  const [items, setItems] = useStateA(SAMPLE_ITEMS.map(it => ({ ...it, status: 'pending' })));
  function act(idx, status) { setItems(items.map((it, i) => i === idx ? { ...it, status } : it)); }
  const approvedTotal = items.filter(i => i.status === 'approved').reduce((s, i) => s + i.amount, 0);
  const allDone = items.every(i => i.status !== 'pending');

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'var(--white)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--fg-strong)', margin: 0, letterSpacing: '-0.02em' }}>Viaje Santiago · Cliente ACME</h3>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 0' }}><b>Camila Soto</b> · Comercial · Enviada 14/05/2026</p>
          </div>
          <StatusPill status="submitted" />
        </div>
        <div style={{ display: 'flex', gap: 28, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--divider)' }}>
          <div><div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Total rendido</div><Amount value={items.reduce((s, i) => s + i.amount, 0)} size={18} /></div>
          <div><div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Aprobado hasta ahora</div><Amount value={approvedTotal} size={18} color="var(--ok-fg)" /></div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => {
          const s = STATUS[it.status] || STATUS.draft;
          return (
            <div key={i} style={{ background: 'var(--white)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)',
              borderLeft: `3px solid ${it.status === 'pending' ? 'var(--ink-200)' : s.solid}`, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-strong)' }}>{it.desc}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 2 }}>{it.cat} · {it.merchant} · {it.doc}</div>
              </div>
              <Amount value={it.amount} size={15} />
              {it.status === 'pending' ? (
                <div style={{ display: 'flex', gap: 7 }}>
                  <button onClick={() => act(i, 'rejected')} title="Rechazar" style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', border: '1px solid var(--bad-bg)', background: 'var(--bad-bg)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon name="x" size={17} color="var(--bad-fg)" /></button>
                  <button onClick={() => act(i, 'approved')} title="Aprobar" style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--ok-solid)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon name="check" size={17} color="#fff" /></button>
                </div>
              ) : <StatusPill status={it.status} pulse />}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <Btn variant="secondary" style={{ flex: 1 }} icon="message-square">Pedir aclaración</Btn>
        <Btn variant={allDone ? 'primary' : 'secondary'} style={{ flex: 1, opacity: allDone ? 1 : 0.5 }} icon="check-check">Finalizar revisión</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { AdminScreen, RendicionesScreen, AprobacionesScreen });
