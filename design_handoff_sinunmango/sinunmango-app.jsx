
const { useState, useEffect, useRef, useCallback } = React;

// ── ACCENT COLORS ─────────────────────────────────────────────────────────────
const ACCENTS = {
  verde:   { name: 'Verde',   hex: '#0F7173', light: '#E6F4F4', dark: '#0A5355' },
  azul:    { name: 'Azul',    hex: '#2563EB', light: '#EFF6FF', dark: '#1D4ED8' },
  violeta: { name: 'Violeta', hex: '#7C3AED', light: '#F5F3FF', dark: '#6D28D9' },
  naranja: { name: 'Naranja', hex: '#E8601A', light: '#FFF6EE', dark: '#C94D10' },
  rosado:  { name: 'Rosado',  hex: '#BE185D', light: '#FDF2F8', dark: '#9D174D' },
};

// ── THEME BUILDER ─────────────────────────────────────────────────────────────
function buildTheme(mode, accentKey) {
  const acc = ACCENTS[accentKey] || ACCENTS.azul;
  const dark = mode === 'oscuro';
  return {
    mode,
    accentKey,
    accent: acc,
    primary: acc.hex,
    bg:           dark ? '#0D1B2A'          : '#EEF2F8',
    surface:      dark ? '#162335'          : '#FFFFFF',
    surfaceAlt:   dark ? '#1E2F42'          : acc.light,
    text:         dark ? '#E8EEF5'          : '#1A2332',
    textSec:      dark ? '#8BA3BA'          : '#6B7A8D',
    textMuted:    dark ? '#546A7E'          : '#A0AFBE',
    border:       dark ? '#243547'          : '#E2E8F0',
    tabBar:       dark ? '#111E2D'          : '#FFFFFF',
    tabBarBorder: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)',
    shadow:       dark ? '0 1px 12px rgba(0,0,0,0.4)' : '0 1px 8px rgba(0,0,0,0.08)',
    shadowMd:     dark ? '0 4px 24px rgba(0,0,0,0.55)' : '0 4px 20px rgba(0,0,0,0.10)',
    income:       dark ? '#22C55E' : '#16A34A',
    expense:      dark ? '#F87171' : '#DC2626',
    balanceBg:    dark
      ? `linear-gradient(145deg, ${acc.dark} 0%, ${acc.hex} 100%)`
      : `linear-gradient(145deg, ${acc.hex} 0%, ${acc.dark} 100%)`,
    balanceText:  '#FFFFFF',
    fabBg:        acc.hex,
    fabShadow:    `0 6px 24px ${acc.hex}55`,
    inputBg:      dark ? '#1E2F42' : '#F4F7FB',
    inputBorder:  dark ? '#2A3F55' : '#DDE4EE',
    pillActive:   acc.hex,
    pillActiveText: '#FFFFFF',
    pillInactive:   dark ? '#1E2F42' : '#EEF2F8',
    pillInactiveText: dark ? '#8BA3BA' : '#6B7A8D',
  };
}

// ── SAMPLE DATA ───────────────────────────────────────────────────────────────
const INITIAL_TRANSACTIONS = [
  { id: 1, type: 'expense', detail: 'COTO Supermercado',  category: 'Supermercados',    amount: 45800,  currency: 'ARS', account: 'Visa Provincia', date: '2026-04-25', icon: '🛒' },
  { id: 2, type: 'expense', detail: 'YPF Nafta',          category: 'Transporte',       amount: 28000,  currency: 'ARS', account: 'Efectivo',       date: '2026-04-24', icon: '⛽' },
  { id: 3, type: 'income',  detail: 'Sueldo Abril',       category: 'Ingresos',         amount: 850000, currency: 'ARS', account: 'Galicia',        date: '2026-04-23', icon: '💼' },
  { id: 4, type: 'expense', detail: 'Netflix',            category: 'Entretenimiento',  amount: 3900,   currency: 'ARS', account: 'Visa Provincia', date: '2026-04-22', icon: '📺' },
  { id: 5, type: 'expense', detail: 'Farmacia',           category: 'Salud',            amount: 12400,  currency: 'ARS', account: 'Mastercard',     date: '2026-04-21', icon: '💊' },
  { id: 6, type: 'expense', detail: 'Airbnb Miami',       category: 'Viajes',           amount: 180,    currency: 'USD', account: 'Wise USD',       date: '2026-04-20', icon: '✈️' },
  { id: 7, type: 'income',  detail: 'Freelance diseño',   category: 'Ingresos',         amount: 250,    currency: 'USD', account: 'Wise USD',       date: '2026-04-18', icon: '🎨' },
  { id: 8, type: 'expense', detail: 'Farmacia Natural',   category: 'Salud',            amount: 8700,   currency: 'ARS', account: 'Efectivo',       date: '2026-04-17', icon: '🌿' },
  { id: 9, type: 'expense', detail: 'Rappi',              category: 'Restaurantes',     amount: 14200,  currency: 'ARS', account: 'Mastercard',     date: '2026-03-30', icon: '🛵' },
  { id:10, type: 'income',  detail: 'Sueldo Marzo',       category: 'Ingresos',         amount: 820000, currency: 'ARS', account: 'Galicia',        date: '2026-03-24', icon: '💼' },
  { id:11, type: 'expense', detail: 'Cablevision',        category: 'Servicios',        amount: 18400,  currency: 'ARS', account: 'Visa Provincia', date: '2026-03-15', icon: '📡' },
  { id:12, type: 'expense', detail: 'Zara',               category: 'Ropa',             amount: 62000,  currency: 'ARS', account: 'Mastercard',     date: '2026-03-10', icon: '👕' },
];

const ACCOUNTS = [
  { id:1, name:'Galicia',        type:'Cuenta corriente', balance:624200,  currency:'ARS', color:'#E8601A' },
  { id:2, name:'Visa Provincia', type:'Tarjeta crédito',  balance:-49700,  currency:'ARS', color:'#2563EB' },
  { id:3, name:'Mastercard',     type:'Tarjeta crédito',  balance:-12400,  currency:'ARS', color:'#7BA7C4' },
  { id:4, name:'Wise USD',       type:'Digital',          balance:430,     currency:'USD', color:'#16A34A' },
  { id:5, name:'Efectivo',       type:'Efectivo',         balance:35000,   currency:'ARS', color:'#92740A' },
];

const CATEGORIES = [
  { name:'Supermercados', icon:'🛒' }, { name:'Transporte',      icon:'🚗' },
  { name:'Entretenimiento',icon:'🎬'},{ name:'Salud',           icon:'💊' },
  { name:'Restaurantes',  icon:'🍽️'},{ name:'Viajes',          icon:'✈️' },
  { name:'Servicios',     icon:'🔌' },{ name:'Ropa',            icon:'👕' },
  { name:'Educación',     icon:'📚' },{ name:'Ingresos',        icon:'💼' },
  { name:'Actividades',   icon:'🎯' },{ name:'Otros',           icon:'📦' },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const fmtARS = n => `$${Math.abs(n).toLocaleString('es-AR')}`;
const fmtUSD = n => `USD ${Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2})}`;
const fmtMoney = (n, currency) => currency === 'USD' ? fmtUSD(n) : fmtARS(n);
const fmtDate = d => {
  const dt = new Date(d + 'T12:00:00');
  const today = new Date();
  const diff = Math.floor((today - dt) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return dt.toLocaleDateString('es-AR',{day:'numeric',month:'short'});
};

// ── ICON (Lucide-style SVG) ───────────────────────────────────────────────────
const ICON_PATHS = {
  home:        [['M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z','M9 21V12h6v9']],
  list:        [['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01']],
  settings:    [['M12 15a3 3 0 100-6 3 3 0 000 6z','M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z']],
  plus:        [['M12 5v14M5 12h14']],
  chevron_l:   [['M15 18l-6-6 6-6']],
  chevron_r:   [['M9 18l6-6-6-6']],
  send:        [['M22 2L11 13','M22 2L15 22l-4-9-9-4 20-7z']],
  eye:         [['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z','M12 9a3 3 0 100 6 3 3 0 000-6z']],
  eye_off:     [['M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24','M1 1l22 22']],
  camera:      [['M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z','M12 17a4 4 0 100-8 4 4 0 000 8z']],
  check:       [['M20 6L9 17l-5-5']],
  bell:        [['M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9','M13.73 21a2 2 0 01-3.46 0']],
  user:        [['M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2','M12 11a4 4 0 100-8 4 4 0 000 8z']],
  credit_card: [['M1 4h22v16H1z','M1 10h22']],
  chevron_right:[['M9 18l6-6-6-6']],
  tag:         [['M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z','M7 7h.01']],
  palette:     [['M12 2a10 10 0 000 20c1.1 0 2-.9 2-2v-.5c0-.56-.45-1-.98-1.1-.44-.06-.8-.44-.8-.9 0-.55.45-1 1-1h1.78c2.75 0 5-2.25 5-5C20 6.13 16.42 2 12 2z','M6.5 13a1.5 1.5 0 100-3 1.5 1.5 0 000 3z','M9.5 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3z','M14.5 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3z']],
  sun:         [['M12 17A5 5 0 1012 7a5 5 0 000 10z','M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42']],
  moon:        [['M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z']],
  filter:      [['M22 3H2l8 9.46V19l4 2v-8.54L22 3z']],
  calendar:    [['M3 4h18v18H3z','M16 2v4M8 2v4M3 10h18']],
  trash:       [['M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2']],
};

function Icon({ name, size=22, color='currentColor', strokeWidth=1.8 }) {
  const segs = ICON_PATHS[name] || ICON_PATHS.home;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {segs.map((paths, gi) =>
        paths.map((d, pi) => <path key={`${gi}-${pi}`} d={d} />)
      )}
    </svg>
  );
}

// ── TAB BAR ───────────────────────────────────────────────────────────────────
function TabBar({ tab, setTab, onFab, t }) {
  const tabs = [
    { id:'dashboard', label:'Inicio',    icon:'home'     },
    { id:'historial', label:'Movim.',    icon:'list'     },
    { id:'__fab__',   label:'',          icon:'plus'     },
    { id:'manguito',  label:'Manguito',  icon:'manguito' },
    { id:'config',    label:'Config',    icon:'settings' },
  ];

  return (
    <div style={{
      position:'absolute', bottom:0, left:0, right:0,
      background: t.tabBar,
      borderTop: `1px solid ${t.tabBarBorder}`,
      display:'flex', alignItems:'flex-end',
      paddingBottom:22, paddingTop:6, zIndex:100,
    }}>
      {tabs.map(({ id, icon, label }) => {
        if (id === '__fab__') {
          return (
            <div key={id} style={{ flex:1, display:'flex', justifyContent:'center' }}>
              <button onClick={onFab} style={{
                width:64, height:64, borderRadius:32,
                background: t.fabBg, border:'none', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow: t.fabShadow,
                transform:'translateY(-18px)',
                transition:'transform 0.15s, box-shadow 0.15s',
                outline:'none',
              }}>
                <Icon name="plus" size={30} color="#FFFFFF" strokeWidth={2.5} />
              </button>
            </div>
          );
        }
        const active = tab === id;
        return (
          <button key={id} onClick={() => setTab(id)} style={{
            flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3,
            background:'none', border:'none', cursor:'pointer', padding:'4px 0',
            color: active ? t.primary : t.textMuted,
            transition:'color 0.2s', outline:'none',
          }}>
            {icon === 'manguito' ? (
              <div style={{
                width:28, height:28, borderRadius:14, overflow:'hidden',
                opacity: active ? 1 : 0.4,
                transition:'opacity 0.2s',
                border: active ? `2px solid ${t.primary}` : '2px solid transparent',
              }}>
                <img src="manguito.png" alt="Manguito" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              </div>
            ) : (
              <div style={{
                width:34, height:28, display:'flex', alignItems:'center', justifyContent:'center',
                borderRadius:10,
                background: active ? t.surfaceAlt : 'transparent',
                transition:'background 0.2s',
              }}>
                <Icon name={icon} size={20} color={active ? t.primary : t.textMuted} />
              </div>
            )}
            <span style={{ fontSize:10, fontWeight: active ? 600 : 400, letterSpacing:0.2 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── BALANCE CARD ──────────────────────────────────────────────────────────────
function BalanceCard({ t, transactions }) {
  const [hidden, setHidden] = useState(false);
  const totalARS = ACCOUNTS.filter(a => a.currency==='ARS').reduce((s,a) => s+a.balance, 0);
  const totalUSD = ACCOUNTS.filter(a => a.currency==='USD').reduce((s,a) => s+a.balance, 0);
  const monthExpense = transactions.filter(x => x.type==='expense' && x.currency==='ARS').reduce((s,x) => s+x.amount, 0);
  const monthIncome  = transactions.filter(x => x.type==='income'  && x.currency==='ARS').reduce((s,x) => s+x.amount, 0);

  return (
    <div style={{ background:t.balanceBg, borderRadius:20, padding:'20px 20px 16px', margin:'0 0 16px', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:-40, right:-20, width:140, height:140, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }} />
      <div style={{ position:'absolute', bottom:-50, left:-30, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }} />

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
        <div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', fontWeight:500, marginBottom:5, letterSpacing:0.8, textTransform:'uppercase' }}>Balance total · ARS</div>
          <div style={{ fontSize:30, fontWeight:800, color:'#FFF', letterSpacing:-1 }}>
            {hidden ? '• • • • • •' : fmtARS(totalARS)}
          </div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.60)', marginTop:4 }}>
            {hidden ? 'USD • • •' : fmtUSD(totalUSD)}
          </div>
        </div>
        <button onClick={() => setHidden(!hidden)} style={{ background:'rgba(255,255,255,0.18)', border:'none', borderRadius:22, width:38, height:38, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon name={hidden ? 'eye_off' : 'eye'} size={16} color="rgba(255,255,255,0.85)" />
        </button>
      </div>

      <div style={{ display:'flex', gap:10 }}>
        <div style={{ flex:1, background:'rgba(255,255,255,0.12)', borderRadius:12, padding:'8px 12px' }}>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.55)', marginBottom:2, letterSpacing:0.4 }}>INGRESOS</div>
          <div style={{ fontSize:14, fontWeight:700, color:'#86EFAC' }}>{hidden ? '• • • •' : fmtARS(monthIncome)}</div>
        </div>
        <div style={{ flex:1, background:'rgba(255,255,255,0.12)', borderRadius:12, padding:'8px 12px' }}>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.55)', marginBottom:2, letterSpacing:0.4 }}>GASTOS</div>
          <div style={{ fontSize:14, fontWeight:700, color:'#FCA5A5' }}>{hidden ? '• • • •' : fmtARS(monthExpense)}</div>
        </div>
      </div>
    </div>
  );
}

// ── ACCOUNTS ROW ──────────────────────────────────────────────────────────────
function AccountsRow({ t }) {
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div style={{ fontSize:14, fontWeight:700, color:t.text }}>Mis cuentas</div>
        <div style={{ fontSize:12, color:t.primary, fontWeight:600 }}>Ver todas</div>
      </div>
      <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:4, scrollbarWidth:'none' }}>
        {ACCOUNTS.map(acc => (
          <div key={acc.id} style={{
            minWidth:128, background:t.surface, borderRadius:14, padding:'12px 14px',
            boxShadow:t.shadow, border:`1px solid ${t.border}`, flexShrink:0,
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
              <div style={{ width:8, height:8, borderRadius:4, background:acc.color }} />
              <div style={{ fontSize:10, color:t.textSec, fontWeight:500 }}>{acc.type}</div>
            </div>
            <div style={{ fontSize:12, fontWeight:700, color:t.text, marginBottom:3 }}>{acc.name}</div>
            <div style={{ fontSize:13, fontWeight:700, color:acc.balance<0 ? t.expense : t.text }}>
              {fmtMoney(acc.balance, acc.currency)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TX ITEM ───────────────────────────────────────────────────────────────────
function TxItem({ tx, t }) {
  const isIncome = tx.type === 'income';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 0', borderBottom:`1px solid ${t.border}` }}>
      <div style={{ width:42, height:42, borderRadius:21, background:t.surfaceAlt, display:'flex', alignItems:'center', justifyContent:'center', fontSize:19, flexShrink:0 }}>
        {tx.icon}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:600, color:t.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{tx.detail}</div>
        <div style={{ fontSize:11, color:t.textSec, marginTop:1 }}>{tx.account} · {fmtDate(tx.date)}</div>
      </div>
      <div style={{ textAlign:'right', flexShrink:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:isIncome ? t.income : t.expense }}>
          {isIncome ? '+' : '-'}{fmtMoney(tx.amount, tx.currency)}
        </div>
        <div style={{ fontSize:10, color:t.textMuted, marginTop:1 }}>{tx.currency}</div>
      </div>
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function DashboardScreen({ t, transactions }) {
  const [month, setMonth] = useState(3);
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  return (
    <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'14px 16px 0' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:12, color:t.textSec }}>Buenos días 👋</div>
          <div style={{ fontSize:19, fontWeight:800, color:t.text }}>sinunmango</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:20, width:36, height:36, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:t.shadow }}>
            <Icon name="bell" size={17} color={t.textSec} />
          </button>
          <img src="logo.png" alt="logo" style={{ width:36, height:36, borderRadius:18, objectFit:'contain' }} />
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
        <button onClick={() => setMonth(m => Math.max(0,m-1))} style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex' }}>
          <Icon name="chevron_l" size={20} color={t.textSec} />
        </button>
        <div style={{ fontSize:15, fontWeight:700, color:t.text }}>{months[month]} 2026</div>
        <button onClick={() => setMonth(m => Math.min(11,m+1))} style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex' }}>
          <Icon name="chevron_r" size={20} color={t.textSec} />
        </button>
      </div>

      <BalanceCard t={t} transactions={transactions} />
      <AccountsRow t={t} />

      <div style={{ marginBottom:8 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontSize:14, fontWeight:700, color:t.text }}>Últimos movimientos</div>
          <div style={{ fontSize:12, color:t.primary, fontWeight:600 }}>Ver todos</div>
        </div>
        <div style={{ background:t.surface, borderRadius:16, padding:'0 14px', boxShadow:t.shadow }}>
          {transactions.slice(0,5).map(tx => <TxItem key={tx.id} tx={tx} t={t} />)}
        </div>
      </div>
      <div style={{ height:110 }} />
    </div>
  );
}

// ── HISTORIAL ─────────────────────────────────────────────────────────────────
const DATE_RANGES = [
  { id:'all',       label:'Todos'       },
  { id:'thisMonth', label:'Este mes'    },
  { id:'lastMonth', label:'Mes anterior'},
  { id:'thisWeek',  label:'Esta semana' },
];

function HistorialScreen({ t, transactions }) {
  const [typeFilter, setTypeFilter] = useState('todos');
  const [dateRange,  setDateRange]  = useState('all');
  const [showDateMenu, setShowDateMenu] = useState(false);

  const typeFilters = [
    { id:'todos',    label:'Todos'    },
    { id:'expense',  label:'Gastos'   },
    { id:'income',   label:'Ingresos' },
  ];

  const filterByDate = (txs) => {
    const now = new Date();
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const endOfLastMonth   = new Date(now.getFullYear(), now.getMonth(), 0);

    return txs.filter(tx => {
      const d = new Date(tx.date + 'T12:00:00');
      if (dateRange === 'thisWeek')  return d >= startOfWeek;
      if (dateRange === 'thisMonth') return d >= startOfMonth;
      if (dateRange === 'lastMonth') return d >= startOfLastMonth && d <= endOfLastMonth;
      return true;
    });
  };

  const filtered = filterByDate(
    typeFilter === 'todos' ? transactions : transactions.filter(tx => tx.type === typeFilter)
  );

  const activeDateLabel = DATE_RANGES.find(r => r.id === dateRange)?.label || 'Todos';

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ padding:'14px 16px 0', background:t.bg }}>
        <div style={{ fontSize:20, fontWeight:800, color:t.text, marginBottom:12 }}>Movimientos</div>

        {/* Type pills */}
        <div style={{ display:'flex', gap:8, marginBottom:10 }}>
          {typeFilters.map(f => (
            <button key={f.id} onClick={() => setTypeFilter(f.id)} style={{
              padding:'6px 14px', borderRadius:20, border:'none', cursor:'pointer',
              fontSize:12, fontWeight:600,
              background: typeFilter===f.id ? t.pillActive : t.pillInactive,
              color:       typeFilter===f.id ? t.pillActiveText : t.pillInactiveText,
              transition:'all 0.2s',
            }}>{f.label}</button>
          ))}
          {/* Date range button */}
          <div style={{ marginLeft:'auto', position:'relative' }}>
            <button onClick={() => setShowDateMenu(v => !v)} style={{
              display:'flex', alignItems:'center', gap:5, padding:'6px 12px',
              borderRadius:20, border:`1px solid ${t.border}`, cursor:'pointer',
              fontSize:12, fontWeight:600, background:t.surface, color:t.text,
            }}>
              <Icon name="calendar" size={13} color={t.primary} />
              {activeDateLabel}
            </button>
            {showDateMenu && (
              <div style={{
                position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:50,
                background:t.surface, borderRadius:12, boxShadow:t.shadowMd,
                border:`1px solid ${t.border}`, overflow:'hidden', minWidth:140,
              }}>
                {DATE_RANGES.map(r => (
                  <button key={r.id} onClick={() => { setDateRange(r.id); setShowDateMenu(false); }} style={{
                    display:'block', width:'100%', textAlign:'left', padding:'10px 14px',
                    border:'none', background: dateRange===r.id ? t.surfaceAlt : 'none',
                    fontSize:13, fontWeight: dateRange===r.id ? 600 : 400,
                    color: dateRange===r.id ? t.primary : t.text, cursor:'pointer',
                    borderBottom:`1px solid ${t.border}`,
                  }}>{r.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ fontSize:11, color:t.textMuted, marginBottom:10 }}>{filtered.length} movimiento{filtered.length!==1?'s':''}</div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'0 16px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px 20px', color:t.textMuted, fontSize:14 }}>
            No hay movimientos para este período
          </div>
        ) : (
          <div style={{ background:t.surface, borderRadius:16, padding:'0 14px', boxShadow:t.shadow }}>
            {filtered.map(tx => <TxItem key={tx.id} tx={tx} t={t} />)}
          </div>
        )}
        <div style={{ height:110 }} />
      </div>
    </div>
  );
}

// ── MANGUITO ──────────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  'Gasté $4.500 en el súper con Visa',
  '¿Cuánto gasté el mes pasado?',
  'Pagué $12.000 de nafta en efectivo',
  '¿Cuál es mi cuenta con más gastos?',
];

function ManguitoScreen({ t }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { role:'user', text }]);
    setInput('');
    setLoading(true);
    try {
      const response = await window.claude.complete({
        messages:[{ role:'user', content:`Sos Manguito, el asistente financiero amigable de sinunmango. Respondé en español rioplatense, breve, cálido, máximo 3 oraciones. El usuario dice: "${text}"` }]
      });
      setMessages(prev => [...prev, { role:'assistant', text:response }]);
    } catch(e) {
      setMessages(prev => [...prev, { role:'assistant', text:'¡Ups! Algo falló. Probá de nuevo 🙈' }]);
    }
    setLoading(false);
  };

  const isEmpty = messages.length === 0;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ background:t.balanceBg, padding:'20px 20px 24px', display:'flex', flexDirection:'column', alignItems:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-30, right:-20, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }} />
        <img src="manguito.png" alt="Manguito" style={{ width:76, height:76, objectFit:'contain', marginBottom:8, filter:'drop-shadow(0 4px 16px rgba(0,0,0,0.3))' }} />
        <div style={{ fontSize:20, fontWeight:900, color:'#FFF', letterSpacing:2, textTransform:'uppercase' }}>Manguito</div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', marginTop:2 }}>Tu asistente financiero personal</div>
      </div>

      <div ref={chatRef} style={{ flex:1, overflowY:'auto', padding:'14px 14px 0', display:'flex', flexDirection:'column', gap:10 }}>
        {isEmpty ? (
          <div>
            <div style={{ fontSize:12, color:t.textSec, marginBottom:10, fontWeight:500 }}>Podés preguntarme cosas como:</div>
            {SUGGESTIONS.map((s,i) => (
              <button key={i} onClick={() => sendMessage(s)} style={{
                display:'block', width:'100%', textAlign:'left', background:t.surface,
                border:`1px solid ${t.border}`, borderRadius:12, padding:'11px 14px',
                fontSize:13, color:t.primary, cursor:'pointer', marginBottom:8,
                boxShadow:t.shadow, fontWeight:500,
              }}>{s}</button>
            ))}
          </div>
        ) : messages.map((msg,i) => (
          <div key={i} style={{ display:'flex', justifyContent:msg.role==='user'?'flex-end':'flex-start', gap:8 }}>
            {msg.role==='assistant' && (
              <img src="manguito.png" alt="" style={{ width:28, height:28, objectFit:'contain', flexShrink:0, marginTop:2 }} />
            )}
            <div style={{
              maxWidth:'80%', padding:'10px 14px',
              borderRadius: msg.role==='user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: msg.role==='user' ? t.primary : t.surface,
              color: msg.role==='user' ? '#FFF' : t.text,
              fontSize:13, lineHeight:1.55, boxShadow:t.shadow,
              border: msg.role==='assistant' ? `1px solid ${t.border}` : 'none',
            }}>{msg.text}</div>
          </div>
        ))}
        {loading && (
          <div style={{ display:'flex', gap:8 }}>
            <img src="manguito.png" alt="" style={{ width:28, height:28, objectFit:'contain', flexShrink:0 }} />
            <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:'18px 18px 18px 4px', padding:'12px 16px', boxShadow:t.shadow }}>
              <div style={{ display:'flex', gap:5 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width:6, height:6, borderRadius:3, background:t.textMuted, animation:`bounce 0.9s ${i*0.18}s infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div style={{ height:12 }} />
      </div>

      <div style={{ padding:'10px 12px 16px', borderTop:`1px solid ${t.border}`, background:t.surface, display:'flex', gap:8, alignItems:'center' }}>
        <img src="manguito.png" alt="" style={{ width:32, height:32, objectFit:'contain', flexShrink:0 }} />
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key==='Enter' && sendMessage(input)}
          placeholder="Escribí un mensaje..."
          style={{ flex:1, border:`1px solid ${t.inputBorder}`, borderRadius:22, padding:'9px 15px', fontSize:13, background:t.inputBg, color:t.text, outline:'none', fontFamily:'inherit' }}
        />
        <button onClick={() => sendMessage(input)} disabled={!input.trim()} style={{
          background: input.trim() ? t.primary : t.border, border:'none', borderRadius:22,
          width:38, height:38, cursor:input.trim()?'pointer':'default',
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background 0.2s',
        }}>
          <Icon name="send" size={16} color={input.trim() ? '#FFF' : t.textMuted} />
        </button>
      </div>
    </div>
  );
}

// ── CONFIG ────────────────────────────────────────────────────────────────────
function ConfigScreen({ t, mode, accentKey, onChangeMode, onChangeAccent }) {
  const accentList = Object.entries(ACCENTS);

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
      <div style={{ fontSize:20, fontWeight:800, color:t.text, marginBottom:18 }}>Configuración</div>

      {/* Profile */}
      <div style={{ background:t.balanceBg, borderRadius:20, padding:'18px 20px', marginBottom:18, display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:52, height:52, borderRadius:26, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon name="user" size={28} color="rgba(255,255,255,0.9)" />
        </div>
        <div>
          <div style={{ fontSize:16, fontWeight:700, color:'#FFF' }}>Mi cuenta</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)' }}>usuario@gmail.com</div>
        </div>
        <div style={{ marginLeft:'auto' }}>
          <Icon name="chevron_right" size={18} color="rgba(255,255,255,0.5)" />
        </div>
      </div>

      {/* Appearance card */}
      <div style={{ background:t.surface, borderRadius:18, padding:'18px', boxShadow:t.shadow, border:`1px solid ${t.border}`, marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:t.surfaceAlt, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Icon name="palette" size={18} color={t.primary} />
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:t.text }}>Apariencia</div>
            <div style={{ fontSize:11, color:t.textSec }}>Colores y modo de visualización</div>
          </div>
        </div>

        {/* Accent colors */}
        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:12, fontWeight:600, color:t.textSec, marginBottom:12, letterSpacing:0.3 }}>Color de acento</div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            {accentList.map(([key, acc]) => {
              const active = accentKey === key;
              return (
                <button key={key} onClick={() => onChangeAccent(key)} style={{
                  display:'flex', flexDirection:'column', alignItems:'center', gap:5,
                  background:'none', border:'none', cursor:'pointer', padding:0,
                }}>
                  <div style={{
                    width:44, height:44, borderRadius:22, background:acc.hex,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    border: active ? `3px solid ${t.text}` : '3px solid transparent',
                    boxShadow: active ? `0 0 0 2px ${acc.hex}` : 'none',
                    transition:'all 0.2s',
                  }}>
                    {active && <Icon name="check" size={20} color="#FFF" strokeWidth={3} />}
                  </div>
                  <div style={{ fontSize:10, fontWeight: active ? 700 : 400, color: active ? t.text : t.textSec }}>{acc.name}</div>
                </button>
              );
            })}
          </div>
          {true && (
            <div style={{ marginTop:10, fontSize:11, color:t.textSec }}>
              ✓ Tema <strong style={{ color:t.primary }}>{ACCENTS[accentKey]?.name}</strong> aplicado. Se guarda automáticamente.
            </div>
          )}
        </div>

        {/* Mode */}
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:t.textSec, marginBottom:10, letterSpacing:0.3 }}>Modo de visualización</div>
          <div style={{ display:'flex', gap:8 }}>
            {['claro','oscuro'].map(m => (
              <button key={m} onClick={() => onChangeMode(m)} style={{
                flex:1, padding:'9px 0', borderRadius:10, border:`1px solid ${mode===m ? t.primary : t.border}`,
                background: mode===m ? t.surfaceAlt : 'none',
                color: mode===m ? t.primary : t.textSec,
                cursor:'pointer', fontSize:13, fontWeight:600,
                display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                transition:'all 0.2s',
              }}>
                <Icon name={m==='claro'?'sun':'moon'} size={15} color={mode===m?t.primary:t.textSec} />
                {m.charAt(0).toUpperCase()+m.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ textAlign:'center', marginBottom:90, marginTop:20 }}>
        <img src="logo_completo.png" alt="sinunmango" style={{ width:110, opacity:0.35, objectFit:'contain' }} />
        <div style={{ fontSize:10, color:t.textMuted, marginTop:6 }}>v1.0.0</div>
      </div>
    </div>
  );
}

// ── NEW MOVEMENT SHEET ────────────────────────────────────────────────────────
function NewMovementSheet({ t, onClose, onSave }) {
  const [tipo, setTipo] = useState('expense');
  const [form, setForm] = useState({
    detail:'', amount:'', currency:'ARS',
    account:'Visa Provincia', category:'Supermercados',
    date: new Date().toISOString().slice(0,10), cuotas:'1',
  });
  const [saved, setSaved] = useState(false);

  const tipos = [
    { id:'expense', label:'Gasto' },
    { id:'income',  label:'Ingreso' },
    { id:'transfer',label:'Transferencia' },
  ];

  const handleSave = () => {
    if (!form.amount || !form.detail) return;
    setSaved(true);
    onSave({ ...form, tipo, amount: parseFloat(form.amount) });
    setTimeout(onClose, 1100);
  };

  const labelSt = { fontSize:10, fontWeight:700, color:t.textSec, marginBottom:5, letterSpacing:0.6, textTransform:'uppercase' };
  const inputSt = { width:'100%', border:`1px solid ${t.inputBorder}`, borderRadius:10, padding:'10px 12px', fontSize:14, background:t.inputBg, color:t.text, outline:'none', boxSizing:'border-box', fontFamily:'inherit' };

  return (
    <div style={{ position:'absolute', inset:0, zIndex:200, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(3px)' }} />
      <div style={{ position:'relative', background:t.surface, borderRadius:'22px 22px 0 0', maxHeight:'90%', display:'flex', flexDirection:'column', animation:'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)' }}>
        <div style={{ display:'flex', justifyContent:'center', padding:'12px 0 2px' }}>
          <div style={{ width:40, height:4, borderRadius:2, background:t.border }} />
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 20px 12px' }}>
          <div style={{ fontSize:18, fontWeight:800, color:t.text }}>Nuevo movimiento</div>
          <button style={{ background:t.surfaceAlt, border:'none', borderRadius:20, padding:'6px 12px', fontSize:12, color:t.primary, cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontWeight:600 }}>
            <Icon name="camera" size={13} color={t.primary} /> Ticket
          </button>
        </div>

        <div style={{ overflowY:'auto', padding:'0 20px 28px' }}>
          {/* Tipo tabs */}
          <div style={{ display:'flex', background:t.surfaceAlt, borderRadius:12, padding:3, marginBottom:16 }}>
            {tipos.map(tp => (
              <button key={tp.id} onClick={() => setTipo(tp.id)} style={{
                flex:1, padding:'9px 0', borderRadius:9, border:'none', cursor:'pointer',
                fontSize:13, fontWeight:600,
                background: tipo===tp.id ? t.surface : 'transparent',
                color:       tipo===tp.id ? t.text : t.textSec,
                boxShadow:   tipo===tp.id ? t.shadow : 'none',
                transition:'all 0.2s',
              }}>{tp.label}</button>
            ))}
          </div>

          {/* Fecha + Detalle */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <div style={labelSt}>Fecha</div>
              <input type="date" value={form.date} onChange={e => setForm(p=>({...p,date:e.target.value}))} style={inputSt} />
            </div>
            <div>
              <div style={labelSt}>Detalle</div>
              <input type="text" value={form.detail} onChange={e => setForm(p=>({...p,detail:e.target.value}))} placeholder="Ej: COTO" style={inputSt} />
            </div>
          </div>

          {/* Moneda + Monto */}
          <div style={{ display:'grid', gridTemplateColumns:'90px 1fr', gap:12, marginBottom:12 }}>
            <div>
              <div style={labelSt}>Moneda</div>
              <select value={form.currency} onChange={e => setForm(p=>({...p,currency:e.target.value}))} style={{...inputSt,appearance:'none',cursor:'pointer'}}>
                <option>ARS</option><option>USD</option><option>EUR</option>
              </select>
            </div>
            <div>
              <div style={labelSt}>Monto</div>
              <input type="number" value={form.amount} onChange={e => setForm(p=>({...p,amount:e.target.value}))} placeholder="0.00" style={inputSt} />
            </div>
          </div>

          {/* Cuenta */}
          <div style={{ marginBottom:12 }}>
            <div style={labelSt}>Cuenta</div>
            <select value={form.account} onChange={e => setForm(p=>({...p,account:e.target.value}))} style={{...inputSt,appearance:'none',cursor:'pointer'}}>
              {ACCOUNTS.map(a => <option key={a.id}>{a.name}</option>)}
            </select>
          </div>

          {/* Categoría */}
          <div style={{ marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
              <div style={labelSt}>Categoría</div>
              <div style={{ fontSize:11, color:t.primary, fontWeight:600 }}>+ Nueva</div>
            </div>
            <select value={form.category} onChange={e => setForm(p=>({...p,category:e.target.value}))} style={{...inputSt,appearance:'none',cursor:'pointer'}}>
              {CATEGORIES.map(c => <option key={c.name}>{c.icon} {c.name}</option>)}
            </select>
          </div>

          {tipo==='expense' && (
            <div style={{ marginBottom:12 }}>
              <div style={labelSt}>Cuotas</div>
              <input type="number" min="1" max="36" value={form.cuotas} onChange={e => setForm(p=>({...p,cuotas:e.target.value}))} style={{...inputSt,width:80}} />
            </div>
          )}

          <button onClick={handleSave} style={{
            width:'100%', padding:'15px 0', borderRadius:14, border:'none', cursor:'pointer',
            background: saved ? '#16A34A' : t.primary,
            color:'#FFF', fontSize:15, fontWeight:800,
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            transition:'background 0.3s', fontFamily:'inherit',
          }}>
            {saved ? <><Icon name="check" size={18} color="#fff" strokeWidth={3}/> Guardado</> : 'Guardar movimiento'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
function SinunmangoApp({ initialMode, initialAccent, onThemeChange }) {
  const [tab,       setTab]       = useState('dashboard');
  const [showSheet, setShowSheet] = useState(false);
  const [transactions, setTransactions] = useState(INITIAL_TRANSACTIONS);
  const [mode,      setMode]      = useState(initialMode   || 'claro');
  const [accentKey, setAccentKey] = useState(initialAccent || 'azul');

  const t = buildTheme(mode, accentKey);

  const handleModeChange = (m) => {
    setMode(m);
    onThemeChange && onThemeChange(m, accentKey);
  };
  const handleAccentChange = (a) => {
    setAccentKey(a);
    onThemeChange && onThemeChange(mode, a);
  };

  const handleSave = (data) => {
    const catIcon = CATEGORIES.find(c => c.name === data.category)?.icon || '💸';
    setTransactions(prev => [{
      id: Date.now(), type: data.tipo, detail: data.detail, category: data.category,
      amount: parseFloat(data.amount), currency: data.currency, account: data.account,
      date: data.date, icon: catIcon,
    }, ...prev]);
  };

  const screens = {
    dashboard: <DashboardScreen t={t} transactions={transactions} />,
    historial: <HistorialScreen t={t} transactions={transactions} />,
    manguito:  <ManguitoScreen  t={t} />,
    config:    <ConfigScreen    t={t} mode={mode} accentKey={accentKey} onChangeMode={handleModeChange} onChangeAccent={handleAccentChange} />,
  };

  return (
    <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', background:t.bg, position:'relative', overflow:'hidden', fontFamily:"'Plus Jakarta Sans','Inter',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; }
        input, select, button { font-family:inherit; }
        ::-webkit-scrollbar { display:none; }
        @keyframes slideUp { from { transform:translateY(100%); } to { transform:translateY(0); } }
        @keyframes bounce  { 0%,60%,100% { transform:translateY(0); } 30% { transform:translateY(-6px); } }
      `}</style>
      {screens[tab] || screens.dashboard}
      <TabBar tab={tab} setTab={setTab} onFab={() => setShowSheet(true)} t={t} />
      {showSheet && <NewMovementSheet t={t} onClose={() => setShowSheet(false)} onSave={handleSave} />}
    </div>
  );
}

Object.assign(window, { SinunmangoApp, buildTheme, ACCENTS });
