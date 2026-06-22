"""
FLUJO DE TRABAJO - PEDIDOS PARCELAR (Google Sheets)
====================================================
Procesa archivos Excel, imagenes y PDF de ordenes de pedido.
Envia la informacion a Google Sheets via Apps Script API.

Uso:
  python procesar_pedidos.py --scan          # Escanea y procesa todos los archivos nuevos
  python procesar_pedidos.py <archivo.xlsx>  # Procesa un unico archivo Excel
  python procesar_pedidos.py --json '...' --archivo 'ruta'  # Agrega datos de imagen/PDF
"""

import openpyxl
import os, json, sys, shutil, re
import urllib.request
from datetime import datetime


# ---- API Google Sheets -------------------------------------------------------
API_URL = 'https://script.google.com/macros/s/AKfycbwvHvKokrsTQv9Ot-LKC4Qmm4j2HSCS-aKQPmNT2XBjqSYWnkooIzS-LtWejJP7K3wHVQ/exec'


class _SafeEncoder(json.JSONEncoder):
    def default(self, o):
        if hasattr(o, 'isoformat'):
            return o.isoformat()
        return super().default(o)


def _api_post(body):
    payload = json.dumps(body, cls=_SafeEncoder).encode('utf-8')
    req = urllib.request.Request(API_URL, data=payload, method='POST')
    req.add_header('Content-Type', 'text/plain')
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode('utf-8'))


# ---- Rutas -------------------------------------------------------------------
PEDIDOS_DIR    = os.path.dirname(os.path.abspath(__file__))
PROCESADOS_DIR = os.path.join(PEDIDOS_DIR, "Procesados")
DUPLICADOS_DIR = os.path.join(PEDIDOS_DIR, "Pedidos_Duplicados")

SKIP_FILES  = {"Pedidos_Consolidados.xlsx", "procesar_pedidos.py",
               "Procesamiento_Pedidos.xlsx", "procesar_entregas.py"}
EXCEL_EXTS  = {".xlsx", ".xls"}
IMAGEN_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp", ".pdf"}


# ---- Parseo del archivo Excel ------------------------------------------------

def _find_selected_option(row, skip_col=0):
    labeled = [(i, v) for i, v in enumerate(row) if v is not None and i > skip_col]
    x_positions = [i for i, v in labeled if str(v).strip().lower() == "x"]
    if not x_positions:
        return None
    x_pos = x_positions[0]
    before = [(i, str(v).strip()) for i, v in labeled
              if str(v).strip().lower() != "x" and i < x_pos]
    if not before:
        return None
    return max(before, key=lambda c: c[0])[1]


def parse_excel(filepath):
    wb = openpyxl.load_workbook(filepath, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(min_row=1, values_only=True))

    def get(r, c):
        try:
            return rows[r][c]
        except IndexError:
            return None

    nombre_empresa  = get(3, 1)
    consecutivo     = get(5, 14)
    fecha           = get(6, 1)
    comercial       = get(6, 14)
    cliente         = get(7, 1)
    nit             = get(7, 14)
    telefono        = get(8, 14)
    direccion_envio = get(8, 1)
    municipio       = get(9, 1)
    departamento    = get(9, 14)

    plazo  = _find_selected_option(rows[11])
    precio = _find_selected_option(rows[12])

    prod_header = next((i for i, r in enumerate(rows) if r[0] == "PRODUCTOS"), None)
    obs_row     = next((i for i, r in enumerate(rows) if r[0] == "OBSERVACIONES"), None)
    total_row   = next(
        (i for i, r in enumerate(rows)
         if len(r) > 8 and isinstance(r[8], str) and "TOTAL A PAGAR" in r[8]), None)

    total_orden = rows[total_row][15] if total_row is not None else None

    productos = []
    if prod_header is not None and obs_row is not None:
        for r in rows[prod_header + 1:obs_row]:
            nombre = r[0] if len(r) > 0 else None
            if nombre is None:
                continue
            nombre_str = str(nombre)
            texto_tiene_bonif = bool(re.search(r'bonificado', nombre_str, re.IGNORECASE))
            producto_limpio = re.sub(r'\s*bonificado\s*', ' ', nombre_str, flags=re.IGNORECASE).strip() if texto_tiene_bonif else nombre_str
            v_unitario = r[10] if len(r) > 10 else None
            es_bonificado = texto_tiene_bonif or (v_unitario is not None and isinstance(v_unitario, (int, float)) and v_unitario > 0 and v_unitario < 10)
            productos.append({
                "producto":       producto_limpio,
                "presentacion":   r[1]  if len(r) > 1  else None,
                "cantidad":       r[5]  if len(r) > 5  else None,
                "valor_unitario": v_unitario,
                "valor_total":    r[15] if len(r) > 15 else None,
                "bonificado":     "Sí" if es_bonificado else "",
            })

    fecha_str = (
        fecha.strftime("%Y-%m-%d") if hasattr(fecha, "strftime")
        else str(fecha) if fecha else None
    )

    return {
        "nombre_empresa":     str(nombre_empresa).strip() if nombre_empresa else None,
        "consecutivo":        consecutivo,
        "fecha_pedido":       fecha_str,
        "cliente":            str(cliente).strip() if cliente else None,
        "nit":                nit,
        "telefono":           telefono,
        "direccion_envio":    str(direccion_envio).strip() if direccion_envio else None,
        "municipio":          str(municipio).strip() if municipio else None,
        "departamento":       str(departamento).strip() if departamento else None,
        "comercial":          str(comercial).strip() if comercial else None,
        "plazo_pago":         plazo,
        "precio_facturacion": precio,
        "total_orden":        total_orden,
        "productos":          productos,
        "archivo_fuente":     os.path.basename(filepath),
    }


# ---- Google Sheets: Agregar pedido -------------------------------------------

def agregar_pedido_sheets(data):
    body = dict(data)
    body['action'] = 'agregarPedido'
    result = _api_post(body)
    if not result.get('ok'):
        raise RuntimeError(result.get('error', 'Error desconocido en API'))
    return result


# ---- Deteccion de duplicados via API -----------------------------------------

def is_duplicate(data):
    consecutivo = str(data.get("consecutivo") or "").strip()
    cliente     = str(data.get("cliente")     or "").strip()
    if not consecutivo or not cliente:
        return False
    try:
        result = _api_post({
            "action": "checkDuplicado",
            "consecutivo": consecutivo,
            "cliente": cliente,
            "fecha_pedido": str(data.get("fecha_pedido") or "").strip(),
        })
        return result.get("duplicado", False)
    except Exception:
        return False


def _mover_duplicado(fpath, fname):
    os.makedirs(DUPLICADOS_DIR, exist_ok=True)
    dest = os.path.join(DUPLICADOS_DIR, fname)
    if os.path.exists(dest):
        ts   = datetime.now().strftime("%Y%m%d%H%M%S")
        base, ext = os.path.splitext(fname)
        dest = os.path.join(DUPLICADOS_DIR, base + "_" + ts + ext)
    shutil.move(fpath, dest)
    return dest


# ---- Escaneo de carpeta ------------------------------------------------------

def scan_and_process():
    os.makedirs(PROCESADOS_DIR, exist_ok=True)
    results  = []
    imagenes = []

    for fname in sorted(os.listdir(PEDIDOS_DIR)):
        if fname in SKIP_FILES or fname.startswith("~$"):
            continue
        fpath = os.path.join(PEDIDOS_DIR, fname)
        if not os.path.isfile(fpath):
            continue
        ext = os.path.splitext(fname)[1].lower()

        if ext in EXCEL_EXTS:
            try:
                data = parse_excel(fpath)
                if is_duplicate(data):
                    _mover_duplicado(fpath, fname)
                    results.append({
                        "tipo": "excel", "archivo": fname, "status": "duplicado",
                        "consecutivo": data["consecutivo"], "cliente": data["cliente"],
                    })
                else:
                    agregar_pedido_sheets(data)
                    dest = os.path.join(PROCESADOS_DIR, fname)
                    if os.path.exists(dest):
                        ts = datetime.now().strftime("%Y%m%d%H%M%S")
                        base, extension = os.path.splitext(fname)
                        dest = os.path.join(PROCESADOS_DIR, base + "_" + ts + extension)
                    shutil.move(fpath, dest)
                    results.append({
                        "tipo": "excel", "archivo": fname, "status": "procesado",
                        "consecutivo": data["consecutivo"], "cliente": data["cliente"],
                        "productos": len(data["productos"]), "total": data["total_orden"],
                    })
            except Exception as e:
                results.append({"tipo": "excel", "archivo": fname, "status": "error", "error": str(e)})

        elif ext in IMAGEN_EXTS:
            imagenes.append({"tipo": "imagen", "archivo": fname, "ruta": fpath, "status": "pendiente_vision"})

    return {"excel_procesados": results, "imagenes_pendientes": imagenes}


# ---- Agregar desde JSON (imagenes/PDF) ---------------------------------------

def process_from_json(json_str, filepath=None):
    data  = json.loads(json_str)
    fname = os.path.basename(filepath) if filepath else None
    if is_duplicate(data):
        if filepath and os.path.exists(filepath):
            _mover_duplicado(filepath, fname)
        return {"status": "duplicado", "archivo": fname,
                "consecutivo": data.get("consecutivo"), "cliente": data.get("cliente")}
    os.makedirs(PROCESADOS_DIR, exist_ok=True)
    agregar_pedido_sheets(data)
    if filepath and os.path.exists(filepath):
        dest = os.path.join(PROCESADOS_DIR, fname)
        if os.path.exists(dest):
            ts = datetime.now().strftime("%Y%m%d%H%M%S")
            base, ext = os.path.splitext(fname)
            dest = os.path.join(PROCESADOS_DIR, base + "_" + ts + ext)
        shutil.move(filepath, dest)
    return {"status": "ok", "archivo": fname}


# ---- CLI ---------------------------------------------------------------------

if __name__ == "__main__":
    args = sys.argv[1:]

    if not args or args[0] == "--scan":
        print(json.dumps(scan_and_process(), ensure_ascii=False, indent=2))

    elif args[0] == "--json":
        json_str = args[1] if len(args) > 1 else "{}"
        filepath = args[args.index("--archivo") + 1] if "--archivo" in args else None
        print(json.dumps(process_from_json(json_str, filepath), ensure_ascii=False))

    else:
        filepath = args[0]
        if not os.path.exists(filepath):
            print(json.dumps({"status": "error", "error": "Archivo no encontrado: " + filepath}))
            sys.exit(1)
        fname = os.path.basename(filepath)
        data  = parse_excel(filepath)
        if is_duplicate(data):
            _mover_duplicado(filepath, fname)
            print(json.dumps({
                "status": "duplicado", "archivo": fname,
                "consecutivo": data["consecutivo"], "cliente": data["cliente"],
            }, ensure_ascii=False))
        else:
            agregar_pedido_sheets(data)
            os.makedirs(PROCESADOS_DIR, exist_ok=True)
            dest = os.path.join(PROCESADOS_DIR, fname)
            if os.path.exists(dest):
                ts = datetime.now().strftime("%Y%m%d%H%M%S")
                base, ext = os.path.splitext(fname)
                dest = os.path.join(PROCESADOS_DIR, base + "_" + ts + ext)
            shutil.move(filepath, dest)
            print(json.dumps({
                "status": "ok", "archivo": fname,
                "consecutivo": data["consecutivo"], "cliente": data["cliente"],
                "productos": len(data["productos"]), "total": data["total_orden"],
            }, ensure_ascii=False))
