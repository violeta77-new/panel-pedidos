// ── State ──
var devoluciones = [];
var editDev = null;
var catalogoProductosDev = [];
var devLineas = [];

// ── Constants ──
var MOTIVOS_DEV = ['Producto defectuoso', 'Sobrante', 'Error de envío', 'Producto vencido', 'Otro'];
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

// ── Sorting ──
var sortLevelsDev = [];

var SORT_COLS_DEV = [
  { id:'fecha',     label:'Fecha',        fn: function(r) { return +new Date(r.Fecha||0); } },
  { id:'motivo',    label:'Motivo',       fn: function(r) { return (r.Motivo||'').toLowerCase(); } },
  { id:'emp_orig',  label:'Emp. Origen',  fn: function(r) { return getSiglaDev(r.Empresa_Origen); } },
  { id:'emp_dest',  label:'Emp. Destino', fn: function(r) { return getSiglaDev(r.Empresa_Destino); } },
  { id:'producto',  label:'Producto',     fn: function(r) { return (r.Producto||'').toLowerCase(); } },
  { id:'cantidad',  label:'Cantidad',     fn: function(r) { return Number(r.Cantidad)||0; } },
  { id:'responsable', label:'Responsable', fn: function(r) { return (r.Responsable||'').toLowerCase(); } },
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
    setSyncStatus('ok', 'Conectado a Google Sheets. Última actualización: ' + new Date().toLocaleTimeString('es-CO'));
    document.getElementById('hdr-status').textContent = '☁️ Google Sheets · ' + devoluciones.length + ' registros';
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

// ── Filters ──
var devFiltersAttached = false;
function populateDevFilters() {
  var productos = [];
  devoluciones.forEach(function(r) {
    if (r.Producto && productos.indexOf(r.Producto) < 0) productos.push(r.Producto);
  });
  productos.sort();

  var fp = document.getElementById('f-prod');
  fp.innerHTML = '<option value="">Todos</option>' + productos.map(function(p) { return '<option value="' + p + '">' + p + '</option>'; }).join('');

  if (!devFiltersAttached) {
    ['f-motivo','f-emp-orig','f-emp-dest','f-prod','f-txt'].forEach(function(id) {
      document.getElementById(id).addEventListener('change', renderDevTable);
      document.getElementById(id).addEventListener('input', renderDevTable);
    });
    devFiltersAttached = true;
  }
}

function filteredDev() {
  var fm = document.getElementById('f-motivo').value;
  var feo = document.getElementById('f-emp-orig').value;
  var fed = document.getElementById('f-emp-dest').value;
  var fp = document.getElementById('f-prod').value;
  var ft = document.getElementById('f-txt').value.toLowerCase();
  return devoluciones.filter(function(r) {
    if (fm && r.Motivo !== fm) return false;
    if (feo && r.Empresa_Origen !== feo) return false;
    if (fed && r.Empresa_Destino !== fed) return false;
    if (fp && r.Producto !== fp) return false;
    if (ft) {
      var hay = [r.Producto, r.Presentacion, r.Remision, r.Responsable, r.Motivo, r.Observaciones].join(' ').toLowerCase();
      if (hay.indexOf(ft) < 0) return false;
    }
    return true;
  });
}

function clearDevFilters() {
  document.getElementById('f-motivo').value = '';
  document.getElementById('f-emp-orig').value = '';
  document.getElementById('f-emp-dest').value = '';
  document.getElementById('f-prod').value = '';
  document.getElementById('f-txt').value = '';
  renderDevTable();
}

// ── Render ──
function renderDevHeader() {
  var cols = [
    { label:'#', id:null },
    { label:'Fecha', id:'fecha' },
    { label:'Motivo', id:'motivo' },
    { label:'Emp. Origen', id:'emp_orig' },
    { label:'Emp. Destino', id:'emp_dest' },
    { label:'Producto', id:'producto' },
    { label:'Presentación', id:null },
    { label:'Cantidad', id:'cantidad' },
    { label:'Responsable', id:'responsable' },
    { label:'Remisión', id:null },
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
  var totalUnidades = devoluciones.reduce(function(s, r) { return s + (Number(r.Cantidad)||0); }, 0);
  var now = new Date();
  var mesActual = devoluciones.filter(function(r) {
    var d = new Date(r.Fecha);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  var empresasSet = {};
  devoluciones.forEach(function(r) {
    if (r.Empresa_Origen) empresasSet[r.Empresa_Origen] = true;
    if (r.Empresa_Destino) empresasSet[r.Empresa_Destino] = true;
  });
  var empresasCount = Object.keys(empresasSet).length;

  document.getElementById('s-total').textContent = totalRegs;
  document.getElementById('s-unidades').textContent = totalUnidades.toLocaleString('es-CO');
  document.getElementById('s-mes').textContent = mesActual;
  document.getElementById('s-empresas').textContent = empresasCount;
  document.getElementById('row-ct-dev').textContent = '(' + rows.length + ' mostrados)';

  renderDevHeader();

  var tbody = document.getElementById('t-body-dev');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="11"><div class="empty">No hay devoluciones con los filtros seleccionados.</div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function(r, i) {
    var motivoBadge = '<span class="badge b-rec">' + (r.Motivo||'—') + '</span>';
    return '<tr>' +
      '<td style="color:#718096;font-size:0.78rem">' + (i+1) + '</td>' +
      '<td style="white-space:nowrap;font-size:0.78rem">' + fmtDate(r.Fecha) + '</td>' +
      '<td>' + motivoBadge + '</td>' +
      '<td title="' + (r.Empresa_Origen||'') + '"><span class="sigla-badge ' + getSiglaClassDev(r.Empresa_Origen) + '">' + getSiglaDev(r.Empresa_Origen) + '</span></td>' +
      '<td title="' + (r.Empresa_Destino||'') + '"><span class="sigla-badge ' + getSiglaClassDev(r.Empresa_Destino) + '">' + getSiglaDev(r.Empresa_Destino) + '</span></td>' +
      '<td style="font-weight:700">' + (r.Producto||'—') + '</td>' +
      '<td>' + (r.Presentacion||'—') + '</td>' +
      '<td style="text-align:center;font-weight:700">' + (r.Cantidad||0) + '</td>' +
      '<td style="font-size:0.78rem">' + (r.Responsable||'—') + '</td>' +
      '<td style="font-size:0.78rem">' + (r.Remision||'—') + '</td>' +
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
    var empSel = document.getElementById('dev-empresa-origen').value;
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
function renderDevLines() {
  var tbody = document.getElementById('dev-lines');
  tbody.innerHTML = devLineas.map(function(l, i) {
    return '<tr>' +
      '<td style="color:#a0aec0;font-size:0.74rem">' + (i+1) + '</td>' +
      '<td style="position:relative"><div style="position:relative"><input class="ef dev-prod-search" data-line="' + i + '" type="text" value="' + ((l.Producto||'').replace(/"/g,'&quot;')) + '" placeholder="Buscar producto..." autocomplete="off"></div></td>' +
      '<td><input class="ef dev-pres" data-line="' + i + '" type="text" value="' + ((l.Presentacion||'').replace(/"/g,'&quot;')) + '" placeholder="Presentación" style="width:120px"></td>' +
      '<td><input class="ef dev-cant" data-line="' + i + '" type="number" min="1" value="' + (l.Cantidad||'') + '" placeholder="0" style="width:80px;text-align:right"></td>' +
      '<td style="text-align:center">' +
        '<button onclick="removeDevLine(' + i + ')" style="background:#e74c3c;color:white;border:none;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:0.78rem;font-weight:700">✕</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  devLineas.forEach(function(l, i) { buildProductSearchDev(i); });
}

function addDevLine() {
  devLineas.push({ Producto: '', Presentacion: '', Cantidad: '' });
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
}

// ── New Devolucion Modal ──
function openNewDev() {
  editDev = null;
  document.getElementById('dev-modal-title').textContent = '🔄 Registrar Devolución';
  document.getElementById('dev-fecha').value = today();
  document.getElementById('dev-motivo').value = '';
  document.getElementById('dev-empresa-origen').value = '';
  document.getElementById('dev-empresa-destino').value = '';
  document.getElementById('dev-responsable').value = '';
  document.getElementById('dev-remision').value = '';
  document.getElementById('dev-observaciones').value = '';
  document.getElementById('btn-save-dev').disabled = false;
  document.getElementById('btn-save-dev').textContent = '✓ Registrar devolución';
  document.getElementById('dev-edit-single').style.display = 'none';
  document.getElementById('dev-multi-lines').style.display = 'block';

  devLineas = [{ Producto: '', Presentacion: '', Cantidad: '' }];
  renderDevLines();
  document.getElementById('dev-overlay').classList.add('show');
}

function closeDevModal() {
  document.getElementById('dev-overlay').classList.remove('show');
  editDev = null;
  closeAllAutocompleteDev();
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
  document.getElementById('dev-fecha').value = toDateInput(r.Fecha);
  document.getElementById('dev-motivo').value = r.Motivo || '';
  document.getElementById('dev-empresa-origen').value = r.Empresa_Origen || '';
  document.getElementById('dev-empresa-destino').value = r.Empresa_Destino || '';
  document.getElementById('dev-responsable').value = r.Responsable || '';
  document.getElementById('dev-remision').value = r.Remision || '';
  document.getElementById('dev-observaciones').value = r.Observaciones || '';
  document.getElementById('btn-save-dev').disabled = false;
  document.getElementById('btn-save-dev').textContent = '✓ Guardar cambios';

  document.getElementById('dev-multi-lines').style.display = 'none';
  document.getElementById('dev-edit-single').style.display = 'block';
  document.getElementById('dev-edit-producto').value = r.Producto || '';
  document.getElementById('dev-edit-presentacion').value = r.Presentacion || '';
  document.getElementById('dev-edit-cantidad').value = r.Cantidad || '';

  document.getElementById('dev-overlay').classList.add('show');
}

// ── Save ──
async function saveDevolucion() {
  var fecha = document.getElementById('dev-fecha').value;
  var motivo = document.getElementById('dev-motivo').value;
  var empresa_origen = document.getElementById('dev-empresa-origen').value;
  var empresa_destino = document.getElementById('dev-empresa-destino').value;
  var responsable = document.getElementById('dev-responsable').value.trim();
  var remision = document.getElementById('dev-remision').value.trim();
  var observaciones = document.getElementById('dev-observaciones').value.trim();

  if (!fecha) { showToast('Selecciona la fecha', '#e74c3c'); return; }
  if (!motivo) { showToast('Selecciona el motivo', '#e74c3c'); return; }
  if (!empresa_origen) { showToast('Selecciona la empresa origen', '#e74c3c'); return; }
  if (!empresa_destino) { showToast('Selecciona la empresa destino', '#e74c3c'); return; }

  var btn = document.getElementById('btn-save-dev');

  if (editDev) {
    var prod = document.getElementById('dev-edit-producto').value.trim();
    var pres = document.getElementById('dev-edit-presentacion').value.trim();
    var cant = Number(document.getElementById('dev-edit-cantidad').value) || 0;
    if (!prod) { showToast('Ingresa el producto', '#e74c3c'); return; }
    if (cant <= 0) { showToast('Ingresa una cantidad válida', '#e74c3c'); return; }

    btn.disabled = true;
    btn.textContent = '⏳ Guardando...';

    try {
      var result = await apiPost({
        action: 'editarDevolucion',
        row: editDev.__row,
        Fecha: fecha, Motivo: motivo, Empresa_Origen: empresa_origen, Empresa_Destino: empresa_destino,
        Producto: prod, Presentacion: pres, Cantidad: cant,
        Responsable: responsable, Remision: remision, Observaciones: observaciones,
      });
      if (!result.ok) throw new Error(result.error || 'Error al guardar');
      closeDevModal();
      showToast('✅ Devolución actualizada en Google Sheets');
      await loadDevoluciones();
    } catch (err) {
      showToast('❌ Error: ' + err.message, '#e74c3c');
      btn.disabled = false;
      btn.textContent = '✓ Guardar cambios';
    }
    return;
  }

  readDevLines();
  var validLines = devLineas.filter(function(l) { return l.Producto && l.Cantidad > 0; });
  if (!validLines.length) { showToast('Agrega al menos un producto con cantidad', '#e74c3c'); return; }

  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    var result = await apiPost({
      action: 'agregarDevolucion',
      Fecha: fecha, Motivo: motivo, Empresa_Origen: empresa_origen, Empresa_Destino: empresa_destino,
      Responsable: responsable, Remision: remision, Observaciones: observaciones,
      lineas: validLines,
    });
    if (!result.ok) throw new Error(result.error || 'Error al guardar');
    closeDevModal();
    showToast('✅ ' + result.added + ' línea(s) registradas en Google Sheets');
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
    'Producto: <strong>' + (r.Producto||'—') + '</strong> · ' + (r.Cantidad||0) + ' uds<br>' +
    'Motivo: ' + (r.Motivo||'—') + ' · ' + fmtDate(r.Fecha) + '<br><br>' +
    '<span style="color:#e74c3c;font-weight:700">Se eliminará este registro de Google Sheets.</span>';
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

// ── Auto-load ──
loadDevoluciones();
loadCatalogoDev();
