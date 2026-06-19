// ── Sorting ──
var sortLevels = [];

var SORT_COLS = [
  { id:'empresa',     label:'Empresa',      fn: function(c) { return getSigla(c.Nombre_Empresa); } },
  { id:'consecutivo', label:'Consecutivo',  fn: function(c) { return Number(c.Consecutivo)||0; } },
  { id:'cliente',     label:'Cliente',      fn: function(c) { return (c.Cliente||'').toLowerCase(); } },
  { id:'fecha',       label:'Fecha Pedido', fn: function(c) { return +new Date(c.Fecha_Pedido||0); } },
  { id:'comercial',   label:'Comercial',    fn: function(c) { return (c.Comercial||'').toLowerCase(); } },
  { id:'total',       label:'Total Orden',  fn: function(c) { return Number(c.Total_Orden)||0; } },
  { id:'productos',   label:'Productos',    fn: function(c) { return getLinesFor(c).length; } },
  { id:'avance',      label:'Avance',       fn: function(c) { return derivedPct(getLinesFor(c)); } },
  { id:'estado',      label:'Estado',       fn: function(c) { return derivedStatus(getLinesFor(c)); } },
  { id:'estado2',     label:'Estado 2',     fn: function(c) { return derivedEstado2(getLinesFor(c)); } },
];

function toggleSort(id, e) {
  var shift = e && e.shiftKey;
  var idx = sortLevels.findIndex(function(l) { return l.id === id; });
  if (shift) { if (idx >= 0) sortLevels.splice(idx, 1); }
  else if (idx >= 0) { if (sortLevels[idx].dir === 'asc') sortLevels[idx].dir = 'desc'; else sortLevels.splice(idx, 1); }
  else { sortLevels.push({ id: id, dir: 'asc' }); }
  renderTable();
}

function clearSort() { sortLevels = []; renderTable(); }

function applySort(rows) {
  if (!sortLevels.length) return rows;
  return [].concat(rows).sort(function(a, b) {
    for (var si = 0; si < sortLevels.length; si++) {
      var lvl = sortLevels[si];
      var col = null;
      for (var ci = 0; ci < SORT_COLS.length; ci++) { if (SORT_COLS[ci].id === lvl.id) { col = SORT_COLS[ci]; break; } }
      if (!col) continue;
      var va = col.fn(a), vb = col.fn(b);
      var cmp = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
      if (cmp !== 0) return lvl.dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}

function renderHeader() {
  var cols = [
    { label:'#', id:null }, { label:'Empresa', id:'empresa' }, { label:'Consecutivo', id:'consecutivo' },
    { label:'Cliente', id:'cliente' }, { label:'Fecha Pedido', id:'fecha' }, { label:'Comercial', id:'comercial' },
    { label:'Total Orden', id:'total' }, { label:'Productos', id:'productos' }, { label:'Avance', id:'avance' },
    { label:'Estado', id:'estado' }, { label:'Estado 2', id:'estado2' }, { label:'Acción', id:null },
  ];
  document.getElementById('t-head').innerHTML = cols.map(function(col) {
    if (!col.id) return '<th>' + col.label + '</th>';
    var lvlIdx = sortLevels.findIndex(function(l) { return l.id === col.id; });
    var active = lvlIdx >= 0;
    var lvl = active ? sortLevels[lvlIdx] : null;
    var dirCls = active ? (lvl.dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
    var badge = sortLevels.length > 1 && active ? '<span class="sort-badge">' + (lvlIdx+1) + '</span>' : '';
    return '<th class="sortable ' + dirCls + '" onclick="toggleSort(\'' + col.id + '\',event)">' + col.label + badge + '<span class="sort-icon"></span></th>';
  }).join('');
  var btn = document.getElementById('btn-clear-sort');
  if (btn) btn.style.display = sortLevels.length ? 'inline-block' : 'none';
}

// ── Siglas ──
var SIGLAS = {
  'PARCELAR DE COLOMBIA SAS': 'PARCELAR',
  'GREEN AGROSOLUCIONES DE COLOMBIA SAS': 'GREEN',
  'SOLUCIONES INTEGRALES RESO SAS': 'RESO',
  'INSUMOS AGROPECUARIOS SOSTENIBLES SAS': 'IASO',
  'INSUMOS AGROPECUARIOS DE LA SABANA SAS': 'IAS',
  'INSUMOS AGROPECUARIOS DE LA SABANA SAS ': 'IAS',
};
function getSigla(n) { return SIGLAS[(n||'').trim()] || n || '—'; }
var SIGLA_CLASSES = ['PARCELAR','GREEN','RESO','IASO','IAS'];
function getSiglaClass(n) { var s = getSigla(n); return SIGLA_CLASSES.indexOf(s) >= 0 ? 'sigla-'+s : 'sigla-DEFAULT'; }

// ── State ──
var consecs = [];
var pedidos = [];
var activeIdx = null;
var editIdx = null;
var editKey = null;
var editWorkingLines = [];

// ── Load from API ──
async function loadFromAPI() {
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
      'Cant_Entregada','Cant_Pendiente','Estado_Entrega','Fecha_Ult_Entrega','Remisiones','Observaciones','Estado_2'];

    if (data.headers && data.headers[0] !== 'Fecha_Procesamiento') {
      var oldHeaders = data.headers;
      var posMap = {};
      for (var pi = 0; pi < oldHeaders.length; pi++) {
        var hKey = String(oldHeaders[pi]);
        if (!(hKey in posMap)) posMap[hKey] = [];
        posMap[hKey].push(pi);
      }
      var fixedFirst = {};
      for (var hi = 0; hi < EXPECTED.length && hi < oldHeaders.length; hi++) {
        fixedFirst[EXPECTED[hi]] = oldHeaders[hi];
      }
      fixedFirst.__row = 1;
      var fixedPedidos = [fixedFirst];
      for (var ri = 0; ri < data.pedidos.length; ri++) {
        var oldRow = data.pedidos[ri];
        var vals = [];
        for (var vi = 0; vi < oldHeaders.length; vi++) vals.push(undefined);
        for (var hk in posMap) {
          if (!posMap.hasOwnProperty(hk)) continue;
          var positions = posMap[hk];
          var rawVal = oldRow[hk];
          if (positions.length === 1) {
            vals[positions[0]] = rawVal;
          } else {
            for (var pp = 0; pp < positions.length; pp++) {
              vals[positions[pp]] = rawVal;
            }
          }
        }
        var newRow = {};
        for (var ci = 0; ci < EXPECTED.length && ci < vals.length; ci++) {
          newRow[EXPECTED[ci]] = vals[ci] !== undefined ? vals[ci] : '';
        }
        newRow.__row = oldRow.__row || (ri + 2);
        fixedPedidos.push(newRow);
      }
      data.pedidos = fixedPedidos;
      data.headers = EXPECTED;
    }

    data.pedidos = data.pedidos.filter(function(p) {
      return p.Nombre_Empresa !== 'Nombre_Empresa' && p.Cliente !== 'Cliente';
    });

    pedidos = data.pedidos.map(function(p) {
      if (p.Consecutivo !== null && p.Consecutivo !== undefined) {
        var n = Number(p.Consecutivo);
        if (!isNaN(n)) p.Consecutivo = n;
      }
      if (!p.Cant_Entregada && p.Cant_Entregada !== 0) {
        p.Cant_Entregada = 0;
        p.Cant_Pendiente = Number(p.Cantidad) || 0;
        p.Estado_Entrega = 'Recibido';
        p.Fecha_Ult_Entrega = null;
        p.Remisiones = '';
      }
      if (!p.Estado_2) p.Estado_2 = 'Abierto';
      var cantE = Number(p.Cant_Entregada) || 0;
      var cantP = Number(p.Cant_Pendiente) || 0;
      var cantQ = Number(p.Cantidad) || 0;
      if (cantQ === 0 && (cantE + cantP) > 0) {
        p.Cantidad = cantE + cantP;
      } else if (cantQ > 0 && cantQ < cantE) {
        p.Cantidad = cantE + cantP;
      }
      return p;
    });

    rebuildConsecs();
    populateFilters();
    renderTable();

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

// ── Parse data ──
function rebuildConsecs() {
  var seen = {};
  pedidos.forEach(function(p) {
    var k = keyOf(p.Nombre_Empresa, p.Consecutivo);
    if (!seen[k]) seen[k] = {
      Nombre_Empresa: p.Nombre_Empresa, Consecutivo: p.Consecutivo,
      Fecha_Pedido: p.Fecha_Pedido, Cliente: p.Cliente, NIT: p.NIT,
      Telefono: p.Telefono, Direccion_Envio: p.Direccion_Envio,
      Comercial: p.Comercial, Municipio: p.Municipio, Departamento: p.Departamento,
      Plazo_Pago: p.Plazo_Pago, Precio_Facturacion: p.Precio_Facturacion, Total_Orden: p.Total_Orden,
    };
  });
  consecs = Object.values(seen).sort(function(a, b) {
    var da = +new Date(a.Fecha_Pedido), db = +new Date(b.Fecha_Pedido);
    return db - da || (b.Consecutivo||0) - (a.Consecutivo||0);
  }).map(function(c, i) { c['N°'] = i + 1; return c; });
}

// ── Helpers ──
function keyOf(emp, con) { return (emp||'') + '||' + String(con||'').trim(); }

function getLinesFor(c) {
  var k = keyOf(c.Nombre_Empresa, c.Consecutivo);
  return pedidos.filter(function(p) { return keyOf(p.Nombre_Empresa, p.Consecutivo) === k; });
}

function derivedStatus(lines) {
  if (!lines.length) return 'Recibido';
  var ent = lines.filter(function(l) { return norm(l.Estado_Entrega) === 'entregado'; }).length;
  var par = lines.filter(function(l) { return norm(l.Estado_Entrega) === 'parcial'; }).length;
  if (ent === lines.length) return 'Entregado';
  if (ent > 0 || par > 0) return 'Parcial';
  return 'Recibido';
}

function derivedEstado2(lines) {
  if (!lines.length) return 'Abierto';
  var vals = lines.map(function(l) { return (l.Estado_2 || 'Abierto').trim(); });
  if (vals.indexOf('Anulado') >= 0) return 'Anulado';
  var allCerrado = vals.every(function(v) { return v === 'Cerrado'; });
  return allCerrado ? 'Cerrado' : 'Abierto';
}

function derivedPct(lines) {
  var totPed = lines.reduce(function(s, l) { return s + (Number(l.Cantidad)||0); }, 0);
  var totEnt = lines.reduce(function(s, l) { return s + (Number(l.Cant_Entregada)||0); }, 0);
  return totPed > 0 ? Math.round(totEnt / totPed * 100) : 0;
}

// ── Filters ──
var filtersAttached = false;
function populateFilters() {
  var emps = []; var clis = [];
  consecs.forEach(function(c) {
    if (c.Nombre_Empresa && emps.indexOf(c.Nombre_Empresa) < 0) emps.push(c.Nombre_Empresa);
    if (c.Cliente && clis.indexOf(c.Cliente) < 0) clis.push(c.Cliente);
  });
  emps.sort(); clis.sort();
  var fe = document.getElementById('f-emp');
  var fc = document.getElementById('f-cli');
  fe.innerHTML = '<option value="">Todas</option>' + emps.map(function(e) { return '<option value="' + e + '">' + getSigla(e) + ' — ' + e + '</option>'; }).join('');
  fc.innerHTML = '<option value="">Todos</option>' + clis.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
  if (!filtersAttached) {
    ['f-emp','f-cli','f-est','f-est2','f-txt'].forEach(function(id) {
      document.getElementById(id).addEventListener('change', renderTable);
      document.getElementById(id).addEventListener('input', renderTable);
    });
    filtersAttached = true;
  }
}

function filtered() {
  var fe = document.getElementById('f-emp').value;
  var fc = document.getElementById('f-cli').value;
  var fs = document.getElementById('f-est').value;
  var fs2 = document.getElementById('f-est2').value;
  var ft = document.getElementById('f-txt').value.toLowerCase();
  return consecs.filter(function(c) {
    if (fe && c.Nombre_Empresa !== fe) return false;
    if (fc && c.Cliente !== fc) return false;
    var lines = getLinesFor(c);
    var est = derivedStatus(lines);
    if (fs && norm(est) !== norm(fs)) return false;
    if (fs2) { var e2 = derivedEstado2(lines); if (e2 !== fs2) return false; }
    if (ft) {
      var hay = [c.Cliente, String(c.Consecutivo), getSigla(c.Nombre_Empresa), c.Comercial].join(' ').toLowerCase();
      if (hay.indexOf(ft) < 0) return false;
    }
    return true;
  });
}

function clearFilters() {
  document.getElementById('f-emp').value = '';
  document.getElementById('f-cli').value = '';
  document.getElementById('f-est').value = '';
  document.getElementById('f-est2').value = '';
  document.getElementById('f-txt').value = '';
  renderTable();
}

// ── Render table ──
function renderTable() {
  var rows = applySort(filtered());
  var all = consecs.map(function(c) { return derivedStatus(getLinesFor(c)); });
  document.getElementById('s-rec').textContent = all.filter(function(e) { return e === 'Recibido'; }).length;
  document.getElementById('s-par').textContent = all.filter(function(e) { return e === 'Parcial'; }).length;
  document.getElementById('s-ent').textContent = all.filter(function(e) { return e === 'Entregado'; }).length;
  document.getElementById('s-tot').textContent = consecs.length;
  document.getElementById('row-ct').textContent = '(' + rows.length + ' mostradas)';

  renderHeader();

  var tbody = document.getElementById('t-body');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="12"><div class="empty">No hay órdenes con los filtros seleccionados.</div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function(c) {
    var lines = getLinesFor(c);
    var est = derivedStatus(lines);
    var est2 = derivedEstado2(lines);
    var pct = derivedPct(lines);
    var badge = est === 'Recibido' ? 'b-rec' : est === 'Parcial' ? 'b-par' : 'b-ent';
    var badge2 = est2 === 'Abierto' ? 'b-abierto' : est2 === 'Cerrado' ? 'b-cerrado' : 'b-anulado';
    var done = est === 'Entregado';
    var idx = consecs.indexOf(c);
    return '<tr>' +
      '<td style="color:#718096;font-size:0.78rem">' + (c['N°']||'') + '</td>' +
      '<td title="' + (c.Nombre_Empresa||'') + '"><span class="sigla-badge ' + getSiglaClass(c.Nombre_Empresa) + '">' + getSigla(c.Nombre_Empresa) + '</span></td>' +
      '<td style="text-align:center;font-weight:700">' + (c.Consecutivo||'') + '</td>' +
      '<td style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (c.Cliente||'') + '">' + (c.Cliente||'—') + '</td>' +
      '<td style="white-space:nowrap;font-size:0.78rem">' + fmtDate(c.Fecha_Pedido) + '</td>' +
      '<td style="font-size:0.78rem">' + (c.Comercial||'—') + '</td>' +
      '<td class="money">' + fmtMoney(c.Total_Orden) + '</td>' +
      '<td style="text-align:center">' +
        (lines.length ? '<span style="background:#e8f4fb;color:#1a5276;padding:2px 9px;border-radius:12px;font-size:0.75rem;font-weight:700">' + lines.length + '</span>' : '<span class="tag-sin">—</span>') +
      '</td>' +
      '<td><div class="prog"><div class="prog-bar"><div class="prog-fill" style="width:' + pct + '%"></div></div><div class="prog-pct">' + pct + '%</div></div></td>' +
      '<td><span class="badge ' + badge + '">' + est + '</span></td>' +
      '<td><span class="badge ' + badge2 + '">' + est2 + '</span></td>' +
      '<td><div style="display:flex;gap:6px;align-items:center">' +
        '<button class="btn-ver ' + (done?'done':'') + '" onclick="openDetail(' + idx + ')">' +
          (lines.length === 0 ? '👁 Ver' : done ? '✓ Entregado' : '📦 Ver pedido') +
        '</button>' +
        '<button class="btn-edit" onclick="openEdit(' + idx + ')" title="Editar pedido">✏️</button>' +
        '<button class="btn-del" onclick="openDelete(' + idx + ')" title="Eliminar pedido">🗑️</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
}

// ── Detail Modal ──
function openDetail(idx) {
  activeIdx = idx;
  var c = consecs[idx];
  var lines = getLinesFor(c);

  document.getElementById('m-titulo').textContent = '[' + getSigla(c.Nombre_Empresa) + '] ' + (c.Nombre_Empresa||'—') + ' · Orden #' + (c.Consecutivo||'');
  document.getElementById('m-meta').innerHTML = [
    '👤 <span>' + (c.Cliente||'—') + '</span>',
    '📅 <span>' + fmtDate(c.Fecha_Pedido) + '</span>',
    c.Comercial ? '🧑‍💼 <span>' + c.Comercial + '</span>' : '',
    '💵 <span>' + fmtMoney(c.Total_Orden) + '</span>',
    c.Municipio ? '📍 <span>' + c.Municipio + (c.Departamento ? ', ' + c.Departamento : '') + '</span>' : '',
  ].filter(Boolean).join('');
  document.getElementById('m-total').textContent = fmtMoney(c.Total_Orden);
  var mObsWrap = document.getElementById('m-obs-wrap');
  var obsText = c.Observaciones || lines.reduce(function(a, l) { return a || l.Observaciones; }, '') || '';
  if (obsText && String(obsText).trim()) {
    document.getElementById('m-observaciones').textContent = String(obsText).trim();
    mObsWrap.style.display = 'block';
  } else {
    mObsWrap.style.display = 'none';
  }
  document.getElementById('m-fecha').value = today();
  document.getElementById('m-remision').value = '';
  document.getElementById('m-remision').classList.remove('error');
  document.getElementById('btn-confirmar').disabled = false;
  document.getElementById('btn-confirmar').textContent = '✓ Registrar entregas';

  var tbody = document.getElementById('m-lines');
  if (!lines.length) {
    tbody.innerHTML = '<tr><td colspan="11"><div class="no-lines">⚠ Esta orden no tiene líneas de producto registradas.</div></td></tr>';
  } else {
    tbody.innerHTML = lines.map(function(l, i) {
      var pedida = Number(l.Cantidad)||0;
      var entregada = Number(l.Cant_Entregada)||0;
      var pendiente = Math.max(0, pedida - entregada);
      var estL = l.Estado_Entrega || 'Recibido';
      var badgeL = norm(estL) === 'recibido' ? 'b-rec' : norm(estL) === 'parcial' ? 'b-par' : 'b-ent';
      var done = norm(estL) === 'entregado';
      return '<tr>' +
        '<td style="color:#a0aec0;font-size:0.74rem">' + (i+1) + '</td>' +
        '<td style="font-weight:700;white-space:nowrap">' + (l.Producto||'—') + '</td>' +
        '<td>' + (l.Presentacion||'') + '</td>' +
        '<td class="money">' + pedida + '</td>' +
        '<td class="money" style="color:#27ae60;font-weight:700">' + entregada + '</td>' +
        '<td class="money"><span class="pend-tag ' + (pendiente > 0 ? 'pend' : 'ok') + '">' + pendiente + '</span></td>' +
        '<td><span class="badge ' + badgeL + '">' + estL + '</span>' +
          (l.Remisiones ? '<div style="font-size:0.7rem;color:#4a5568;margin-top:3px">📄 ' + l.Remisiones + '</div>' : '') +
          (l.Fecha_Ult_Entrega ? '<div style="font-size:0.68rem;color:#718096">📅 ' + fmtDate(l.Fecha_Ult_Entrega) + '</div>' : '') +
        '</td>' +
        '<td class="money" style="font-size:0.78rem">' + fmtMoney(l.Valor_Unitario) + '</td>' +
        '<td class="money" style="font-size:0.78rem">' + fmtMoney(l.Valor_Total) + '</td>' +
        '<td><input type="number" class="qty-input" data-row="' + l.__row + '" data-max="' + pendiente + '" min="0" max="' + pendiente + '" value="0" placeholder="0"' +
          (done ? ' disabled style="background:#f7fafc;color:#a0aec0"' : '') + '></td>' +
      '</tr>';
    }).join('');
  }

  resetNewLineForm();
  document.getElementById('overlay').classList.add('show');
}

function closeModal() {
  document.getElementById('overlay').classList.remove('show');
  activeIdx = null;
}

document.getElementById('overlay').addEventListener('click', function(e) { if (isBackdropClick(e)) closeModal(); });

// ── Confirm deliveries ──
async function confirmarEntregas() {
  var fecha = document.getElementById('m-fecha').value;
  if (!fecha) { showToast('Selecciona la fecha de entrega', '#e74c3c'); return; }

  var remInput = document.getElementById('m-remision');
  var rem = remInput.value.trim();

  var qtyInputs = document.querySelectorAll('#m-lines input.qty-input');
  var hasSomething = false, hasError = false;

  qtyInputs.forEach(function(inp) {
    inp.classList.remove('error');
    var cant = Number(inp.value) || 0;
    if (cant > 0) {
      hasSomething = true;
      if (cant > Number(inp.dataset.max)) { inp.classList.add('error'); hasError = true; }
    }
  });

  if (hasError) { showToast('Verifica las cantidades en rojo', '#e74c3c'); return; }
  if (!hasSomething) { showToast('Ingresa al menos una cantidad mayor a 0', '#e67e22'); return; }
  if (!rem) { remInput.classList.add('error'); showToast('Ingresa el número de remisión del pedido', '#e74c3c'); return; }
  remInput.classList.remove('error');

  var entregas = [];
  qtyInputs.forEach(function(inp) {
    var cant = Number(inp.value) || 0;
    if (cant <= 0) return;
    entregas.push({ row: Number(inp.dataset.row), cantidad: cant, fecha: fecha, remision: rem });
  });

  var btn = document.getElementById('btn-confirmar');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    var result = await apiPost({ action: 'registrarEntrega', entregas: entregas });
    if (!result.ok) throw new Error(result.error || 'Error al guardar');

    closeModal();
    showToast('✅ ' + result.updated + ' línea(s) guardadas en Google Sheets');
    await loadFromAPI();
  } catch (err) {
    showToast('❌ Error: ' + err.message, '#e74c3c');
    btn.disabled = false;
    btn.textContent = '✓ Registrar entregas';
  }
}

// ── Add new line from detail modal ──
function toggleNewLine() {
  var form = document.getElementById('new-line-form');
  var btn = document.getElementById('btn-toggle-newline');
  if (form.style.display === 'none') {
    form.style.display = 'block';
    btn.textContent = 'Ocultar';
  } else {
    form.style.display = 'none';
    btn.textContent = 'Mostrar';
  }
}

function calcNewLineTotal() {
  var cant = Number(document.getElementById('nl-cantidad').value) || 0;
  var vuni = Number(document.getElementById('nl-vunitario').value) || 0;
  document.getElementById('nl-vtotal').value = cant * vuni;
}

function resetNewLineForm() {
  document.getElementById('nl-producto').value = '';
  document.getElementById('nl-presentacion').value = '';
  document.getElementById('nl-cantidad').value = '';
  document.getElementById('nl-vunitario').value = '';
  document.getElementById('nl-vtotal').value = '';
  document.getElementById('new-line-form').style.display = 'none';
  document.getElementById('btn-toggle-newline').textContent = 'Mostrar';
}

async function agregarNuevaLinea() {
  if (activeIdx === null) return;
  var producto = document.getElementById('nl-producto').value.trim();
  var presentacion = document.getElementById('nl-presentacion').value.trim();
  var cantidad = Number(document.getElementById('nl-cantidad').value) || 0;
  var vunitario = Number(document.getElementById('nl-vunitario').value) || 0;
  var vtotal = Number(document.getElementById('nl-vtotal').value) || 0;

  if (!producto) { showToast('Ingresa el nombre del producto', '#e74c3c'); return; }
  if (cantidad <= 0) { showToast('La cantidad debe ser mayor a 0', '#e74c3c'); return; }

  var c = consecs[activeIdx];
  var newLine = {
    __row: null,
    Nombre_Empresa: c.Nombre_Empresa,
    Consecutivo: c.Consecutivo,
    Fecha_Pedido: c.Fecha_Pedido,
    Producto: producto,
    Presentacion: presentacion,
    Cantidad: cantidad,
    Valor_Unitario: vunitario,
    Valor_Total: vtotal,
    Cant_Entregada: 0,
    Cant_Pendiente: cantidad,
    Estado_Entrega: 'Recibido',
    Estado: 'recibido',
    Estado_2: 'Abierto'
  };

  var hdr = {
    Cliente: c.Cliente, NIT: c.NIT, Fecha_Pedido: c.Fecha_Pedido,
    Comercial: c.Comercial, Municipio: c.Municipio, Departamento: c.Departamento,
    Telefono: c.Telefono, Plazo_Pago: c.Plazo_Pago, Precio_Facturacion: c.Precio_Facturacion,
    Nombre_Empresa: c.Nombre_Empresa, Consecutivo: c.Consecutivo,
    Total_Orden: (Number(c.Total_Orden) || 0) + vtotal
  };

  var btn = document.getElementById('btn-add-newline');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    var result = await apiPost({
      action: 'editarPedido',
      header: hdr,
      lineas: [newLine],
      deleteRows: []
    });
    if (!result.ok) throw new Error(result.error || 'Error al guardar');

    resetNewLineForm();
    closeModal();
    showToast('✅ Línea de producto agregada al pedido');
    await loadFromAPI();
  } catch (err) {
    showToast('❌ Error: ' + err.message, '#e74c3c');
    btn.disabled = false;
    btn.textContent = '✓ Agregar línea al pedido';
  }
}

// ── Edit Modal ──
function openEdit(idx) {
  editIdx = idx;
  var c = consecs[idx];
  editKey = keyOf(c.Nombre_Empresa, c.Consecutivo);
  editWorkingLines = getLinesFor(c).map(function(l) { return Object.assign({}, l); });

  document.getElementById('ed-titulo').textContent = '✏️ [' + getSigla(c.Nombre_Empresa) + '] Orden #' + (c.Consecutivo||'');
  document.getElementById('ed-cliente').value = c.Cliente || '';
  document.getElementById('ed-nit').value = c.NIT || '';
  document.getElementById('ed-fecha').value = toDateInput(c.Fecha_Pedido);
  document.getElementById('ed-comercial').value = c.Comercial || '';
  document.getElementById('ed-municipio').value = c.Municipio || '';
  document.getElementById('ed-departamento').value = c.Departamento || '';
  document.getElementById('ed-telefono').value = c.Telefono || '';
  document.getElementById('ed-plazo').value = c.Plazo_Pago || '';
  document.getElementById('ed-precio').value = c.Precio_Facturacion || '';
  document.getElementById('btn-saveEdit').disabled = false;
  document.getElementById('btn-saveEdit').textContent = '✓ Aplicar cambios';

  renderEditLines();
  document.getElementById('edit-overlay').classList.add('show');
}

function closeEdit() {
  document.getElementById('edit-overlay').classList.remove('show');
  editIdx = null; editKey = null; editWorkingLines = [];
}

document.getElementById('edit-overlay').addEventListener('click', function(e) { if (isBackdropClick(e)) closeEdit(); });

function renderEditLines() {
  var tbody = document.getElementById('ed-lines');
  tbody.innerHTML = editWorkingLines.map(function(l, i) {
    var locked = (Number(l.Cant_Entregada)||0) > 0;
    var prod = (l.Producto||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    var pres = (l.Presentacion||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    return '<tr>' +
      '<td style="color:#a0aec0;font-size:0.74rem">' + (i+1) + '</td>' +
      '<td><input class="ef ed-prod" data-i="' + i + '" type="text" value="' + prod + '"' + (locked ? ' style="background:#f7fafc"' : '') + '></td>' +
      '<td><input class="ef ed-pres" data-i="' + i + '" type="text" value="' + pres + '"' + (locked ? ' style="background:#f7fafc"' : '') + '></td>' +
      '<td><input class="ef ed-cant" data-i="' + i + '" type="number" min="0" value="' + (l.Cantidad||0) + '" style="width:80px;text-align:right" oninput="updateLineTotal(' + i + ')"></td>' +
      '<td><input class="ef ed-vuni" data-i="' + i + '" type="number" min="0" value="' + (l.Valor_Unitario||0) + '" style="width:100px;text-align:right" oninput="updateLineTotal(' + i + ')"></td>' +
      '<td><input class="ef ed-vtot" data-i="' + i + '" type="number" value="' + (l.Valor_Total||0) + '" style="width:100px;text-align:right;background:#f7fafc" readonly></td>' +
      '<td><input class="ef ed-rem" data-i="' + i + '" type="text" value="' + (l.Remisiones||'').replace(/"/g,'&quot;') + '" placeholder="' + (locked ? 'Ej: REM-001' : '') + '" style="width:120px;font-size:0.78rem"></td>' +
      '<td style="text-align:center">' +
        (locked
          ? '<span style="font-size:0.85rem;color:#a0aec0" title="Tiene entregas registradas">🔒</span>'
          : '<button onclick="removeEditLine(' + i + ')" style="background:#e74c3c;color:white;border:none;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:0.78rem;font-weight:700">✕</button>') +
      '</td></tr>';
  }).join('');
  updateEditTotal();
}

function updateLineTotal(i) {
  var cants = document.querySelectorAll('.ed-cant');
  var vunis = document.querySelectorAll('.ed-vuni');
  var vtots = document.querySelectorAll('.ed-vtot');
  var cant = parseFloat(cants[i] && cants[i].value) || 0;
  var vuni = parseFloat(vunis[i] && vunis[i].value) || 0;
  var vtot = cant * vuni;
  if (vtots[i]) vtots[i].value = vtot;
  if (editWorkingLines[i]) {
    editWorkingLines[i].Cantidad = cant;
    editWorkingLines[i].Valor_Unitario = vuni;
    editWorkingLines[i].Valor_Total = vtot;
  }
  updateEditTotal();
}

function updateEditTotal() {
  var total = editWorkingLines.reduce(function(s, l) { return s + (Number(l.Valor_Total)||0); }, 0);
  document.getElementById('ed-total-calc').textContent = fmtMoney(total);
}

function addEditLine() {
  editWorkingLines.push({
    Producto:'', Presentacion:'', Cantidad:0, Valor_Unitario:0, Valor_Total:0,
    Cant_Entregada:0, Cant_Pendiente:0, Estado_Entrega:'Recibido',
    Fecha_Ult_Entrega:null, Remisiones:'', __row: null
  });
  renderEditLines();
  var wrap = document.querySelector('#edit-overlay .prod-wrap');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

function removeEditLine(i) {
  editWorkingLines.splice(i, 1);
  renderEditLines();
}

async function saveEdit() {
  if (editIdx === null) return;

  var prods = [].slice.call(document.querySelectorAll('.ed-prod'));
  var press = [].slice.call(document.querySelectorAll('.ed-pres'));
  var cants = [].slice.call(document.querySelectorAll('.ed-cant'));
  var vunis = [].slice.call(document.querySelectorAll('.ed-vuni'));
  var vtots = [].slice.call(document.querySelectorAll('.ed-vtot'));
  var rems = [].slice.call(document.querySelectorAll('.ed-rem'));
  editWorkingLines.forEach(function(l, i) {
    l.Producto = prods[i] ? prods[i].value.trim() : '';
    l.Presentacion = press[i] ? press[i].value.trim() : '';
    l.Cantidad = Number(cants[i] && cants[i].value) || 0;
    l.Valor_Unitario = Number(vunis[i] && vunis[i].value) || 0;
    l.Valor_Total = Number(vtots[i] && vtots[i].value) || 0;
    l.Remisiones = rems[i] ? rems[i].value.trim() : '';
    l.Cant_Pendiente = Math.max(0, l.Cantidad - (Number(l.Cant_Entregada)||0));
  });

  var hdr = {
    Cliente: document.getElementById('ed-cliente').value.trim(),
    NIT: document.getElementById('ed-nit').value.trim(),
    Fecha_Pedido: document.getElementById('ed-fecha').value || null,
    Comercial: document.getElementById('ed-comercial').value.trim(),
    Municipio: document.getElementById('ed-municipio').value.trim(),
    Departamento: document.getElementById('ed-departamento').value.trim(),
    Telefono: document.getElementById('ed-telefono').value.trim(),
    Plazo_Pago: document.getElementById('ed-plazo').value.trim(),
    Precio_Facturacion: document.getElementById('ed-precio').value.trim(),
    Total_Orden: editWorkingLines.reduce(function(s, l) { return s + (Number(l.Valor_Total)||0); }, 0),
  };

  var c = consecs[editIdx];
  var originalLines = getLinesFor(c);
  var originalRows = originalLines.map(function(l) { return l.__row; });
  var keepRows = editWorkingLines.filter(function(l) { return l.__row; }).map(function(l) { return l.__row; });
  var deleteRows = originalRows.filter(function(r) { return keepRows.indexOf(r) < 0; });

  var btn = document.getElementById('btn-saveEdit');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    var result = await apiPost({
      action: 'editarPedido',
      header: Object.assign({}, hdr, { Nombre_Empresa: c.Nombre_Empresa, Consecutivo: c.Consecutivo }),
      lineas: editWorkingLines,
      deleteRows: deleteRows
    });
    if (!result.ok) throw new Error(result.error || 'Error al guardar');

    closeEdit();
    showToast('✅ Pedido actualizado en Google Sheets');
    await loadFromAPI();
  } catch (err) {
    showToast('❌ Error: ' + err.message, '#e74c3c');
    btn.disabled = false;
    btn.textContent = '✓ Aplicar cambios';
  }
}

// ── Upload Order from Excel ──
var uploadData = null;

function handleFileUpload(input) {
  var file = input.files[0];
  if (!file) return;
  input.value = '';
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = new Uint8Array(e.target.result);
      var parsed = parseOrderExcel(data, file.name);
      uploadData = parsed;
      showUploadPreview(parsed);
    } catch (err) {
      showToast('Error al leer el archivo: ' + err.message, '#e74c3c');
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseOrderExcel(data, filename) {
  var wb = XLSX.read(data, {type: 'array', cellDates: true});
  var ws = wb.Sheets[wb.SheetNames[0]];
  var rows = XLSX.utils.sheet_to_json(ws, {header: 1, defval: null, raw: true});

  function get(r, c) {
    if (r >= rows.length) return null;
    var row = rows[r] || [];
    return c < row.length ? row[c] : null;
  }

  function str(v) { return v != null ? String(v).trim() : null; }

  function dateFmt(v) {
    if (!v) return null;
    if (v instanceof Date) return v.getFullYear() + '-' + String(v.getMonth()+1).padStart(2,'0') + '-' + String(v.getDate()).padStart(2,'0');
    return String(v);
  }

  function findRow(label, col) {
    col = col || 0;
    for (var i = 0; i < rows.length; i++) {
      var cell = get(i, col);
      if (cell != null && String(cell).trim().toUpperCase().indexOf(label) >= 0) return i;
    }
    return null;
  }

  function findSelectedOption(row, skipCol) {
    if (!row) return null;
    skipCol = skipCol || 0;
    var labeled = [];
    for (var i = 0; i < row.length; i++) {
      if (row[i] != null && i > skipCol) labeled.push({i: i, v: row[i]});
    }
    var xItems = labeled.filter(function(item) { return String(item.v).trim().toLowerCase() === 'x'; });
    if (!xItems.length) return null;
    var xp = xItems[0].i;
    var before = labeled.filter(function(item) { return String(item.v).trim().toLowerCase() !== 'x' && item.i < xp; });
    if (!before.length) return null;
    before.sort(function(a, b) { return b.i - a.i; });
    return String(before[0].v).trim();
  }

  var rEmpresa = findRow('NOMBRE DE LA EMPRESA');
  var rFecha = findRow('FECHA');
  var rCliente = findRow('CLIENTE');
  var rDirEnvio = findRow('DIRECCION DE ENVIO') || findRow('DIRECCI');
  var rMunicipio = findRow('MUNICIPIO');
  var rPlazo = findRow('PLAZO DE PAGO');
  var rPrecio = findRow('PRECIO FACTURA');

  function findLabeledValue(label) {
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || [];
      for (var c = 0; c < row.length; c++) {
        var cell = row[c];
        if (cell == null) continue;
        var upper = String(cell).trim().toUpperCase();
        if (upper.indexOf(label) < 0) continue;
        for (var cc = c + 1; cc < row.length; cc++) {
          if (row[cc] != null && String(row[cc]).trim() !== '') return { row: i, col: cc };
        }
      }
    }
    return null;
  }

  var consecInfo = findLabeledValue('CONSECUTIVO');
  var comercialInfo = findLabeledValue('COMERCIAL');
  var nitInfo = findLabeledValue('NIT');
  var telInfo = findLabeledValue('TEL');
  var deptoInfo = findLabeledValue('DEPARTAMENTO');

  var prodHeader = null, obsRow = null, totalRow = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i] && str(rows[i][0]) === 'PRODUCTOS') prodHeader = i;
    if (rows[i] && str(rows[i][0]) === 'OBSERVACIONES') obsRow = i;
    for (var c = 0; c < (rows[i]||[]).length; c++) {
      if (rows[i][c] != null && String(rows[i][c]).indexOf('TOTAL A PAGAR') >= 0) { totalRow = i; break; }
    }
  }

  var cantCol = 5, vuCol = 10, vtCol = 15;
  if (prodHeader !== null) {
    var hdr = rows[prodHeader] || [];
    for (var c = 0; c < hdr.length; c++) {
      var h = str(hdr[c]) || '';
      if (h.toUpperCase().indexOf('CANTIDAD') >= 0) cantCol = c;
      if (h.toUpperCase().indexOf('VALOR UNITARIO') >= 0) vuCol = c;
      if (h.toUpperCase().indexOf('VALOR TOTAL') >= 0) vtCol = c;
    }
  }

  var productos = [];
  if (prodHeader !== null) {
    var endRow = obsRow || rows.length;
    for (var r = prodHeader + 1; r < endRow; r++) {
      var nombre = get(r, 0);
      if (nombre == null) continue;
      productos.push({
        producto: nombre,
        presentacion: get(r, 1),
        cantidad: get(r, cantCol),
        valor_unitario: get(r, vuCol),
        valor_total: get(r, vtCol),
      });
    }
  }

  var observaciones = null;
  if (obsRow !== null) {
    var obsParts = [];
    var obsRowData = rows[obsRow] || [];
    for (var oi = 1; oi < obsRowData.length; oi++) {
      if (obsRowData[oi] != null && String(obsRowData[oi]).trim()) obsParts.push(String(obsRowData[oi]).trim());
    }
    if (obsParts.length) observaciones = obsParts.join(' ');
  }

  return {
    nombre_empresa: rEmpresa !== null ? str(get(rEmpresa, 1)) : null,
    consecutivo: consecInfo ? get(consecInfo.row, consecInfo.col) : null,
    fecha_pedido: rFecha !== null ? dateFmt(get(rFecha, 1)) : null,
    cliente: rCliente !== null ? str(get(rCliente, 1)) : null,
    nit: nitInfo ? get(nitInfo.row, nitInfo.col) : null,
    telefono: telInfo ? get(telInfo.row, telInfo.col) : null,
    direccion_envio: rDirEnvio !== null ? str(get(rDirEnvio, 1)) : null,
    municipio: rMunicipio !== null ? str(get(rMunicipio, 1)) : null,
    departamento: deptoInfo ? str(get(deptoInfo.row, deptoInfo.col)) : null,
    comercial: comercialInfo ? str(get(comercialInfo.row, comercialInfo.col)) : null,
    plazo_pago: rPlazo !== null ? findSelectedOption(rows[rPlazo]) : null,
    precio_facturacion: rPrecio !== null ? findSelectedOption(rows[rPrecio]) : null,
    total_orden: totalRow !== null ? get(totalRow, vtCol) : null,
    observaciones: observaciones,
    productos: productos,
    archivo_fuente: filename,
  };
}

async function showUploadPreview(data) {
  document.getElementById('up-archivo').textContent = 'Archivo: ' + data.archivo_fuente;
  document.getElementById('up-empresa').textContent = data.nombre_empresa || '—';
  document.getElementById('up-consecutivo').textContent = data.consecutivo || '—';
  document.getElementById('up-fecha').textContent = data.fecha_pedido || '—';
  document.getElementById('up-cliente').textContent = data.cliente || '—';
  document.getElementById('up-nit').textContent = data.nit || '—';
  document.getElementById('up-comercial').textContent = data.comercial || '—';
  document.getElementById('up-municipio').textContent = data.municipio || '—';
  document.getElementById('up-departamento').textContent = data.departamento || '—';
  document.getElementById('up-plazo').textContent = data.plazo_pago || '—';
  var obsWrap = document.getElementById('up-obs-wrap');
  if (data.observaciones) {
    document.getElementById('up-observaciones').textContent = data.observaciones;
    obsWrap.style.display = 'block';
  } else {
    obsWrap.style.display = 'none';
  }
  document.getElementById('up-total').textContent = fmtMoney(data.total_orden);

  var tbody = document.getElementById('up-lines');
  if (!data.productos.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a0aec0;padding:16px">Sin productos</td></tr>';
  } else {
    tbody.innerHTML = data.productos.map(function(p, i) {
      return '<tr>' +
        '<td style="color:#a0aec0;font-size:0.74rem">' + (i+1) + '</td>' +
        '<td style="font-weight:700">' + (p.producto||'—') + '</td>' +
        '<td>' + (p.presentacion||'') + '</td>' +
        '<td class="money">' + (p.cantidad||0) + '</td>' +
        '<td class="money">' + fmtMoney(p.valor_unitario) + '</td>' +
        '<td class="money">' + fmtMoney(p.valor_total) + '</td>' +
        '</tr>';
    }).join('');
  }

  var dupWarn = document.getElementById('up-dup-warn');
  dupWarn.style.display = 'none';
  try {
    var dupResult = await apiPost({
      action: 'checkDuplicado',
      consecutivo: data.consecutivo,
      cliente: data.cliente,
      fecha_pedido: data.fecha_pedido
    });
    if (dupResult.ok && dupResult.duplicado) dupWarn.style.display = 'block';
  } catch(e) {}

  document.getElementById('btn-upload').disabled = false;
  document.getElementById('btn-upload').textContent = '📥 Cargar a Google Sheets';
  document.getElementById('upload-overlay').classList.add('show');
}

function closeUpload() {
  document.getElementById('upload-overlay').classList.remove('show');
  uploadData = null;
}

document.getElementById('upload-overlay').addEventListener('click', function(e) { if (isBackdropClick(e)) closeUpload(); });

async function confirmUpload() {
  if (!uploadData) return;
  var btn = document.getElementById('btn-upload');
  btn.disabled = true;
  btn.textContent = '⏳ Cargando...';

  try {
    var result = await apiPost({
      action: 'agregarPedido',
      nombre_empresa: uploadData.nombre_empresa,
      consecutivo: uploadData.consecutivo,
      fecha_pedido: uploadData.fecha_pedido,
      cliente: uploadData.cliente,
      nit: uploadData.nit,
      telefono: uploadData.telefono,
      direccion_envio: uploadData.direccion_envio,
      municipio: uploadData.municipio,
      departamento: uploadData.departamento,
      comercial: uploadData.comercial,
      plazo_pago: uploadData.plazo_pago,
      precio_facturacion: uploadData.precio_facturacion,
      total_orden: uploadData.total_orden,
      observaciones: uploadData.observaciones,
      productos: uploadData.productos,
      archivo_fuente: uploadData.archivo_fuente,
    });
    if (!result.ok) throw new Error(result.error || 'Error al cargar');
    closeUpload();
    showToast('Pedido cargado: ' + (result.added||0) + ' linea(s) agregadas a Google Sheets');
    await loadFromAPI();
  } catch (err) {
    showToast('Error: ' + err.message, '#e74c3c');
    btn.disabled = false;
    btn.textContent = '📥 Cargar a Google Sheets';
  }
}

// ── Delete Order ──
var deleteIdx = null;

function openDelete(idx) {
  deleteIdx = idx;
  var c = consecs[idx];
  var lines = getLinesFor(c);
  var est = derivedStatus(lines);
  document.getElementById('del-msg').textContent = '¿Eliminar el pedido #' + (c.Consecutivo||'') + ' de ' + getSigla(c.Nombre_Empresa) + '?';
  document.getElementById('del-detail').innerHTML =
    'Cliente: <strong>' + (c.Cliente||'—') + '</strong><br>' +
    'Productos: ' + lines.length + ' línea(s) · Estado: ' + est + '<br>' +
    'Total: ' + fmtMoney(c.Total_Orden) + '<br><br>' +
    '<span style="color:#e74c3c;font-weight:700">Se eliminarán todas las líneas de este pedido de Google Sheets.</span>';
  document.getElementById('btn-del-confirm').disabled = false;
  document.getElementById('btn-del-confirm').textContent = '🗑️ Sí, eliminar';
  document.getElementById('delete-overlay').classList.add('show');
}

function closeDelete() {
  document.getElementById('delete-overlay').classList.remove('show');
  deleteIdx = null;
}

document.getElementById('delete-overlay').addEventListener('click', function(e) { if (isBackdropClick(e)) closeDelete(); });

async function confirmDelete() {
  if (deleteIdx === null) return;
  var c = consecs[deleteIdx];
  var btn = document.getElementById('btn-del-confirm');
  btn.disabled = true;
  btn.textContent = '⏳ Eliminando...';

  try {
    var result = await apiPost({
      action: 'eliminarPedido',
      empresa: c.Nombre_Empresa,
      consecutivo: String(c.Consecutivo)
    });
    if (!result.ok) throw new Error(result.error || 'Error al eliminar');
    closeDelete();
    showToast('🗑️ Pedido eliminado: ' + (result.deleted||0) + ' línea(s) removidas');
    await loadFromAPI();
  } catch (err) {
    showToast('❌ Error: ' + err.message, '#e74c3c');
    btn.disabled = false;
    btn.textContent = '🗑️ Sí, eliminar';
  }
}

// ── Auto-load on page open ──
loadFromAPI();
