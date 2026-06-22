# Sistema de Gestión Logística — Decisiones Clave y Próximos Pasos

**Última actualización:** 2026-06-22 (sesión 6)  
**URL del panel:** https://violeta77-new.github.io/panel-pedidos/  
**Repo:** github.com/violeta77-new/panel-pedidos  
**Google Sheet:** "Copia de Pedidos_Consolidados"  
**Versión actual:** Sistema multi-módulo (Pedidos v7.2 + Ingresos v2.1 + Devoluciones v1.1 + Inventario v1.0)

---

## Arquitectura

```
                          index.html (landing)
                       /        |          \           \
             pedidos.html  ingresos.html  devoluciones.html  inventario.html
                  |              |               |                |
            js/pedidos.js  js/ingresos.js  js/devoluciones.js  js/inventario.js
                  \              |              /                /
                     js/shared.js  (API, utilidades comunes)
                     css/panel.css (estilos compartidos)
                          |
                    Google Apps Script (API única)
                          |
                    Google Sheets
                     ├── Pedidos (31 columnas)
                     ├── Ingresos (12 columnas)
                     ├── Devoluciones (20 columnas)
                     ├── Inventario (10 columnas)
                     ├── ClientesUnicos (catálogo de clientes)
                     ├── maestro_productos (catálogo dinámico)
                     ├── Clientes
                     ├── Comerciales
                     └── Productos
```

| Capa | Tecnología | Ubicación |
|------|-----------|-----------|
| Frontend | HTML/CSS/JS multi-página, sin framework | GitHub Pages |
| CSS compartido | `css/panel.css` (estilos de todos los módulos) | Archivo separado |
| JS compartido | `js/shared.js` (API_URL, apiGet/apiPost, utilidades) | Archivo separado |
| JS por módulo | `js/pedidos.js`, `js/ingresos.js`, `js/devoluciones.js` | Archivos separados |
| Backend / API | Google Apps Script (`apps_script_api.js`) | Vinculado al Google Sheet |
| Base de datos | Google Sheets (hojas: Pedidos, Ingresos, Devoluciones, maestro_productos, etc.) | Google Drive |
| Parseo Excel | SheetJS (xlsx.js) cargado desde CDN | Se ejecuta en el navegador (Pedidos y Devoluciones) |
| Procesamiento masivo | `procesar_pedidos.py` | Local, llama al mismo API |

### Por qué esta arquitectura

- **Sin servidor propio:** GitHub Pages sirve el HTML estático gratis; Google Apps Script maneja la lógica sin costo adicional.
- **Multiusuario sin conflictos:** cada operación (entrega, edición, importación) se escribe directamente en Google Sheets fila por fila.
- **Sin autenticación propia:** el Apps Script está desplegado como "cualquier persona con el enlace puede ejecutar", lo que simplifica el acceso.

---

## Decisiones clave

### 1. Reestructuración a sistema multi-página modular (sesión 3)

**Decisión:** separar el monolítico `index.html` (~1483 líneas) en un sistema multi-página con CSS/JS compartidos.  
**Razón:** el panel original superó las 1400 líneas y se necesitaba agregar nuevos módulos (Ingresos, futuros Reportes y Usuarios). Mantener todo en un archivo hacía inmanejable el desarrollo.  
**Estructura:** `index.html` (landing), `pedidos.html`, `ingresos.html` + `css/panel.css` + `js/shared.js` + `js/pedidos.js` + `js/ingresos.js`.  
**Respaldo:** el archivo original se conserva como `index_v7_backup.html`.

### 2. API vía `Content-Type: text/plain` (no `application/json`)

**Decisión:** los POST al Apps Script usan `Content-Type: text/plain` con body JSON.  
**Razón:** Google Apps Script aplica restricciones CORS a `application/json`. Con `text/plain`, el navegador envía una petición simple (sin preflight OPTIONS), y el script recibe el JSON igual vía `e.postData.contents`.

### 3. Identificación de filas por número (`__row`) en vez de ID único

**Decisión:** cada línea de pedido se identifica por su número de fila en Google Sheets (`__row`).  
**Razón:** evita crear una columna extra de IDs y mantiene compatibilidad con el Sheet existente.  
**Riesgo:** si dos usuarios editan simultáneamente y uno elimina filas, los `__row` del otro quedan desalineados. Mitigación: recargar datos después de cada operación de escritura.

### 4. Importación de Excel se parsea en el navegador, no en el servidor

**Decisión:** el usuario selecciona un archivo `.xlsx`, SheetJS lo parsea en el navegador, se muestra vista previa, y los datos validados se envían al API.  
**Razón:** evita subir archivos binarios al Apps Script (que tiene límites de tamaño). El parseo local es instantáneo y permite validación antes de enviar.

### 5. Ordenamiento multi-nivel con Shift+clic (nuevo en v7)

**Decisión:** clic en columna = ordenar por esa columna; Shift+clic = agregar nivel secundario.  
**Razón:** los usuarios necesitan ver pedidos agrupados por empresa + cliente, o por fecha + estado.

### 6. Tablas dimensionales gestionadas automáticamente por el API

**Decisión:** el Apps Script crea registros en hojas Clientes/Comerciales/Productos al recibir un pedido nuevo.  
**Razón:** normalización automática sin intervención manual. Si el cliente ya existe (por NIT o nombre), se reutiliza su ID.  
**Riesgo:** duplicados con variaciones de nombre ("JUAN PEREZ" vs "Juan Pérez"). No hay fuzzy matching.

### 7. API URL única para todas las operaciones

```
https://script.google.com/macros/s/AKfycby56eHdQIjfgQ9BRUbzoq238xSVD56Bl19popJmN4K2jl1eeHO0WRlp2h6GtFYPox9diA/exec
```

- **GET:** `getPedidos`, `getConsecutivos`, `getIngresos`, `getDevoluciones`, `getInventario`, `getProductos`, `getMaestroProductos`, `getClientesUnicos`, `repararEncabezados`
- **POST:** `agregarPedido`, `checkDuplicado`, `registrarEntrega`, `editarPedido`, `eliminarPedido`, `agregarIngreso`, `editarIngreso`, `eliminarIngreso`, `agregarDevolucion`, `editarDevolucion`, `eliminarDevolucion`, `agregarInventario`, `editarInventario`, `eliminarInventario`

### 8. Columnas del Sheet — Pedidos (31 en total)

```
Fecha_Procesamiento, Nombre_Empresa, Consecutivo, Fecha_Pedido,
Cliente, NIT, Telefono, Direccion_Envio, Municipio, Departamento,
Comercial, Plazo_Pago, Precio_Facturacion, Producto, Presentacion,
Cantidad, Valor_Unitario, Valor_Total, Total_Orden, Archivo_Fuente,
Estado, ID_Cliente, ID_Comercial, ID_Producto,
Cant_Entregada, Cant_Pendiente, Estado_Entrega, Fecha_Ult_Entrega, Remisiones,
Observaciones, Estado_2
```

### 9. Observaciones se extraen del Excel y se almacenan por línea (nuevo en v7.1)

**Decisión:** el campo OBSERVACIONES del formato Excel se parsea durante la importación, se envía al API y se almacena en la columna 30 (`Observaciones`) de cada línea del pedido.  
**Razón:** las observaciones del pedido contienen instrucciones operativas (bonificaciones, condiciones especiales) que necesitan ser visibles al consultar el detalle.  
**Formato Excel:** fila con "OBSERVACIONES" en columna A, texto en columna B (celda fusionada B:W).  
**Visualización:** bloque amarillo (`#fef9e7`) visible en el modal de vista previa al importar y en el modal de detalle del pedido. Solo se muestra si hay contenido.

### 10. Remisiones editables desde el modal de edición (nuevo en v7.1)

**Decisión:** agregar una columna "Remisiones" editable en la tabla de líneas del modal de edición de pedidos.  
**Razón:** las entregas históricas registradas directamente en el Google Sheet (o vía `procesar_entregas.py`) no tenían el número de remisión en la columna `Remisiones`. Esto impedía que aparecieran en el detalle del pedido. Con este campo editable, se pueden corregir los datos retroactivamente desde el panel.  
**API:** `editarPedido` ahora incluye `Remisiones` en el array `lineFields`, permitiendo su escritura en Google Sheets.

### 11. Cierre de modales protegido contra clics en scrollbar (fix v7.1)

**Decisión:** los handlers de clic-en-backdrop de los modales usan `isBackdropClick()` en vez de `e.target === this`.  
**Razón:** cuando el modal tenía más contenido que el viewport, el overlay mostraba una barra de scroll. Al hacer clic en la barra, el navegador disparaba el evento con `e.target === overlay`, cerrando el modal inesperadamente.  
**Fix:** `isBackdropClick(e)` verifica `e.offsetX <= clientWidth && e.offsetY <= clientHeight`, excluyendo la zona del scrollbar.

### 12. Búsqueda de productos exclusivamente desde maestro_productos (sesión 4)

**Decisión:** el autocompletado de productos en Ingresos y Devoluciones usa la hoja `maestro_productos` del Google Sheet, no la hoja `Productos`.  
**Razón:** la hoja `Productos` se genera automáticamente al importar pedidos y contiene datos normalizados por empresa. La hoja `maestro_productos` es el catálogo maestro mantenido manualmente con la lista oficial de productos y presentaciones.  
**API:** `getMaestroProductos()` detecta dinámicamente las columnas (busca PRODUCTO, PRESENTACION, EMPRESA en los headers) para tolerar cambios en la estructura de la hoja.  
**Sin fallback:** si `maestro_productos` no existe o está vacía, el autocompletado simplemente no muestra sugerencias — no hay fallback a la hoja Productos.

### 13. Ingresos: Empresa Origen y Empresa Destino separadas (sesión 4)

**Decisión:** reemplazar el campo único "Empresa" por dos campos: "Empresa Origen" y "Empresa Destino".  
**Razón:** un ingreso de producto puede ser entre dos empresas del holding (ej: PARCELAR envía a GREEN). Tener un solo campo no capturaba esta relación.  
**Impacto en columnas:** la hoja Ingresos pasó de 10 a 12 columnas: `Fecha, Origen, Empresa_Origen, Empresa_Destino, Producto, Presentacion, Cantidad, Responsable, Remision_Origen, Remision_Destino, Observaciones, Fecha_Registro`.  
**Acción requerida:** si la hoja "Ingresos" ya existía con la estructura vieja (10 columnas), debe eliminarse para que `_getOrCreateIngresosSheet()` la recree con las 12 columnas correctas.

### 14. Ingresos: Remisión Origen y Remisión Destino separadas (sesión 4)

**Decisión:** reemplazar el campo único "Remisión" por "Remisión Origen" y "Remisión Destino".  
**Razón:** en el flujo logístico hay una remisión de salida (origen) y otra de entrada (destino) que deben registrarse por separado.

### 15. Abreviaturas de empresa en dropdowns (sesión 4)

**Decisión:** los selects de empresa muestran la sigla (PARCELAR, GREEN, RESO, IASO, IAS) pero envían el nombre completo como valor.  
**Razón:** las siglas son más legibles en los dropdowns y la tabla. El nombre completo se almacena en Google Sheets para integridad.  
**Mapeo:** `PARCELAR DE COLOMBIA SAS` → PARCELAR, `GREEN AGROSOLUCIONES DE COLOMBIA SAS` → GREEN, `SOLUCIONES INTEGRALES RESO SAS` → RESO, `INSUMOS AGROPECUARIOS SOSTENIBLES SAS` → IASO, `INSUMOS AGROPECUARIOS DE LA SABANA SAS` → IAS.

### 16. Devoluciones como módulo separado de Ingresos (sesión 4)

**Decisión:** separar las devoluciones del módulo de Ingresos y crear un módulo independiente.  
**Razón:** las devoluciones tienen campos y flujo distintos (cliente, NIT, factura, motivo, valores monetarios). Mezclarlas con los ingresos de planta complicaba ambos formularios.  
**Eliminado de Ingresos:** se quitó la opción "Devolución" del select de Origen y de las estadísticas.

### 17. Devoluciones basadas en formato OP-PDC-FO10 (sesión 4)

**Decisión:** reestructurar el formulario de devoluciones para coincidir con la "Orden de Devoluciones" (código OP-PDC-FO10) usada en la empresa.  
**Campos del encabezado:** Empresa, Fecha, # Consecutivo, Vendedor, N° de Factura, Cliente, NIT, Dirección, Municipio, Departamento, Teléfono, Motivo Devolución, Observaciones.  
**Campos de producto:** Producto (con autocompletado), Presentación, Cantidad, Cantidad Entregada, Valor Unitario, Valor Total (calculado automáticamente).  
**Total general:** se calcula y muestra en el pie de la tabla de productos.  
**Columnas en Google Sheets (20):**  
```
Fecha, Empresa, Consecutivo, Vendedor, Cliente, NIT, Direccion,
Municipio, Departamento, Telefono, Num_Factura, Producto, Presentacion,
Cantidad, Cant_Entregada, Valor_Unitario, Valor_Total, Motivo,
Observaciones, Fecha_Registro
```
**Tema visual:** naranja (#e67e22) para diferenciarse de Ingresos (verde) y Pedidos (azul).

### 18. Holding de 5 empresas con módulos compartidos (sesión 3)

**Decisión:** el sistema se presenta como "Sistema de Gestión Logística — Holding de empresas" y soporta 5 empresas del grupo.  
**Empresas:**  
- PARCELAR DE COLOMBIA SAS (sigla: PARCELAR)  
- GREEN AGROSOLUCIONES DE COLOMBIA SAS (sigla: GREEN)  
- SOLUCIONES INTEGRALES RESO SAS (sigla: RESO)  
- INSUMOS AGROPECUARIOS SOSTENIBLES SAS (sigla: IASO)  
- INSUMOS AGROPECUARIOS DE LA SABANA SAS (sigla: IAS)  
**Razón:** todas las empresas comparten la misma infraestructura logística y Google Sheet. El filtro por empresa permite ver datos de una sola compañía.

### 19. Búsqueda de clientes desde hoja ClientesUnicos en Devoluciones (sesión 5)

**Decisión:** el formulario de devoluciones busca clientes en la hoja `ClientesUnicos` del Google Sheet con autocompletado por nombre o NIT.  
**Razón:** evitar digitar manualmente los datos del cliente (NIT, dirección, municipio, departamento, teléfono) cuando ya existen en la base de datos.  
**Fallback manual:** si el cliente no se encuentra, el usuario puede escribir los datos manualmente.  
**API:** `getClientesUnicos()` detecta dinámicamente las columnas (CLIENTE, NIT, TELEFONO, DIRECCION, MUNICIPIO, DEPARTAMENTO) para tolerar cambios en la estructura de la hoja.

### 20. Motivo de devolución como dropdown de 5 categorías + Otro (sesión 5)

**Decisión:** el campo Motivo Devolución es un `<select>` con 5 categorías predefinidas y una opción "Otro" que habilita un campo de texto libre.  
**Categorías:** Defecto, daño o fuera de especificaciones / Producto vencido / Error en despacho o pedido / Devolución comercial / Avería o daño en transporte.  
**Razón:** estandarizar los motivos para facilitar reportes y análisis, sin perder flexibilidad para casos atípicos.

### 21. Importación de devoluciones desde Excel formato OP-PDC-FO10 (sesión 5)

**Decisión:** agregar botón "Importar Excel" en Devoluciones que parsea el formato OP-PDC-FO10 y pre-llena el formulario.  
**Razón:** los datos de devolución ya se capturan en un formato Excel estandarizado. Permitir importarlo evita doble digitación.  
**Parser dinámico:** busca etiquetas (EMPRESA, FECHA, CLIENTE, NIT, etc.) en celdas y lee la tabla de productos dinámicamente hasta encontrar OBSERVACIONES o MOTIVO.  
**Flujo:** importar → pre-llenar formulario → el usuario revisa y ajusta → guardar.

### 22. Auto-selección de empresa según planta de origen en Ingresos (sesión 5)

**Decisión:** al seleccionar la planta de origen en Ingresos, la Empresa Origen se auto-selecciona: Planta Mosquera → GREEN, Planta Cachipay → PARCELAR.  
**Razón:** cada planta pertenece a una sola empresa. La selección manual era redundante y propensa a errores.

### 23. Columna ESTADO_2 en Pedidos (sesión 5)

**Decisión:** agregar columna `Estado_2` (columna 31) con valores Abierto, Cerrado y Anulado.  
**Razón:** el Estado existente (Recibido/Parcial/Entregado) refleja el avance de entregas por línea. `Estado_2` refleja el estado administrativo del pedido completo.  
**Comportamiento automático:**
- `agregarPedido()`: inicializa `Estado_2 = 'Abierto'`
- `registrarEntrega()`: cuando `pendiente <= 0` en una línea, esa línea cambia a `Estado_2 = 'Cerrado'`
- Derivación en frontend: si todas las líneas son Cerrado → orden Cerrada; si alguna es Anulado → orden Anulada; de lo contrario → Abierta
**Editable:** el usuario puede cambiar manualmente Estado_2 desde el modal de edición (dropdown).  
**Filtro:** nuevo filtro "Estado 2" en la barra de filtros con opciones Abierto/Cerrado/Anulado.  
**CSS:** badges con colores diferenciados: verde (`.b-abierto`), azul (`.b-cerrado`), rojo (`.b-anulado`).

### 25. Módulo de Inventario con relación a Pedidos (sesión 6)

**Decisión:** crear un módulo de Inventario independiente que registra stock por producto/lote/empresa y calcula disponibilidad real descontando las cantidades pendientes de pedidos abiertos.  
**Razón:** el holding necesita visibilidad del stock disponible para planificar despachos. Sin inventario, no se sabe cuánto producto hay disponible vs. cuánto está comprometido en pedidos pendientes.  
**Relación con Pedidos:** al cargar el inventario, se consultan también los pedidos (`getPedidos`). Para cada producto, se suman las cantidades pendientes (`Cantidad - Cant_Entregada`) de pedidos con `Estado_2 != 'Cerrado' && != 'Anulado'`. Esto se muestra como "Comprometido". La "Disponibilidad real" = Stock - Comprometido.  
**Columnas en Google Sheets (10):**
```
Fecha, Empresa, Producto, Presentacion, Unidad_Medida, Cantidad_Caja, Lote, Cantidad, Observaciones, Fecha_Registro
```
**Importación Excel:** parser dinámico que busca columnas REFERENCIA/PRODUCTO, UNIDAD_MEDIDA, CANTIDAD_CAJA, LOTE, CANTIDAD.  
**Alerta de stock:** banner visible cuando hay productos con disponibilidad ≤ 10 unidades.  
**Tema visual:** púrpura (#8e44ad) para diferenciarse de Pedidos (azul), Ingresos (verde) y Devoluciones (naranja).

### 24. Agregar línea de producto desde pantalla de entregas (sesión 5)

**Decisión:** permitir agregar una nueva línea de producto a un pedido existente directamente desde el modal de detalle/entregas.  
**Razón:** a veces se necesita agregar un producto adicional a un pedido ya cargado sin salir a la pantalla de edición completa.  
**Implementación:** sección colapsable "Agregar línea de producto" con campos Producto, Presentación, Cantidad, Valor Unitario, Valor Total (auto-calculado). Usa la acción `editarPedido` del backend con `__row: null` para agregar la línea.

---

## Estado actual de funcionalidades (sesión 6, 2026-06-22)

### Módulo Pedidos (pedidos.html)

| Funcionalidad | Estado | Notas |
|--------------|--------|-------|
| Carga de pedidos desde Google Sheets | ✅ Funcional | Auto-carga al abrir la página |
| Filtros (empresa, cliente, estado, estado 2) | ✅ Funcional | Filtro combinado en tiempo real, incluye Estado_2 |
| Ordenamiento multi-nivel | ✅ Funcional | Clic + Shift+clic en columnas, incluye Estado 2 |
| Registro de entregas | ✅ Funcional | Modal con cantidad, fecha, remisión por línea |
| Edición de pedidos | ✅ Funcional | Editar encabezado + líneas + remisiones + Estado_2 |
| Columna Estado_2 (Abierto/Cerrado/Anulado) | ✅ Funcional | Badges con color, derivación automática, editable |
| Agregar línea de producto desde detalle | ✅ Funcional | Sección colapsable en modal de entregas |
| Importación desde Excel | ✅ Funcional | Parser dinámico por etiquetas, soporta formatos IASO y RESO |
| Observaciones del pedido | ✅ Funcional | Extraídas del Excel, visibles en detalle y vista previa |
| Verificación de duplicados | ✅ Funcional | Se consulta antes de importar |
| Eliminación de pedidos | ⚠️ Solo en API | Función `eliminarPedido` existe, falta botón en interfaz |
| Exportar a Excel | ❌ No implementado | Solo existe lectura |

### Módulo Ingresos (ingresos.html) — v2.1

| Funcionalidad | Estado | Notas |
|--------------|--------|-------|
| Carga de ingresos desde Google Sheets | ✅ Funcional | Via `getIngresos` |
| Filtros (origen, emp. origen, emp. destino, producto, responsable) | ✅ Funcional | Filtros separados por empresa origen y destino |
| Ordenamiento multi-nivel | ✅ Funcional | Clic + Shift+clic en columnas |
| Nuevo ingreso multi-línea | ✅ Funcional | Requiere Apps Script actualizado |
| Búsqueda de productos desde maestro_productos | ✅ Funcional | Autocompletado exclusivo desde hoja maestro_productos |
| Empresa Origen / Empresa Destino | ✅ Funcional | Campos separados con abreviaturas |
| Auto-selección empresa según planta | ✅ Funcional | Mosquera → GREEN, Cachipay → PARCELAR |
| Remisión Origen / Remisión Destino | ✅ Funcional | Campos separados |
| Edición de ingresos | ✅ Funcional | Edición individual por registro |
| Eliminación de ingresos | ✅ Funcional | Con confirmación |
| Devoluciones | ❌ Removido | Ahora en módulo independiente |

### Módulo Devoluciones (devoluciones.html) — v1.1

| Funcionalidad | Estado | Notas |
|--------------|--------|-------|
| Carga de devoluciones desde Google Sheets | ✅ Funcional | Via `getDevoluciones` |
| Formulario basado en formato OP-PDC-FO10 | ✅ Funcional | 13 campos de encabezado + líneas de producto |
| Datos del cliente (Cliente, NIT, Dir., Mpio., Depto., Tel.) | ✅ Funcional | Sección dedicada en el formulario |
| Búsqueda de clientes desde ClientesUnicos | ✅ Funcional | Autocompletado por nombre o NIT, pre-llena datos |
| Líneas de producto con valores monetarios | ✅ Funcional | Cantidad, Cant. Entregada, Valor Unitario, Valor Total |
| Cálculo automático de totales | ✅ Funcional | Valor Total por línea y total general |
| Búsqueda de productos desde maestro_productos | ✅ Funcional | Autocompletado con filtro por empresa |
| Motivo de devolución (dropdown 5 categorías + Otro) | ✅ Funcional | Categorías estandarizadas + campo libre |
| Importación desde Excel formato OP-PDC-FO10 | ✅ Funcional | Parser dinámico, pre-llena formulario |
| Filtros (empresa, cliente, motivo, producto, búsqueda) | ✅ Funcional | Filtro combinado en tiempo real |
| Ordenamiento multi-nivel | ✅ Funcional | Clic + Shift+clic en columnas |
| Nuevo registro multi-línea | ✅ Funcional | Requiere Apps Script actualizado |
| Edición de devoluciones | ✅ Funcional | Edición individual con recálculo de valores |
| Eliminación de devoluciones | ✅ Funcional | Con confirmación |
| Estadísticas | ✅ Funcional | Total devoluciones, Valor total, Este mes, Clientes |

### Módulo Inventario (inventario.html) — v1.0

| Funcionalidad | Estado | Notas |
|--------------|--------|-------|
| Carga de inventario desde Google Sheets | ✅ Funcional | Via `getInventario` + `getPedidos` para calcular disponibilidad |
| Relación con Pedidos (stock comprometido) | ✅ Funcional | Calcula cantidades pendientes de pedidos abiertos por producto |
| Disponibilidad real (stock - comprometido) | ✅ Funcional | Badges con color: verde (ok), naranja (bajo), rojo (negativo) |
| Alertas de stock bajo | ✅ Funcional | Banner amarillo cuando hay productos con disponibilidad ≤ 10 |
| Filtros (empresa, producto, disponibilidad, búsqueda) | ✅ Funcional | Filtro combinado en tiempo real |
| Ordenamiento multi-nivel | ✅ Funcional | Clic + Shift+clic en columnas |
| Nuevo registro multi-línea | ✅ Funcional | Producto, presentación, unidad, cant/caja, lote, cantidad |
| Importación desde Excel | ✅ Funcional | Parser dinámico para formato inventario_inicial_sharda.xlsx |
| Búsqueda de productos desde maestro_productos | ✅ Funcional | Autocompletado con filtro por empresa |
| Edición de registros | ✅ Funcional | Edición individual por registro |
| Eliminación de registros | ✅ Funcional | Con confirmación |
| Estadísticas | ✅ Funcional | Referencias, stock total, comprometido, disponible real |

### Landing y navegación (index.html)

| Funcionalidad | Estado | Notas |
|--------------|--------|-------|
| Landing con grid de módulos | ✅ Funcional | Pedidos, Ingresos y Devoluciones activos; Reportes y Usuarios próximamente |
| Navbar compartido | ✅ Funcional | Inicio, Pedidos, Ingresos, Devoluciones en todas las páginas |

---

## Próximos pasos

### 🔴 Prioridad alta

#### 1. Desplegar Apps Script con TODOS los cambios de sesión 5
El código local `apps_script_api.js` incluye cambios críticos que **requieren redespliegue**:
- Estado_2 en EXPECTED (31 columnas)
- `agregarPedido` inicializa Estado_2='Abierto'
- `registrarEntrega` cierra Estado_2 automáticamente
- `editarPedido` incluye Estado_2 en hdrFields
- `getClientesUnicos` (nueva función)

Pasos:
1. Abrir el editor de Apps Script (en Google Sheets: Extensiones > Apps Script)
2. Reemplazar **todo** el código con el contenido de `apps_script_api.js`
3. Ir a **Implementar > Administrar implementaciones**
4. Editar la implementación existente → seleccionar **"Nueva versión"**
5. Clic en **Implementar**

> **IMPORTANTE:** Solo guardar el código NO actualiza la versión desplegada. Hay que seleccionar "Nueva versión" explícitamente cada vez.

#### 2. Verificar funcionalidad del botón Editar en producción
El botón de editar pedidos funciona correctamente en pruebas locales pero el usuario reportó que no funciona en GitHub Pages. Posibles causas:
- Caché del navegador (limpiar con Ctrl+Shift+R)
- Verificar que el JS desplegado en GitHub Pages es la versión más reciente
- Verificar que Apps Script tiene la última versión (el guardado de edición requiere backend actualizado)

#### 3. Probar Estado_2 end-to-end
- [ ] Crear pedido nuevo → verificar que Estado_2 = "Abierto"
- [ ] Registrar entrega completa → verificar que Estado_2 cambia a "Cerrado"
- [ ] Editar Estado_2 manualmente desde el modal de edición
- [ ] Filtrar por Estado_2 (Abierto/Cerrado/Anulado)
- [ ] Agregar nueva línea de producto desde modal de entregas

### 🟡 Prioridad media

#### 4. Manejo de concurrencia básico
- Agregar `LockService.getScriptLock()` en funciones de escritura del Apps Script

#### 5. Botón de eliminación de pedido en la interfaz
- El API ya soporta `eliminarPedido`, falta botón con confirmación

#### 6. Exportar datos a Excel
- Botón "Exportar" que descargue los pedidos/ingresos/devoluciones filtrados como `.xlsx`

#### 7. Normalización de nombres de cliente
- Comparar nombres sin acentos y en mayúsculas en `_getOrCreateCliente`

### 🟢 Prioridad baja

#### 8. Módulo de Reportes
- Resúmenes de movimientos, análisis por empresa, cliente y período

#### 9. Módulo de Usuarios / Autenticación
- Roles (lectura vs edición), restricción por empresa
- Opciones: Google OAuth en Apps Script, o token de verificación

#### 10. Paginación
- Si los datos superan ~5000 filas, implementar carga paginada

---

## Archivos del proyecto

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Landing page con grid de módulos (Pedidos, Ingresos, Devoluciones) |
| `pedidos.html` | Módulo de Pedidos (importación Excel, entregas, edición) |
| `ingresos.html` | Módulo de Ingresos v2 (Empresa Origen/Destino, Remisión Origen/Destino) |
| `devoluciones.html` | Módulo de Devoluciones (formato OP-PDC-FO10, valores monetarios) |
| `css/panel.css` | Estilos compartidos de todos los módulos |
| `js/shared.js` | API_URL, apiGet/apiPost, utilidades comunes (fmtMoney, showToast, etc.) |
| `js/pedidos.js` | Lógica del módulo Pedidos (~1000 líneas) |
| `js/ingresos.js` | Lógica del módulo Ingresos (~380 líneas) |
| `js/devoluciones.js` | Lógica del módulo Devoluciones (~430 líneas) |
| `inventario.html` | Módulo de Inventario (stock, disponibilidad, importación Excel) |
| `js/inventario.js` | Lógica del módulo Inventario (~480 líneas) |
| `apps_script_api.js` | Código del backend en Google Apps Script (referencia local, ~890 líneas) |
| `procesar_pedidos.py` | Script Python de procesamiento masivo desde carpeta |
| `procesar_entregas.py` | Script Python para procesar entregas |
| `index_v7_backup.html` | Respaldo del panel monolítico original (~1483 líneas) |
| `Panel_Pedidos_6.html` | Versión anterior del panel (respaldo) |
| `DECISIONES_Y_PROXIMOS_PASOS.md` | Este documento |

---

## Cómo hacer cambios

### Actualizar el panel (frontend)
1. Editar los archivos localmente (`*.html`, `css/`, `js/`)
2. Hacer push a `main` en `violeta77-new/panel-pedidos` (vía `git push origin master:main`)
3. GitHub Pages despliega automáticamente en ~1 minuto

### Actualizar el API (backend)
1. Abrir Google Apps Script vinculado al Sheet
2. Reemplazar el código con el contenido de `apps_script_api.js`
3. **Implementar > Administrar implementaciones** > Editar > seleccionar **"Nueva versión"** > Implementar
4. Si la URL cambia, actualizar `API_URL` en `js/shared.js` y hacer push

---

## Problemas conocidos

1. **`__row` desalineado por edición simultánea:** si un usuario elimina filas mientras otro tiene la página abierta, las referencias `__row` del segundo quedan incorrectas. Solución temporal: recargar la página antes de hacer cambios.

2. **CORS con `application/json`:** nunca cambiar el `Content-Type` de los POST a `application/json`. Apps Script no responde al preflight OPTIONS del navegador.

3. **Duplicados de clientes:** el matching es exacto por NIT o nombre. Variaciones como tildes, mayúsculas o espacios adicionales crean registros duplicados en la hoja Clientes.

4. **Hojas con estructura vieja:** si las hojas "Ingresos" o "Devoluciones" fueron creadas con versiones anteriores del código, tienen menos columnas de las esperadas. Solución: eliminar la hoja y dejar que `_getOrCreateSheet()` la recree con la estructura correcta.

---

## Historial de cambios

### Módulo de Inventario v1.0 (2026-06-22, sesión 6)

- **Nuevo módulo de Inventario:** CRUD completo (`inventario.html` + `js/inventario.js`) con registro de stock por producto, lote, unidad de medida y empresa. Tema púrpura (#8e44ad).
- **Relación directa con Pedidos:** al cargar el inventario se consultan también los pedidos abiertos. Para cada producto se calcula la cantidad comprometida (pendiente de entrega) y la disponibilidad real (stock - comprometido). Pedidos con Estado_2 Cerrado o Anulado no se cuentan.
- **Alertas de stock bajo:** banner de alerta visible cuando hay productos con disponibilidad ≤ 10 unidades, con botón para filtrar directamente esos productos.
- **Importación desde Excel:** parser dinámico que detecta columnas (REFERENCIA/PRODUCTO, UNIDAD_MEDIDA, CANTIDAD_CAJA, LOTE, CANTIDAD). Compatible con formato `inventario_inicial_sharda.xlsx`.
- **Estadísticas:** 4 tarjetas — referencias totales, stock total, comprometido en pedidos, disponible real.
- **Badges de disponibilidad:** verde (stock ok), naranja (stock bajo ≤ 10), rojo (stock negativo o agotado).
- **Backend:** `apps_script_api.js` actualizado con hoja Inventario (10 columnas), funciones `getInventario`, `agregarInventario`, `editarInventario`, `eliminarInventario`.
- **Navegación:** link a Inventario agregado en navbar de todas las páginas. Tarjeta de módulo Inventario agregada al grid de `index.html`.

### Estado_2 + Línea desde entregas + Mejoras multi-módulo (2026-06-22, sesión 5)

- **Columna Estado_2 en Pedidos:** nueva columna 31 con valores Abierto/Cerrado/Anulado. Se inicializa como "Abierto" al crear pedido, cambia a "Cerrado" automáticamente al completar entregas. Editable manualmente desde modal de edición. Derivación en frontend: todas las líneas Cerrado → orden Cerrada; alguna Anulado → orden Anulada; de lo contrario → Abierta.
- **Filtro y ordenamiento por Estado_2:** nuevo dropdown "Estado 2" en barra de filtros. Columna sorteable con badges de colores (verde=Abierto, azul=Cerrado, rojo=Anulado).
- **Agregar línea de producto desde entregas:** sección colapsable en el modal de detalle/entregas que permite agregar un producto nuevo a un pedido existente sin salir a edición completa. Usa `editarPedido` con `__row: null`.
- **Edición de Estado_2 desde modal:** dropdown en el modal de edición para cambiar manualmente el Estado_2 de un pedido.
- **Búsqueda de clientes en Devoluciones:** autocompletado de clientes desde hoja `ClientesUnicos` con detección dinámica de columnas. Pre-llena NIT, dirección, municipio, departamento y teléfono.
- **Motivo de devolución estandarizado:** dropdown con 5 categorías predefinidas + opción "Otro" con campo libre.
- **Importación Excel en Devoluciones:** parser del formato OP-PDC-FO10 que busca etiquetas dinámicamente y pre-llena el formulario.
- **Auto-selección de empresa en Ingresos:** al seleccionar planta de origen, la empresa se auto-selecciona (Mosquera → GREEN, Cachipay → PARCELAR).
- **Placeholder remisión:** cambiado a XXXX.
- **Backend:** `apps_script_api.js` actualizado con Estado_2 en EXPECTED (31 cols), `agregarPedido` inicializa Estado_2='Abierto', `registrarEntrega` cierra Estado_2 automáticamente, `editarPedido` incluye Estado_2 en hdrFields, nueva función `getClientesUnicos` con detección dinámica de columnas.

### Devoluciones OP-PDC-FO10 + Ingresos v2.0 (2026-06-18, sesión 4)

- **Búsqueda de productos desde maestro_productos:** el autocompletado de productos en Ingresos y Devoluciones ahora usa exclusivamente la hoja `maestro_productos` con detección dinámica de columnas (`getMaestroProductos()`). Se eliminó el fallback a la hoja Productos.
- **Ingresos — Empresa Origen/Destino:** se separó el campo "Empresa" en "Empresa Origen" y "Empresa Destino" para registrar transferencias entre empresas del holding.
- **Ingresos — Remisión Origen/Destino:** se separó el campo "Remisión" en "Remisión Origen" y "Remisión Destino". Columnas de la hoja Ingresos: 12 en total.
- **Abreviaturas en dropdowns:** los selects de empresa muestran siglas (PARCELAR, GREEN, RESO, IASO, IAS) en lugar de nombres completos.
- **Devolución removida de Ingresos:** se quitó la opción "Devolución" del módulo de Ingresos (origen, estadísticas, filtros).
- **Módulo de Devoluciones independiente:** nuevo módulo completo (`devoluciones.html` + `js/devoluciones.js`) con CRUD, filtros, ordenamiento, autocompletado y tema naranja.
- **Devoluciones reestructuradas según formato OP-PDC-FO10:** el formulario incluye Empresa, Fecha, Consecutivo, Vendedor, N° Factura, datos del cliente (Cliente, NIT, Dirección, Municipio, Departamento, Teléfono), líneas de producto con Cantidad, Cantidad Entregada, Valor Unitario y Valor Total calculado automáticamente, Motivo Devolución y Observaciones. Hoja Devoluciones: 20 columnas.
- **Landing page actualizada:** tarjeta de módulo Devoluciones agregada al grid de `index.html`.
- **Navbar en todas las páginas:** Inicio, Pedidos, Ingresos, Devoluciones.

### Sistema multi-módulo + Ingresos v1.0 + Parser dinámico (2026-06-18, sesión 3)

- **Reestructuración multi-página:** el monolítico `index.html` (~1483 líneas) se separó en `index.html` (landing), `pedidos.html`, `ingresos.html`, `css/panel.css`, `js/shared.js`, `js/pedidos.js`, `js/ingresos.js`. Respaldo del original en `index_v7_backup.html`.
- **Landing page:** grid de módulos con Pedidos e Ingresos activos, Reportes y Usuarios marcados como "Próximamente". Título: "Sistema de Gestión Logística — Holding de empresas".
- **Módulo de Ingresos:** CRUD completo (crear, leer, editar, eliminar) conectado a Google Sheets hoja "Ingresos". Campos iniciales: Fecha, Origen, Empresa, Producto, Presentación, Cantidad, Responsable, Remisión, Observaciones.
- **Ingresos multi-línea:** el formulario de nuevo ingreso permite agregar múltiples líneas de producto en una sola operación con autocompletado.
- **Parser de Excel dinámico:** `parseOrderExcel()` reescrito para buscar etiquetas dinámicamente en vez de posiciones fijas. Funciona con formatos IASO (GC-ISO-FO01) y RESO (GC-SIR-FO01).

### v7.1 (2026-06-17, sesión 2)

- **Observaciones del Excel:** se extrae el texto de la fila OBSERVACIONES durante la importación. Se almacena en columna 30 del Sheet y se muestra en los modales de vista previa y detalle.
- **Remisiones editables:** nueva columna "Remisiones" en la tabla del modal de edición de pedidos.
- **Fix modal scroll:** los modales ya no se cierran al hacer clic en la barra de scroll. Se reemplazó `e.target === this` por `isBackdropClick(e)`.
- **API actualizada:** `agregarPedido` escribe `observaciones` en columna 30; `editarPedido` incluye `Remisiones` en campos editables; headers EXPECTED actualizados a 30 columnas.
