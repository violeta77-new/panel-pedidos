// ── CONFIGURACIÓN ──
// Script vinculado al Google Sheet "Copia de Pedidos_Consolidados"
// Usa getActiveSpreadsheet() para acceder al sheet al que está vinculado

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'getPedidos';
  if (action === 'getPedidos') return respond(getPedidos());
  if (action === 'getConsecutivos') return respond(getConsecutivos());
  if (action === 'getIngresos') return respond(getIngresos());
  if (action === 'getDevoluciones') return respond(getDevoluciones());
  if (action === 'getProductos') return respond(getProductos());
  if (action === 'getMaestroProductos') return respond(getMaestroProductos());
  if (action === 'getClientesUnicos') return respond(getClientesUnicos());
  if (action === 'getInventario') return respond(getInventario());
  if (action === 'getOrdenesCompra') return respond(getOrdenesCompra());
  if (action === 'repararEncabezados') return respond(repararEncabezados());
  return respond({ error: 'Accion no reconocida' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || '';
    if (action === 'registrarEntrega') return respond(registrarEntrega(body));
    if (action === 'editarPedido')     return respond(editarPedido(body));
    if (action === 'agregarPedido')    return respond(agregarPedido(body));
    if (action === 'checkDuplicado')   return respond(checkDuplicado(body));
    if (action === 'eliminarPedido')   return respond(eliminarPedido(body));
    if (action === 'agregarIngreso')    return respond(agregarIngreso(body));
    if (action === 'editarIngreso')     return respond(editarIngreso(body));
    if (action === 'eliminarIngreso')   return respond(eliminarIngreso(body));
    if (action === 'agregarDevolucion')  return respond(agregarDevolucion(body));
    if (action === 'editarDevolucion')   return respond(editarDevolucion(body));
    if (action === 'eliminarDevolucion') return respond(eliminarDevolucion(body));
    if (action === 'agregarInventario')    return respond(agregarInventario(body));
    if (action === 'editarInventario')     return respond(editarInventario(body));
    if (action === 'eliminarInventario')   return respond(eliminarInventario(body));
    if (action === 'agregarOrdenCompra')   return respond(agregarOrdenCompra(body));
    if (action === 'editarOrdenCompra')    return respond(editarOrdenCompra(body));
    if (action === 'eliminarOrdenCompra')  return respond(eliminarOrdenCompra(body));
    if (action === 'repararEncabezados')   return respond(repararEncabezados());
    return respond({ error: 'Accion POST no reconocida' });
  } catch (err) {
    return respond({ error: err.message });
  }
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════════════
// GET: Leer todos los pedidos
// ══════════════════════════════════════════════════════════════
function getPedidos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Pedidos');

  var EXPECTED = ['Fecha_Procesamiento','Nombre_Empresa','Consecutivo','Fecha_Pedido',
    'Cliente','NIT','Telefono','Direccion_Envio','Municipio','Departamento',
    'Comercial','Plazo_Pago','Precio_Facturacion','Producto','Presentacion',
    'Cantidad','Valor_Unitario','Valor_Total','Total_Orden','Archivo_Fuente',
    'Estado','ID_Cliente','ID_Comercial','ID_Producto',
    'Cant_Entregada','Cant_Pendiente','Estado_Entrega','Fecha_Ult_Entrega','Remisiones','Observaciones','Estado_2','Bonificado'];

  var data = ws.getDataRange().getValues();
  var firstCell = String(data[0][0]).trim();
  var hasHeaders = (firstCell === 'Fecha_Procesamiento');
  var startRow = hasHeaders ? 1 : 0;

  if (!hasHeaders) {
    ws.insertRowBefore(1);
    for (var h = 0; h < EXPECTED.length; h++) {
      ws.getRange(1, h + 1).setValue(EXPECTED[h]);
    }
    SpreadsheetApp.flush();
  }

  var rows = [];
  for (var i = startRow; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < EXPECTED.length; j++) {
      var val = (j < data[i].length) ? data[i][j] : '';
      if (val instanceof Date) {
        val = Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      }
      obj[EXPECTED[j]] = val;
    }
    obj.__row = hasHeaders ? (i + 1) : (i + 2);
    rows.push(obj);
  }
  return { ok: true, pedidos: rows, headers: EXPECTED };
}

// ══════════════════════════════════════════════════════════════
// GET: Leer consecutivos
// ══════════════════════════════════════════════════════════════
function getConsecutivos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Consecutivos');
  if (!ws) return { ok: true, consecutivos: [] };
  var data = ws.getDataRange().getValues();
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      }
      obj[headers[j]] = val;
    }
    rows.push(obj);
  }
  return { ok: true, consecutivos: rows };
}

// ══════════════════════════════════════════════════════════════
// POST: Registrar entregas
// ══════════════════════════════════════════════════════════════
function registrarEntrega(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Pedidos');
  var headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
  var colIdx = {};
  for (var i = 0; i < headers.length; i++) colIdx[headers[i]] = i + 1;

  var needed = ['Cant_Entregada','Cant_Pendiente','Estado_Entrega','Fecha_Ult_Entrega','Remisiones','Estado_2'];
  for (var n = 0; n < needed.length; n++) {
    if (!colIdx[needed[n]]) {
      ws.getRange(1, ws.getLastColumn() + 1).setValue(needed[n]);
      colIdx[needed[n]] = ws.getLastColumn();
    }
  }

  var entregas = body.entregas || [];
  var observaciones = body.observaciones;
  var updated = 0;
  for (var e = 0; e < entregas.length; e++) {
    var ent = entregas[e];
    var row = ent.row;
    if (!row || row < 2) continue;
    var cantPedida = Number(ws.getRange(row, colIdx['Cantidad']).getValue()) || 0;
    var prevEntregada = Number(ws.getRange(row, colIdx['Cant_Entregada']).getValue()) || 0;
    var nuevaEntregada = prevEntregada + (Number(ent.cantidad) || 0);
    var pendiente = Math.max(0, cantPedida - nuevaEntregada);
    var estado = pendiente <= 0 ? 'Entregado' : 'Parcial';
    var prevRem = ws.getRange(row, colIdx['Remisiones']).getValue() || '';
    var newRem = ent.remision
      ? (prevRem ? prevRem + ', ' + ent.remision : ent.remision)
      : prevRem;
    ws.getRange(row, colIdx['Cant_Entregada']).setValue(nuevaEntregada);
    ws.getRange(row, colIdx['Cant_Pendiente']).setValue(pendiente);
    ws.getRange(row, colIdx['Estado_Entrega']).setValue(estado);
    ws.getRange(row, colIdx['Fecha_Ult_Entrega']).setValue(ent.fecha);
    ws.getRange(row, colIdx['Remisiones']).setValue(newRem);
    if (observaciones !== undefined && colIdx['Observaciones']) {
      ws.getRange(row, colIdx['Observaciones']).setValue(observaciones);
    }
    if (pendiente <= 0) {
      ws.getRange(row, colIdx['Estado_2']).setValue('Cerrado');
    }
    updated++;
  }

  // Update sibling lines in the same order: Recibido → Parcial
  if (entregas.length > 0 && colIdx['Consecutivo'] && colIdx['Nombre_Empresa']) {
    var orderKeys = {};
    for (var e2 = 0; e2 < entregas.length; e2++) {
      var r = entregas[e2].row;
      if (!r || r < 2) continue;
      var emp = ws.getRange(r, colIdx['Nombre_Empresa']).getValue();
      var con = ws.getRange(r, colIdx['Consecutivo']).getValue();
      orderKeys[emp + '||' + con] = true;
    }
    var allData = ws.getRange(2, 1, ws.getLastRow() - 1, ws.getLastColumn()).getValues();
    for (var d = 0; d < allData.length; d++) {
      var rEmp = allData[d][colIdx['Nombre_Empresa'] - 1];
      var rCon = allData[d][colIdx['Consecutivo'] - 1];
      var key = rEmp + '||' + rCon;
      if (!orderKeys[key]) continue;
      var curEstado = (allData[d][colIdx['Estado_Entrega'] - 1] || '').toString().trim();
      if (curEstado === '' || curEstado.toLowerCase() === 'recibido') {
        ws.getRange(d + 2, colIdx['Estado_Entrega']).setValue('Parcial');
      }
    }
  }

  return { ok: true, updated: updated };
}

// ══════════════════════════════════════════════════════════════
// POST: Editar pedido (header + lineas)
// ══════════════════════════════════════════════════════════════
function editarPedido(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Pedidos');
  var headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
  var colIdx = {};
  for (var i = 0; i < headers.length; i++) colIdx[headers[i]] = i + 1;

  var needed = ['Observaciones','Estado_2','Bonificado'];
  for (var n = 0; n < needed.length; n++) {
    if (!colIdx[needed[n]]) {
      ws.getRange(1, ws.getLastColumn() + 1).setValue(needed[n]);
      colIdx[needed[n]] = ws.getLastColumn();
    }
  }

  var lineas = body.lineas || [];
  var hdr = body.header || {};
  var updated = 0, added = 0;

  for (var l = 0; l < lineas.length; l++) {
    var lin = lineas[l];
    var row = lin.__row;
    if (row && row >= 2) {
      var hdrFields = ['Cliente','NIT','Fecha_Pedido','Comercial','Municipio',
                       'Departamento','Telefono','Plazo_Pago','Precio_Facturacion','Total_Orden','Estado_2'];
      for (var h = 0; h < hdrFields.length; h++) {
        var f = hdrFields[h];
        if (hdr[f] !== undefined && colIdx[f]) ws.getRange(row, colIdx[f]).setValue(hdr[f]);
      }
      var lineFields = ['Producto','Presentacion','Cantidad','Valor_Unitario','Valor_Total','Cant_Pendiente','Remisiones','Bonificado'];
      for (var lf = 0; lf < lineFields.length; lf++) {
        var ff = lineFields[lf];
        if (lin[ff] !== undefined && colIdx[ff]) ws.getRange(row, colIdx[ff]).setValue(lin[ff]);
      }
      updated++;
    } else {
      var newRow = [];
      for (var c = 0; c < headers.length; c++) {
        var col = headers[c];
        newRow.push(lin[col] !== undefined ? lin[col] : (hdr[col] !== undefined ? hdr[col] : ''));
      }
      ws.appendRow(newRow);
      added++;
    }
  }

  var toDelete = (body.deleteRows || []).sort(function(a,b){return b-a;});
  for (var d = 0; d < toDelete.length; d++) {
    if (toDelete[d] >= 2) ws.deleteRow(toDelete[d]);
  }
  return { ok: true, updated: updated, added: added, deleted: toDelete.length };
}

// ══════════════════════════════════════════════════════════════
// POST: Verificar si un pedido ya existe (duplicado)
// ══════════════════════════════════════════════════════════════
function checkDuplicado(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Pedidos');
  var data = ws.getDataRange().getValues();
  var consecutivo = String(body.consecutivo || '').trim();
  var cliente = String(body.cliente || '').trim();
  var fecha = String(body.fecha_pedido || '').trim();
  if (!consecutivo || !cliente) return { ok: true, duplicado: false };
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2] || '').trim() == consecutivo &&
        String(data[i][4] || '').trim() == cliente &&
        String(data[i][3] || '').trim() == fecha) {
      return { ok: true, duplicado: true };
    }
  }
  return { ok: true, duplicado: false };
}

// ══════════════════════════════════════════════════════════════
// POST: Eliminar pedido completo (todas sus líneas)
// ══════════════════════════════════════════════════════════════
function eliminarPedido(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Pedidos');
  var data = ws.getDataRange().getValues();
  var headers = data[0];

  var colEmp = -1, colCon = -1;
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] === 'Nombre_Empresa') colEmp = i;
    if (headers[i] === 'Consecutivo') colCon = i;
  }

  if (colEmp < 0 || colCon < 0) {
    for (var i = 0; i < headers.length; i++) {
      if (i === 1) colEmp = i;
      if (i === 2) colCon = i;
    }
  }

  var empresa = String(body.empresa || '').trim();
  var consecutivo = String(body.consecutivo || '').trim();
  if (!empresa && !consecutivo) return { ok: false, error: 'Faltan empresa y consecutivo' };

  var rowsToDelete = [];
  for (var r = 1; r < data.length; r++) {
    var rowEmp = String(data[r][colEmp] || '').trim();
    var rowCon = String(data[r][colCon] || '').trim();
    if (rowEmp === empresa && rowCon === consecutivo) {
      rowsToDelete.push(r + 1);
    }
  }

  if (!rowsToDelete.length) return { ok: true, deleted: 0, message: 'No se encontraron lineas para ese pedido' };

  rowsToDelete.sort(function(a, b) { return b - a; });
  for (var d = 0; d < rowsToDelete.length; d++) {
    ws.deleteRow(rowsToDelete[d]);
  }

  _rebuildConsecutivos(ss);
  return { ok: true, deleted: rowsToDelete.length };
}

// ══════════════════════════════════════════════════════════════
// POST: Agregar pedido nuevo (usado por procesar_pedidos.py)
// ══════════════════════════════════════════════════════════════
function agregarPedido(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Pedidos');
  var now = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');

  var idCl = _getOrCreateCliente(ss, body);
  var idCm = _getOrCreateComercial(ss, body.comercial);

  var productos = body.productos || [{}];
  var added = 0;

  for (var i = 0; i < productos.length; i++) {
    var prod = productos[i];
    var idPr = _getOrCreateProducto(ss, prod.producto, prod.presentacion, body.nombre_empresa);
    var consec = body.consecutivo;
    if (consec !== null && consec !== '' && !isNaN(consec)) consec = Number(consec);

    ws.appendRow([
      now,
      body.nombre_empresa || '',
      consec || '',
      body.fecha_pedido || '',
      body.cliente || '',
      body.nit || '',
      body.telefono || '',
      body.direccion_envio || '',
      body.municipio || '',
      body.departamento || '',
      body.comercial || '',
      body.plazo_pago || '',
      body.precio_facturacion || '',
      prod.producto || '',
      prod.presentacion || '',
      prod.cantidad || '',
      prod.valor_unitario || '',
      prod.valor_total || '',
      body.total_orden || '',
      body.archivo_fuente || '',
      'recibido',
      idCl || '',
      idCm || '',
      idPr || '',
      '', '', '', '', '',
      body.observaciones || '',
      'Abierto',
      prod.bonificado || ''
    ]);
    added++;
  }

  _rebuildConsecutivos(ss);
  return { ok: true, added: added };
}

// ══════════════════════════════════════════════════════════════
// Helpers: Tablas dimensionales
// ══════════════════════════════════════════════════════════════

function _nitKey(nit) {
  if (!nit) return null;
  return String(nit).trim().replace(/\./g, '').replace(/ /g, '').split('-')[0];
}

function _getOrCreateCliente(ss, data) {
  var ws = ss.getSheetByName('Clientes');
  if (!ws) return null;
  var all = ws.getDataRange().getValues();
  var name = data.cliente;
  var nit = _nitKey(data.nit);

  if (nit) {
    for (var i = 1; i < all.length; i++) {
      if (_nitKey(all[i][2]) == nit) {
        if (name && !all[i][1]) ws.getRange(i+1, 2).setValue(name);
        if (data.telefono && !all[i][3]) ws.getRange(i+1, 4).setValue(data.telefono);
        return all[i][0];
      }
    }
  }
  if (name) {
    for (var i = 1; i < all.length; i++) {
      if (all[i][1] == name) {
        if (nit && !all[i][2]) ws.getRange(i+1, 3).setValue(data.nit);
        return all[i][0];
      }
    }
  }
  if (!name) return null;
  var newId = 'CL-' + ('000' + all.length).slice(-3);
  ws.appendRow([newId, name, data.nit || '', data.telefono || '',
                data.direccion_envio || '', data.municipio || '', data.departamento || '']);
  return newId;
}

function _getOrCreateComercial(ss, comercial) {
  var ws = ss.getSheetByName('Comerciales');
  if (!ws || !comercial) return null;
  var all = ws.getDataRange().getValues();
  for (var i = 1; i < all.length; i++) {
    if (all[i][1] == comercial) return all[i][0];
  }
  var newId = 'CM-' + ('000' + all.length).slice(-3);
  ws.appendRow([newId, comercial]);
  return newId;
}

function _getOrCreateProducto(ss, producto, presentacion, empresa) {
  var ws = ss.getSheetByName('Productos');
  if (!ws || !producto) return null;
  var all = ws.getDataRange().getValues();
  var hasEmpresa = all[0][1] == 'Nombre_Empresa';

  if (hasEmpresa) {
    for (var i = 1; i < all.length; i++) {
      if (all[i][1] == empresa && all[i][2] == producto && all[i][3] == presentacion)
        return all[i][0];
    }
    var newId = 'PR-' + ('000' + all.length).slice(-3);
    ws.appendRow([newId, empresa, producto, presentacion]);
  } else {
    for (var i = 1; i < all.length; i++) {
      if (all[i][1] == producto && all[i][2] == presentacion)
        return all[i][0];
    }
    var newId = 'PR-' + ('000' + all.length).slice(-3);
    ws.appendRow([newId, producto, presentacion]);
  }
  return newId;
}

function repararEncabezados() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Pedidos');
  var firstCell = ws.getRange(1, 1).getValue();
  var expectedHeaders = ['Fecha_Procesamiento','Nombre_Empresa','Consecutivo','Fecha_Pedido',
    'Cliente','NIT','Telefono','Direccion_Envio','Municipio','Departamento',
    'Comercial','Plazo_Pago','Precio_Facturacion','Producto','Presentacion',
    'Cantidad','Valor_Unitario','Valor_Total','Total_Orden','Archivo_Fuente',
    'Estado','ID_Cliente','ID_Comercial','ID_Producto',
    'Cant_Entregada','Cant_Pendiente','Estado_Entrega','Fecha_Ult_Entrega','Remisiones','Observaciones','Estado_2','Bonificado'];

  if (firstCell === 'Fecha_Procesamiento') {
    return { ok: true, message: 'Encabezados ya existen, no se necesita reparacion' };
  }

  ws.insertRowBefore(1);
  for (var i = 0; i < expectedHeaders.length; i++) {
    ws.getRange(1, i + 1).setValue(expectedHeaders[i]);
  }
  return { ok: true, message: 'Encabezados restaurados', columnas: expectedHeaders.length };
}

function _rebuildConsecutivos(ss) {
  var wsPed = ss.getSheetByName('Pedidos');
  var pedData = wsPed.getDataRange().getValues();

  var seen = {};
  var ordered = [];
  for (var i = 1; i < pedData.length; i++) {
    var row = pedData[i];
    var key = String(row[1]) + '|' + String(row[4]) + '|' + String(row[3]) + '|' + String(row[2]);
    if (!seen[key]) {
      seen[key] = true;
      ordered.push(row);
    }
  }
  ordered.sort(function(a, b) {
    var c1 = String(a[1]||'').localeCompare(String(b[1]||''));
    if (c1) return c1;
    var c2 = String(a[4]||'').localeCompare(String(b[4]||''));
    if (c2) return c2;
    return String(a[3]||'').localeCompare(String(b[3]||''));
  });

  var wsCon = ss.getSheetByName('Consecutivos');
  if (!wsCon) {
    wsCon = ss.insertSheet('Consecutivos');
    wsCon.appendRow(['N°','Nombre_Empresa','Cliente','Fecha_Pedido',
                     'Consecutivo','Comercial','Total_Orden','Archivo_Fuente']);
  } else if (wsCon.getLastRow() > 1) {
    wsCon.deleteRows(2, wsCon.getLastRow() - 1);
  }

  for (var n = 0; n < ordered.length; n++) {
    var r = ordered[n];
    wsCon.appendRow([n+1, r[1], r[4], r[3], r[2], r[10], r[18], r[19]]);
  }
}

// ══════════════════════════════════════════════════════════════
// MÓDULO: INGRESOS DE PRODUCTO
// ══════════════════════════════════════════════════════════════

var INGRESOS_HEADERS = ['Fecha','Origen','Empresa_Origen','Empresa_Destino','Producto','Presentacion','Cantidad','Responsable','Remision_Origen','Remision_Destino','Observaciones','Fecha_Registro'];

// GET: Leer catálogo de productos
function getProductos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Productos');
  if (!ws) return { ok: true, productos: [] };
  var data = ws.getDataRange().getValues();
  var hasEmpresa = data[0][1] == 'Nombre_Empresa';
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    if (hasEmpresa) {
      rows.push({ id: data[i][0], empresa: data[i][1], producto: data[i][2], presentacion: data[i][3] });
    } else {
      rows.push({ id: data[i][0], empresa: '', producto: data[i][1], presentacion: data[i][2] });
    }
  }
  return { ok: true, productos: rows };
}

// GET: Leer catálogo desde hoja maestro_productos (búsqueda dinámica de columnas)
function getMaestroProductos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('maestro_productos');
  if (!ws) return { ok: true, productos: [], source: 'not_found' };

  var data = ws.getDataRange().getValues();
  if (data.length < 2) return { ok: true, productos: [], source: 'maestro_productos' };

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var headersUpper = headers.map(function(h) { return h.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

  var colProducto = -1, colPresentacion = -1, colEmpresa = -1;
  for (var i = 0; i < headersUpper.length; i++) {
    var h = headersUpper[i];
    if (colProducto < 0 && (h === 'PRODUCTO' || h === 'NOMBRE' || h === 'NOMBREPRODUCTO' || h === 'NOMBREDELPRODUCTO')) colProducto = i;
    if (colPresentacion < 0 && (h === 'PRESENTACION' || h === 'PRESENTACIÓN')) colPresentacion = i;
    if (colEmpresa < 0 && (h === 'EMPRESA' || h === 'NOMBREEMPRESA')) colEmpresa = i;
  }
  if (colProducto < 0) colProducto = headers.length > 1 ? 1 : 0;

  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var prod = String(data[i][colProducto] || '').trim();
    if (!prod) continue;
    rows.push({
      producto: prod,
      presentacion: colPresentacion >= 0 ? String(data[i][colPresentacion] || '').trim() : '',
      empresa: colEmpresa >= 0 ? String(data[i][colEmpresa] || '').trim() : ''
    });
  }
  return { ok: true, productos: rows, source: 'maestro_productos', headers: headers };
}

// GET: Leer clientes únicos desde hoja ClientesUnicos (búsqueda dinámica de columnas)
function getClientesUnicos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('ClientesUnicos');
  if (!ws) return { ok: true, clientes: [], source: 'not_found' };

  var data = ws.getDataRange().getValues();
  if (data.length < 2) return { ok: true, clientes: [], source: 'ClientesUnicos' };

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var headersUpper = headers.map(function(h) { return h.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

  var colCliente = -1, colNit = -1, colTelefono = -1, colDireccion = -1, colMunicipio = -1, colDepartamento = -1;
  for (var i = 0; i < headersUpper.length; i++) {
    var h = headersUpper[i];
    if (colCliente < 0 && (h === 'CLIENTE' || h === 'NOMBRE' || h === 'NOMBRECLIENTE' || h === 'RAZONSOCIAL')) colCliente = i;
    if (colNit < 0 && (h === 'NIT' || h === 'IDENTIFICACION' || h === 'CEDULA' || h === 'DOCUMENTO')) colNit = i;
    if (colTelefono < 0 && (h === 'TELEFONO' || h === 'TEL' || h === 'CELULAR' || h === 'TELEFONOCONTACTO')) colTelefono = i;
    if (colDireccion < 0 && (h === 'DIRECCION' || h === 'DIRECCIÓN' || h === 'DIR' || h === 'DIRECCIONENVIO')) colDireccion = i;
    if (colMunicipio < 0 && (h === 'MUNICIPIO' || h === 'CIUDAD')) colMunicipio = i;
    if (colDepartamento < 0 && (h === 'DEPARTAMENTO' || h === 'DEPTO' || h === 'DPTO')) colDepartamento = i;
  }
  if (colCliente < 0) colCliente = 0;

  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var nombre = String(data[i][colCliente] || '').trim();
    if (!nombre) continue;
    rows.push({
      cliente: nombre,
      nit: colNit >= 0 ? String(data[i][colNit] || '').trim() : '',
      telefono: colTelefono >= 0 ? String(data[i][colTelefono] || '').trim() : '',
      direccion: colDireccion >= 0 ? String(data[i][colDireccion] || '').trim() : '',
      municipio: colMunicipio >= 0 ? String(data[i][colMunicipio] || '').trim() : '',
      departamento: colDepartamento >= 0 ? String(data[i][colDepartamento] || '').trim() : ''
    });
  }
  return { ok: true, clientes: rows, source: 'ClientesUnicos', headers: headers };
}

function _getOrCreateIngresosSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Ingresos');
  if (!ws) {
    ws = ss.insertSheet('Ingresos');
    ws.appendRow(INGRESOS_HEADERS);
    ws.getRange(1, 1, 1, INGRESOS_HEADERS.length).setFontWeight('bold');
  }
  var firstCell = String(ws.getRange(1, 1).getValue()).trim();
  if (firstCell !== 'Fecha') {
    ws.insertRowBefore(1);
    for (var h = 0; h < INGRESOS_HEADERS.length; h++) {
      ws.getRange(1, h + 1).setValue(INGRESOS_HEADERS[h]);
    }
    ws.getRange(1, 1, 1, INGRESOS_HEADERS.length).setFontWeight('bold');
  }
  return ws;
}

// GET: Leer todos los ingresos
function getIngresos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = _getOrCreateIngresosSheet();
  var data = ws.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < INGRESOS_HEADERS.length; j++) {
      var val = (j < data[i].length) ? data[i][j] : '';
      if (val instanceof Date) {
        val = Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      }
      obj[INGRESOS_HEADERS[j]] = val;
    }
    obj.__row = i + 1;
    rows.push(obj);
  }
  return { ok: true, ingresos: rows };
}

// POST: Agregar ingreso (una o varias líneas)
function agregarIngreso(body) {
  var ws = _getOrCreateIngresosSheet();
  var now = Utilities.formatDate(new Date(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var lineas = body.lineas || [];
  if (!lineas.length && body.Producto) {
    lineas = [{ Producto: body.Producto, Presentacion: body.Presentacion, Cantidad: body.Cantidad }];
  }
  var added = 0;
  for (var i = 0; i < lineas.length; i++) {
    var lin = lineas[i];
    ws.appendRow([
      body.Fecha || '',
      body.Origen || '',
      body.Empresa_Origen || '',
      body.Empresa_Destino || '',
      lin.Producto || '',
      lin.Presentacion || '',
      Number(lin.Cantidad) || 0,
      body.Responsable || '',
      body.Remision_Origen || '',
      body.Remision_Destino || '',
      body.Observaciones || '',
      now
    ]);
    added++;
  }
  return { ok: true, added: added };
}

// POST: Editar un ingreso existente
function editarIngreso(body) {
  var ws = _getOrCreateIngresosSheet();
  var row = Number(body.row);
  if (!row || row < 2) return { ok: false, error: 'Fila inválida' };

  var vals = [
    body.Fecha || '',
    body.Origen || '',
    body.Empresa_Origen || '',
    body.Empresa_Destino || '',
    body.Producto || '',
    body.Presentacion || '',
    Number(body.Cantidad) || 0,
    body.Responsable || '',
    body.Remision_Origen || '',
    body.Remision_Destino || '',
    body.Observaciones || ''
  ];
  for (var i = 0; i < vals.length; i++) {
    ws.getRange(row, i + 1).setValue(vals[i]);
  }
  return { ok: true, updated: 1 };
}

// POST: Eliminar un ingreso
function eliminarIngreso(body) {
  var ws = _getOrCreateIngresosSheet();
  var row = Number(body.row);
  if (!row || row < 2) return { ok: false, error: 'Fila inválida' };
  ws.deleteRow(row);
  return { ok: true, deleted: 1 };
}

// ══════════════════════════════════════════════════════════════
// MÓDULO: DEVOLUCIONES DE PRODUCTO
// ══════════════════════════════════════════════════════════════

var DEVOLUCIONES_HEADERS = ['Fecha','Empresa','Consecutivo','Vendedor','Cliente','NIT','Direccion','Municipio','Departamento','Telefono','Num_Factura','Producto','Presentacion','Cantidad','Cant_Entregada','Valor_Unitario','Valor_Total','Motivo','Observaciones','Fecha_Registro'];

function _getOrCreateDevolucionesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Devoluciones');
  if (!ws) {
    ws = ss.insertSheet('Devoluciones');
    ws.appendRow(DEVOLUCIONES_HEADERS);
    ws.getRange(1, 1, 1, DEVOLUCIONES_HEADERS.length).setFontWeight('bold');
  }
  var firstCell = String(ws.getRange(1, 1).getValue()).trim();
  if (firstCell !== 'Fecha') {
    ws.insertRowBefore(1);
    for (var h = 0; h < DEVOLUCIONES_HEADERS.length; h++) {
      ws.getRange(1, h + 1).setValue(DEVOLUCIONES_HEADERS[h]);
    }
    ws.getRange(1, 1, 1, DEVOLUCIONES_HEADERS.length).setFontWeight('bold');
  }
  return ws;
}

function getDevoluciones() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = _getOrCreateDevolucionesSheet();
  var data = ws.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < DEVOLUCIONES_HEADERS.length; j++) {
      var val = (j < data[i].length) ? data[i][j] : '';
      if (val instanceof Date) {
        val = Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      }
      obj[DEVOLUCIONES_HEADERS[j]] = val;
    }
    obj.__row = i + 1;
    rows.push(obj);
  }
  return { ok: true, devoluciones: rows };
}

function agregarDevolucion(body) {
  var ws = _getOrCreateDevolucionesSheet();
  var now = Utilities.formatDate(new Date(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var lineas = body.lineas || [];
  if (!lineas.length && body.Producto) {
    lineas = [{ Producto: body.Producto, Presentacion: body.Presentacion, Cantidad: body.Cantidad, Cant_Entregada: body.Cant_Entregada, Valor_Unitario: body.Valor_Unitario, Valor_Total: body.Valor_Total }];
  }
  var added = 0;
  for (var i = 0; i < lineas.length; i++) {
    var lin = lineas[i];
    var cant = Number(lin.Cantidad) || 0;
    var vUnit = Number(lin.Valor_Unitario) || 0;
    var vTotal = Number(lin.Valor_Total) || (cant * vUnit);
    ws.appendRow([
      body.Fecha || '',
      body.Empresa || '',
      body.Consecutivo || '',
      body.Vendedor || '',
      body.Cliente || '',
      body.NIT || '',
      body.Direccion || '',
      body.Municipio || '',
      body.Departamento || '',
      body.Telefono || '',
      body.Num_Factura || '',
      lin.Producto || '',
      lin.Presentacion || '',
      cant,
      Number(lin.Cant_Entregada) || 0,
      vUnit,
      vTotal,
      body.Motivo || '',
      body.Observaciones || '',
      now
    ]);
    added++;
  }
  return { ok: true, added: added };
}

function editarDevolucion(body) {
  var ws = _getOrCreateDevolucionesSheet();
  var row = Number(body.row);
  if (!row || row < 2) return { ok: false, error: 'Fila inválida' };

  var cant = Number(body.Cantidad) || 0;
  var vUnit = Number(body.Valor_Unitario) || 0;
  var vTotal = Number(body.Valor_Total) || (cant * vUnit);
  var vals = [
    body.Fecha || '',
    body.Empresa || '',
    body.Consecutivo || '',
    body.Vendedor || '',
    body.Cliente || '',
    body.NIT || '',
    body.Direccion || '',
    body.Municipio || '',
    body.Departamento || '',
    body.Telefono || '',
    body.Num_Factura || '',
    body.Producto || '',
    body.Presentacion || '',
    cant,
    Number(body.Cant_Entregada) || 0,
    vUnit,
    vTotal,
    body.Motivo || '',
    body.Observaciones || ''
  ];
  for (var i = 0; i < vals.length; i++) {
    ws.getRange(row, i + 1).setValue(vals[i]);
  }
  return { ok: true, updated: 1 };
}

function eliminarDevolucion(body) {
  var ws = _getOrCreateDevolucionesSheet();
  var row = Number(body.row);
  if (!row || row < 2) return { ok: false, error: 'Fila inválida' };
  ws.deleteRow(row);
  return { ok: true, deleted: 1 };
}

// ══════════════════════════════════════════════════════════════
// MÓDULO: INVENTARIO DE PRODUCTOS
// ══════════════════════════════════════════════════════════════

var INVENTARIO_HEADERS = ['Fecha','Empresa','Producto','Presentacion','Unidad_Medida','Cantidad_Caja','Lote','Cantidad','Observaciones','Fecha_Registro'];

function _getOrCreateInventarioSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Inventario');
  if (!ws) {
    ws = ss.insertSheet('Inventario');
    ws.appendRow(INVENTARIO_HEADERS);
    ws.getRange(1, 1, 1, INVENTARIO_HEADERS.length).setFontWeight('bold');
  }
  var firstCell = String(ws.getRange(1, 1).getValue()).trim();
  if (firstCell !== 'Fecha') {
    ws.insertRowBefore(1);
    for (var h = 0; h < INVENTARIO_HEADERS.length; h++) {
      ws.getRange(1, h + 1).setValue(INVENTARIO_HEADERS[h]);
    }
    ws.getRange(1, 1, 1, INVENTARIO_HEADERS.length).setFontWeight('bold');
  }
  return ws;
}

function getInventario() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = _getOrCreateInventarioSheet();
  var data = ws.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < INVENTARIO_HEADERS.length; j++) {
      var val = (j < data[i].length) ? data[i][j] : '';
      if (val instanceof Date) {
        val = Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      }
      obj[INVENTARIO_HEADERS[j]] = val;
    }
    obj.__row = i + 1;
    rows.push(obj);
  }
  return { ok: true, inventario: rows };
}

function agregarInventario(body) {
  var ws = _getOrCreateInventarioSheet();
  var now = Utilities.formatDate(new Date(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var lineas = body.lineas || [];
  if (!lineas.length && body.Producto) {
    lineas = [{ Producto: body.Producto, Presentacion: body.Presentacion, Unidad_Medida: body.Unidad_Medida, Cantidad_Caja: body.Cantidad_Caja, Lote: body.Lote, Cantidad: body.Cantidad }];
  }
  var added = 0;
  for (var i = 0; i < lineas.length; i++) {
    var lin = lineas[i];
    ws.appendRow([
      body.Fecha || '',
      body.Empresa || '',
      lin.Producto || '',
      lin.Presentacion || '',
      lin.Unidad_Medida || '',
      Number(lin.Cantidad_Caja) || 0,
      lin.Lote || '',
      Number(lin.Cantidad) || 0,
      body.Observaciones || '',
      now
    ]);
    added++;
  }
  return { ok: true, added: added };
}

function editarInventario(body) {
  var ws = _getOrCreateInventarioSheet();
  var row = Number(body.row);
  if (!row || row < 2) return { ok: false, error: 'Fila inválida' };

  var vals = [
    body.Fecha || '',
    body.Empresa || '',
    body.Producto || '',
    body.Presentacion || '',
    body.Unidad_Medida || '',
    Number(body.Cantidad_Caja) || 0,
    body.Lote || '',
    Number(body.Cantidad) || 0,
    body.Observaciones || ''
  ];
  for (var i = 0; i < vals.length; i++) {
    ws.getRange(row, i + 1).setValue(vals[i]);
  }
  return { ok: true, updated: 1 };
}

function eliminarInventario(body) {
  var ws = _getOrCreateInventarioSheet();
  var row = Number(body.row);
  if (!row || row < 2) return { ok: false, error: 'Fila inválida' };
  ws.deleteRow(row);
  return { ok: true, deleted: 1 };
}

// ══════════════════════════════════════════════════════════════
// MÓDULO: ÓRDENES DE COMPRA
// ══════════════════════════════════════════════════════════════

var OC_HEADERS = ['Fecha','Empresa_Destino','Empresa_Origen','Consecutivo','Direccion','Bodega','Municipio','Producto','Presentacion','Cantidad','Valor_Unitario','Valor_Total','Total_Orden','Observaciones','Estado','Fecha_Registro'];

function _getOrCreateOCSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('OrdenesCompra');
  if (!ws) {
    ws = ss.insertSheet('OrdenesCompra');
    ws.appendRow(OC_HEADERS);
    ws.getRange(1, 1, 1, OC_HEADERS.length).setFontWeight('bold');
  }
  var firstCell = String(ws.getRange(1, 1).getValue()).trim();
  if (firstCell !== 'Fecha') {
    ws.insertRowBefore(1);
    for (var h = 0; h < OC_HEADERS.length; h++) {
      ws.getRange(1, h + 1).setValue(OC_HEADERS[h]);
    }
    ws.getRange(1, 1, 1, OC_HEADERS.length).setFontWeight('bold');
  }
  return ws;
}

function getOrdenesCompra() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = _getOrCreateOCSheet();
  var data = ws.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < OC_HEADERS.length; j++) {
      var val = (j < data[i].length) ? data[i][j] : '';
      if (val instanceof Date) {
        val = Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      }
      obj[OC_HEADERS[j]] = val;
    }
    obj.__row = i + 1;
    rows.push(obj);
  }
  return { ok: true, ordenes: rows };
}

function agregarOrdenCompra(body) {
  var ws = _getOrCreateOCSheet();
  var now = Utilities.formatDate(new Date(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var lineas = body.lineas || [];
  if (!lineas.length && body.Producto) {
    lineas = [{ Producto: body.Producto, Presentacion: body.Presentacion, Cantidad: body.Cantidad, Valor_Unitario: body.Valor_Unitario, Valor_Total: body.Valor_Total }];
  }
  var added = 0;
  for (var i = 0; i < lineas.length; i++) {
    var lin = lineas[i];
    var cant = Number(lin.Cantidad) || 0;
    var vUnit = Number(lin.Valor_Unitario) || 0;
    var vTotal = Number(lin.Valor_Total) || (cant * vUnit);
    ws.appendRow([
      body.Fecha || '',
      body.Empresa_Destino || '',
      body.Empresa_Origen || '',
      body.Consecutivo || '',
      body.Direccion || '',
      body.Bodega || '',
      body.Municipio || '',
      lin.Producto || '',
      lin.Presentacion || '',
      cant,
      vUnit,
      vTotal,
      Number(body.Total_Orden) || 0,
      body.Observaciones || '',
      body.Estado || 'Abierta',
      now
    ]);
    added++;
  }
  return { ok: true, added: added };
}

function editarOrdenCompra(body) {
  var ws = _getOrCreateOCSheet();
  var row = Number(body.row);
  if (!row || row < 2) return { ok: false, error: 'Fila inválida' };

  var cant = Number(body.Cantidad) || 0;
  var vUnit = Number(body.Valor_Unitario) || 0;
  var vTotal = Number(body.Valor_Total) || (cant * vUnit);
  var vals = [
    body.Fecha || '',
    body.Empresa_Destino || '',
    body.Empresa_Origen || '',
    body.Consecutivo || '',
    body.Direccion || '',
    body.Bodega || '',
    body.Municipio || '',
    body.Producto || '',
    body.Presentacion || '',
    cant,
    vUnit,
    vTotal,
    Number(body.Total_Orden) || 0,
    body.Observaciones || '',
    body.Estado || 'Abierta'
  ];
  for (var i = 0; i < vals.length; i++) {
    ws.getRange(row, i + 1).setValue(vals[i]);
  }
  return { ok: true, updated: 1 };
}

function eliminarOrdenCompra(body) {
  var ws = _getOrCreateOCSheet();
  var row = Number(body.row);
  if (!row || row < 2) return { ok: false, error: 'Fila inválida' };
  ws.deleteRow(row);
  return { ok: true, deleted: 1 };
}
