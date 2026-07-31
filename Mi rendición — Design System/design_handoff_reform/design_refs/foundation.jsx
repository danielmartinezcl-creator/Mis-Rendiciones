/* foundation.jsx — shared primitives for the Mi rendición UI kit
   Exports to window: Icon, Btn, StatusPill, Amount, Field, Select, useCountUp,
   STATUS, fmtCLP, CATEGORIES */

const { useState, useEffect, useRef, useCallback } = React;

/* ---- Status lifecycle meta (mirrors src/lib/constants.ts) ---- */
const STATUS = {
  draft:              { label: 'Borrador',         fg: 'var(--draft-fg)', bg: 'var(--draft-bg)', solid: 'var(--draft-solid)' },
  submitted:          { label: 'En revisión',      fg: 'var(--warn-fg)',  bg: 'var(--warn-bg)',  solid: 'var(--warn-solid)' },
  pending_l2:         { label: 'Revisión N2',      fg: 'var(--l2-fg)',    bg: 'var(--l2-bg)',    solid: 'var(--l2-solid)' },
  approved:           { label: 'Aprobada',         fg: 'var(--ok-fg)',    bg: 'var(--ok-bg)',    solid: 'var(--ok-solid)' },
  partially_approved: { label: 'Aprobada parcial', fg: 'var(--warn-fg)',  bg: 'var(--warn-bg)',  solid: 'var(--warn-solid)' },
  rejected:           { label: 'Rechazada',        fg: 'var(--bad-fg)',   bg: 'var(--bad-bg)',   solid: 'var(--bad-solid)' },
  reimbursed:         { label: 'Reembolsada',      fg: 'var(--info-fg)',  bg: 'var(--info-bg)',  solid: 'var(--info-solid)' },
};

const CATEGORIES = [
  { id: 'food',  name: 'Alimentación', icon: 'utensils' },
  { id: 'taxi',  name: 'Transporte',   icon: 'car' },
  { id: 'hotel', name: 'Alojamiento',  icon: 'bed' },
  { id: 'sup',   name: 'Insumos',      icon: 'package' },
  { id: 'other', name: 'Otros',        icon: 'ellipsis' },
];

function fmtCLP(n) {
  const abs = Math.abs(Math.round(n));
  return (n < 0 ? '-' : '') + '$ ' + abs.toLocaleString('es-CL');
}

/* ---- Icon (Lucide) ---- */
function Icon({ name, size = 18, color, style, strokeWidth = 1.85 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.lucide) return;
    el.innerHTML = '';
    const i = document.createElement('i');
    i.setAttribute('data-lucide', name);
    el.appendChild(i);
    window.lucide.createIcons({ attrs: { width: size, height: size, 'stroke-width': strokeWidth } });
  }, [name, size, strokeWidth]);
  return <span ref={ref} style={{ display: 'inline-flex', color, lineHeight: 0, ...style }} />;
}

/* ---- Animated count-up for figures ---- */
function useCountUp(target, deps = []) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setVal(target); return; }
    let raf, start;
    const dur = 700;
    const from = 0;
    const tick = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, deps); // eslint-disable-line
  return val;
}

/* ---- Button ---- */
function Btn({ variant = 'primary', size = 'md', icon, children, style, ...props }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: 'var(--font-ui)', fontWeight: 700, border: 'none', cursor: 'pointer',
    borderRadius: 'var(--r-md)', transition: 'all var(--dur-fast) var(--ease-out)',
    whiteSpace: 'nowrap',
  };
  const sizes = {
    sm: { fontSize: 12.5, padding: '7px 13px' },
    md: { fontSize: 14,   padding: '11px 18px' },
    lg: { fontSize: 15,   padding: '13px 22px' },
  };
  const variants = {
    primary:   { background: 'var(--brand)', color: '#fff', boxShadow: 'var(--shadow-brand)' },
    secondary: { background: 'var(--white)', color: 'var(--fg)', border: '1px solid var(--border)' },
    ghost:     { background: 'transparent', color: 'var(--fg-muted)' },
    danger:    { background: 'var(--bad-bg)', color: 'var(--bad-fg)' },
    ok:        { background: 'var(--ok-solid)', color: '#fff' },
  };
  const [hover, setHover] = useState(false);
  const hoverBg = {
    primary: 'var(--brand-hover)', secondary: 'var(--ink-50)', ghost: 'var(--ink-100)',
    danger: '#FFE4E6', ok: '#0EA572',
  };
  return (
    <button
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ ...base, ...sizes[size], ...variants[variant],
        ...(hover ? { background: hoverBg[variant], color: variants[variant].color } : {}),
        ...style }}
      onMouseDown={e => e.currentTarget.style.transform = 'scale(.97)'}
      onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
      {...props}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
    </button>
  );
}

/* ---- Status pill ---- */
function StatusPill({ status, pulse }) {
  const s = STATUS[status] || STATUS.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
      borderRadius: 'var(--r-full)', fontSize: 11.5, fontWeight: 700,
      background: s.bg, color: s.fg, fontFamily: 'var(--font-ui)',
      animation: pulse ? 'ds-pop var(--dur-slow) var(--ease-spring)' : 'none',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.solid }} />
      {s.label}
    </span>
  );
}

/* ---- Amount (mono) ---- */
function Amount({ value, size = 15, color = 'var(--fg-strong)', animate }) {
  const counted = useCountUp(animate ? value : value, [animate ? value : 0]);
  const shown = animate ? counted : value;
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
      letterSpacing: '-0.01em', fontSize: size, color }}>
      {fmtCLP(shown)}
    </span>
  );
}

/* ---- Field & Select ---- */
function Field({ label, value, onChange, placeholder, mono, type = 'text' }) {
  const [foc, setFoc] = useState(false);
  return (
    <label style={{ display: 'block' }}>
      {label && <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 6 }}>{label}</span>}
      <input type={type} value={value} placeholder={placeholder}
        onChange={e => onChange && onChange(e.target.value)}
        onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
        style={{ width: '100%', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-ui)',
          fontWeight: mono ? 600 : 400, fontSize: 14, color: 'var(--fg-strong)',
          padding: '11px 13px', borderRadius: 'var(--r-sm)', background: 'var(--white)',
          border: `1px solid ${foc ? 'var(--brand)' : 'var(--border)'}`,
          boxShadow: foc ? 'var(--ring-brand)' : 'none', outline: 'none',
          transition: 'border-color var(--dur-fast), box-shadow var(--dur-fast)' }} />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  const [foc, setFoc] = useState(false);
  return (
    <label style={{ display: 'block' }}>
      {label && <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 6 }}>{label}</span>}
      <select value={value} onChange={e => onChange && onChange(e.target.value)}
        onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
        style={{ width: '100%', fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--fg-strong)',
          padding: '11px 13px', borderRadius: 'var(--r-sm)', background: 'var(--white)',
          border: `1px solid ${foc ? 'var(--brand)' : 'var(--border)'}`,
          boxShadow: foc ? 'var(--ring-brand)' : 'none', outline: 'none', appearance: 'none',
          cursor: 'pointer' }}>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </label>
  );
}

Object.assign(window, { Icon, Btn, StatusPill, Amount, Field, Select, useCountUp, STATUS, fmtCLP, CATEGORIES });
