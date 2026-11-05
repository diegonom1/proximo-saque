#!/usr/bin/env python3
"""Prepara las fotos del sitio a partir de fotos-originales/.

Entrada: fotos-originales/<slug>/ y fotos-originales/seleccion/, con cualquier nombre y formato.
Si una carpeta trae varias fotos, el script elige: la más vertical para tarjeta.jpg y la más
horizontal para fondo.jpg. Para decidirlo tú, pon en el nombre del archivo "tarjeta", "fondo" o
"recorte" (en la Selección, "hero" o "movil").

Cada jugadora se recorta con los dos modelos y la hoja los muestra lado a lado. Por defecto
recorte.png usa birefnet-portrait; para usar el otro, escribe "general" en
fotos-originales/<slug>/modelo.txt. Cambiar ese archivo no repite el recorte.

Salida: src/assets/fotos/, una hoja fotos-originales/vista-previa.jpg y un resumen con avisos.

Este script solo recorta y redimensiona. No retoca las fotos ni quita marcas de agua.
Ojo: un recorte puede dejar fuera una marca de agua que esté en una orilla; revisa los créditos.
"""

import argparse
import hashlib
import io
import json
import multiprocessing
import os
import resource
import shutil
import sys
from pathlib import Path
import urllib.request

os.environ.setdefault("OPENCV_LOG_LEVEL", "ERROR")
os.environ.setdefault("U2NET_HOME", str(Path(__file__).resolve().parents[2] / ".venv/modelos"))

from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from dataclasses import dataclass, field
import cv2
import numpy as np
import pillow_heif
import psutil
from PIL import Image, ImageDraw, ImageFont, ImageOps

pillow_heif.register_heif_opener()
Image.MAX_IMAGE_PIXELS = 200_000_000

RAIZ = Path(__file__).resolve().parents[2]
ORIGINALES = RAIZ / "fotos-originales"
SALIDA = RAIZ / "src/assets/fotos"
CACHE = ORIGINALES / ".procesado.json"
VISTA_PREVIA = ORIGINALES / "vista-previa.jpg"
COMPARAR = ORIGINALES / ".comparar"
MODELOS = RAIZ / ".venv/modelos"

# Súbelo si cambia el proceso, para que todo se vuelva a generar.
VERSION = 2
# birefnet-portrait se concentra en la persona y puede morder lo que trae en las manos (un balón).
MODELO_DEFECTO = "birefnet-portrait"
MODELOS_RECORTE = (MODELO_DEFECTO, "birefnet-general")

# Memoria: no se carga un modelo con menos de esto disponible. Medido en 14 GB de RAM: cada modelo
# llega a 9.1 GB en la inferencia, sin importar hilos, arena ni tamaño de la foto, porque la red
# siempre trabaja a 1024 × 1024. Por eso el mínimo va por encima de ese pico.
MIN_MEMORIA_GB = 10
ONNX_HILOS = 4
# Lado largo de la copia para la inferencia.
INFERENCIA_LADO = 1600

EXTENSIONES = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif", ".tif", ".tiff", ".bmp"}

# Mínimos recomendados en CLAUDE.md.
MIN_TARJETA = (1000, 1250)
MIN_FONDO_LADO = 2000
MIN_RECORTE_ALTO = 1600
MIN_HERO_ANCHO = 2400
MIN_HERO_MOVIL = (1080, 1920)
MAX_MB = 5

ROSTRO_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
ROSTRO_SHA256 = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"

# Cuánto mide el recuadro de la tarjeta respecto a la cara, y dónde queda el centro de la cara.
CARA_A_ALTO = 5.0
CARA_POSICION = 0.30


@dataclass
class Cara:
    x: float
    y: float
    ancho: float
    alto: float

    @property
    def centro(self):
        return self.x + self.ancho / 2, self.y + self.alto / 2


@dataclass
class Foto:
    ruta: Path
    imagen: Image.Image
    caras: list = field(default_factory=list)

    @property
    def proporcion(self):
        return self.imagen.width / self.imagen.height

    @property
    def cara(self):
        return self.caras[0] if self.caras else None

    def personas(self):
        """Caras de tamaño parecido a la principal: las del fondo o las de la tribuna no cuentan."""
        return [c for c in self.caras if c.ancho >= self.caras[0].ancho * 0.5] if self.caras else []


# ---------- Geometría (funciones puras) ----------


def recuadro_tarjeta(ancho, alto, cara=None):
    """Recuadro 4:5 con la cara en el tercio de arriba. Devuelve (izq, arriba, der, abajo)."""
    alto_max = min(alto, ancho * 5 / 4)
    if cara is None:
        h = alto_max
        w = h * 4 / 5
        izq = (ancho - w) / 2
        return tuple(round(v) for v in (izq, 0, izq + w, h))

    cx, cy = cara.centro
    # Tan amplio como pide la cara, y hasta el mínimo recomendado si la foto alcanza.
    h = min(alto_max, max(cara.alto * CARA_A_ALTO, MIN_TARJETA[1]))
    arriba = max(0.0, cy - h * CARA_POSICION)
    if arriba + h > alto:
        # La cara está muy abajo en la foto: se aprieta el recuadro para mantenerla arriba.
        apretado = (alto - cy) / (1 - CARA_POSICION)
        if apretado >= cara.alto * 2:
            h = apretado
            arriba = cy - h * CARA_POSICION
        else:
            arriba = alto - h
    w = h * 4 / 5
    izq = min(max(0.0, cx - w / 2), ancho - w)
    return tuple(round(v) for v in (izq, arriba, izq + w, arriba + h))


def recuadro_proporcion(ancho, alto, proporcion, caras=()):
    """El recuadro más grande con esa proporción, centrado en las caras."""
    if ancho / alto > proporcion:
        h, w = alto, alto * proporcion
    else:
        w, h = ancho, ancho / proporcion
    if caras:
        cx = sum(c.centro[0] for c in caras) / len(caras)
        cy = sum(c.centro[1] for c in caras) / len(caras)
    else:
        cx, cy = ancho / 2, alto / 2
    izq = min(max(0.0, cx - w / 2), ancho - w)
    arriba = min(max(0.0, cy - h * 0.4), alto - h)
    return tuple(round(v) for v in (izq, arriba, izq + w, arriba + h))


def caras_fuera(recuadro, caras):
    izq, arriba, der, abajo = recuadro
    return sum(1 for c in caras if not (izq <= c.centro[0] <= der and arriba <= c.centro[1] <= abajo))


def foco_sugerido(ancho, alto, cara):
    cx, cy = cara.centro
    return f"{round(cx / ancho * 100)}% {round(cy / alto * 100)}%"


def interpretar_modelo(texto):
    """Lee modelo.txt: acepta "general" o "birefnet-general". Devuelve None si no lo reconoce."""
    limpio = texto.strip().lower()
    for modelo in MODELOS_RECORTE:
        if limpio in (modelo, modelo.removeprefix("birefnet-")):
            return modelo
    return None


def elegir(fotos, palabra, clave):
    """Una foto con la palabra en su nombre manda; si no, la de mayor `clave`."""
    for foto in fotos:
        if palabra in foto.ruta.stem.lower():
            return foto
    return max(fotos, key=clave)


# ---------- Lectura y modelos ----------


def huella(archivos):
    h = hashlib.sha256(str(VERSION).encode())
    for ruta in archivos:
        h.update(ruta.name.encode())
        h.update(ruta.read_bytes())
    return h.hexdigest()


def abrir(ruta):
    with Image.open(ruta) as original:
        icc = original.info.get("icc_profile")
        imagen = ImageOps.exif_transpose(original)
        if imagen.mode in ("RGBA", "LA", "P"):
            rgba = imagen.convert("RGBA")
            imagen = Image.new("RGB", rgba.size, "white")
            imagen.paste(rgba, mask=rgba.getchannel("A"))
        else:
            imagen = imagen.convert("RGB")
        if icc:
            imagen.info["icc_profile"] = icc
        return imagen


def modelo_rostros():
    ruta = MODELOS / "yunet.onnx"
    if not ruta.exists():
        ruta.parent.mkdir(parents=True, exist_ok=True)
        print("Descargando el detector de rostros (230 KB)...")
        with urllib.request.urlopen(ROSTRO_URL, timeout=60) as r:
            datos = r.read()
        if hashlib.sha256(datos).hexdigest() != ROSTRO_SHA256:
            sys.exit("El detector de rostros descargado no coincide con el esperado.")
        ruta.write_bytes(datos)
    return str(ruta)


def detectar_caras(imagen):
    """Caras de mayor a menor, en coordenadas de la imagen original."""
    escala = min(1.0, 1600 / max(imagen.size))
    chica = imagen.resize((round(imagen.width * escala), round(imagen.height * escala)))
    bgr = cv2.cvtColor(np.array(chica), cv2.COLOR_RGB2BGR)
    detector = cv2.FaceDetectorYN.create(modelo_rostros(), "", chica.size, 0.7, 0.3, 5000)
    _, resultado = detector.detect(bgr)
    if resultado is None:
        return []
    caras = [Cara(*(float(v) / escala for v in fila[:4])) for fila in resultado]
    return sorted(caras, key=lambda c: c.ancho * c.alto, reverse=True)


def falta_memoria(disponible, modelo):
    """Mensaje si no conviene cargar el modelo; None si alcanza. `disponible` va en bytes."""
    gb = disponible / 1024**3
    if gb >= MIN_MEMORIA_GB:
        return None
    return (f"{modelo}: no lo cargué porque hay {gb:.1f} GB de memoria disponibles y pido {MIN_MEMORIA_GB} GB. "
            "Cierra Chrome u otros programas y corre npm run fotos otra vez.")


def _mascara(png, modelo):
    """Corre en un proceso aparte. Devuelve la máscara en PNG y el pico de memoria en GB."""
    import onnxruntime as ort
    from rembg import new_session, remove

    opciones = ort.SessionOptions()
    opciones.enable_cpu_mem_arena = False
    opciones.enable_mem_pattern = False
    opciones.intra_op_num_threads = ONNX_HILOS
    opciones.inter_op_num_threads = 1
    sesion = new_session(modelo, opciones, providers=["CPUExecutionProvider"])
    mascara = remove(Image.open(io.BytesIO(png)), session=sesion, only_mask=True).convert("L")
    salida = io.BytesIO()
    mascara.save(salida, "PNG")
    return salida.getvalue(), resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**2


def calcular_mascara(imagen, modelo):
    """Un modelo ocupa varios GB: cada uno corre en su propio proceso, que al terminar los libera.
    Tener los dos cargados a la vez agotó la memoria de una máquina de 14 GB."""
    entrada = io.BytesIO()
    imagen.save(entrada, "PNG")
    print(f"  Recortando con {modelo} (la primera vez se descarga, cerca de 1 GB)...", flush=True)
    contexto = multiprocessing.get_context("spawn")
    with ProcessPoolExecutor(max_workers=1, mp_context=contexto) as proceso:
        png, pico = proceso.submit(_mascara, entrada.getvalue(), modelo).result()
    print(f"  {modelo}: pico de memoria {pico:.2f} GB", flush=True)
    return Image.open(io.BytesIO(png)).convert("L")


def limpiar_bordes(imagen, mascara):
    """Devuelve RGBA. La máscara no cambia; solo se limpia el color de los bordes, que trae
    mezclado el fondo original y se nota como halo sobre fondos oscuros."""
    from pymatting import estimate_foreground_ml

    alfa = np.asarray(mascara, dtype=np.float64) / 255
    color = estimate_foreground_ml(np.asarray(imagen, dtype=np.float64) / 255, alfa)
    rgba = np.dstack([np.clip(color, 0, 1), alfa]) * 255
    return Image.fromarray(rgba.round().astype(np.uint8), "RGBA")


# ---------- Generación ----------


def guardar_jpg(imagen, ruta, avisos):
    icc = imagen.info.get("icc_profile")
    extra = {"icc_profile": icc} if icc else {}
    imagen.save(ruta, "JPEG", quality=90, optimize=True, progressive=True, **extra)
    revisar_peso(ruta, avisos)


def revisar_peso(ruta, avisos):
    mb = ruta.stat().st_size / 1_000_000
    if mb > MAX_MB:
        avisos.append(f"{ruta.name} pesa {mb:.1f} MB (máximo {MAX_MB} MB).")


def recortar(foto, recuadro):
    recorte = foto.imagen.crop(recuadro)
    if "icc_profile" in foto.imagen.info:
        recorte.info["icc_profile"] = foto.imagen.info["icc_profile"]
    return recorte


def reducir(imagen, ancho, alto):
    """Solo reduce: nunca agranda una foto chica."""
    if imagen.width <= ancho and imagen.height <= alto:
        return imagen
    icc = imagen.info.get("icc_profile")
    copia = imagen.copy()
    copia.thumbnail((ancho, alto), Image.Resampling.LANCZOS)
    if icc:
        copia.info["icc_profile"] = icc
    return copia


def hacer_tarjeta(foto, destino, avisos):
    if not foto.cara:
        avisos.append(f"tarjeta.jpg: no encontré una cara en {foto.ruta.name}; recorté desde arriba al centro. Revísala.")
    recorte = recortar(foto, recuadro_tarjeta(*foto.imagen.size, foto.cara))
    if recorte.width < MIN_TARJETA[0] or recorte.height < MIN_TARJETA[1]:
        avisos.append(f"tarjeta.jpg: {recorte.width} × {recorte.height} px, debajo del mínimo {MIN_TARJETA[0]} × {MIN_TARJETA[1]}.")
    guardar_jpg(reducir(recorte, 1200, 1500), destino, avisos)


def hacer_fondo(foto, destino, avisos):
    lado = max(foto.imagen.size)
    if lado < MIN_FONDO_LADO:
        avisos.append(f"fondo.jpg: lado largo de {lado} px, debajo del mínimo {MIN_FONDO_LADO}.")
    guardar_jpg(reducir(foto.imagen, 2400, 2400), destino, avisos)
    if foto.cara:
        avisos.append(f"Sugerencia para fotos.foco: \"{foco_sugerido(*foto.imagen.size, foto.cara)}\".")


def hacer_recortes(foto, nombre, avisos):
    """Recorta con los dos modelos y deja los resultados en .comparar/<slug>/.

    La inferencia usa una copia reducida (el modelo trabaja a 1024 px de todos modos) y la máscara
    se aplica sobre la foto original. Los bordes se limpian ya recortados, que es mucho menos área.
    """
    if len(foto.personas()) > 1:
        avisos.append(f"recorte.png: {foto.ruta.name} tiene {len(foto.personas())} personas; el recorte puede dejarlas a todas.")
    carpeta = COMPARAR / nombre
    carpeta.mkdir(parents=True, exist_ok=True)
    original = foto.imagen.convert("RGB")
    copia = reducir(original, INFERENCIA_LADO, INFERENCIA_LADO)
    for modelo in MODELOS_RECORTE:
        aviso = falta_memoria(psutil.virtual_memory().available, modelo)
        if aviso:
            avisos.append(aviso)
            continue
        try:
            mascara = calcular_mascara(copia, modelo)
        except BrokenProcessPool:
            avisos.append(f"{modelo}: el proceso murió, seguramente por falta de memoria. Cierra programas y corre de nuevo.")
            continue
        cubierto = float(np.asarray(mascara).mean()) / 255
        if not 0.03 <= cubierto <= 0.9:
            avisos.append(f"{modelo}: quedó cubierto el {cubierto:.0%} de la imagen; seguramente salió mal. Revísalo.")
        if mascara.size != original.size:
            mascara = mascara.resize(original.size, Image.Resampling.LANCZOS)
        caja = mascara.point(lambda v: 255 if v > 8 else 0).getbbox() or (0, 0, *original.size)
        persona = reducir(original.crop(caja), 2400, MIN_RECORTE_ALTO)
        limpio = limpiar_bordes(persona, mascara.crop(caja).resize(persona.size, Image.Resampling.LANCZOS))
        limpio.save(carpeta / f"{modelo}.png", "PNG", optimize=True)


def aplicar_recorte(nombre, modelo, avisos):
    """recorte.png es una copia del modelo elegido: cambiar de modelo no vuelve a recortar."""
    destino = destino_de(nombre) / "recorte.png"
    origen = COMPARAR / nombre / f"{modelo}.png"
    if not origen.exists():
        avisos.append(f"recorte.png: todavía no hay recorte de {modelo}; corre npm run fotos otra vez.")
        return
    shutil.copyfile(origen, destino)
    with Image.open(destino) as imagen:
        alto = imagen.height
    if alto < MIN_RECORTE_ALTO:
        avisos.append(f"recorte.png: {alto} px de alto, debajo del mínimo {MIN_RECORTE_ALTO}.")
    revisar_peso(destino, avisos)


def hacer_jugadora(fotos, nombre, avisos):
    carpeta = destino_de(nombre)
    tarjeta = elegir(fotos, "tarjeta", lambda f: (f.cara is not None, -f.proporcion))
    fondo = elegir(fotos, "fondo", lambda f: (f.proporcion, f.imagen.width))
    recorte = elegir(fotos, "recorte", lambda f: (len(f.personas()) == 1, f.cara.alto if f.cara else 0))
    hacer_tarjeta(tarjeta, carpeta / "tarjeta.jpg", avisos)
    hacer_fondo(fondo, carpeta / "fondo.jpg", avisos)
    hacer_recortes(recorte, nombre, avisos)


def hacer_seleccion(fotos, nombre, avisos):
    carpeta = destino_de(nombre)
    escritorio = elegir(fotos, "hero", lambda f: (f.proporcion, f.imagen.width))
    movil = elegir(fotos, "movil", lambda f: (-f.proporcion, f.imagen.height))

    caras = escritorio.personas()
    recuadro = recuadro_proporcion(*escritorio.imagen.size, 16 / 9, caras)
    recorte = recortar(escritorio, recuadro)
    if recorte.width < MIN_HERO_ANCHO:
        avisos.append(f"hero.jpg: {recorte.width} px de ancho, debajo del mínimo {MIN_HERO_ANCHO}.")
    if caras_fuera(recuadro, caras):
        avisos.append(f"hero.jpg: {caras_fuera(recuadro, caras)} cara(s) quedaron fuera del recorte.")
    guardar_jpg(reducir(recorte, 2800, 2800), carpeta / "hero.jpg", avisos)

    caras = movil.personas()
    recuadro = recuadro_proporcion(*movil.imagen.size, 9 / 16, caras)
    recorte = recortar(movil, recuadro)
    if recorte.width < MIN_HERO_MOVIL[0] or recorte.height < MIN_HERO_MOVIL[1]:
        avisos.append(f"hero-movil.jpg: {recorte.width} × {recorte.height} px, debajo del mínimo {MIN_HERO_MOVIL[0]} × {MIN_HERO_MOVIL[1]}.")
    if caras_fuera(recuadro, caras):
        avisos.append(f"hero-movil.jpg: {caras_fuera(recuadro, caras)} cara(s) quedaron fuera; conviene una foto vertical.")
    guardar_jpg(reducir(recorte, 1440, 2560), carpeta / "hero-movil.jpg", avisos)


# ---------- Vista previa ----------


def fuente(tamano):
    # La fuente que trae Pillow no tiene acentos.
    for nombre in ("DejaVuSans.ttf", "LiberationSans-Regular.ttf", "Arial.ttf"):
        try:
            return ImageFont.truetype(nombre, tamano)
        except OSError:
            continue
    return ImageFont.load_default(size=tamano)


def sobre_cuadricula(imagen):
    """Pinta lo transparente como cuadrícula, para que se vean los bordes del recorte."""
    lienzo = Image.new("RGB", imagen.size, "#ffffff")
    dibujo = ImageDraw.Draw(lienzo)
    paso = 12
    for y in range(0, imagen.height, paso):
        for x in range((y // paso % 2) * paso, imagen.width, paso * 2):
            dibujo.rectangle((x, y, x + paso - 1, y + paso - 1), fill="#d6d6d6")
    lienzo.paste(imagen, mask=imagen.getchannel("A"))
    return lienzo


def miniatura(ruta, alto=300):
    imagen = Image.open(ruta)
    imagen = imagen.convert("RGBA") if ruta.suffix == ".png" else imagen.convert("RGB")
    imagen.thumbnail((alto * 2, alto), Image.Resampling.LANCZOS)
    if imagen.mode == "RGBA":
        imagen = sobre_cuadricula(imagen)
    if ruta.name == "tarjeta.jpg":
        y = imagen.height // 3
        ImageDraw.Draw(imagen).line((0, y, imagen.width, y), fill="#d1202f", width=1)
    return imagen


def piezas_de(nombre, carpeta):
    """Lo que va en la fila de una carpeta: (rótulo, ruta, ¿resaltar?)."""
    piezas = [(n, carpeta / n, False) for n in ("hero.jpg", "hero-movil.jpg", "tarjeta.jpg", "fondo.jpg") if (carpeta / n).exists()]
    actual = modelo_de(ORIGINALES / nombre, [])
    for modelo in MODELOS_RECORTE:
        ruta = COMPARAR / nombre / f"{modelo}.png"
        if ruta.exists():
            corto = modelo.removeprefix("birefnet-")
            piezas.append((f"{corto} (elegido)" if modelo == actual else corto, ruta, modelo == actual))
    return piezas


def hoja_vista_previa(carpetas, avisos):
    filas = []
    for nombre, carpeta in carpetas:
        piezas = piezas_de(nombre, carpeta)
        if piezas:
            filas.append((nombre, [(rotulo, miniatura(ruta), marca) for rotulo, ruta, marca in piezas], avisos.get(nombre, [])))
    if not filas:
        return None

    margen, etiqueta, renglon = 24, 26, 20
    ancho = max(sum(m.width + margen for _, m, _ in fotos) for _, fotos, _ in filas) + margen
    ancho = max(ancho, 900)
    alto = margen
    for _, fotos, textos in filas:
        alto += 34 + etiqueta + max(m.height for _, m, _ in fotos) + len(textos) * renglon + margen + 6
    hoja = Image.new("RGB", (ancho, alto), "#ffffff")
    d = ImageDraw.Draw(hoja)
    y = margen
    for nombre, fotos, textos in filas:
        d.text((margen, y), nombre, fill="#0e0e10", font=fuente(24))
        y += 34
        x = margen
        for rotulo, imagen, marca in fotos:
            d.text((x, y), rotulo, fill="#d1202f" if marca else "#6b6b70", font=fuente(14))
            hoja.paste(imagen, (x, y + etiqueta))
            x += imagen.width + margen
        y += etiqueta + max(m.height for _, m, _ in fotos) + 6
        for texto in textos:
            d.text((margen, y), f"! {texto}", fill="#d1202f", font=fuente(14))
            y += renglon
        y += margen
    hoja.save(VISTA_PREVIA, "JPEG", quality=85)
    return VISTA_PREVIA


# ---------- Corrida ----------


def destino_de(nombre):
    return SALIDA / "seleccion" if nombre == "seleccion" else SALIDA / "jugadoras" / nombre


def salidas_de(nombre):
    return ("hero.jpg", "hero-movil.jpg") if nombre == "seleccion" else ("tarjeta.jpg", "fondo.jpg")


def credito_pendiente(carpeta):
    ruta = carpeta / "credito.txt"
    if not ruta.exists():
        ruta.touch()
    return not ruta.read_text(encoding="utf-8").strip()


def modelo_de(origen, avisos):
    ruta = origen / "modelo.txt"
    if not ruta.exists():
        return MODELO_DEFECTO
    modelo = interpretar_modelo(ruta.read_text(encoding="utf-8"))
    if modelo is None:
        avisos.append(f"modelo.txt no dice \"portrait\" ni \"general\"; usé {MODELO_DEFECTO}.")
        return MODELO_DEFECTO
    return modelo


def procesar_carpeta(nombre, archivos, cache, forzar):
    """Devuelve (avisos, ¿se saltó?)."""
    carpeta = destino_de(nombre)
    carpeta.mkdir(parents=True, exist_ok=True)
    firma = huella(archivos)
    previo = cache.get(nombre, {})
    completo = all((carpeta / s).exists() for s in salidas_de(nombre))
    if nombre != "seleccion":
        completo = completo and all((COMPARAR / nombre / f"{m}.png").exists() for m in MODELOS_RECORTE)
    if not forzar and previo.get("huella") == firma and completo:
        return list(previo.get("avisos", [])), True

    avisos, fotos = [], []
    for ruta in archivos:
        try:
            imagen = abrir(ruta)
        except Exception:  # una foto dañada no debe detener a las demás
            avisos.append(f"No pude abrir {ruta.name}; ¿está dañada o en un formato raro?")
            continue
        fotos.append(Foto(ruta, imagen, detectar_caras(imagen)))
    if not fotos:
        return avisos, False

    (hacer_seleccion if nombre == "seleccion" else hacer_jugadora)(fotos, nombre, avisos)
    if nombre == "seleccion" or all((COMPARAR / nombre / f"{m}.png").exists() for m in MODELOS_RECORTE):
        cache[nombre] = {"huella": firma, "avisos": list(avisos)}
    return avisos, False


def main():
    argumentos = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    argumentos.add_argument("--forzar", action="store_true", help="vuelve a procesar aunque nada haya cambiado")
    argumentos.add_argument("--solo", metavar="SLUG", help="procesa solo esa carpeta")
    opciones = argumentos.parse_args()

    ORIGINALES.mkdir(exist_ok=True)
    slugs = {j["slug"] for j in json.loads((RAIZ / "data/jugadoras.json").read_text(encoding="utf-8"))}
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}

    carpetas = sorted(p for p in ORIGINALES.iterdir() if p.is_dir() and not p.name.startswith("."))
    if opciones.solo:
        carpetas = [p for p in carpetas if p.name == opciones.solo]
    if not carpetas:
        print(f"No hay fotos: deja las originales en {ORIGINALES.relative_to(RAIZ)}/<slug>/ o en seleccion/.")
        return

    avisos, procesadas, saltadas = {}, [], []
    for origen in carpetas:
        nombre = origen.name
        if nombre != "seleccion" and nombre not in slugs:
            avisos[nombre] = [f"La carpeta {nombre} no coincide con ningún slug de data/jugadoras.json; la salté."]
            continue
        archivos = sorted(p for p in origen.iterdir() if p.suffix.lower() in EXTENSIONES)
        if not archivos:
            avisos[nombre] = ["La carpeta no tiene fotos."]
            continue
        print(f"> {nombre}", flush=True)
        lista, salto = procesar_carpeta(nombre, archivos, cache, opciones.forzar)
        (saltadas if salto else procesadas).append(nombre)
        avisos[nombre] = list(lista)
        CACHE.write_text(json.dumps(cache, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if nombre != "seleccion" and (COMPARAR / nombre).exists():
            aplicar_recorte(nombre, modelo_de(origen, avisos[nombre]), avisos[nombre])
        if credito_pendiente(destino_de(nombre)):
            avisos[nombre].append("credito.txt está vacío: sin crédito la foto no se publica. Escribe \"Foto: autor o cuenta — URL\".")

    todas = [("seleccion", destino_de("seleccion"))] if (SALIDA / "seleccion").exists() else []
    todas += [(s, destino_de(s)) for s in sorted(slugs)]
    hoja = hoja_vista_previa(todas, avisos)

    print(f"\nProcesadas: {len(procesadas)} · sin cambios: {len(saltadas)}")
    if procesadas:
        print("Compara los recortes en la vista previa: revisa cabello, balón y personas de atrás.")
    for nombre, textos in avisos.items():
        for texto in textos:
            print(f"  ! {nombre}: {texto}")
    if hoja:
        print(f"\nVista previa: {hoja.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
