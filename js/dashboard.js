// ── Dashboard State ──
var dPedidos = [];
var dDevoluciones = [];
var dIngresos = [];
var dInventario = [];
var dOrdenes = [];
var dMuestras = [];
var dReenvases = [];

var SIGLAS = {
  'PARCELAR DE COLOMBIA SAS': 'PARCELAR',
  'GREEN AGROSOLUCIONES DE COLOMBIA SAS': 'GREEN',
  'SOLUCIONES INTEGRALES RESO SAS': 'RESO',
  'INSUMOS AGROPECUARIOS SOSTENIBLES SAS': 'IASO',
  'INSUMOS AGROPECUARIOS DE LA SABANA SAS': 'IAS',
  'INSUMOS AGROPECUARIOS DE LA SABANA SAS ': 'IAS',
};
var EMP_COLORS = { PARCELAR: '#2980b9', GREEN: '#27ae60', RESO: '#e67e22', IASO: '#8e44ad', IAS: '#c0392b' };
function dGetSigla(n) { return SIGLAS[(n || '').trim()] || n || '—'; }

// ── Load ──
async function loadDashboard() {
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
      apiGet('getPedidos'),
      apiGet('getDevoluciones').catch(function() { return { ok: true, devoluciones: [] }; }),
      apiGet('getIngresos').catch(function() { return { ok: true, ingresos: [] }; }),
      apiGet('getInventario').catch(function() { return { ok: true, inventario: [] }; }),
      apiGet('getOrdenesCompra').catch(function() { return { ok: true, ordenes: [] }; }),
      apiGet('getMuestras').catch(function() { return { ok: true, muestras: [] }; }),
      apiGet('getReenvases').catch(function() { return { ok: true, reenvases: [] }; })
    ]);

    if (!results[0].ok) throw new Error(results[0].error || 'Error al cargar pedidos');

    dPedidos = (results[0].pedidos || []).filter(function(p) {
      return p.Nombre_Empresa !== 'Nombre_Empresa' && p.Cliente !== 'Cliente';
    }).map(function(p) {
      if (!p.Cant_Entregada && p.Cant_Entregada !== 0) {
        p.Cant_Entregada = 0;
        p.Cant_Pendiente = Number(p.Cantidad) || 0;
        p.Estado_Entrega = 'Recibido';
      }
      if (!p.Estado_2) p.Estado_2 = 'Abierto';
      p.Cant_Pendiente = Math.max(0, (Number(p.Cantidad) || 0) - (Number(p.Cant_Entregada) || 0));
      return p;
    });

    dDevoluciones = results[1].devoluciones || [];
    dIngresos = results[2].ingresos || [];
    dInventario = results[3].inventario || [];
    dOrdenes = results[4].ordenes || [];
    dMuestras = results[5].muestras || [];
    dReenvases = results[6].reenvases || [];

    populateDashFilters();
    buildDashboard();

    loadZone.style.display = 'none';
    mainEl.style.display = 'block';
    setSyncStatus('ok', 'Conectado a la nube. Ultima actualizacion: ' + new Date().toLocaleTimeString('es-CO'));
    document.getElementById('hdr-status').textContent = '☁️ Supabase';
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
var dashFiltersAttached = false;
function populateDashFilters() {
  var emps = [];
  dPedidos.forEach(function(p) {
    if (p.Nombre_Empresa && emps.indexOf(p.Nombre_Empresa) < 0) emps.push(p.Nombre_Empresa);
  });
  emps.sort();
  var sel = document.getElementById('df-emp');
  sel.innerHTML = '<option value="">Todas</option>' + emps.map(function(e) {
    return '<option value="' + e + '">' + dGetSigla(e) + ' — ' + e + '</option>';
  }).join('');

  if (!dashFiltersAttached) {
    sel.addEventListener('change', buildDashboard);
    dashFiltersAttached = true;
  }
}

function clearDashFilters() {
  document.getElementById('df-emp').value = '';
  buildDashboard();
}

// ── Build Dashboard ──
function buildDashboard() {
  var fEmp = document.getElementById('df-emp').value;

  var ped = fEmp ? dPedidos.filter(function(p) { return p.Nombre_Empresa === fEmp; }) : dPedidos;
  var dev = fEmp ? dDevoluciones.filter(function(d) { return d.Empresa === fEmp; }) : dDevoluciones;
  var inv = fEmp ? dInventario.filter(function(i) { return i.Empresa === fEmp; }) : dInventario;
  var oc = fEmp ? dOrdenes.filter(function(o) { return o.Empresa_Destino === fEmp || o.Empresa_Origen === fEmp; }) : dOrdenes;
  var mue = fEmp ? dMuestras.filter(function(m) { return m.Empresa === fEmp; }) : dMuestras;
  var ree = fEmp ? dReenvases.filter(function(r) { return r.Empresa === fEmp; }) : dReenvases;
  var ing = fEmp ? dIngresos.filter(function(i) { return i.Empresa_Origen === fEmp || i.Empresa_Destino === fEmp; }) : dIngresos;

  document.getElementById('dash-ts').textContent = 'Actualizado: ' + new Date().toLocaleString('es-CO');

  buildKPIs(ped, dev, inv, oc);
  buildEntregas(ped);
  buildEmpresas(ped);
  buildTopProductos(ped);
  buildTopClientes(ped);
  buildDevoluciones(dev);
  buildTopComerciales(ped);
  buildInventario(inv, ped);
  buildResumenModulos(ped, dev, ing, inv, oc, mue, ree);
}

// ── 1. KPI Cards ──
function buildKPIs(ped, dev, inv, oc) {
  var ordSet = {};
  var abiertos = 0;
  var valorTotal = 0;
  var udsEntregadas = 0;
  var udsPedidas = 0;

  ped.forEach(function(p) {
    var key = (p.Nombre_Empresa || '') + '||' + (p.Consecutivo || '');
    if (!ordSet[key]) {
      ordSet[key] = true;
      if ((p.Estado_2 || 'Abierto') === 'Abierto') abiertos++;
    }
    valorTotal += Number(p.Valor_Total) || 0;
    udsEntregadas += Number(p.Cant_Entregada) || 0;
    udsPedidas += Number(p.Cantidad) || 0;
  });

  var totalOrdenes = Object.keys(ordSet).length;
  var tasaEntrega = udsPedidas > 0 ? Math.round((udsEntregadas / udsPedidas) * 100) : 0;

  var devPendientes = dev.filter(function(d) { return (d.Estado || '') === 'Pendiente'; }).length;
  var valorDev = dev.reduce(function(s, d) { return s + (Number(d.Valor_Total) || 0); }, 0);

  var html = '';
  html += kpiCard('', totalOrdenes.toLocaleString('es-CO'), 'Total ordenes', abiertos + ' abiertas');
  html += kpiCard('green', fmtMoney(valorTotal), 'Valor total pedidos', ped.length.toLocaleString('es-CO') + ' lineas');
  html += kpiCard('teal', tasaEntrega + '%', 'Tasa de entrega', udsEntregadas.toLocaleString('es-CO') + ' / ' + udsPedidas.toLocaleString('es-CO') + ' uds');
  html += kpiCard('red', devPendientes.toString(), 'Devoluciones pendientes', fmtMoney(valorDev) + ' total dev.');
  html += kpiCard('purple', inv.length.toLocaleString('es-CO'), 'Registros inventario', inv.reduce(function(s, i) { return s + (Number(i.Cantidad) || 0); }, 0).toLocaleString('es-CO') + ' uds en stock');
  html += kpiCard('orange', oc.filter(function(o) { return (o.Estado || '') === 'Abierta'; }).length.toString(), 'OC abiertas', oc.length + ' ordenes de compra total');

  document.getElementById('kpi-main').innerHTML = html;
}

function kpiCard(cls, val, lbl, sub) {
  return '<div class="kpi ' + cls + '">' +
    '<div class="kpi-val">' + val + '</div>' +
    '<div class="kpi-lbl">' + lbl + '</div>' +
    (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') +
  '</div>';
}

// ── 2. Estado de Entregas ──
function buildEntregas(ped) {
  var ordMap = {};
  ped.forEach(function(p) {
    var key = (p.Nombre_Empresa || '') + '||' + (p.Consecutivo || '');
    if (!ordMap[key]) {
      ordMap[key] = { estado: 'Recibido', est2: (p.Estado_2 || 'Abierto').trim() };
    }
    var est = (p.Estado_Entrega || 'Recibido').trim();
    if (est === 'Entregado' || ordMap[key].estado === 'Entregado') ordMap[key].estado = 'Entregado';
    else if (est === 'Parcial' || (Number(p.Cant_Entregada) || 0) > 0) ordMap[key].estado = 'Parcial';
  });

  var recibidos = 0, parciales = 0, entregados = 0, anulados = 0, cerrados = 0;
  Object.values(ordMap).forEach(function(o) {
    if (o.est2 === 'Anulado') { anulados++; return; }
    if (o.est2 === 'Cerrado') { cerrados++; return; }
    if (o.estado === 'Entregado') entregados++;
    else if (o.estado === 'Parcial') parciales++;
    else recibidos++;
  });

  var total = recibidos + parciales + entregados + anulados + cerrados;

  var segData = [
    { label: 'Recibidos', val: recibidos, color: '#e67e22' },
    { label: 'Parciales', val: parciales, color: '#2980b9' },
    { label: 'Entregados', val: entregados, color: '#27ae60' },
    { label: 'Cerrados', val: cerrados, color: '#1565c0' },
    { label: 'Anulados', val: anulados, color: '#e74c3c' },
  ];

  document.getElementById('ent-sub').textContent = total + ' ordenes total';
  document.getElementById('chart-entregas').innerHTML = renderSegBar(segData, total);
}

function renderSegBar(data, total) {
  if (!total) return '<div style="color:#a0aec0;text-align:center;padding:20px">Sin datos</div>';

  var barHtml = '<div class="seg-bar">';
  data.forEach(function(d) {
    var pct = (d.val / total) * 100;
    if (pct > 0) {
      barHtml += '<div class="seg" style="width:' + pct + '%;background:' + d.color + '">' + (pct >= 8 ? d.val : '') + '</div>';
    }
  });
  barHtml += '</div>';

  barHtml += '<div class="seg-legend">';
  data.forEach(function(d) {
    if (d.val > 0) {
      barHtml += '<div class="seg-legend-item"><div class="seg-legend-dot" style="background:' + d.color + '"></div>' +
        d.label + ': <span class="seg-legend-val">' + d.val + '</span> (' + Math.round((d.val / total) * 100) + '%)</div>';
    }
  });
  barHtml += '</div>';

  return barHtml;
}

// ── 3. Pedidos por Empresa ──
function buildEmpresas(ped) {
  var empMap = {};
  var ordSet = {};
  ped.forEach(function(p) {
    var sigla = dGetSigla(p.Nombre_Empresa);
    if (!empMap[sigla]) empMap[sigla] = { ordenes: 0, valor: 0, lineas: 0, _keys: {} };
    empMap[sigla].lineas++;
    empMap[sigla].valor += Number(p.Valor_Total) || 0;
    var key = (p.Nombre_Empresa || '') + '||' + (p.Consecutivo || '');
    if (!empMap[sigla]._keys[key]) { empMap[sigla]._keys[key] = true; empMap[sigla].ordenes++; }
  });

  var empArr = Object.keys(empMap).map(function(s) { return { sigla: s, ordenes: empMap[s].ordenes, valor: empMap[s].valor }; });
  empArr.sort(function(a, b) { return b.valor - a.valor; });

  var maxVal = empArr.length ? empArr[0].valor : 1;

  document.getElementById('emp-sub').textContent = empArr.length + ' empresas';

  var html = '<div class="hbar-chart">';
  empArr.forEach(function(e) {
    var pct = maxVal > 0 ? Math.max(3, (e.valor / maxVal) * 100) : 3;
    var color = EMP_COLORS[e.sigla] || '#718096';
    html += '<div class="hbar-row">' +
      '<div class="hbar-label">' + e.sigla + '</div>' +
      '<div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%;background:' + color + '">' + e.ordenes + ' ord</div></div>' +
      '<div class="hbar-value">' + fmtMoney(e.valor) + '</div>' +
    '</div>';
  });
  html += '</div>';

  document.getElementById('chart-empresas').innerHTML = html;
}

// ── 4. Top Productos Pendientes ──
function buildTopProductos(ped) {
  var map = {};
  ped.forEach(function(p) {
    var est2 = (p.Estado_2 || 'Abierto').trim();
    if (est2 === 'Anulado' || est2 === 'Cerrado') return;
    var pend = Number(p.Cant_Pendiente) || 0;
    if (pend <= 0) return;
    var prod = (p.Producto || '').toUpperCase().trim();
    if (!prod) return;
    if (!map[prod]) map[prod] = { producto: prod, pendiente: 0, pedido: 0 };
    map[prod].pendiente += pend;
    map[prod].pedido += Number(p.Cantidad) || 0;
  });

  var arr = Object.values(map);
  arr.sort(function(a, b) { return b.pendiente - a.pendiente; });
  arr = arr.slice(0, 10);

  var tbody = document.getElementById('tb-productos');
  if (!arr.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#a0aec0;padding:20px">Sin pendientes</td></tr>';
    return;
  }

  tbody.innerHTML = arr.map(function(r) {
    var avance = r.pedido > 0 ? Math.round(((r.pedido - r.pendiente) / r.pedido) * 100) : 0;
    return '<tr>' +
      '<td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + r.producto + '</td>' +
      '<td class="money" style="color:#e74c3c;font-weight:700">' + r.pendiente.toLocaleString('es-CO') + '</td>' +
      '<td class="money">' + r.pedido.toLocaleString('es-CO') + '</td>' +
      '<td style="text-align:center"><div class="prog" style="margin:0 auto"><div class="prog-bar"><div class="prog-fill" style="width:' + avance + '%"></div></div><div class="prog-pct">' + avance + '%</div></div></td>' +
    '</tr>';
  }).join('');
}

// ── 5. Top Clientes por Valor ──
function buildTopClientes(ped) {
  var map = {};
  ped.forEach(function(p) {
    var cli = (p.Cliente || '').trim();
    if (!cli) return;
    if (!map[cli]) map[cli] = { cliente: cli, valor: 0, ordenes: 0, empresas: {}, _keys: {} };
    map[cli].valor += Number(p.Valor_Total) || 0;
    var sigla = dGetSigla(p.Nombre_Empresa);
    map[cli].empresas[sigla] = true;
    var key = (p.Nombre_Empresa || '') + '||' + (p.Consecutivo || '');
    if (!map[cli]._keys[key]) { map[cli]._keys[key] = true; map[cli].ordenes++; }
  });

  var arr = Object.values(map);
  arr.sort(function(a, b) { return b.valor - a.valor; });
  arr = arr.slice(0, 10);

  var tbody = document.getElementById('tb-clientes');
  if (!arr.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#a0aec0;padding:20px">Sin datos</td></tr>';
    return;
  }

  tbody.innerHTML = arr.map(function(r) {
    var empTags = Object.keys(r.empresas).sort().map(function(s) {
      var color = EMP_COLORS[s] || '#718096';
      return '<span class="sigla-badge" style="background:' + color + '20;color:' + color + '">' + s + '</span>';
    }).join(' ');
    return '<tr>' +
      '<td style="font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + r.cliente + '</td>' +
      '<td class="money" style="font-weight:700;color:#27ae60">' + fmtMoney(r.valor) + '</td>' +
      '<td class="money">' + r.ordenes + '</td>' +
      '<td>' + empTags + '</td>' +
    '</tr>';
  }).join('');
}

// ── 6. Devoluciones ──
function buildDevoluciones(dev) {
  var pendientes = 0, tramitadas = 0, valorPend = 0, valorTram = 0;
  var motivoMap = {};

  dev.forEach(function(d) {
    var val = Number(d.Valor_Total) || 0;
    if ((d.Estado || '') === 'Tramitada') { tramitadas++; valorTram += val; }
    else { pendientes++; valorPend += val; }
    var motivo = (d.Motivo || 'Sin motivo').trim();
    if (!motivoMap[motivo]) motivoMap[motivo] = 0;
    motivoMap[motivo]++;
  });

  var total = pendientes + tramitadas;
  document.getElementById('dev-sub').textContent = total + ' total';

  if (!total) {
    document.getElementById('chart-devoluciones').innerHTML = '<div style="color:#a0aec0;text-align:center;padding:20px">Sin devoluciones registradas</div>';
    return;
  }

  var segData = [
    { label: 'Pendientes', val: pendientes, color: '#e67e22' },
    { label: 'Tramitadas', val: tramitadas, color: '#27ae60' },
  ];

  var html = renderSegBar(segData, total);

  html += '<div style="display:flex;gap:20px;margin-top:14px;flex-wrap:wrap">';
  html += '<div style="flex:1;min-width:140px"><div style="font-size:0.76rem;color:#718096;text-transform:uppercase;font-weight:600;margin-bottom:4px">Valor pendientes</div><div style="font-size:1.1rem;font-weight:700;color:#e67e22">' + fmtMoney(valorPend) + '</div></div>';
  html += '<div style="flex:1;min-width:140px"><div style="font-size:0.76rem;color:#718096;text-transform:uppercase;font-weight:600;margin-bottom:4px">Valor tramitadas</div><div style="font-size:1.1rem;font-weight:700;color:#27ae60">' + fmtMoney(valorTram) + '</div></div>';
  html += '</div>';

  var motivoArr = Object.keys(motivoMap).map(function(m) { return { motivo: m, count: motivoMap[m] }; });
  motivoArr.sort(function(a, b) { return b.count - a.count; });
  if (motivoArr.length > 5) motivoArr = motivoArr.slice(0, 5);

  if (motivoArr.length) {
    html += '<div style="margin-top:16px"><div style="font-size:0.76rem;color:#718096;text-transform:uppercase;font-weight:600;margin-bottom:8px">Top motivos</div>';
    var maxMotivo = motivoArr[0].count;
    motivoArr.forEach(function(m) {
      var pct = Math.max(5, (m.count / maxMotivo) * 100);
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">' +
        '<div style="width:120px;font-size:0.78rem;color:#4a5568;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + m.motivo + '">' + m.motivo + '</div>' +
        '<div style="flex:1;height:18px;background:#f0f4f8;border-radius:4px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:#e74c3c;border-radius:4px"></div></div>' +
        '<div style="width:30px;font-size:0.78rem;font-weight:700;color:#2d3748">' + m.count + '</div>' +
      '</div>';
    });
    html += '</div>';
  }

  document.getElementById('chart-devoluciones').innerHTML = html;
}

// ── 7. Top Comerciales ──
function buildTopComerciales(ped) {
  var map = {};
  ped.forEach(function(p) {
    var com = (p.Comercial || '').trim();
    if (!com) return;
    if (!map[com]) map[com] = { comercial: com, ordenes: 0, valor: 0, entregada: 0, pedida: 0, _keys: {} };
    map[com].valor += Number(p.Valor_Total) || 0;
    map[com].entregada += Number(p.Cant_Entregada) || 0;
    map[com].pedida += Number(p.Cantidad) || 0;
    var key = (p.Nombre_Empresa || '') + '||' + (p.Consecutivo || '');
    if (!map[com]._keys[key]) { map[com]._keys[key] = true; map[com].ordenes++; }
  });

  var arr = Object.values(map);
  arr.sort(function(a, b) { return b.valor - a.valor; });
  arr = arr.slice(0, 10);

  var tbody = document.getElementById('tb-comerciales');
  if (!arr.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#a0aec0;padding:20px">Sin datos</td></tr>';
    return;
  }

  tbody.innerHTML = arr.map(function(r) {
    var pct = r.pedida > 0 ? Math.round((r.entregada / r.pedida) * 100) : 0;
    var pctColor = pct >= 75 ? '#27ae60' : pct >= 40 ? '#e67e22' : '#e74c3c';
    return '<tr>' +
      '<td style="font-weight:600">' + r.comercial + '</td>' +
      '<td class="money">' + r.ordenes + '</td>' +
      '<td class="money" style="font-weight:700;color:#27ae60">' + fmtMoney(r.valor) + '</td>' +
      '<td style="text-align:center"><span style="background:' + pctColor + '18;color:' + pctColor + ';padding:2px 10px;border-radius:12px;font-size:0.78rem;font-weight:700">' + pct + '%</span></td>' +
    '</tr>';
  }).join('');
}

// ── 8. Inventario ──
function buildInventario(inv, ped) {
  var empMap = {};
  inv.forEach(function(i) {
    var sigla = dGetSigla(i.Empresa);
    if (!empMap[sigla]) empMap[sigla] = { stock: 0, productos: 0 };
    empMap[sigla].stock += Number(i.Cantidad) || 0;
    empMap[sigla].productos++;
  });

  var pendByEmp = {};
  ped.forEach(function(p) {
    if ((p.Estado_2 || 'Abierto').trim() !== 'Abierto') return;
    var sigla = dGetSigla(p.Nombre_Empresa);
    if (!pendByEmp[sigla]) pendByEmp[sigla] = 0;
    pendByEmp[sigla] += Number(p.Cant_Pendiente) || 0;
  });

  var empArr = Object.keys(empMap);
  empArr.sort();

  var el = document.getElementById('chart-inventario');

  if (!empArr.length) {
    el.innerHTML = '<div style="color:#a0aec0;text-align:center;padding:20px">Sin registros de inventario</div>';
    return;
  }

  var totalStock = inv.reduce(function(s, i) { return s + (Number(i.Cantidad) || 0); }, 0);
  var totalPend = Object.values(pendByEmp).reduce(function(s, v) { return s + v; }, 0);

  var html = '<div style="display:flex;gap:20px;margin-bottom:16px;flex-wrap:wrap">';
  html += '<div style="flex:1;min-width:120px"><div style="font-size:0.76rem;color:#718096;text-transform:uppercase;font-weight:600">Stock total</div><div style="font-size:1.4rem;font-weight:800;color:#2980b9">' + totalStock.toLocaleString('es-CO') + '</div></div>';
  html += '<div style="flex:1;min-width:120px"><div style="font-size:0.76rem;color:#718096;text-transform:uppercase;font-weight:600">Comprometido</div><div style="font-size:1.4rem;font-weight:800;color:#e67e22">' + totalPend.toLocaleString('es-CO') + '</div></div>';
  html += '<div style="flex:1;min-width:120px"><div style="font-size:0.76rem;color:#718096;text-transform:uppercase;font-weight:600">Disponible</div><div style="font-size:1.4rem;font-weight:800;color:' + ((totalStock - totalPend) >= 0 ? '#27ae60' : '#e74c3c') + '">' + (totalStock - totalPend).toLocaleString('es-CO') + '</div></div>';
  html += '</div>';

  html += '<div class="hbar-chart">';
  empArr.forEach(function(sigla) {
    var stock = empMap[sigla].stock;
    var pend = pendByEmp[sigla] || 0;
    var maxBar = Math.max(stock, pend, 1);
    var color = EMP_COLORS[sigla] || '#718096';
    html += '<div class="hbar-row">' +
      '<div class="hbar-label">' + sigla + '</div>' +
      '<div class="hbar-track" style="position:relative">' +
        '<div class="hbar-fill" style="width:' + Math.max(3, (stock / maxBar) * 100) + '%;background:' + color + ';opacity:0.7">' + stock.toLocaleString('es-CO') + '</div>' +
      '</div>' +
      '<div class="hbar-value" style="color:' + ((stock - pend) >= 0 ? '#27ae60' : '#e74c3c') + '">' + (stock - pend).toLocaleString('es-CO') + '</div>' +
    '</div>';
  });
  html += '</div>';
  html += '<div style="font-size:0.72rem;color:#a0aec0;margin-top:8px;text-align:right">Barra = stock | Valor = disponible (stock - comprometido)</div>';

  el.innerHTML = html;
}

// ── 9. Resumen Modulos ──
function buildResumenModulos(ped, dev, ing, inv, oc, mue, ree) {
  var ordSet = {};
  ped.forEach(function(p) {
    ordSet[(p.Nombre_Empresa || '') + '||' + (p.Consecutivo || '')] = true;
  });

  var modules = [
    { icon: '📋', name: 'Pedidos', count: Object.keys(ordSet).length, detail: ped.length + ' lineas' },
    { icon: '🔄', name: 'Devoluciones', count: dev.length, detail: dev.filter(function(d) { return d.Estado === 'Pendiente'; }).length + ' pendientes' },
    { icon: '📥', name: 'Ingresos', count: ing.length, detail: ing.reduce(function(s, i) { return s + (Number(i.Cantidad) || 0); }, 0).toLocaleString('es-CO') + ' uds' },
    { icon: '📦', name: 'Inventario', count: inv.length, detail: inv.reduce(function(s, i) { return s + (Number(i.Cantidad) || 0); }, 0).toLocaleString('es-CO') + ' uds' },
    { icon: '🛒', name: 'Ordenes Compra', count: oc.length, detail: oc.filter(function(o) { return o.Estado === 'Abierta'; }).length + ' abiertas' },
    { icon: '🧪', name: 'Muestras', count: mue.length, detail: mue.filter(function(m) { return (m.Estado || '') === 'Pendiente'; }).length + ' pendientes' },
    { icon: '🏭', name: 'Salidas prod.', count: ree.length, detail: ree.reduce(function(s, r) { return s + (Number(r.Cantidad) || 0); }, 0).toLocaleString('es-CO') + ' uds' },
  ];

  var html = '';
  modules.forEach(function(m) {
    html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #edf2f7">' +
      '<div style="font-size:1.3rem">' + m.icon + '</div>' +
      '<div style="flex:1"><div style="font-weight:700;font-size:0.88rem;color:#2d3748">' + m.name + '</div><div style="font-size:0.76rem;color:#718096">' + m.detail + '</div></div>' +
      '<div style="font-size:1.2rem;font-weight:800;color:#1a5276">' + m.count + '</div>' +
    '</div>';
  });

  document.getElementById('resumen-modulos').innerHTML = html;
}

// ── Init ──
loadDashboard();
