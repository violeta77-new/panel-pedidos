// ── State ──
var pedidos = [];
var aggregated = [];
var rptSort = { col: 'pendiente', dir: 'desc' };

var SIGLAS = {
  'PARCELAR DE COLOMBIA SAS': 'PARCELAR',
  'GREEN AGROSOLUCIONES DE COLOMBIA SAS': 'GREEN',
  'SOLUCIONES INTEGRALES RESO SAS': 'RESO',
  'INSUMOS AGROPECUARIOS SOSTENIBLES SAS': 'IASO',
  'INSUMOS AGROPECUARIOS DE LA SABANA SAS': 'IAS',
  'INSUMOS AGROPECUARIOS DE LA SABANA SAS ': 'IAS',
};
function getSigla(n) { return SIGLAS[(n||'').trim()] || n || '—'; }

// ── Load ──
async function loadReportes() {
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
    var data = await apiGet('getPedidos');
    if (!data.ok) throw new Error(data.error || 'Error desconocido');

    var EXPECTED = ['Fecha_Procesamiento','Nombre_Empresa','Consecutivo','Fecha_Pedido',
      'Cliente','NIT','Telefono','Direccion_Envio','Municipio','Departamento',
      'Comercial','Plazo_Pago','Precio_Facturacion','Producto','Presentacion',
      'Cantidad','Valor_Unitario','Valor_Total','Total_Orden','Archivo_Fuente',
      'Estado','ID_Cliente','ID_Comercial','ID_Producto',
      'Cant_Entregada','Cant_Pendiente','Estado_Entrega','Fecha_Ult_Entrega','Remisiones','Observaciones','Estado_2','Bonificado'];

    data.pedidos = data.pedidos.filter(function(p) {
      return p.Nombre_Empresa !== 'Nombre_Empresa' && p.Cliente !== 'Cliente';
    });

    pedidos = data.pedidos.map(function(p) {
      if (!p.Cant_Entregada && p.Cant_Entregada !== 0) {
        p.Cant_Entregada = 0;
        p.Cant_Pendiente = Number(p.Cantidad) || 0;
        p.Estado_Entrega = 'Recibido';
      }
      if (!p.Estado_2) p.Estado_2 = 'Abierto';
      var cantE = Number(p.Cant_Entregada) || 0;
      var cantQ = Number(p.Cantidad) || 0;
      p.Cant_Pendiente = Math.max(0, cantQ - cantE);
      return p;
    });

    populateRptFilters();
    buildReport();

    loadZone.style.display = 'none';
    mainEl.style.display = 'block';
    setSyncStatus('ok', 'Conectado a Google Sheets. Última actualización: ' + new Date().toLocaleTimeString('es-CO'));
    document.getElementById('hdr-status').textContent = '☁️ Google Sheets · ' + pedidos.length + ' líneas';
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

// ── Filters ──
var rptFiltersAttached = false;
function populateRptFilters() {
  var emps = [], coms = [];
  pedidos.forEach(function(p) {
    if (p.Nombre_Empresa && emps.indexOf(p.Nombre_Empresa) < 0) emps.push(p.Nombre_Empresa);
    if (p.Comercial && coms.indexOf(p.Comercial) < 0) coms.push(p.Comercial);
  });
  emps.sort(); coms.sort();
  var fe = document.getElementById('rf-emp');
  fe.innerHTML = '<option value="">Todas</option>' + emps.map(function(e) { return '<option value="' + e + '">' + getSigla(e) + ' — ' + e + '</option>'; }).join('');
  var fc = document.getElementById('rf-com');
  fc.innerHTML = '<option value="">Todos</option>' + coms.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');

  if (!rptFiltersAttached) {
    ['rf-emp','rf-com','rf-txt'].forEach(function(id) {
      document.getElementById(id).addEventListener('change', buildReport);
      document.getElementById(id).addEventListener('input', buildReport);
    });
    rptFiltersAttached = true;
  }
}

function clearRptFilters() {
  document.getElementById('rf-emp').value = '';
  document.getElementById('rf-com').value = '';
  document.getElementById('rf-txt').value = '';
  buildReport();
}

function limpiarProducto(nombre) {
  nombre = String(nombre || '');
  if (/bonificado/i.test(nombre)) {
    return nombre.replace(/\s*bonificado\s*/gi, ' ').trim();
  }
  return nombre;
}

// ── Build aggregated report ──
function buildReport() {
  var fEmp = document.getElementById('rf-emp').value;
  var fCom = document.getElementById('rf-com').value;
  var fTxt = document.getElementById('rf-txt').value.toLowerCase();

  // Build set of orders that have at least one delivery
  var ordersWithDeliveries = {};
  pedidos.forEach(function(p) {
    if ((Number(p.Cant_Entregada) || 0) > 0) {
      ordersWithDeliveries[(p.Nombre_Empresa || '') + '||' + (p.Consecutivo || '')] = true;
    }
  });

  // Filter lines: Parcial (or Recibido in an order with deliveries) with pending > 0
  var filtered = pedidos.filter(function(p) {
    var rawEst = (p.Estado_Entrega || '').trim();
    var est = norm(rawEst || 'Recibido');
    var ordKey = (p.Nombre_Empresa || '') + '||' + (p.Consecutivo || '');
    var effectiveEst = (est === 'recibido' && ordersWithDeliveries[ordKey]) ? 'parcial' : est;
    if (effectiveEst !== 'parcial') return false;
    var pend = Number(p.Cant_Pendiente) || 0;
    if (pend <= 0) return false;
    var est2 = (p.Estado_2 || 'Abierto').trim();
    if (est2 === 'Anulado') return false;
    if (fEmp && p.Nombre_Empresa !== fEmp) return false;
    if (fCom && p.Comercial !== fCom) return false;
    return true;
  });

  // Aggregate by product + presentacion
  var map = {};
  var ordenesSet = {};
  var clientesSet = {};
  filtered.forEach(function(p) {
    var prodLimpio = limpiarProducto(String(p.Producto || '')).toUpperCase().trim();
    var pres = String(p.Presentacion || '').toUpperCase().trim();
    var key = prodLimpio + '||' + pres;
    if (!map[key]) {
      map[key] = {
        producto: prodLimpio,
        presentacion: pres,
        pendiente: 0,
        pedida: 0,
        entregada: 0,
        ordenes: 0,
        empresas: {},
        _ordenKeys: {}
      };
    }
    var row = map[key];
    row.pendiente += Number(p.Cant_Pendiente) || 0;
    row.pedida += Number(p.Cantidad) || 0;
    row.entregada += Number(p.Cant_Entregada) || 0;
    var empSigla = getSigla(p.Nombre_Empresa);
    row.empresas[empSigla] = (row.empresas[empSigla] || 0) + (Number(p.Cant_Pendiente) || 0);
    var ordKey = (p.Nombre_Empresa || '') + '||' + p.Consecutivo;
    if (!row._ordenKeys[ordKey]) { row._ordenKeys[ordKey] = true; row.ordenes++; }
    ordenesSet[ordKey] = true;
    clientesSet[p.Cliente || ''] = true;
  });

  aggregated = Object.values(map);

  if (fTxt) {
    aggregated = aggregated.filter(function(r) {
      return r.producto.toLowerCase().indexOf(fTxt) >= 0 || r.presentacion.toLowerCase().indexOf(fTxt) >= 0;
    });
  }

  // Stats
  document.getElementById('st-productos').textContent = aggregated.length;
  document.getElementById('st-unidades').textContent = aggregated.reduce(function(s, r) { return s + r.pendiente; }, 0).toLocaleString('es-CO');
  document.getElementById('st-ordenes').textContent = Object.keys(ordenesSet).length;
  document.getElementById('st-clientes').textContent = Object.keys(clientesSet).filter(Boolean).length;

  renderRptTable();
  if (document.getElementById('panel-remisiones').style.display !== 'none') buildRemisiones();
}

// ── Sort ──
function toggleRptSort(col) {
  if (rptSort.col === col) {
    rptSort.dir = rptSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    rptSort.col = col;
    rptSort.dir = col === 'producto' || col === 'presentacion' ? 'asc' : 'desc';
  }
  renderRptTable();
}

function sortedAggregated() {
  var col = rptSort.col;
  var dir = rptSort.dir;
  return [].concat(aggregated).sort(function(a, b) {
    var va, vb;
    if (col === 'producto') { va = a.producto; vb = b.producto; }
    else if (col === 'presentacion') { va = a.presentacion; vb = b.presentacion; }
    else if (col === 'pedida') { va = a.pedida; vb = b.pedida; }
    else if (col === 'entregada') { va = a.entregada; vb = b.entregada; }
    else if (col === 'pendiente') { va = a.pendiente; vb = b.pendiente; }
    else if (col === 'ordenes') { va = a.ordenes; vb = b.ordenes; }
    else { va = a.pendiente; vb = b.pendiente; }
    var cmp = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ── Render ──
function renderRptTable() {
  var cols = [
    { id: 'producto', label: 'Producto' },
    { id: 'presentacion', label: 'Presentación' },
    { id: 'pedida', label: 'Cant. Pedida' },
    { id: 'entregada', label: 'Entregada' },
    { id: 'pendiente', label: 'Pendiente' },
    { id: 'ordenes', label: 'Órdenes' },
    { id: null, label: 'Empresas' },
  ];

  document.getElementById('rpt-head').innerHTML = cols.map(function(c) {
    if (!c.id) return '<th>' + c.label + '</th>';
    var cls = rptSort.col === c.id ? (rptSort.dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
    return '<th class="' + cls + '" onclick="toggleRptSort(\'' + c.id + '\')">' + c.label + '</th>';
  }).join('');

  document.getElementById('rpt-count').textContent = '(' + aggregated.length + ' productos)';

  var rows = sortedAggregated();
  var tbody = document.getElementById('rpt-body');

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-msg">No hay productos pendientes con los filtros seleccionados.</div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function(r) {
    var empTags = Object.keys(r.empresas).sort().map(function(emp) {
      return '<span class="badge-emp" style="background:#ebf5fb;color:#1a5276;margin-right:3px">' + emp + ': ' + r.empresas[emp] + '</span>';
    }).join(' ');

    var pct = r.pedida > 0 ? Math.round(r.entregada / r.pedida * 100) : 0;

    return '<tr>' +
      '<td style="font-weight:700">' + (r.producto || '—') + '</td>' +
      '<td>' + (r.presentacion || '—') + '</td>' +
      '<td class="money">' + r.pedida.toLocaleString('es-CO') + '</td>' +
      '<td class="money" style="color:#27ae60;font-weight:600">' + r.entregada.toLocaleString('es-CO') + '</td>' +
      '<td class="money" style="color:#e74c3c;font-weight:700;font-size:0.95rem">' + r.pendiente.toLocaleString('es-CO') + '</td>' +
      '<td class="center">' + r.ordenes + '</td>' +
      '<td>' + empTags + '</td>' +
    '</tr>';
  }).join('');
}

// ── Export CSV ──
function exportCSV() {
  var rows = sortedAggregated();
  if (!rows.length) { showToast('No hay datos para exportar', '#e74c3c'); return; }

  var lines = ['Producto,Presentacion,Cant_Pedida,Entregada,Pendiente,Ordenes'];
  rows.forEach(function(r) {
    lines.push([
      '"' + (r.producto || '').replace(/"/g, '""') + '"',
      '"' + (r.presentacion || '').replace(/"/g, '""') + '"',
      r.pedida,
      r.entregada,
      r.pendiente,
      r.ordenes
    ].join(','));
  });

  var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'pendientes_' + today() + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exportado: ' + rows.length + ' productos');
}

// ── Tabs ──
function switchTab(tab) {
  document.getElementById('panel-pendientes').style.display = tab === 'pendientes' ? 'block' : 'none';
  document.getElementById('panel-remisiones').style.display = tab === 'remisiones' ? 'block' : 'none';
  document.getElementById('tab-pendientes').style.background = tab === 'pendientes' ? '#1a5276' : '#718096';
  document.getElementById('tab-remisiones').style.background = tab === 'remisiones' ? '#1a5276' : '#718096';
  if (tab === 'remisiones') buildRemisiones();
}

// ── Remisiones report ──
var remData = [];
var remSort = { col: 'empresa', dir: 'asc' };

function buildRemisiones() {
  var fEmp = document.getElementById('rf-emp').value;
  var fTxt = document.getElementById('rf-txt').value.toLowerCase();

  var map = {};
  var empresasSet = {};
  var ordenesSet = {};
  var totalLineas = 0;

  pedidos.forEach(function(p) {
    var rem = (p.Remisiones || '').trim();
    if (!rem) return;
    if (fEmp && p.Nombre_Empresa !== fEmp) return;

    var empNombre = p.Nombre_Empresa || '';
    var empSigla = getSigla(empNombre);
    var consec = p.Consecutivo || '';

    var nums = rem.split(/[,;\/]+/).map(function(r) { return r.trim(); }).filter(Boolean);
    nums.forEach(function(numRem) {
      if (fTxt && numRem.toLowerCase().indexOf(fTxt) < 0 && empSigla.toLowerCase().indexOf(fTxt) < 0 && (p.Cliente || '').toLowerCase().indexOf(fTxt) < 0) return;

      var key = empNombre + '||' + numRem;
      if (!map[key]) {
        map[key] = {
          empresa: empSigla,
          empresaFull: empNombre,
          remision: numRem,
          ordenes: {},
          clientes: {},
          productos: [],
          cantEntregada: 0,
          fechas: []
        };
      }
      var row = map[key];
      row.ordenes[consec] = true;
      row.clientes[p.Cliente || '—'] = true;
      row.productos.push((p.Producto || '') + ' (' + (p.Presentacion || '') + ')');
      row.cantEntregada += Number(p.Cant_Entregada) || 0;
      if (p.Fecha_Ult_Entrega) row.fechas.push(p.Fecha_Ult_Entrega);

      empresasSet[empSigla] = true;
      ordenesSet[empNombre + '||' + consec] = true;
      totalLineas++;
    });
  });

  remData = Object.values(map).map(function(r) {
    r.numOrdenes = Object.keys(r.ordenes).length;
    r.ordenesStr = Object.keys(r.ordenes).join(', ');
    r.clientesStr = Object.keys(r.clientes).join(', ');
    r.numProductos = r.productos.length;
    r.fecha = r.fechas.length ? r.fechas.sort().pop() : '';
    return r;
  });

  document.getElementById('st-rem-total').textContent = remData.length;
  document.getElementById('st-rem-empresas').textContent = Object.keys(empresasSet).length;
  document.getElementById('st-rem-ordenes').textContent = Object.keys(ordenesSet).length;
  document.getElementById('st-rem-lineas').textContent = totalLineas;

  renderRemTable();
}

function toggleRemSort(col) {
  if (remSort.col === col) {
    remSort.dir = remSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    remSort.col = col;
    remSort.dir = col === 'cantEntregada' || col === 'numProductos' || col === 'numOrdenes' ? 'desc' : 'asc';
  }
  renderRemTable();
}

function sortedRemData() {
  var col = remSort.col;
  var dir = remSort.dir;
  return [].concat(remData).sort(function(a, b) {
    var va = a[col], vb = b[col];
    if (va === undefined) { va = ''; vb = ''; }
    var cmp = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
    return dir === 'asc' ? cmp : -cmp;
  });
}

function renderRemTable() {
  var cols = [
    { id: 'empresa', label: 'Empresa' },
    { id: 'remision', label: 'N° Remisión' },
    { id: 'ordenesStr', label: 'Orden(es)' },
    { id: 'clientesStr', label: 'Cliente(s)' },
    { id: 'numProductos', label: 'Productos' },
    { id: 'cantEntregada', label: 'Cant. Entregada' },
    { id: 'fecha', label: 'Fecha' },
  ];

  document.getElementById('rem-head').innerHTML = cols.map(function(c) {
    var cls = remSort.col === c.id ? (remSort.dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
    return '<th class="' + cls + '" onclick="toggleRemSort(\'' + c.id + '\')">' + c.label + '</th>';
  }).join('');

  document.getElementById('rem-count').textContent = '(' + remData.length + ' remisiones)';

  var rows = sortedRemData();
  var tbody = document.getElementById('rem-body');

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-msg">No hay remisiones registradas con los filtros seleccionados.</div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function(r) {
    return '<tr>' +
      '<td><span class="badge-emp" style="background:#ebf5fb;color:#1a5276">' + r.empresa + '</span></td>' +
      '<td style="font-weight:700;color:#2c3e50">' + r.remision + '</td>' +
      '<td style="font-size:0.8rem">' + r.ordenesStr + '</td>' +
      '<td style="font-size:0.8rem">' + r.clientesStr + '</td>' +
      '<td class="center">' + r.numProductos + '</td>' +
      '<td class="money" style="color:#27ae60;font-weight:600">' + r.cantEntregada.toLocaleString('es-CO') + '</td>' +
      '<td style="font-size:0.8rem;color:#718096">' + (r.fecha ? fmtDate(r.fecha) : '—') + '</td>' +
    '</tr>';
  }).join('');
}

function exportRemCSV() {
  var rows = sortedRemData();
  if (!rows.length) { showToast('No hay datos para exportar', '#e74c3c'); return; }

  var lines = ['Empresa,Remision,Ordenes,Clientes,Productos,Cant_Entregada,Fecha'];
  rows.forEach(function(r) {
    lines.push([
      '"' + r.empresa + '"',
      '"' + r.remision + '"',
      '"' + r.ordenesStr.replace(/"/g,'""') + '"',
      '"' + r.clientesStr.replace(/"/g,'""') + '"',
      r.numProductos,
      r.cantEntregada,
      '"' + (r.fecha || '') + '"'
    ].join(','));
  });

  var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'remisiones_' + today() + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exportado: ' + rows.length + ' remisiones');
}

// ── Init ──
loadReportes();
