/* shell.jsx — Sidebar, TopBar (with role switcher), Login, mark
   Exports: Sidebar, TopBar, Login, BrandMark, NAV */

const { useState: useStateSh } = React;

function BrandMark({ size = 40, light }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <div style={{ width: size, height: size, borderRadius: 'var(--r-md)',
        background: 'linear-gradient(135deg, var(--ink-900), var(--teal-700))',
        display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: 'var(--shadow-sm)' }}>
        <Icon name="receipt-text" size={size * 0.52} color="#fff" />
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size * 0.5,
        letterSpacing: '-0.03em', lineHeight: 1 }}>
        <span style={{ color: light ? 'var(--teal-300)' : 'var(--brand)' }}>mi</span>
        <span style={{ color: light ? '#fff' : 'var(--fg-strong)' }}> rendición</span>
      </div>
    </div>
  );
}

const NAV = {
  employee: [
    { id: 'estado',   label: 'Estado',          icon: 'layout-dashboard' },
    { id: 'nueva',    label: 'Nueva rendición', icon: 'scan-line' },
    { id: 'reembolsos', label: 'Mis reembolsos', icon: 'banknote' },
  ],
  approver: [
    { id: 'estado',      label: 'Estado',       icon: 'layout-dashboard' },
    { id: 'aprobaciones', label: 'Aprobaciones', icon: 'check-circle-2' },
  ],
  admin: [
    { id: 'admin',     label: 'Dashboard',    icon: 'bar-chart-3' },
    { id: 'rendiciones', label: 'Rendiciones', icon: 'receipt-text' },
    { id: 'aprobaciones', label: 'Aprobaciones', icon: 'check-circle-2' },
    { id: 'empleados', label: 'Empleados',    icon: 'users' },
    { id: 'config',    label: 'Configuración', icon: 'settings-2' },
  ],
};

const ROLE_USER = {
  employee: { name: 'Camila Soto',   role: 'Empleada · Comercial' },
  approver: { name: 'Diego Fuentes', role: 'Aprobador · Finanzas' },
  admin:    { name: 'Valentina Ríos', role: 'Admin · Finanzas' },
};

function Sidebar({ role, active, onNav }) {
  const items = NAV[role];
  const user = ROLE_USER[role];
  return (
    <aside style={{ width: 'var(--sidebar-w)', background: 'var(--bg-dark)', minHeight: '100%',
      display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <BrandMark size={34} light />
      </div>
      <nav style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((it, i) => {
          const on = active === it.id;
          return (
            <button key={it.id} onClick={() => onNav(it.id)}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 13px', borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer',
                background: on ? 'var(--brand)' : 'transparent',
                color: on ? '#fff' : 'var(--fg-on-dark-muted)',
                fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: on ? 700 : 500,
                textAlign: 'left', transition: 'all var(--dur-fast) var(--ease-out)',
                animation: `ds-slidein var(--dur) var(--ease-expo) ${i * 0.04}s both` }}
              onMouseEnter={e => { if (!on) { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = '#fff'; } }}
              onMouseLeave={e => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-on-dark-muted)'; } }}>
              <Icon name={it.icon} size={18} />
              {it.label}
            </button>
          );
        })}
      </nav>
      <div style={{ padding: 14, borderTop: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--teal-700)',
          color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
          {user.name[0]}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
          <div style={{ color: 'var(--fg-on-dark-muted)', fontSize: 11 }}>{user.role}</div>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ role, onRole, title, subtitle }) {
  const roles = [
    { id: 'employee', label: 'Empleada' },
    { id: 'approver', label: 'Aprobador' },
    { id: 'admin',    label: 'Admin' },
  ];
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 28px', borderBottom: '1px solid var(--divider)', background: 'rgba(246,248,251,.8)',
      backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 5 }}>
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24,
          letterSpacing: '-0.02em', color: 'var(--fg-strong)', margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '3px 0 0' }}>{subtitle}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--fg-subtle)' }}>Ver como</span>
        <div style={{ display: 'inline-flex', background: 'var(--ink-100)', borderRadius: 'var(--r-full)', padding: 3 }}>
          {roles.map(r => (
            <button key={r.id} onClick={() => onRole(r.id)}
              style={{ border: 'none', cursor: 'pointer', padding: '6px 14px', borderRadius: 'var(--r-full)',
                fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 700,
                background: role === r.id ? 'var(--white)' : 'transparent',
                color: role === r.id ? 'var(--brand-pressed)' : 'var(--fg-muted)',
                boxShadow: role === r.id ? 'var(--shadow-xs)' : 'none',
                transition: 'all var(--dur-fast) var(--ease-out)' }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function Login({ onEnter }) {
  const [email, setEmail] = useStateSh('camila@empresa.cl');
  const [pw, setPw] = useStateSh('••••••••');
  return (
    <div style={{ minHeight: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
      {/* Brand panel */}
      <div style={{ background: 'linear-gradient(150deg, var(--ink-900), var(--teal-800))',
        padding: 48, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 380, height: 380, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(94,234,212,.22), transparent 70%)', top: -120, right: -100 }} />
        <BrandMark size={38} light />
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 38, lineHeight: 1.08,
            letterSpacing: '-0.03em', color: '#fff' }}>
            Toda la rendición<br />de tu empresa,<br /><span style={{ color: 'var(--teal-300)' }}>bajo control.</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 15, marginTop: 16, maxWidth: 380, lineHeight: 1.55 }}>
            Saca la foto de tu boleta y la IA hace el resto. Aprobaciones, gastos y reembolsos en un solo flujo.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 24, color: 'rgba(255,255,255,.55)', fontSize: 12.5, position: 'relative' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="sparkles" size={15} color="var(--teal-300)" />Lectura con IA</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="shield-check" size={15} color="var(--teal-300)" />Flujo de aprobación</span>
        </div>
      </div>
      {/* Form */}
      <div style={{ display: 'grid', placeItems: 'center', padding: 48, background: 'var(--bg-app)' }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, color: 'var(--fg-strong)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Iniciar sesión</h2>
          <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: '0 0 26px' }}>Ingresa con tu correo de la empresa.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Correo electrónico" value={email} onChange={setEmail} placeholder="tu@empresa.cl" />
            <Field label="Contraseña" value={pw} onChange={setPw} type="password" />
            <Btn variant="primary" size="lg" onClick={onEnter} style={{ width: '100%', marginTop: 4 }}>Ingresar</Btn>
          </div>
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--fg-subtle)', marginTop: 18 }}>
            ¿Olvidaste tu contraseña? <span style={{ color: 'var(--brand)', fontWeight: 600, cursor: 'pointer' }}>Recupérala</span>
          </p>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Sidebar, TopBar, Login, BrandMark, NAV, ROLE_USER });
