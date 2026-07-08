// ── State ──
var kxPedidos = [];
var kxIngresos = [];
var kxOrdenes = [];
var kxMuestras = [];
var kxReenvases = [];
var kxDevoluciones = [];
var kxAjustes = [];
var kxCatalogo = [];
var kxMovimientos = [];
var kxFiltered = [];

var EMPRESAS_HOLDING = [
  { value: 'PARCELAR DE COLOMBIA SAS', sigla: 'PARCELAR' },
  { value: 'GREEN AGROSOLUCIONES DE COLOMBIA SAS', sigla: 'GREEN' },
  { value: 'SOLUCIONES INTEGRALES RESO SAS', sigla: 'RESO' },
  { value: 'INSUMOS AGROPECUARIOS SOSTENIBLES SAS', sigla: 'IASO' },
  { value: 'INSUMOS AGROPECUARIOS DE LA SABANA SAS', sigla: 'IAS' },
];

function getSiglaKx(n) {
  for (var i = 0; i < EMPRESAS_HOLDING.length; i++) {
    if (EMPRESAS_HOLDING[i].value === (n || '').trim()) return EMPRESAS_HOLDING[i].sigla;
  }
  return n || '—';
}

// ── Load all modules ──
async function loadKardex() {
  var loadZone = document.getElementById('load-zone');
  var mainEl = document.getElementById('main');
  var errEl = document.getElementById('load-error');
  var retryBtn = document.getElementById('btn-retry');
  var spinnerEl = document.getElementById('load-spinner');

  if (mainEl.style.display === 'block') {
    setSyncStatus('syncing', 'Actualizando datos...');
  } else {
    loadZone.style.display = 'block';
    spinnerEl.style.display = 'inline-block';
    errEl.style.display = 'none';
    retryBtn.style.display = 'none';
  }

  try {
    var results = await Promise.all([
      apiGet('getPedidos').catch(function() { return { ok: true, pedidos: [] }; }),
      apiGet('getIngresos').catch(function() { return { ok: true, ingresos: [] }; }),
      apiGet('getOrdenesCompra').catch(function() { return { ok: true, ordenes: [] }; }),
      apiGet('getMuestras').catch(function() { return { ok: true, muestras: [] }; }),
      apiGet('getReenvases').catch(function() { return { ok: true, reenvases: [] }; }),
      apiGet('getDevoluciones').catch(function() { return { ok: true, devoluciones: [] }; }),
      apiGet('getKardexAjustes').catch(function() { return { ok: true, ajustes: [] }; }),
      apiGet('getMaestroProductos').catch(function() { return { ok: true, productos: [] }; })
    ]);

    kxPedidos = (results[0].pedidos || []).filter(function(p) {
      return p.Nombre_Empresa !== 'Nombre_Empresa' && p.Cliente !== 'Cliente';
    });
    kxIngresos = results[1].ingresos || [];
    kxOrdenes = results[2].ordenes || [];
    kxMuestras = results[3].muestras || [];
    kxReenvases = results[4].reenvases || [];
    kxDevoluciones = results[5].devoluciones || [];
    kxAjustes = results[6].ajustes || [];
    kxCatalogo = results[7].productos || [];

    buildMovimientos();
    populateKxFilters();
    calcularKardex();

    loadZone.style.display = 'none';
    mainEl.style.display = 'block';
    var total = kxPedidos.length + kxIngresos.length + kxOrdenes.length + kxMuestras.length + kxReenvases.length + kxDevoluciones.length;
    setSyncStatus('ok', 'Conectado a la nube. Última actualización: ' + new Date().toLocaleTimeString('es-CO'));
    document.getElementById('hdr-status').textContent = '☁️ Supabase · ' + total + ' transacciones';
  } catch (err) {
    if (mainEl.style.display === 'block') {
      setSyncStatus('error', 'Error al actualizar: ' + err.message);
    } else {
      spinnerEl.style.display = 'none';
      errEl.textContent = '⚠️ ' + err.message;
      errEl.style.display = 'block';
      retryBtn.style.display = 'inline-block';
    }
  }
}

// ── Build unified movements ──
function buildMovimientos() {
  kxMovimientos = [];

  // Pedidos — entregas (SALIDA)
  kxPedidos.forEach(function(p) {
    var cantE = Number(p.Cant_Entregada) || 0;
    if (cantE <= 0) return;
    var est2 = (p.Estado_2 || '').trim();
    if (est2 === 'Anulado') return;
    kxMovimientos.push({
      fecha: p.Fecha_Ult_Entrega || p.Fecha_Pedido || '',
      tipo: 'Salida',
      modulo: 'Pedidos',
      remision: p.Remisiones || '',
      referencia: 'Orden ' + (p.Consecutivo || '') + ' — ' + (p.Cliente || ''),
      empresa: p.Nombre_Empresa || '',
      producto: p.Producto || '',
      presentacion: p.Presentacion || '',
      cantidad: cantE,
      _ajusteId: null
    });
  });

  // Ingresos — ENTRADA para destino siempre; SALIDA para origen solo si NO es Cachipay
  kxIngresos.forEach(function(ing) {
    var cant = Number(ing.Cantidad) || 0;
    if (cant <= 0) return;
    var esCachipay = (ing.Origen || '').toLowerCase().indexOf('cachipay') >= 0;
    // ENTRADA destino
    if (ing.Empresa_Destino) {
      kxMovimientos.push({
        fecha: ing.Fecha || '',
        tipo: 'Entrada',
        modulo: 'Ingresos',
        remision: ing.Remision_Destino || '',
        referencia: 'Desde ' + getSiglaKx(ing.Empresa_Origen) + (ing.Origen ? ' — ' + ing.Origen : ''),
        empresa: ing.Empresa_Destino,
        producto: ing.Producto || '',
        presentacion: ing.Presentacion || '',
        cantidad: cant,
        _ajusteId: null
      });
    }
    // SALIDA origen — se omite para ingresos desde Cachipay
    if (ing.Empresa_Origen && !esCachipay) {
      kxMovimientos.push({
        fecha: ing.Fecha || '',
        tipo: 'Salida',
        modulo: 'Ingresos',
        remision: ing.Remision_Origen || '',
        referencia: 'Hacia ' + getSiglaKx(ing.Empresa_Destino) + (ing.Origen ? ' — ' + ing.Origen : ''),
        empresa: ing.Empresa_Origen,
        producto: ing.Producto || '',
        presentacion: ing.Presentacion || '',
        cantidad: cant,
        _ajusteId: null
      });
    }
  });

  // Devoluciones — ENTRADA (producto regresa)
  kxDevoluciones.forEach(function(d) {
    var cant = Number(d.Cant_Entregada || d.Cantidad) || 0;
    if (cant <= 0) return;
    var estado = (d.Estado || '').toLowerCase();
    if (estado === 'anulado') return;
    kxMovimientos.push({
      fecha: d.Fecha_Devolucion || d.Fecha || '',
      tipo: 'Entrada',
      modulo: 'Devoluciones',
      remision: d.Remision || '',
      referencia: 'Dev. ' + (d.Consecutivo || '') + (d.Motivo ? ' — ' + d.Motivo : ''),
      empresa: d.Empresa || '',
      producto: d.Producto || '',
      presentacion: d.Presentacion || '',
      cantidad: cant,
      _ajusteId: null
    });
  });

  // Órdenes de Compra — ENTRADA
  kxOrdenes.forEach(function(oc) {
    var cant = Number(oc.Cantidad) || 0;
    if (cant <= 0) return;
    var rem = String(oc.Remision || '').trim();
    if (!rem) return;
    kxMovimientos.push({
      fecha: oc.Fecha || '',
      tipo: 'Entrada',
      modulo: 'Órdenes de Compra',
      remision: rem,
      referencia: 'OC ' + (oc.Consecutivo || '') + (oc.Proveedor ? ' — ' + oc.Proveedor : ''),
      empresa: oc.Empresa_Destino || '',
      producto: oc.Producto || '',
      presentacion: oc.Presentacion || '',
      cantidad: cant,
      _ajusteId: null
    });
  });

  // Muestras — SALIDA
  kxMuestras.forEach(function(m) {
    var cant = Number(m.Cant_Entregada || m.Cantidad) || 0;
    if (cant <= 0) return;
    var rem = String(m.Remision || '').trim();
    if (!rem) return;
    kxMovimientos.push({
      fecha: m.Fecha_Entrega || m.Fecha_Solicitud || '',
      tipo: 'Salida',
      modulo: 'Muestras',
      remision: rem,
      referencia: 'Sol. ' + (m.Consecutivo || '') + (m.Solicitante ? ' — ' + m.Solicitante : ''),
      empresa: m.Empresa || '',
      producto: m.Producto || '',
      presentacion: m.Presentacion || '',
      cantidad: cant,
      _ajusteId: null
    });
  });

  // Salidas a producción (Reenvases) — SALIDA
  kxReenvases.forEach(function(re) {
    var cant = Number(re.Cantidad) || 0;
    if (cant <= 0) return;
    var rem = String(re.Remision || '').trim();
    if (!rem) return;
    kxMovimientos.push({
      fecha: re.Fecha || '',
      tipo: 'Salida',
      modulo: 'Producción',
      remision: rem,
      referencia: re.Destino || '',
      empresa: re.Empresa || '',
      producto: re.Producto || '',
      presentacion: re.Presentacion || '',
      cantidad: cant,
      _ajusteId: null
    });
  });

  // Ajustes manuales y Saldos iniciales
  kxAjustes.forEach(function(a) {
    var cant = Number(a.Cantidad) || 0;
    if (cant <= 0) return;
    var tipo = a.Tipo || '';
    var esTipo;
    var modulo;
    if (tipo === 'Saldo_Inicial') {
      esTipo = 'Entrada';
      modulo = 'Saldo Inicial';
    } else if (tipo === 'Ajuste_Sobrante') {
      esTipo = 'Entrada';
      modulo = 'Ajuste';
    } else if (tipo === 'Ajuste_Faltante') {
      esTipo = 'Salida';
      modulo = 'Ajuste';
    } else {
      return;
    }
    kxMovimientos.push({
      fecha: a.Fecha || '',
      tipo: esTipo,
      modulo: modulo,
      remision: '',
      referencia: a.Observaciones || '',
      empresa: a.Empresa || '',
      producto: a.Producto || '',
      presentacion: a.Presentacion || '',
      cantidad: cant,
      _ajusteId: a.__row || a.id || null
    });
  });
}

// ── Filters ──
var kxFiltersAttached = false;

function populateKxFilters() {
  if (!kxFiltersAttached) {
    document.getElementById('f-empresa').addEventListener('change', function() {
      populateProductFilter();
      calcularKardex();
    });
    document.getElementById('f-prod').addEventListener('change', calcularKardex);
    document.getElementById('f-desde').addEventListener('change', calcularKardex);
    document.getElementById('f-hasta').addEventListener('change', calcularKardex);
    kxFiltersAttached = true;
  }
  populateProductFilter();
}

function populateProductFilter() {
  var fEmp = document.getElementById('f-empresa').value;
  var productos = {};
  kxMovimientos.forEach(function(m) {
    if (fEmp && m.empresa !== fEmp) return;
    if (m.producto) productos[m.producto] = true;
  });
  var sorted = Object.keys(productos).sort();
  var fp = document.getElementById('f-prod');
  var current = fp.value;
  fp.innerHTML = '<option value="">— Seleccionar —</option>' + sorted.map(function(p) {
    return '<option value="' + p.replace(/"/g, '&quot;') + '">' + p + '</option>';
  }).join('');
  if (current && sorted.indexOf(current) >= 0) fp.value = current;
}

function clearKardexFilters() {
  document.getElementById('f-empresa').value = '';
  document.getElementById('f-prod').value = '';
  document.getElementById('f-desde').value = '';
  document.getElementById('f-hasta').value = '';
  populateProductFilter();
  calcularKardex();
}

// ── Calculate & render Kardex ──
function calcularKardex() {
  var fEmp = document.getElementById('f-empresa').value;
  var fProd = document.getElementById('f-prod').value;
  var fDesde = document.getElementById('f-desde').value;
  var fHasta = document.getElementById('f-hasta').value;

  if (!fEmp || !fProd) {
    document.getElementById('kx-no-filter').style.display = 'block';
    document.getElementById('kx-table-wrap').style.display = 'none';
    document.getElementById('s-saldo-ini').textContent = '0';
    document.getElementById('s-entradas').textContent = '0';
    document.getElementById('s-salidas').textContent = '0';
    document.getElementById('s-saldo-act').textContent = '0';
    document.getElementById('row-ct-kx').textContent = '';
    return;
  }

  document.getElementById('kx-no-filter').style.display = 'none';
  document.getElementById('kx-table-wrap').style.display = 'block';

  // Filter movements
  kxFiltered = kxMovimientos.filter(function(m) {
    if (m.empresa !== fEmp) return false;
    if (m.producto !== fProd) return false;
    if (fDesde && m.fecha < fDesde) return false;
    if (fHasta && m.fecha > fHasta) return false;
    return true;
  });

  // Sort by date, then saldo_inicial first
  kxFiltered.sort(function(a, b) {
    var da = a.fecha || '';
    var db = b.fecha || '';
    if (da !== db) return da < db ? -1 : 1;
    var pa = a.modulo === 'Saldo Inicial' ? 0 : 1;
    var pb = b.modulo === 'Saldo Inicial' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    var ea = a.tipo === 'Entrada' ? 0 : 1;
    var eb = b.tipo === 'Entrada' ? 0 : 1;
    return ea - eb;
  });

  // Calculate running balance and stats
  var saldoIni = 0;
  var totalEntradas = 0;
  var totalSalidas = 0;
  var saldo = 0;

  kxFiltered.forEach(function(m) {
    if (m.tipo === 'Entrada') {
      saldo += m.cantidad;
      if (m.modulo === 'Saldo Inicial') {
        saldoIni += m.cantidad;
      } else {
        totalEntradas += m.cantidad;
      }
    } else {
      saldo -= m.cantidad;
      totalSalidas += m.cantidad;
    }
    m._saldo = saldo;
  });

  document.getElementById('s-saldo-ini').textContent = saldoIni.toLocaleString('es-CO');
  document.getElementById('s-entradas').textContent = totalEntradas.toLocaleString('es-CO');
  document.getElementById('s-salidas').textContent = totalSalidas.toLocaleString('es-CO');
  document.getElementById('s-saldo-act').textContent = saldo.toLocaleString('es-CO');

  renderKardexTable();
}

function renderKardexTable() {
  var cols = ['#', 'Fecha', 'Tipo', 'Módulo', 'N° Remisión', 'Referencia', 'Entrada', 'Salida', 'Saldo', ''];
  document.getElementById('t-head-kx').innerHTML = cols.map(function(c) {
    return '<th>' + c + '</th>';
  }).join('');

  document.getElementById('row-ct-kx').textContent = '(' + kxFiltered.length + ' movimientos)';

  var tbody = document.getElementById('t-body-kx');
  if (!kxFiltered.length) {
    tbody.innerHTML = '<tr><td colspan="10"><div class="empty-msg" style="text-align:center;padding:32px;color:#718096">No hay movimientos para este producto con los filtros seleccionados.</div></td></tr>';
    return;
  }

  var MOD_COLORS = {
    'Pedidos': '#2980b9',
    'Ingresos': '#27ae60',
    'Devoluciones': '#e67e22',
    'Órdenes de Compra': '#8e44ad',
    'Muestras': '#f39c12',
    'Producción': '#d35400',
    'Saldo Inicial': '#1a5276',
    'Ajuste': '#0e6655'
  };

  tbody.innerHTML = kxFiltered.map(function(m, i) {
    var modColor = MOD_COLORS[m.modulo] || '#718096';
    var entradaStr = m.tipo === 'Entrada' ? '<span style="color:#27ae60;font-weight:700">+' + m.cantidad.toLocaleString('es-CO') + '</span>' : '';
    var salidaStr = m.tipo === 'Salida' ? '<span style="color:#e74c3c;font-weight:700">−' + m.cantidad.toLocaleString('es-CO') + '</span>' : '';
    var saldoColor = m._saldo < 0 ? '#e74c3c' : '#2c3e50';
    var deleteBtn = m._ajusteId ? '<button class="btn-del" onclick="openDeleteKx(' + m._ajusteId + ',\'' + (m.modulo || '').replace(/'/g, "\\'") + '\',' + m.cantidad + ')" title="Eliminar ajuste" style="font-size:0.72rem;padding:3px 8px">🗑️</button>' : '';

    return '<tr' + (m.modulo === 'Saldo Inicial' ? ' style="background:#f0f9ff"' : '') + '>' +
      '<td style="color:#718096;font-size:0.78rem">' + (i + 1) + '</td>' +
      '<td style="white-space:nowrap;font-size:0.8rem">' + fmtDate(m.fecha) + '</td>' +
      '<td><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.72rem;font-weight:700;color:white;background:' + (m.tipo === 'Entrada' ? '#27ae60' : '#e74c3c') + '">' + m.tipo + '</span></td>' +
      '<td><span style="background:' + modColor + ';color:white;padding:2px 9px;border-radius:12px;font-size:0.72rem;font-weight:700">' + m.modulo + '</span></td>' +
      '<td style="font-size:0.8rem;font-weight:600">' + (m.remision || '—') + '</td>' +
      '<td style="font-size:0.78rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (m.referencia || '').replace(/"/g, '&quot;') + '">' + (m.referencia || '—') + '</td>' +
      '<td style="text-align:right">' + entradaStr + '</td>' +
      '<td style="text-align:right">' + salidaStr + '</td>' +
      '<td style="text-align:right;font-weight:800;color:' + saldoColor + '">' + m._saldo.toLocaleString('es-CO') + '</td>' +
      '<td>' + deleteBtn + '</td>' +
    '</tr>';
  }).join('');
}

// ── Export Excel ──
function exportKardexExcel() {
  if (!kxFiltered.length) { showToast('No hay datos para exportar. Selecciona empresa y producto.', '#e74c3c'); return; }

  var fEmp = document.getElementById('f-empresa').value;
  var fProd = document.getElementById('f-prod').value;

  var data = kxFiltered.map(function(m, i) {
    return {
      '#': i + 1,
      'Fecha': m.fecha || '',
      'Tipo': m.tipo,
      'Módulo': m.modulo,
      'N° Remisión': m.remision || '',
      'Referencia': m.referencia || '',
      'Producto': m.producto,
      'Presentación': m.presentacion,
      'Entrada': m.tipo === 'Entrada' ? m.cantidad : '',
      'Salida': m.tipo === 'Salida' ? m.cantidad : '',
      'Saldo': m._saldo
    };
  });

  var ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 5 }, { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 15 },
    { wch: 35 }, { wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
  ];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kardex');
  var filename = 'Kardex_' + getSiglaKx(fEmp) + '_' + (fProd || '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30) + '_' + today() + '.xlsx';
  XLSX.writeFile(wb, filename);
  showToast('Excel exportado: ' + kxFiltered.length + ' movimientos');
}

// ── Autocomplete helpers ──
var activeAutocompleteKx = null;

function buildKxProductSearch(prefix, lineIdx) {
  var inp = document.querySelector('.' + prefix + '-prod-search[data-line="' + lineIdx + '"]');
  if (!inp) return;

  inp.addEventListener('input', function() {
    var q = this.value.toLowerCase().trim();
    var empSel = document.getElementById(prefix === 'aj' ? 'aj-empresa' : 'si-empresa').value;
    closeAllAutocompleteKx();
    if (q.length < 1) return;

    var matches = kxCatalogo.filter(function(p) {
      var matchName = (p.producto || '').toLowerCase().indexOf(q) >= 0;
      var matchEmp = !empSel || !p.empresa || p.empresa === empSel;
      return matchName && matchEmp;
    });

    var seen = {};
    matches = matches.filter(function(p) {
      var key = p.producto + '||' + p.presentacion;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });

    if (!matches.length) return;

    var list = document.createElement('div');
    list.className = 'autocomplete-list-kx';
    list.style.cssText = 'position:absolute;z-index:100;background:white;border:1px solid #cbd5e0;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.12);max-height:200px;overflow-y:auto;width:100%;left:0;top:100%';

    matches.slice(0, 15).forEach(function(p) {
      var item = document.createElement('div');
      item.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid #f0f4f8;display:flex;justify-content:space-between;align-items:center';
      item.innerHTML = '<span style="font-weight:600">' + (p.producto || '') + '</span><span style="color:#718096;font-size:0.75rem">' + (p.presentacion || '') + '</span>';
      item.addEventListener('mousedown', function(ev) {
        ev.preventDefault();
        inp.value = p.producto;
        var presInp = document.querySelector('.' + prefix + '-pres[data-line="' + lineIdx + '"]');
        if (presInp) presInp.value = p.presentacion || '';
        closeAllAutocompleteKx();
      });
      item.addEventListener('mouseover', function() { this.style.background = '#f0f8ff'; });
      item.addEventListener('mouseout', function() { this.style.background = 'white'; });
      list.appendChild(item);
    });

    var wrapper = inp.parentElement;
    wrapper.style.position = 'relative';
    wrapper.appendChild(list);
    activeAutocompleteKx = list;
  });

  inp.addEventListener('blur', function() {
    setTimeout(closeAllAutocompleteKx, 150);
  });
}

function closeAllAutocompleteKx() {
  document.querySelectorAll('.autocomplete-list-kx').forEach(function(el) { el.remove(); });
  activeAutocompleteKx = null;
}

// ── Ajuste Manual Modal ──
var ajLineas = [];

function openAjusteModal() {
  document.getElementById('ajuste-modal-title').textContent = '➕ Ajuste Manual de Inventario';
  document.getElementById('aj-fecha').value = today();
  document.getElementById('aj-empresa').value = document.getElementById('f-empresa').value || '';
  document.getElementById('aj-tipo').value = 'Ajuste_Sobrante';
  document.getElementById('aj-observaciones').value = '';
  document.getElementById('btn-save-ajuste').disabled = false;
  document.getElementById('btn-save-ajuste').textContent = '✓ Registrar ajuste';
  ajLineas = [{ Producto: '', Presentacion: '', Cantidad: '' }];
  renderAjLines();
  document.getElementById('ajuste-overlay').classList.add('show');
}

function closeAjusteModal() {
  document.getElementById('ajuste-overlay').classList.remove('show');
  closeAllAutocompleteKx();
}
document.getElementById('ajuste-overlay').addEventListener('click', function(e) { if (isBackdropClick(e)) closeAjusteModal(); });

function renderAjLines() {
  var tbody = document.getElementById('aj-lines');
  tbody.innerHTML = ajLineas.map(function(l, i) {
    return '<tr>' +
      '<td style="color:#a0aec0;font-size:0.74rem">' + (i + 1) + '</td>' +
      '<td style="position:relative"><div style="position:relative"><input class="ef aj-prod-search" data-line="' + i + '" type="text" value="' + ((l.Producto || '').replace(/"/g, '&quot;')) + '" placeholder="Buscar producto..." autocomplete="off"></div></td>' +
      '<td><input class="ef aj-pres" data-line="' + i + '" type="text" value="' + ((l.Presentacion || '').replace(/"/g, '&quot;')) + '" placeholder="Pres." style="width:100px"></td>' +
      '<td><input class="ef aj-cant" data-line="' + i + '" type="number" min="0" value="' + (l.Cantidad || '') + '" placeholder="0" style="width:80px;text-align:right"></td>' +
      '<td style="text-align:center">' +
        '<button onclick="removeAjLine(' + i + ')" style="background:#e74c3c;color:white;border:none;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:0.78rem;font-weight:700">✕</button>' +
      '</td>' +
    '</tr>';
  }).join('');
  ajLineas.forEach(function(l, i) { buildKxProductSearch('aj', i); });
}

function addAjusteLine() {
  ajLineas.push({ Producto: '', Presentacion: '', Cantidad: '' });
  renderAjLines();
  var lastInput = document.querySelector('.aj-prod-search[data-line="' + (ajLineas.length - 1) + '"]');
  if (lastInput) lastInput.focus();
}

function removeAjLine(i) {
  if (ajLineas.length <= 1) { showToast('Debe haber al menos una línea', '#e67e22'); return; }
  ajLineas.splice(i, 1);
  renderAjLines();
}

function readAjLines() {
  document.querySelectorAll('.aj-prod-search').forEach(function(inp) {
    var i = Number(inp.dataset.line);
    if (ajLineas[i]) ajLineas[i].Producto = inp.value.trim();
  });
  document.querySelectorAll('.aj-pres').forEach(function(inp) {
    var i = Number(inp.dataset.line);
    if (ajLineas[i]) ajLineas[i].Presentacion = inp.value.trim();
  });
  document.querySelectorAll('.aj-cant').forEach(function(inp) {
    var i = Number(inp.dataset.line);
    if (ajLineas[i]) ajLineas[i].Cantidad = Number(inp.value) || 0;
  });
}

async function saveAjuste() {
  var fecha = document.getElementById('aj-fecha').value;
  var empresa = document.getElementById('aj-empresa').value;
  var tipo = document.getElementById('aj-tipo').value;
  var obs = document.getElementById('aj-observaciones').value.trim();

  if (!fecha) { showToast('Selecciona la fecha', '#e74c3c'); return; }
  if (!empresa) { showToast('Selecciona la empresa', '#e74c3c'); return; }

  readAjLines();
  var validLines = ajLineas.filter(function(l) { return l.Producto && l.Cantidad > 0; });
  if (!validLines.length) { showToast('Agrega al menos un producto con cantidad', '#e74c3c'); return; }

  var btn = document.getElementById('btn-save-ajuste');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    var result = await apiPost({
      action: 'agregarKardexAjuste',
      Fecha: fecha,
      Empresa: empresa,
      Tipo: tipo,
      Observaciones: obs,
      lineas: validLines
    });
    if (!result.ok) throw new Error(result.error || 'Error al guardar');
    closeAjusteModal();
    showToast('✅ ' + result.added + ' ajuste(s) registrado(s)');
    await loadKardex();
  } catch (err) {
    showToast('❌ Error: ' + err.message, '#e74c3c');
    btn.disabled = false;
    btn.textContent = '✓ Registrar ajuste';
  }
}

// ── Saldo Inicial Modal ──
var siLineas = [];

function openSaldoInicialModal() {
  document.getElementById('si-fecha').value = today();
  document.getElementById('si-empresa').value = document.getElementById('f-empresa').value || '';
  document.getElementById('si-observaciones').value = '';
  document.getElementById('btn-save-saldo').disabled = false;
  document.getElementById('btn-save-saldo').textContent = '✓ Cargar saldo inicial';
  siLineas = [{ Producto: '', Presentacion: '', Cantidad: '' }];
  renderSiLines();
  document.getElementById('saldo-overlay').classList.add('show');
}

function closeSaldoModal() {
  document.getElementById('saldo-overlay').classList.remove('show');
  closeAllAutocompleteKx();
}
document.getElementById('saldo-overlay').addEventListener('click', function(e) { if (isBackdropClick(e)) closeSaldoModal(); });

function renderSiLines() {
  var tbody = document.getElementById('si-lines');
  tbody.innerHTML = siLineas.map(function(l, i) {
    return '<tr>' +
      '<td style="color:#a0aec0;font-size:0.74rem">' + (i + 1) + '</td>' +
      '<td style="position:relative"><div style="position:relative"><input class="ef si-prod-search" data-line="' + i + '" type="text" value="' + ((l.Producto || '').replace(/"/g, '&quot;')) + '" placeholder="Buscar producto..." autocomplete="off"></div></td>' +
      '<td><input class="ef si-pres" data-line="' + i + '" type="text" value="' + ((l.Presentacion || '').replace(/"/g, '&quot;')) + '" placeholder="Pres." style="width:100px"></td>' +
      '<td><input class="ef si-cant" data-line="' + i + '" type="number" min="0" value="' + (l.Cantidad || '') + '" placeholder="0" style="width:80px;text-align:right"></td>' +
      '<td style="text-align:center">' +
        '<button onclick="removeSiLine(' + i + ')" style="background:#e74c3c;color:white;border:none;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:0.78rem;font-weight:700">✕</button>' +
      '</td>' +
    '</tr>';
  }).join('');
  siLineas.forEach(function(l, i) { buildKxProductSearch('si', i); });
}

function addSaldoLine() {
  siLineas.push({ Producto: '', Presentacion: '', Cantidad: '' });
  renderSiLines();
  var lastInput = document.querySelector('.si-prod-search[data-line="' + (siLineas.length - 1) + '"]');
  if (lastInput) lastInput.focus();
}

function removeSiLine(i) {
  if (siLineas.length <= 1) { showToast('Debe haber al menos una línea', '#e67e22'); return; }
  siLineas.splice(i, 1);
  renderSiLines();
}

function readSiLines() {
  document.querySelectorAll('.si-prod-search').forEach(function(inp) {
    var i = Number(inp.dataset.line);
    if (siLineas[i]) siLineas[i].Producto = inp.value.trim();
  });
  document.querySelectorAll('.si-pres').forEach(function(inp) {
    var i = Number(inp.dataset.line);
    if (siLineas[i]) siLineas[i].Presentacion = inp.value.trim();
  });
  document.querySelectorAll('.si-cant').forEach(function(inp) {
    var i = Number(inp.dataset.line);
    if (siLineas[i]) siLineas[i].Cantidad = Number(inp.value) || 0;
  });
}

async function saveSaldoInicial() {
  var fecha = document.getElementById('si-fecha').value;
  var empresa = document.getElementById('si-empresa').value;
  var obs = document.getElementById('si-observaciones').value.trim();

  if (!fecha) { showToast('Selecciona la fecha de corte', '#e74c3c'); return; }
  if (!empresa) { showToast('Selecciona la empresa', '#e74c3c'); return; }

  readSiLines();
  var validLines = siLineas.filter(function(l) { return l.Producto && l.Cantidad > 0; });
  if (!validLines.length) { showToast('Agrega al menos un producto con cantidad', '#e74c3c'); return; }

  var btn = document.getElementById('btn-save-saldo');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    var result = await apiPost({
      action: 'agregarKardexAjuste',
      Fecha: fecha,
      Empresa: empresa,
      Tipo: 'Saldo_Inicial',
      Observaciones: obs || 'Saldo inicial',
      lineas: validLines
    });
    if (!result.ok) throw new Error(result.error || 'Error al guardar');
    closeSaldoModal();
    showToast('✅ ' + result.added + ' saldo(s) inicial(es) cargado(s)');
    await loadKardex();
  } catch (err) {
    showToast('❌ Error: ' + err.message, '#e74c3c');
    btn.disabled = false;
    btn.textContent = '✓ Cargar saldo inicial';
  }
}

// ── Delete Ajuste ──
var deleteKxRow = null;

function openDeleteKx(row, modulo, cantidad) {
  deleteKxRow = row;
  document.getElementById('del-kx-msg').textContent = '¿Eliminar este ajuste del Kardex?';
  document.getElementById('del-kx-detail').innerHTML =
    'Tipo: <strong>' + modulo + '</strong> · Cantidad: ' + Number(cantidad).toLocaleString('es-CO') + '<br><br>' +
    '<span style="color:#e74c3c;font-weight:700">Se eliminará este registro de la base de datos.</span>';
  document.getElementById('btn-del-kx-confirm').disabled = false;
  document.getElementById('btn-del-kx-confirm').textContent = '🗑️ Sí, eliminar';
  document.getElementById('delete-kx-overlay').classList.add('show');
}

function closeDeleteKx() {
  document.getElementById('delete-kx-overlay').classList.remove('show');
  deleteKxRow = null;
}
document.getElementById('delete-kx-overlay').addEventListener('click', function(e) { if (isBackdropClick(e)) closeDeleteKx(); });

async function confirmDeleteKx() {
  if (!deleteKxRow) return;
  var btn = document.getElementById('btn-del-kx-confirm');
  btn.disabled = true;
  btn.textContent = '⏳ Eliminando...';

  try {
    var result = await apiPost({ action: 'eliminarKardexAjuste', row: deleteKxRow });
    if (!result.ok) throw new Error(result.error || 'Error al eliminar');
    closeDeleteKx();
    showToast('🗑️ Ajuste eliminado del Kardex');
    await loadKardex();
  } catch (err) {
    showToast('❌ Error: ' + err.message, '#e74c3c');
    btn.disabled = false;
    btn.textContent = '🗑️ Sí, eliminar';
  }
}

// ── Carga masiva saldo inicial PARCELAR ──
var SALDOS_PARCELAR = [
  ['AFINADOR CAB X BIDON 20 LITROS', '', 6],
  ['AFINADOR CAB X 250 ML', '', 20],
  ['AFINADOR CAB X 500 ML', '', 15],
  ['AFINADOR CAB X GALON', '', 30],
  ['AFINADOR CAB X LITRO', '', 337],
  ['AMETRINA 80WG X KILO', '', 2],
  ['BORDEL CROP X BIDON 20 LITROS', '', 5],
  ['BORDEL CROP X 250 ML', '', 76],
  ['BORDEL CROP X GALON', '', 9],
  ['BORDEL CROP X LITRO', '', 137],
  ['BORO 21 X KILO', '', 25],
  ['CALIMAN X CANECA 10 LITROS', '', 5],
  ['CALIMAN X GALON', '', 23],
  ['CALIMAN X LITRO', '', 263],
  ['CERTUS 70 WS X 100 GR CV', '', 24],
  ['CERTUS 70 WS X 500 GR CV', '', 1],
  ['CERTUS 70 WS 50 GM', '', 11],
  ['CLEAN CROP X 100 ML', '', 90],
  ['CLEAN CROP X 250 ML', '', 75],
  ['CLEAN CROP X LITRO', '', 196],
  ['CONTRA 200 SC X 200 ML', '', 24],
  ['CUFIGA 80 WP X 500 GR CV', '', 643],
  ['DESESTRES P X 100 ML', '', 73],
  ['DESESTRES P X GALON', '', 9],
  ['DESESTRES P X 20 LITROS', '', 6],
  ['DESESTRES P X 250 ML', '', 37],
  ['DESESTRES P X 500 ML', '', 19],
  ['DESESTRES P X LITRO', '', 154],
  ['DIRVO 60% WG X 20 GR CV', '', 45],
  ['DIRVO 60% WG X KILO ( METSULFURON) CV', '', 60],
  ['ENGORDE K X 100 ML', '', 54],
  ['ENGORDE K X 20 LITROS', '', 2],
  ['ENGORDE K X 4 LITROS', '', 9],
  ['ENGORDE K X LITRO', '', 312],
  ['ESPAIDER CROP X 20 LITROS', '', 5],
  ['ESPAIDER CROP X 250 ML', '', 155],
  ['ESPAIDER CROP X LITRO', '', 85],
  ['FERTI-HUMI 16 X GALON', '', 9],
  ['FERTI-HUMI 16 X LITRO', '', 86],
  ['FERTI-HUMI 16 X 20 LITROS', '', 10],
  ['FERTILASER PRODUMLION X KILO', '', 17],
  ['FICLORAM SL X GALON', '', 1],
  ['FICLORAM LITRO', '', 11],
  ['FOSTAL 80 WP X 500 GR CV', '', 22],
  ['GRADUS 43 SC X LITRO CV', '', 12],
  ['GRADUS 43 X 500 ML CV', '', 29],
  ['HEXAZINONA 300 GR', '', 4],
  ['JABOLAN X 20 LITROS', '', 2],
  ['JABOLAN X 250 ML', '', 19],
  ['JABOLAN X GALON', '', 3],
  ['JABOLAN X LITRO', '', 5],
  ['LAMBDA CIHALOTRINA X 100 ML', '', 28],
  ['LAMBDA CIHALOTRINA X 500 ML', '', 101],
  ['LAMBDA CIHALOTRINA X LITRO', '', 38],
  ['MAXI PASTO X LITRO', '', 15],
  ['MERO BRIO X 250 ML', '', 229],
  ['MERO BRIO X GALON', '', 6],
  ['MERO BRIO X LITRO', '', 88],
  ['MICROZUL FZ&V LOMBRI-CROP  X GALON', '', 33],
  ['MICROZUL FZ&V LOMBRI-CROP  X LITRO', '', 288],
  ['NEMATO CROP X 500 ML', '', 29],
  ['NEMATO CROP X LITRO', '', 13],
  ['NEMATO CROP X 250 ML', '', 163],
  ['NOI-1 X 250 ML', '', 5],
  ['OXICLORURO DE COBRE X KILO', '', 30],
  ['PEGASSO OIL X 100 ML', '', 35],
  ['PEGASSO OIL X 20 LITROS', '', 39],
  ['PEGASSO OIL X 200 LITROS', '', 5],
  ['PEGASSO OIL X 250 ML', '', 173],
  ['PEGASSO OIL X 60 LITROS', '', 5],
  ['PEGASSO OIL X GALON', '', 52],
  ['PEGASSO OIL X LITRO', '', 171],
  ['PEGASSO PH X CANECA 200 LITROS', '', 5],
  ['PEGASSO PH X 20 LITROS', '', 37],
  ['PEGASSO PH X 250 ML', '', 3],
  ['PEGASSO PH X 60 LITROS', '', 4],
  ['PEGASSO PH X GALON', '', 44],
  ['PEGASSO PH X LITRO', '', 128],
  ['RUDOWN X1KG', '', 3],
  ['RUDOWN X50GR', '', 378],
  ['SAGUM 25 SC X 500 ML CV', '', 30],
  ['SAGUM X LITRO CV', '', 72],
  ['SHOCK UPI 36 EG X 500G', '', 6],
  ['TABUS 50 WG X 40 GR CV', '', 100],
  ['TRIP-CROP X 250 ML', '', 122],
  ['TRIP-CROP X LITRO', '', 29],
  ['YODO X LITRO', '', 7],
  ['YODO X 250 ML', '', 118]
];

function openCargaMasivaModal() {
  var total = SALDOS_PARCELAR.reduce(function(s, r) { return s + r[2]; }, 0);
  document.getElementById('cm-count').textContent = SALDOS_PARCELAR.length;
  document.getElementById('cm-total').textContent = total.toLocaleString('es-CO');
  document.getElementById('cm-fecha').value = today();
  document.getElementById('btn-cm-confirm').disabled = false;
  document.getElementById('btn-cm-confirm').textContent = '✓ Cargar ' + SALDOS_PARCELAR.length + ' productos';
  document.getElementById('cm-progress').style.display = 'none';

  var tbody = document.getElementById('cm-preview');
  tbody.innerHTML = SALDOS_PARCELAR.map(function(r, i) {
    return '<tr><td style="color:#a0aec0;font-size:0.74rem">' + (i + 1) + '</td>' +
      '<td style="font-size:0.82rem;font-weight:600">' + r[0] + '</td>' +
      '<td style="text-align:right;font-weight:700;color:#27ae60">' + r[2].toLocaleString('es-CO') + '</td></tr>';
  }).join('');

  document.getElementById('carga-masiva-overlay').classList.add('show');
}

function closeCargaMasivaModal() {
  document.getElementById('carga-masiva-overlay').classList.remove('show');
}
document.getElementById('carga-masiva-overlay').addEventListener('click', function(e) { if (isBackdropClick(e)) closeCargaMasivaModal(); });

async function ejecutarCargaMasiva() {
  var fecha = document.getElementById('cm-fecha').value;
  if (!fecha) { showToast('Selecciona la fecha de corte', '#e74c3c'); return; }

  var btn = document.getElementById('btn-cm-confirm');
  btn.disabled = true;
  btn.textContent = '⏳ Cargando...';
  var progress = document.getElementById('cm-progress');
  progress.style.display = 'block';

  var BATCH = 20;
  var total = SALDOS_PARCELAR.length;
  var loaded = 0;
  var errors = [];

  for (var i = 0; i < total; i += BATCH) {
    var batch = SALDOS_PARCELAR.slice(i, i + BATCH);
    var lineas = batch.map(function(r) {
      return { Producto: r[0], Presentacion: r[1], Cantidad: r[2] };
    });

    try {
      var result = await apiPost({
        action: 'agregarKardexAjuste',
        Fecha: fecha,
        Empresa: 'PARCELAR DE COLOMBIA SAS',
        Tipo: 'Saldo_Inicial',
        Observaciones: 'Saldo inicial carga masiva desde inventario fisico',
        lineas: lineas
      });
      if (!result.ok) {
        errors.push('Lote ' + (Math.floor(i / BATCH) + 1) + ': ' + (result.error || 'Error'));
      } else {
        loaded += lineas.length;
      }
    } catch (err) {
      errors.push('Lote ' + (Math.floor(i / BATCH) + 1) + ': ' + err.message);
    }

    progress.textContent = 'Cargados: ' + loaded + ' / ' + total + ' productos...';
  }

  if (errors.length) {
    showToast('⚠️ Cargados ' + loaded + ' con ' + errors.length + ' errores', '#e67e22');
  } else {
    showToast('✅ ' + loaded + ' saldos iniciales cargados exitosamente');
  }

  closeCargaMasivaModal();
  await loadKardex();
}

// ── Auto-load ──
loadKardex();
