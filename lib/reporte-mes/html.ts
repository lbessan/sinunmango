import 'server-only'
import type { ReporteMesData } from './data'

// ─── Reporte mensual PDF — HTML LAYER ─────────────────────────────────────────
//
// Convierte ReporteMesData en un HTML string self-contained (CSS inline,
// sin links externos a fuentes / imágenes). Puppeteer lo recibe via
// page.setContent() y lo "imprime" a PDF.
//
// Paleta:
//   - Brand: #1a6b5a (verde sinunmango), #FFB84D (mango)
//   - Texto: #0A0E1A (navy oscuro)
//   - Sutil:  #64748b (slate-500)
//   - Background: blanco / cream cálido para los headers
//
// Decisión: no usamos Tailwind ni fuentes externas (cold start de
// Puppeteer ya es lento — agregar font fetching mete más latencia y
// fallos). Sistema font stack + CSS inline.

const fmt = (n: number): string =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const fmtUsd = (n: number): string =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Escape HTML para evitar XSS si algún detalle del user trae < o >
function esc(s: string | null | undefined): string {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function reporteToHtml(data: ReporteMesData): string {
  const { mes, mesLabel, generadoEn, kpis, porCategoria, topGastos, tarjetas, cuentas } = data

  const balancePositivo = kpis.balance >= 0
  const balanceColor    = balancePositivo ? '#0F4D3A' : '#b91c1c'
  const generadoLabel   = new Date(generadoEn).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reporte ${esc(mesLabel)} — sinunmango</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #0A0E1A;
      line-height: 1.5;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page { padding: 0; }

    /* ── Header con gradient brand ────────────────────────────────────── */
    .header {
      background: linear-gradient(135deg, #07192b 0%, #1a6b5a 100%);
      color: white;
      padding: 32px 40px 28px;
      margin-bottom: 32px;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .brand {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .brand .mango { color: #FFB84D; }
    .header-period {
      font-size: 11px;
      opacity: 0.8;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .header-mes {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    /* ── Contenedor principal con padding lateral ─────────────────────── */
    .content {
      padding: 0 40px;
    }

    /* ── KPIs grid 4 cols ─────────────────────────────────────────────── */
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 36px;
    }
    .kpi {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px 18px;
    }
    .kpi-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 6px;
    }
    .kpi-value {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #0A0E1A;
      line-height: 1.1;
    }
    .kpi-sub {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 4px;
    }
    .kpi-positive { color: #0F4D3A; }
    .kpi-negative { color: #b91c1c; }
    .kpi-warning  { color: #c2410c; }

    /* ── Section ─────────────────────────────────────────────────────── */
    .section {
      margin-bottom: 32px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: -0.01em;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #1a6b5a;
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }
    .section-title-aside {
      font-size: 10px;
      font-weight: 500;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    /* ── Tablas ──────────────────────────────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      text-align: left;
      padding: 8px 10px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
    }
    td {
      padding: 10px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    td.amount, th.amount {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    td.muted {
      color: #94a3b8;
      font-size: 11px;
    }
    tr:last-child td {
      border-bottom: none;
    }

    /* ── Barra horizontal de porcentaje (por categoría) ───────────────── */
    .bar-track {
      width: 100px;
      height: 6px;
      background: #f1f5f9;
      border-radius: 999px;
      overflow: hidden;
      display: inline-block;
      margin-right: 8px;
      vertical-align: middle;
    }
    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #1a6b5a, #FFB84D);
      border-radius: 999px;
    }
    .pct-label {
      font-size: 11px;
      color: #64748b;
      font-variant-numeric: tabular-nums;
    }

    /* ── Footer ──────────────────────────────────────────────────────── */
    .footer {
      margin-top: 40px;
      padding: 16px 40px;
      border-top: 1px solid #e2e8f0;
      font-size: 10px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer .mango { color: #c2410c; font-weight: 600; }

    /* ── Sin datos ───────────────────────────────────────────────────── */
    .empty {
      text-align: center;
      padding: 24px;
      font-size: 12px;
      color: #94a3b8;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="page">

    <!-- ── HEADER ──────────────────────────────────────────────────── -->
    <header class="header">
      <div class="header-row">
        <div>
          <p class="header-period">Reporte mensual</p>
          <h1 class="header-mes">${esc(mesLabel)}</h1>
        </div>
        <div class="brand">sinun<span class="mango">mango</span></div>
      </div>
    </header>

    <div class="content">

      <!-- ── KPIs ──────────────────────────────────────────────────── -->
      <section class="kpis">
        <div class="kpi">
          <p class="kpi-label">Ingresos</p>
          <p class="kpi-value kpi-positive">$${fmt(kpis.ingresos)}</p>
          <p class="kpi-sub">ARS · ${kpis.movimientosCount} movs en el mes</p>
        </div>
        <div class="kpi">
          <p class="kpi-label">Gastos</p>
          <p class="kpi-value kpi-negative">$${fmt(kpis.gastos)}</p>
          <p class="kpi-sub">ARS</p>
        </div>
        <div class="kpi">
          <p class="kpi-label">Balance</p>
          <p class="kpi-value" style="color: ${balanceColor};">
            ${balancePositivo ? '+' : '−'}$${fmt(Math.abs(kpis.balance))}
          </p>
          <p class="kpi-sub">ARS · ${balancePositivo ? 'ahorrado' : 'déficit'}</p>
        </div>
        <div class="kpi">
          <p class="kpi-label">Gastos / Ingresos</p>
          <p class="kpi-value ${kpis.gastosPctIng > 100 ? 'kpi-negative' : kpis.gastosPctIng > 80 ? 'kpi-warning' : 'kpi-positive'}">
            ${kpis.gastosPctIng}%
          </p>
          <p class="kpi-sub">${kpis.gastosPctIng > 100 ? 'Gastaste más de lo que ingresó' : kpis.gastosPctIng > 80 ? 'Ajustado' : 'Saludable'}</p>
        </div>
      </section>

      <!-- ── DISTRIBUCIÓN POR CATEGORÍA ──────────────────────────────── -->
      <section class="section">
        <h2 class="section-title">
          Distribución por categoría
          <span class="section-title-aside">${porCategoria.length} categorías</span>
        </h2>
        ${porCategoria.length === 0 ? `
          <p class="empty">No hay gastos registrados este mes.</p>
        ` : `
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                <th class="amount">Monto</th>
                <th class="amount" style="width: 200px;">% del total</th>
              </tr>
            </thead>
            <tbody>
              ${porCategoria.map(c => `
                <tr>
                  <td>${esc(c.categoria_nombre)}</td>
                  <td class="amount">$${fmt(c.monto)}</td>
                  <td class="amount">
                    <span class="bar-track">
                      <span class="bar-fill" style="width: ${Math.min(c.pct, 100)}%;"></span>
                    </span>
                    <span class="pct-label">${c.pct.toFixed(1)}%</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </section>

      <!-- ── TOP 10 GASTOS ────────────────────────────────────────────── -->
      <section class="section">
        <h2 class="section-title">
          Top ${topGastos.length} gastos del mes
          <span class="section-title-aside">Mayor a menor</span>
        </h2>
        ${topGastos.length === 0 ? `
          <p class="empty">No hay gastos individuales que destacar.</p>
        ` : `
          <table>
            <thead>
              <tr>
                <th style="width: 80px;">Fecha</th>
                <th>Detalle</th>
                <th>Categoría</th>
                <th>Cuenta</th>
                <th class="amount">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${topGastos.map(g => `
                <tr>
                  <td class="muted">${esc(g.fecha)}</td>
                  <td>${esc(g.detalle)}</td>
                  <td class="muted">${esc(g.categoria)}</td>
                  <td class="muted">${esc(g.cuenta)}</td>
                  <td class="amount">$${fmt(g.monto)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </section>

      ${tarjetas.length > 0 ? `
      <!-- ── TARJETAS — DEUDA DEL PERÍODO ────────────────────────────── -->
      <section class="section">
        <h2 class="section-title">
          Tarjetas de crédito
          <span class="section-title-aside">Deuda del período ${esc(mes)}</span>
        </h2>
        <table>
          <thead>
            <tr>
              <th>Tarjeta</th>
              <th class="amount">Deuda ARS</th>
              <th class="amount">Deuda USD</th>
            </tr>
          </thead>
          <tbody>
            ${tarjetas.map(t => `
              <tr>
                <td>${esc(t.nombre_cuenta)}</td>
                <td class="amount">${t.deuda_ars > 0 ? `$${fmt(t.deuda_ars)}` : '—'}</td>
                <td class="amount">${t.deuda_usd > 0 ? `US$ ${fmtUsd(t.deuda_usd)}` : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
      ` : ''}

      ${cuentas.length > 0 ? `
      <!-- ── CUENTAS — SALDOS ACTUALES ──────────────────────────────── -->
      <section class="section">
        <h2 class="section-title">
          Cuentas
          <span class="section-title-aside">Saldos actuales</span>
        </h2>
        <table>
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Tipo</th>
              <th>Moneda</th>
              <th class="amount">Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${cuentas.map(c => `
              <tr>
                <td>${esc(c.nombre_cuenta)}</td>
                <td class="muted">${esc(c.tipo_cuenta)}</td>
                <td class="muted">${esc(c.moneda)}</td>
                <td class="amount">${c.moneda === 'USD' ? 'US$ ' + fmtUsd(c.saldo) : '$' + fmt(c.saldo)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
      ` : ''}

    </div>

    <!-- ── FOOTER ────────────────────────────────────────────────────── -->
    <footer class="footer">
      <span>Generado el ${esc(generadoLabel)}</span>
      <span>sinun<span class="mango">mango</span> · app.sinunmango.com.ar</span>
    </footer>

  </div>
</body>
</html>`
}
