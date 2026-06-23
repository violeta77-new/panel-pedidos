// ── State ──
var devoluciones = [];
var editDev = null;
var catalogoProductosDev = [];
var catalogoClientesDev = [];
var devLineas = [];

// ── Constants ──
var EMPRESAS_HOLDING_DEV = [
  { value: 'PARCELAR DE COLOMBIA SAS', sigla: 'PARCELAR' },
  { value: 'GREEN AGROSOLUCIONES DE COLOMBIA SAS', sigla: 'GREEN' },
  { value: 'SOLUCIONES INTEGRALES RESO SAS', sigla: 'RESO' },
  { value: 'INSUMOS AGROPECUARIOS SOSTENIBLES SAS', sigla: 'IASO' },
  { value: 'INSUMOS AGROPECUARIOS DE LA SABANA SAS', sigla: 'IAS' },
];

function getSiglaDev(n) {
  for (var i = 0; i < EMPRESAS_HOLDING_DEV.length; i++) {
    if (EMPRESAS_HOLDING_DEV[i].value === (n||'').trim()) return EMPRESAS_HOLDING_DEV[i].sigla;
  }
  return n || '—';
}
var SIGLA_CLS_DEV = ['PARCELAR','GREEN','RESO','IASO','IAS'];
function getSiglaClassDev(n) { var s = getSiglaDev(n); return SIGLA_CLS_DEV.indexOf(s) >= 0 ? 'sigla-'+s : 'sigla-DEFAULT'; }

function fmtMoney(v) {
  var n = Number(v) || 0;
  return '$' + n.toLocaleString('es-CO');
}

// ── Sorting ──
var sortLevelsDev = [];

var SORT_COLS_DEV = [
  { id:'fecha',      label:'Fecha',       fn: function(r) { return +new Date(r.Fecha||0); } },
  { id:'empresa',    label:'Empresa',     fn: function(r) { return getSiglaDev(r.Empresa); } },
  { id:'consecutivo',label:'Consec.',     fn: function(r) { return Number(r.Consecutivo)||0; } },
  { id:'cliente',    label:'Cliente',     fn: function(r) { return (r.Cliente||'').toLowerCase(); } },
  { id:'producto',   label:'Producto',    fn: function(r) { return (r.Producto||'').toLowerCase(); } },
  { id:'cantidad',   label:'Cantidad',    fn: function(r) { return Number(r.Cantidad)||0; } },
  { id:'valor_total',label:'Valor Total', fn: function(r) { return Number(r.Valor_Total)||0; } },
  { id:'vendedor',   label:'Vendedor',    fn: function(r) { return (r.Vendedor||'').toLowerCase(); } },
];

function toggleSortDev(id, e) {
  var shift = e && e.shiftKey;
  var idx = sortLevelsDev.findIndex(function(l) { return l.id === id; });
  if (shift) { if (idx >= 0) sortLevelsDev.splice(idx, 1); }
  else if (idx >= 0) { if (sortLevelsDev[idx].dir === 'asc') sortLevelsDev[idx].dir = 'desc'; else sortLevelsDev.splice(idx, 1); }
  else { sortLevelsDev.push({ id: id, dir: 'asc' }); }
  renderDevTable();
}

function clearSortDev() { sortLevelsDev = []; renderDevTable(); }

function applySortDev(rows) {
  if (!sortLevelsDev.length) return rows;
  return [].concat(rows).sort(function(a, b) {
    for (var si = 0; si < sortLevelsDev.length; si++) {
      var lvl = sortLevelsDev[si];
      var col = null;
      for (var ci = 0; ci < SORT_COLS_DEV.length; ci++) { if (SORT_COLS_DEV[ci].id === lvl.id) { col = SORT_COLS_DEV[ci]; break; } }
      if (!col) continue;
      var va = col.fn(a), vb = col.fn(b);
      var cmp = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
      if (cmp !== 0) return lvl.dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}

// ── Load from API ──
async function loadDevoluciones() {
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
    var data = await apiGet('getDevoluciones');
    if (!data.ok) throw new Error(data.error || 'Error desconocido');

    devoluciones = (data.devoluciones || []).map(function(r) {
      if (r.Fecha instanceof Date) r.Fecha = r.Fecha.toISOString().slice(0,10);
      return r;
    });

    populateDevFilters();
    renderDevTable();

    loadZone.style.display = 'none';
    mainEl.style.display = 'block';
    setSyncStatus('ok', 'Conectado a la nube. Última actualización: ' + new Date().toLocaleTimeString('es-CO'));
    document.getElementById('hdr-status').textContent = '☁️ Supabase · ' + devoluciones.length + ' registros';
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

async function loadCatalogoDev() {
  try {
    var data = await apiGet('getMaestroProductos');
    if (data.ok) catalogoProductosDev = data.productos || [];
  } catch(e) {}
}

async function loadClientesDev() {
  try {
    var data = await apiGet('getClientesUnicos');
    if (data.ok) catalogoClientesDev = data.clientes || [];
  } catch(e) {}
}

// ── Client search/autocomplete ──
var activeClientAutocompleteDev = null;

function buildClientSearchDev() {
  var inp = document.getElementById('dev-cliente');
  if (!inp || inp._clientSearchBound) return;
  inp._clientSearchBound = true;

  inp.addEventListener('input', function() {
    var q = this.value.toLowerCase().trim();
    closeClientAutocompleteDev();
    if (q.length < 1 || !catalogoClientesDev.length) return;

    var matches = catalogoClientesDev.filter(function(c) {
      return (c.cliente || '').toLowerCase().indexOf(q) >= 0 ||
             (c.nit || '').toLowerCase().indexOf(q) >= 0;
    });

    if (!matches.length) return;

    var list = document.createElement('div');
    list.className = 'autocomplete-list client-autocomplete';
    list.style.cssText = 'position:absolute;z-index:100;background:white;border:1px solid #cbd5e0;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.12);max-height:220px;overflow-y:auto;width:100%;left:0;top:100%';

    matches.slice(0, 20).forEach(function(c) {
      var item = document.createElement('div');
      item.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid #f0f4f8';
      var nitLabel = c.nit ? ' <span style="color:#718096;font-size:0.75rem">NIT: ' + c.nit + '</span>' : '';
      var muniLabel = c.municipio ? ' <span style="color:#a0aec0;font-size:0.72rem">· ' + c.municipio + '</span>' : '';
      item.innerHTML = '<span style="font-weight:600">' + c.cliente + '</span>' + nitLabel + muniLabel;
      item.addEventListener('mousedown', function(ev) {
        ev.preventDefault();
        fillClientFields(c);
        closeClientAutocompleteDev();
      });
      item.addEventListener('mouseover', function() { this.style.background = '#f0f8ff'; });
      item.addEventListener('mouseout', function() { this.style.background = 'white'; });
      list.appendChild(item);
    });

    var wrapper = inp.parentElement;
    wrapper.style.position = 'relative';
    wrapper.appendChild(list);
    activeClientAutocompleteDev = list;
  });

  inp.addEventListener('blur', function() {
    setTimeout(closeClientAutocompleteDev, 150);
  });
}

function fillClientFields(c) {
  document.getElementById('dev-cliente').value = c.cliente || '';
  document.getElementById('dev-nit').value = c.nit || '';
  document.getElementById('dev-direccion').value = c.direccion || '';
  document.getElementById('dev-municipio').value = c.municipio || '';
  document.getElementById('dev-departamento').value = c.departamento || '';
  document.getElementById('dev-telefono').value = c.telefono || '';
}

function closeClientAutocompleteDev() {
  document.querySelectorAll('.client-autocomplete').forEach(function(el) { el.remove(); });
  activeClientAutocompleteDev = null;
}

// ── Filters ──
var devFiltersAttached = false;
function populateDevFilters() {
  var productos = [], clientes = [], motivos = [];
  devoluciones.forEach(function(r) {
    if (r.Producto && productos.indexOf(r.Producto) < 0) productos.push(r.Producto);
    if (r.Cliente && clientes.indexOf(r.Cliente) < 0) clientes.push(r.Cliente);
    if (r.Motivo && motivos.indexOf(r.Motivo) < 0) motivos.push(r.Motivo);
  });
  productos.sort();
  clientes.sort();
  motivos.sort();

  var fp = document.getElementById('f-prod');
  fp.innerHTML = '<option value="">Todos</option>' + productos.map(function(p) { return '<option value="' + p + '">' + p + '</option>'; }).join('');

  var fc = document.getElementById('f-cliente');
  fc.innerHTML = '<option value="">Todos</option>' + clientes.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');

  var fm = document.getElementById('f-motivo');
  fm.innerHTML = '<option value="">Todos</option>' + motivos.map(function(m) { return '<option value="' + m + '">' + m + '</option>'; }).join('');

  if (!devFiltersAttached) {
    ['f-empresa','f-cliente','f-motivo','f-prod','f-txt'].forEach(function(id) {
      document.getElementById(id).addEventListener('change', renderDevTable);
      document.getElementById(id).addEventListener('input', renderDevTable);
    });
    devFiltersAttached = true;
  }
}

function filteredDev() {
  var fe = document.getElementById('f-empresa').value;
  var fc = document.getElementById('f-cliente').value;
  var fm = document.getElementById('f-motivo').value;
  var fp = document.getElementById('f-prod').value;
  var ft = document.getElementById('f-txt').value.toLowerCase();
  return devoluciones.filter(function(r) {
    if (fe && r.Empresa !== fe) return false;
    if (fc && r.Cliente !== fc) return false;
    if (fm && r.Motivo !== fm) return false;
    if (fp && r.Producto !== fp) return false;
    if (ft) {
      var hay = [r.Cliente, r.Vendedor, r.Producto, r.Presentacion, r.Num_Factura, r.Motivo, r.Observaciones, r.Consecutivo, r.NIT].join(' ').toLowerCase();
      if (hay.indexOf(ft) < 0) return false;
    }
    return true;
  });
}

function clearDevFilters() {
  document.getElementById('f-empresa').value = '';
  document.getElementById('f-cliente').value = '';
  document.getElementById('f-motivo').value = '';
  document.getElementById('f-prod').value = '';
  document.getElementById('f-txt').value = '';
  renderDevTable();
}

// ── Render ──
function renderDevHeader() {
  var cols = [
    { label:'#', id:null },
    { label:'Fecha', id:'fecha' },
    { label:'Empresa', id:'empresa' },
    { label:'Consec.', id:'consecutivo' },
    { label:'Factura', id:null },
    { label:'Cliente', id:'cliente' },
    { label:'Vendedor', id:'vendedor' },
    { label:'Producto', id:'producto' },
    { label:'Pres.', id:null },
    { label:'Cant.', id:'cantidad' },
    { label:'Cant. Ent.', id:null },
    { label:'V. Unit.', id:null },
    { label:'V. Total', id:'valor_total' },
    { label:'Motivo', id:null },
    { label:'Acción', id:null },
  ];
  document.getElementById('t-head-dev').innerHTML = cols.map(function(col) {
    if (!col.id) return '<th>' + col.label + '</th>';
    var lvlIdx = sortLevelsDev.findIndex(function(l) { return l.id === col.id; });
    var active = lvlIdx >= 0;
    var lvl = active ? sortLevelsDev[lvlIdx] : null;
    var dirCls = active ? (lvl.dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
    var badge = sortLevelsDev.length > 1 && active ? '<span class="sort-badge">' + (lvlIdx+1) + '</span>' : '';
    return '<th class="sortable ' + dirCls + '" onclick="toggleSortDev(\'' + col.id + '\',event)">' + col.label + badge + '<span class="sort-icon"></span></th>';
  }).join('');
  var btn = document.getElementById('btn-clear-sort-dev');
  if (btn) btn.style.display = sortLevelsDev.length ? 'inline-block' : 'none';
}

function renderDevTable() {
  var rows = applySortDev(filteredDev());

  var totalRegs = devoluciones.length;
  var totalValor = devoluciones.reduce(function(s, r) { return s + (Number(r.Valor_Total)||0); }, 0);
  var now = new Date();
  var mesActual = devoluciones.filter(function(r) {
    var d = new Date(r.Fecha);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  var clientesSet = {};
  devoluciones.forEach(function(r) { if (r.Cliente) clientesSet[r.Cliente] = true; });
  var clientesCount = Object.keys(clientesSet).length;

  document.getElementById('s-total').textContent = totalRegs;
  document.getElementById('s-valor').textContent = fmtMoney(totalValor);
  document.getElementById('s-mes').textContent = mesActual;
  document.getElementById('s-clientes').textContent = clientesCount;
  document.getElementById('row-ct-dev').textContent = '(' + rows.length + ' mostrados)';

  renderDevHeader();

  var tbody = document.getElementById('t-body-dev');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="15"><div class="empty">No hay devoluciones con los filtros seleccionados.</div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function(r, i) {
    return '<tr>' +
      '<td style="color:#718096;font-size:0.78rem">' + (i+1) + '</td>' +
      '<td style="white-space:nowrap;font-size:0.78rem">' + fmtDate(r.Fecha) + '</td>' +
      '<td title="' + (r.Empresa||'') + '"><span class="sigla-badge ' + getSiglaClassDev(r.Empresa) + '">' + getSiglaDev(r.Empresa) + '</span></td>' +
      '<td style="text-align:center;font-weight:600">' + (r.Consecutivo||'—') + '</td>' +
      '<td style="font-size:0.78rem">' + (r.Num_Factura||'—') + '</td>' +
      '<td style="font-weight:600;font-size:0.82rem">' + (r.Cliente||'—') + '</td>' +
      '<td style="font-size:0.78rem">' + (r.Vendedor||'—') + '</td>' +
      '<td style="font-weight:700">' + (r.Producto||'—') + '</td>' +
      '<td style="font-size:0.78rem">' + (r.Presentacion||'—') + '</td>' +
      '<td style="text-align:center">' + (r.Cantidad||0) + '</td>' +
      '<td style="text-align:center">' + (r.Cant_Entregada||'—') + '</td>' +
      '<td style="text-align:right;font-size:0.78rem">' + fmtMoney(r.Valor_Unitario) + '</td>' +
      '<td style="text-align:right;font-weight:700;font-size:0.82rem">' + fmtMoney(r.Valor_Total) + '</td>' +
      '<td style="font-size:0.76rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (r.Motivo||'') + '">' + (r.Motivo||'—') + '</td>' +
      '<td><div style="display:flex;gap:6px;align-items:center">' +
        '<button class="btn-edit" onclick="openEditDev(' + r.__row + ')" title="Editar">✏️</button>' +
        '<button class="btn-del" onclick="openDeleteDev(' + i + ',' + (r.__row||0) + ')" title="Eliminar">🗑️</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
}

// ── Product search/autocomplete ──
var activeAutocompleteDev = null;

function buildProductSearchDev(lineIdx) {
  var inp = document.querySelector('.dev-prod-search[data-line="' + lineIdx + '"]');
  if (!inp) return;

  inp.addEventListener('input', function() {
    var q = this.value.toLowerCase().trim();
    var empSel = document.getElementById('dev-empresa').value;
    closeAllAutocompleteDev();
    if (q.length < 1) return;

    var matches = catalogoProductosDev.filter(function(p) {
      var matchName = (p.producto||'').toLowerCase().indexOf(q) >= 0;
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
    list.className = 'autocomplete-list';
    list.style.cssText = 'position:absolute;z-index:100;background:white;border:1px solid #cbd5e0;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.12);max-height:200px;overflow-y:auto;width:100%;left:0;top:100%';

    matches.slice(0, 15).forEach(function(p) {
      var item = document.createElement('div');
      item.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid #f0f4f8;display:flex;justify-content:space-between;align-items:center';
      item.innerHTML = '<span style="font-weight:600">' + (p.producto||'') + '</span><span style="color:#718096;font-size:0.75rem">' + (p.presentacion||'') + '</span>';
      item.addEventListener('mousedown', function(ev) {
        ev.preventDefault();
        inp.value = p.producto;
        var presInp = document.querySelector('.dev-pres[data-line="' + lineIdx + '"]');
        if (presInp) presInp.value = p.presentacion || '';
        devLineas[lineIdx].Producto = p.producto;
        devLineas[lineIdx].Presentacion = p.presentacion || '';
        closeAllAutocompleteDev();
      });
      item.addEventListener('mouseover', function() { this.style.background = '#f0f8ff'; });
      item.addEventListener('mouseout', function() { this.style.background = 'white'; });
      list.appendChild(item);
    });

    var wrapper = inp.parentElement;
    wrapper.style.position = 'relative';
    wrapper.appendChild(list);
    activeAutocompleteDev = list;
  });

  inp.addEventListener('blur', function() {
    setTimeout(closeAllAutocompleteDev, 150);
  });
}

function closeAllAutocompleteDev() {
  document.querySelectorAll('.autocomplete-list').forEach(function(el) { el.remove(); });
  activeAutocompleteDev = null;
}

// ── Render line rows in modal ──
function updateDevTotal() {
  var total = 0;
  devLineas.forEach(function(l) { total += (Number(l.Valor_Total)||0); });
  var el = document.getElementById('dev-total-display');
  if (el) el.textContent = fmtMoney(total);
}

function calcLineTotal(i) {
  var cant = Number(devLineas[i].Cantidad) || 0;
  var vunit = Number(devLineas[i].Valor_Unitario) || 0;
  devLineas[i].Valor_Total = cant * vunit;
  var vtEl = document.querySelector('.dev-vtotal[data-line="' + i + '"]');
  if (vtEl) vtEl.textContent = fmtMoney(devLineas[i].Valor_Total);
  updateDevTotal();
}

function renderDevLines() {
  var tbody = document.getElementById('dev-lines');
  tbody.innerHTML = devLineas.map(function(l, i) {
    return '<tr>' +
      '<td style="color:#a0aec0;font-size:0.74rem">' + (i+1) + '</td>' +
      '<td style="position:relative"><div style="position:relative"><input class="ef dev-prod-search" data-line="' + i + '" type="text" value="' + ((l.Producto||'').replace(/"/g,'&quot;')) + '" placeholder="Buscar producto..." autocomplete="off"></div></td>' +
      '<td><input class="ef dev-pres" data-line="' + i + '" type="text" value="' + ((l.Presentacion||'').replace(/"/g,'&quot;')) + '" placeholder="Pres." style="width:100px"></td>' +
      '<td><input class="ef dev-cant" data-line="' + i + '" type="number" min="0" value="' + (l.Cantidad||'') + '" placeholder="0" style="width:65px;text-align:right"></td>' +
      '<td><input class="ef dev-cant-ent" data-line="' + i + '" type="number" min="0" value="' + (l.Cant_Entregada||'') + '" placeholder="0" style="width:75px;text-align:right"></td>' +
      '<td><input class="ef dev-vunit" data-line="' + i + '" type="number" min="0" value="' + (l.Valor_Unitario||'') + '" placeholder="$0" style="width:90px;text-align:right"></td>' +
      '<td style="text-align:right;font-weight:700;font-size:0.82rem"><span class="dev-vtotal" data-line="' + i + '">' + fmtMoney(l.Valor_Total||0) + '</span></td>' +
      '<td style="text-align:center">' +
        '<button onclick="removeDevLine(' + i + ')" style="background:#e74c3c;color:white;border:none;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:0.78rem;font-weight:700">✕</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  devLineas.forEach(function(l, i) {
    buildProductSearchDev(i);

    var cantInp = document.querySelector('.dev-cant[data-line="' + i + '"]');
    var vunitInp = document.querySelector('.dev-vunit[data-line="' + i + '"]');
    if (cantInp) cantInp.addEventListener('input', function() {
      devLineas[i].Cantidad = Number(this.value) || 0;
      calcLineTotal(i);
    });
    if (vunitInp) vunitInp.addEventListener('input', function() {
      devLineas[i].Valor_Unitario = Number(this.value) || 0;
      calcLineTotal(i);
    });
  });

  updateDevTotal();
}

function addDevLine() {
  devLineas.push({ Producto: '', Presentacion: '', Cantidad: '', Cant_Entregada: '', Valor_Unitario: '', Valor_Total: 0 });
  renderDevLines();
  var lastInput = document.querySelector('.dev-prod-search[data-line="' + (devLineas.length - 1) + '"]');
  if (lastInput) lastInput.focus();
}

function removeDevLine(i) {
  if (devLineas.length <= 1) { showToast('Debe haber al menos una línea', '#e67e22'); return; }
  devLineas.splice(i, 1);
  renderDevLines();
}

function readDevLines() {
  document.querySelectorAll('.dev-prod-search').forEach(function(inp) {
    var i = Number(inp.dataset.line);
    if (devLineas[i]) devLineas[i].Producto = inp.value.trim();
  });
  document.querySelectorAll('.dev-pres').forEach(function(inp) {
    var i = Number(inp.dataset.line);
    if (devLineas[i]) devLineas[i].Presentacion = inp.value.trim();
  });
  document.querySelectorAll('.dev-cant').forEach(function(inp) {
    var i = Number(inp.dataset.line);
    if (devLineas[i]) devLineas[i].Cantidad = Number(inp.value) || 0;
  });
  document.querySelectorAll('.dev-cant-ent').forEach(function(inp) {
    var i = Number(inp.dataset.line);
    if (devLineas[i]) devLineas[i].Cant_Entregada = Number(inp.value) || 0;
  });
  document.querySelectorAll('.dev-vunit').forEach(function(inp) {
    var i = Number(inp.dataset.line);
    if (devLineas[i]) {
      devLineas[i].Valor_Unitario = Number(inp.value) || 0;
      devLineas[i].Valor_Total = (devLineas[i].Cantidad || 0) * devLineas[i].Valor_Unitario;
    }
  });
}

// ── Motivo dropdown helpers ──
function toggleMotivoOtro() {
  var sel = document.getElementById('dev-motivo');
  var inp = document.getElementById('dev-motivo-otro');
  if (sel.value === '__otro__') {
    inp.style.display = 'block';
    inp.focus();
  } else {
    inp.style.display = 'none';
    inp.value = '';
  }
}

function getDevMotivo() {
  var sel = document.getElementById('dev-motivo');
  if (sel.value === '__otro__') return document.getElementById('dev-motivo-otro').value.trim();
  return sel.value;
}

function setDevMotivo(motivo) {
  var sel = document.getElementById('dev-motivo');
  var inp = document.getElementById('dev-motivo-otro');
  var found = false;
  for (var i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === motivo) { found = true; break; }
  }
  if (found) {
    sel.value = motivo;
    inp.style.display = 'none';
    inp.value = '';
  } else {
    sel.value = '__otro__';
    inp.style.display = 'block';
    inp.value = motivo;
  }
}

// ── New Devolucion Modal ──
function openNewDev() {
  editDev = null;
  document.getElementById('dev-modal-title').textContent = '🔄 Registrar Devolución';
  document.getElementById('dev-empresa').value = '';
  document.getElementById('dev-fecha').value = today();
  document.getElementById('dev-consecutivo').value = '';
  document.getElementById('dev-vendedor').value = '';
  document.getElementById('dev-num-factura').value = '';
  document.getElementById('dev-cliente').value = '';
  document.getElementById('dev-nit').value = '';
  document.getElementById('dev-direccion').value = '';
  document.getElementById('dev-municipio').value = '';
  document.getElementById('dev-departamento').value = '';
  document.getElementById('dev-telefono').value = '';
  document.getElementById('dev-motivo').value = '';
  document.getElementById('dev-motivo-otro').value = '';
  document.getElementById('dev-motivo-otro').style.display = 'none';
  document.getElementById('dev-observaciones').value = '';
  document.getElementById('btn-save-dev').disabled = false;
  document.getElementById('btn-save-dev').textContent = '✓ Registrar devolución';
  document.getElementById('dev-edit-single').style.display = 'none';
  document.getElementById('dev-multi-lines').style.display = 'block';

  devLineas = [{ Producto: '', Presentacion: '', Cantidad: '', Cant_Entregada: '', Valor_Unitario: '', Valor_Total: 0 }];
  renderDevLines();
  buildClientSearchDev();
  document.getElementById('dev-overlay').classList.add('show');
}

function closeDevModal() {
  document.getElementById('dev-overlay').classList.remove('show');
  editDev = null;
  closeAllAutocompleteDev();
  closeClientAutocompleteDev();
}

document.getElementById('dev-overlay').addEventListener('click', function(e) { if (isBackdropClick(e)) closeDevModal(); });

// ── Edit Devolucion (single line) ──
function openEditDev(row) {
  var r = null;
  for (var i = 0; i < devoluciones.length; i++) {
    if (devoluciones[i].__row === row) { r = devoluciones[i]; break; }
  }
  if (!r) return;
  editDev = r;
  document.getElementById('dev-modal-title').textContent = '✏️ Editar Devolución';
  document.getElementById('dev-empresa').value = r.Empresa || '';
  document.getElementById('dev-fecha').value = toDateInput(r.Fecha);
  document.getElementById('dev-consecutivo').value = r.Consecutivo || '';
  document.getElementById('dev-vendedor').value = r.Vendedor || '';
  document.getElementById('dev-num-factura').value = r.Num_Factura || '';
  document.getElementById('dev-cliente').value = r.Cliente || '';
  document.getElementById('dev-nit').value = r.NIT || '';
  document.getElementById('dev-direccion').value = r.Direccion || '';
  document.getElementById('dev-municipio').value = r.Municipio || '';
  document.getElementById('dev-departamento').value = r.Departamento || '';
  document.getElementById('dev-telefono').value = r.Telefono || '';
  setDevMotivo(r.Motivo || '');
  document.getElementById('dev-observaciones').value = r.Observaciones || '';
  document.getElementById('btn-save-dev').disabled = false;
  document.getElementById('btn-save-dev').textContent = '✓ Guardar cambios';

  document.getElementById('dev-multi-lines').style.display = 'none';
  document.getElementById('dev-edit-single').style.display = 'block';
  document.getElementById('dev-edit-producto').value = r.Producto || '';
  document.getElementById('dev-edit-presentacion').value = r.Presentacion || '';
  document.getElementById('dev-edit-cantidad').value = r.Cantidad || '';
  document.getElementById('dev-edit-cant-entregada').value = r.Cant_Entregada || '';
  document.getElementById('dev-edit-valor-unit').value = r.Valor_Unitario || '';
  document.getElementById('dev-edit-valor-total').value = r.Valor_Total || '';

  // Auto-calculate on edit
  var calcEdit = function() {
    var c = Number(document.getElementById('dev-edit-cantidad').value) || 0;
    var v = Number(document.getElementById('dev-edit-valor-unit').value) || 0;
    document.getElementById('dev-edit-valor-total').value = c * v;
  };
  document.getElementById('dev-edit-cantidad').oninput = calcEdit;
  document.getElementById('dev-edit-valor-unit').oninput = calcEdit;

  buildClientSearchDev();
  document.getElementById('dev-overlay').classList.add('show');
}

// ── Save ──
async function saveDevolucion() {
  var empresa = document.getElementById('dev-empresa').value;
  var fecha = document.getElementById('dev-fecha').value;
  var consecutivo = document.getElementById('dev-consecutivo').value.trim();
  var vendedor = document.getElementById('dev-vendedor').value.trim();
  var num_factura = document.getElementById('dev-num-factura').value.trim();
  var cliente = document.getElementById('dev-cliente').value.trim();
  var nit = document.getElementById('dev-nit').value.trim();
  var direccion = document.getElementById('dev-direccion').value.trim();
  var municipio = document.getElementById('dev-municipio').value.trim();
  var departamento = document.getElementById('dev-departamento').value.trim();
  var telefono = document.getElementById('dev-telefono').value.trim();
  var motivo = getDevMotivo();
  var observaciones = document.getElementById('dev-observaciones').value.trim();

  if (!empresa) { showToast('Selecciona la empresa', '#e74c3c'); return; }
  if (!fecha) { showToast('Selecciona la fecha', '#e74c3c'); return; }
  if (!cliente) { showToast('Ingresa el nombre del cliente', '#e74c3c'); return; }

  var btn = document.getElementById('btn-save-dev');

  if (editDev) {
    var prod = document.getElementById('dev-edit-producto').value.trim();
    var pres = document.getElementById('dev-edit-presentacion').value.trim();
    var cant = Number(document.getElementById('dev-edit-cantidad').value) || 0;
    var cantEnt = Number(document.getElementById('dev-edit-cant-entregada').value) || 0;
    var vUnit = Number(document.getElementById('dev-edit-valor-unit').value) || 0;
    var vTotal = Number(document.getElementById('dev-edit-valor-total').value) || 0;
    if (!prod) { showToast('Ingresa el producto', '#e74c3c'); return; }

    btn.disabled = true;
    btn.textContent = '⏳ Guardando...';

    try {
      var result = await apiPost({
        action: 'editarDevolucion',
        row: editDev.__row,
        Fecha: fecha, Empresa: empresa, Consecutivo: consecutivo, Vendedor: vendedor,
        Cliente: cliente, NIT: nit, Direccion: direccion, Municipio: municipio,
        Departamento: departamento, Telefono: telefono, Num_Factura: num_factura,
        Producto: prod, Presentacion: pres, Cantidad: cant, Cant_Entregada: cantEnt,
        Valor_Unitario: vUnit, Valor_Total: vTotal,
        Motivo: motivo, Observaciones: observaciones,
      });
      if (!result.ok) throw new Error(result.error || 'Error al guardar');
      closeDevModal();
      showToast('✅ Devolución actualizada en la nube');
      await loadDevoluciones();
    } catch (err) {
      showToast('❌ Error: ' + err.message, '#e74c3c');
      btn.disabled = false;
      btn.textContent = '✓ Guardar cambios';
    }
    return;
  }

  readDevLines();
  var validLines = devLineas.filter(function(l) { return l.Producto; });
  if (!validLines.length) { showToast('Agrega al menos un producto', '#e74c3c'); return; }

  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    var result = await apiPost({
      action: 'agregarDevolucion',
      Fecha: fecha, Empresa: empresa, Consecutivo: consecutivo, Vendedor: vendedor,
      Cliente: cliente, NIT: nit, Direccion: direccion, Municipio: municipio,
      Departamento: departamento, Telefono: telefono, Num_Factura: num_factura,
      Motivo: motivo, Observaciones: observaciones,
      lineas: validLines,
    });
    if (!result.ok) throw new Error(result.error || 'Error al guardar');
    closeDevModal();
    showToast('✅ ' + result.added + ' línea(s) registradas en la nube');
    await loadDevoluciones();
  } catch (err) {
    showToast('❌ Error: ' + err.message, '#e74c3c');
    btn.disabled = false;
    btn.textContent = '✓ Registrar devolución';
  }
}

// ── Delete ──
var deleteDevRow = null;

function openDeleteDev(idx, row) {
  deleteDevRow = row;
  var rows = filteredDev();
  var r = rows[idx] || {};
  document.getElementById('del-dev-msg').textContent = '¿Eliminar esta devolución?';
  document.getElementById('del-dev-detail').innerHTML =
    'Cliente: <strong>' + (r.Cliente||'—') + '</strong> · Producto: <strong>' + (r.Producto||'—') + '</strong><br>' +
    'Valor: ' + fmtMoney(r.Valor_Total) + ' · ' + fmtDate(r.Fecha) + '<br><br>' +
    '<span style="color:#e74c3c;font-weight:700">Se eliminará este registro de la base de datos.</span>';
  document.getElementById('btn-del-dev-confirm').disabled = false;
  document.getElementById('btn-del-dev-confirm').textContent = '🗑️ Sí, eliminar';
  document.getElementById('delete-dev-overlay').classList.add('show');
}

function closeDeleteDev() {
  document.getElementById('delete-dev-overlay').classList.remove('show');
  deleteDevRow = null;
}

document.getElementById('delete-dev-overlay').addEventListener('click', function(e) { if (isBackdropClick(e)) closeDeleteDev(); });

async function confirmDeleteDev() {
  if (!deleteDevRow) return;
  var btn = document.getElementById('btn-del-dev-confirm');
  btn.disabled = true;
  btn.textContent = '⏳ Eliminando...';

  try {
    var result = await apiPost({ action: 'eliminarDevolucion', row: deleteDevRow });
    if (!result.ok) throw new Error(result.error || 'Error al eliminar');
    closeDeleteDev();
    showToast('🗑️ Devolución eliminada');
    await loadDevoluciones();
  } catch (err) {
    showToast('❌ Error: ' + err.message, '#e74c3c');
    btn.disabled = false;
    btn.textContent = '🗑️ Sí, eliminar';
  }
}

// ── Excel import ──
function handleDevExcelUpload(input) {
  var file = input.files[0];
  if (!file) return;
  input.value = '';

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var wb = XLSX.read(e.target.result, { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var parsed = parseDevExcel(ws);
      if (!parsed) { showToast('No se pudo leer el formato de devolución', '#e74c3c'); return; }
      prefillDevForm(parsed);
      showToast('📂 Datos cargados desde Excel — revisa y guarda');
    } catch (err) {
      showToast('❌ Error al leer el archivo: ' + err.message, '#e74c3c');
    }
  };
  reader.readAsArrayBuffer(file);
}

function findCellByLabel(ws, label) {
  var range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  var labelUp = label.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (var r = range.s.r; r <= range.e.r; r++) {
    for (var c = range.s.c; c <= range.e.c; c++) {
      var addr = XLSX.utils.encode_cell({ r: r, c: c });
      var cell = ws[addr];
      if (!cell) continue;
      var val = String(cell.v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (val.indexOf(labelUp) >= 0) return { r: r, c: c };
    }
  }
  return null;
}

function getCellValue(ws, r, c) {
  var addr = XLSX.utils.encode_cell({ r: r, c: c });
  var cell = ws[addr];
  if (!cell) return '';
  if (cell.t === 'n') return cell.v;
  return String(cell.v || '').trim();
}

function getValueNextTo(ws, label, colOffset) {
  var pos = findCellByLabel(ws, label);
  if (!pos) return '';
  return getCellValue(ws, pos.r, pos.c + (colOffset || 1));
}

function parseDevExcel(ws) {
  var empresa = getValueNextTo(ws, 'NOMBRE DE LA EMPRESA') || getValueNextTo(ws, 'NOMBRE EMPRESA');
  var fecha = getValueNextTo(ws, 'FECHA');
  var vendedor = getValueNextTo(ws, 'VENDEDOR');
  var cliente = getValueNextTo(ws, 'CLIENTE');
  var nit = getValueNextTo(ws, 'NIT');
  var direccion = '';
  var dirPos = findCellByLabel(ws, 'DIRECCION');
  if (dirPos) {
    var clientePos = findCellByLabel(ws, 'CLIENTE');
    if (clientePos && dirPos.r > clientePos.r) {
      direccion = getCellValue(ws, dirPos.r, dirPos.c + 1);
    } else if (dirPos) {
      var dirs = [];
      var range = XLSX.utils.decode_range(ws['!ref']);
      for (var r = range.s.r; r <= range.e.r; r++) {
        for (var c = range.s.c; c <= range.e.c; c++) {
          var v = String(getCellValue(ws, r, c)).toUpperCase().replace(/[^A-Z]/g, '');
          if (v === 'DIRECCION' && r > (clientePos ? clientePos.r : 0)) {
            direccion = getCellValue(ws, r, c + 1);
            break;
          }
        }
        if (direccion) break;
      }
      if (!direccion) direccion = getCellValue(ws, dirPos.r, dirPos.c + 1);
    }
  }
  var municipio = getValueNextTo(ws, 'MUNICIPIO');
  var departamento = getValueNextTo(ws, 'DEPARTAMENTO');
  var telefono = getValueNextTo(ws, 'TELEFONO');
  var numFactura = getValueNextTo(ws, 'FACTURA');
  var consecutivo = '';
  var consPos = findCellByLabel(ws, 'CONSECUTIVO');
  if (consPos) consecutivo = getCellValue(ws, consPos.r, consPos.c + 1);

  var observaciones = getValueNextTo(ws, 'OBSERVACIONES');
  if (!observaciones) {
    var obsPos = findCellByLabel(ws, 'OBSERVACIONES');
    if (obsPos) {
      var parts = [];
      for (var oRow = obsPos.r + 1; oRow <= obsPos.r + 3; oRow++) {
        var v = getCellValue(ws, oRow, obsPos.c + 1);
        if (v) parts.push(v);
        else break;
      }
      observaciones = parts.join('. ');
    }
  }

  var motivo = getValueNextTo(ws, 'MOTIVO');
  if (!motivo) {
    var motPos = findCellByLabel(ws, 'MOTIVO');
    if (motPos) {
      var parts = [];
      for (var mRow = motPos.r + 1; mRow <= motPos.r + 2; mRow++) {
        var v = getCellValue(ws, mRow, motPos.c + 1);
        if (v) parts.push(v);
        else break;
      }
      motivo = parts.join('. ');
    }
  }

  var prodPos = findCellByLabel(ws, 'PRODUCTOS');
  if (!prodPos) prodPos = findCellByLabel(ws, 'PRODUCTO');
  var lineas = [];
  if (prodPos) {
    var startRow = prodPos.r + 1;
    var range = XLSX.utils.decode_range(ws['!ref']);
    var colProd = prodPos.c;
    for (var r = startRow; r <= range.e.r; r++) {
      var prod = String(getCellValue(ws, r, colProd)).trim();
      if (!prod) continue;
      var prodUp = prod.toUpperCase().replace(/[^A-Z]/g, '');
      if (prodUp === 'OBSERVACIONES' || prodUp === 'MOTIVO' || prodUp === 'FACTURA') break;
      lineas.push({
        Producto: prod,
        Presentacion: String(getCellValue(ws, r, colProd + 1)).trim(),
        Cantidad: Number(getCellValue(ws, r, colProd + 2)) || 0,
        Cant_Entregada: Number(getCellValue(ws, r, colProd + 3)) || 0,
        Valor_Unitario: Number(getCellValue(ws, r, colProd + 4)) || 0,
        Valor_Total: Number(getCellValue(ws, r, colProd + 5)) || 0,
      });
    }
  }

  if (!cliente && !lineas.length) return null;

  if (fecha) {
    if (typeof fecha === 'number') {
      var d = XLSX.SSF.parse_date_code(fecha);
      if (d) fecha = d.y + '-' + String(d.m).padStart(2,'0') + '-' + String(d.d).padStart(2,'0');
    } else {
      var dp = new Date(fecha);
      if (!isNaN(dp)) fecha = dp.getFullYear() + '-' + String(dp.getMonth()+1).padStart(2,'0') + '-' + String(dp.getDate()).padStart(2,'0');
    }
  }

  return {
    empresa: empresa, fecha: fecha, vendedor: vendedor, cliente: cliente,
    nit: String(nit), direccion: direccion, municipio: municipio,
    departamento: departamento, telefono: String(telefono),
    numFactura: String(numFactura), consecutivo: String(consecutivo),
    observaciones: observaciones, motivo: motivo, lineas: lineas,
  };
}

function prefillDevForm(data) {
  openNewDev();

  var empSelect = document.getElementById('dev-empresa');
  var empVal = (data.empresa || '').toUpperCase();
  var matched = false;
  for (var i = 0; i < empSelect.options.length; i++) {
    if (empVal.indexOf(empSelect.options[i].value.split(' ')[0].toUpperCase()) >= 0 && empSelect.options[i].value) {
      empSelect.value = empSelect.options[i].value;
      matched = true;
      break;
    }
  }
  if (!matched) {
    for (var i = 0; i < EMPRESAS_HOLDING_DEV.length; i++) {
      if (empVal.indexOf(EMPRESAS_HOLDING_DEV[i].sigla) >= 0) {
        empSelect.value = EMPRESAS_HOLDING_DEV[i].value;
        break;
      }
    }
  }

  if (data.fecha) document.getElementById('dev-fecha').value = data.fecha;
  document.getElementById('dev-consecutivo').value = data.consecutivo || '';
  document.getElementById('dev-vendedor').value = data.vendedor || '';
  document.getElementById('dev-num-factura').value = data.numFactura || '';
  document.getElementById('dev-cliente').value = data.cliente || '';
  document.getElementById('dev-nit').value = data.nit || '';
  document.getElementById('dev-direccion').value = data.direccion || '';
  document.getElementById('dev-municipio').value = data.municipio || '';
  document.getElementById('dev-departamento').value = data.departamento || '';
  document.getElementById('dev-telefono').value = data.telefono || '';
  document.getElementById('dev-observaciones').value = data.observaciones || '';

  if (data.motivo) setDevMotivo(data.motivo);

  if (data.lineas && data.lineas.length) {
    devLineas = data.lineas.map(function(l) {
      var cant = Number(l.Cantidad) || 0;
      var vUnit = Number(l.Valor_Unitario) || 0;
      return {
        Producto: l.Producto || '',
        Presentacion: l.Presentacion || '',
        Cantidad: cant,
        Cant_Entregada: Number(l.Cant_Entregada) || 0,
        Valor_Unitario: vUnit,
        Valor_Total: Number(l.Valor_Total) || (cant * vUnit),
      };
    });
    renderDevLines();
  }
}

// ── Auto-load ──
loadDevoluciones();
loadCatalogoDev();
loadClientesDev();
