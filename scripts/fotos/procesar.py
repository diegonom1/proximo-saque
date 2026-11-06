#!/usr/bin/env python3
"""Prepara las fotos del sitio a partir de fotos-originales/.

Entrada: fotos-originales/<slug>/ y fotos-originales/seleccion/, con cualquier nombre y formato.
Si una carpeta trae varias fotos, el script elige: la más vertical para tarjeta.jpg y la más
horizontal para fondo.jpg. Para decidirlo tú, pon en el nombre del archivo "tarjeta", "fondo" o
"recorte" (en la Selección, "hero" o "movil").

Modelo del recorte: birefnet-general, o el que diga fotos-originales/<slug>/modelo.txt
("general" o "portrait"). Si cambias modelo.txt, la siguiente corrida recorta esa foto sola.
Con poca memoria baja a un modelo de reserva y lo dice en el resumen.

Una sola persona: del recorte solo queda la silueta conectada a la cara de la jugadora. Si sigue
pegada a alguien, fotos-originales/<slug>/caja.txt limita la zona antes de quitar el fondo, en
porcentaje de la foto: "20% 0% 80% 100%" (izquierda, arriba, derecha, abajo).

Cara: si el detector elige a otra persona, fotos-originales/<slug>/cara.txt dice dónde está la cara
de la jugadora, en porcentaje de la foto: "36% 39%".

Crédito: fotos-originales/<slug>/credito.txt se copia a src/assets/fotos/ al procesar. La plantilla
sin llenar cuenta como vacía. Si faltan carpetas de jugadoras, el script las crea con esa plantilla.

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
import re
import resource
import shutil
import sys
import time
import warnings
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
GUIA = Path(__file__).resolve().parent / "LEEME-originales.txt"
PLANTILLA_CREDITO = "Foto: autor o cuenta — URL"
MODELOS = RAIZ / ".venv/modelos"

# Súbelo si cambia el proceso, para que todo se vuelva a generar.
VERSION = 3
# birefnet-general dio el borde más nítido en una foto real. birefnet-portrait se concentra en la
# persona y puede morder lo que trae en las manos (un balón).
MODELO_DEFECTO = "birefnet-general"
MODELOS_RECORTE = (MODELO_DEFECTO, "birefnet-portrait")

# Memoria: no se carga un modelo con menos de esto disponible. Medido en 14 GB de RAM: cada modelo
# llega a 9.1 GB con la primera foto, sin importar hilos, arena ni tamaño de la foto, porque la red
# siempre trabaja a 1024 × 1024. En una corrida de 16 fotos birefnet-general llegó a 11.82 GB.
# Por eso el mínimo va por encima de ese pico.
MIN_MEMORIA_GB = 12

# Reservas, de mejor a peor, para no saltarse la foto cuando no alcanza. Medido en 7 fotos reales:
# birefnet-general-lite llega a 7.44 GB y casi no pierde calidad, pero acumula memoria entre fotos
# (pasó de 8.4 GB en la segunda): por eso corre en un proceso nuevo por foto.
# isnet-general-use llega a 1.71 GB, pero deja fantasmas y puede perder un brazo.
# u2net_human_seg se descartó: se come el balón.
MODELO_LIGERO = "birefnet-general-lite"
MODELO_MINIMO = "isnet-general-use"
RESERVAS = (MODELO_LIGERO, MODELO_MINIMO)
MEMORIA_GB = {MODELO_LIGERO: 8, MODELO_MINIMO: 3}
UN_PROCESO_POR_FOTO = {MODELO_LIGERO}

# Una sola persona: la máscara se parte con este corte y se conserva lo que esté a esta distancia
# de la silueta (fracción del lado largo), para no perder el borde suave ni el cabello.
CORTE_SILUETA = 96
BORDE_SILUETA = 0.006
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

# La cara del chip de la agenda: cuánto mide el recuadro respecto a la cara y su lado final.
CARA_CHIP = 1.9
CARA_CHIP_LADO = 192
# El encabezado de la agenda va a media pantalla: más que esto no se aprovecha.
AGENDA_LADO = 1600

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


def recuadro_cara(ancho, alto, cara):
    """Cuadrado centrado en la cara, sin salirse de la foto. Devuelve (izq, arriba, der, abajo)."""
    lado = min(cara.alto * CARA_CHIP, ancho, alto)
    cx, cy = cara.centro
    izq = min(max(0.0, cx - lado / 2), ancho - lado)
    arriba = min(max(0.0, cy - lado / 2), alto - lado)
    return tuple(round(v) for v in (izq, arriba, izq + lado, arriba + lado))


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
    for modelo in (*MODELOS_RECORTE, *RESERVAS):
        if limpio in (modelo, modelo.removeprefix("birefnet-")):
            return modelo
    return None


def interpretar_cara(texto):
    """Lee cara.txt: "36% 39%" es el centro de la cara. Devuelve (0.36, 0.39), o None si no se entiende."""
    partes = texto.replace("%", " ").split()
    try:
        x, y = (float(p) / 100 for p in partes)
    except ValueError:
        return None
    return (x, y) if 0 <= x <= 1 and 0 <= y <= 1 else None


def interpretar_caja(texto):
    """Lee caja.txt: "20% 0% 80% 100%" es izquierda, arriba, derecha y abajo. None si no se entiende."""
    partes = texto.replace("%", " ").split()
    try:
        izq, arriba, der, abajo = (float(p) / 100 for p in partes)
    except ValueError:
        return None
    return (izq, arriba, der, abajo) if 0 <= izq < der <= 1 and 0 <= arriba < abajo <= 1 else None


def una_sola_persona(mascara, caras):
    """Deja solo la silueta conectada a la cara principal, con su balón si lo trae en la mano.

    Devuelve (máscara, ¿se pudo elegir por la cara?, otras caras que siguen en la silueta).
    Sin cara no hay a quién seguir: queda la silueta más grande.
    """
    alfa = np.asarray(mascara)
    cuantas, etiquetas = cv2.connectedComponents((alfa >= CORTE_SILUETA).astype(np.uint8), connectivity=8)
    if cuantas < 2:
        return mascara, True, 0
    elegida = None
    if caras:
        cara = caras[0]
        izq, arriba = max(0, round(cara.x)), max(0, round(cara.y))
        zona = etiquetas[arriba:round(cara.y + cara.alto) + 1, izq:round(cara.x + cara.ancho) + 1]
        tocadas = zona[zona > 0]
        if tocadas.size:
            elegida = int(np.bincount(tocadas).argmax())
    encontrada = elegida is not None
    if not encontrada:
        elegida = int(np.bincount(etiquetas[etiquetas > 0]).argmax())
    silueta = (etiquetas == elegida).astype(np.uint8)
    otras = 0
    for cara in caras[1:]:
        x, y = (round(v) for v in cara.centro)
        if 0 <= y < silueta.shape[0] and 0 <= x < silueta.shape[1] and silueta[y, x]:
            otras += 1
    radio = max(2, round(max(mascara.size) * BORDE_SILUETA))
    cerca = cv2.dilate(silueta, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radio * 2 + 1, radio * 2 + 1)))
    return Image.fromarray(alfa * cerca, "L"), encontrada, otras


def cara_fijada(foto, posicion):
    """Una cara en esa posición, con un tamaño nominal: cara.txt solo dice dónde está."""
    lado = min(foto.imagen.size) / 10
    return Cara(posicion[0] * foto.imagen.width - lado / 2, posicion[1] * foto.imagen.height - lado / 2, lado, lado)


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
    minimo = MEMORIA_GB.get(modelo, MIN_MEMORIA_GB)
    if gb >= minimo:
        return None
    return (f"{modelo}: no lo cargué porque hay {gb:.1f} GB de memoria disponibles y pido {minimo} GB. "
            "Cierra Chrome u otros programas y corre npm run fotos otra vez.")


def memoria_disponible():
    return psutil.virtual_memory().available


def opciones_de(modelo):
    """El modelo pedido y sus reservas, de mejor a peor."""
    return (modelo, *(m for m in RESERVAS if m != modelo))


def modelo_posible(disponible, modelo):
    """El mejor modelo que cabe en la memoria disponible; None si no cabe ninguno."""
    return next((m for m in opciones_de(modelo) if falta_memoria(disponible, m) is None), None)


AVISO_RESERVA = "recorte.png: usé la reserva"


class MemoriaInsuficiente(Exception):
    pass


_sesion = None


def _mascara(png, modelo):
    """Corre en un proceso aparte, que conserva el modelo entre fotos.
    Devuelve la máscara en PNG y el pico de memoria en GB."""
    global _sesion
    import onnxruntime as ort
    from rembg import new_session, remove

    if _sesion is None:
        opciones = ort.SessionOptions()
        opciones.enable_cpu_mem_arena = False
        opciones.enable_mem_pattern = False
        opciones.intra_op_num_threads = ONNX_HILOS
        opciones.inter_op_num_threads = 1
        _sesion = new_session(modelo, opciones, providers=["CPUExecutionProvider"])
    with warnings.catch_warnings():
        # rembg calcula 1 / (1 + exp(-x)). Donde el modelo está muy seguro de que es fondo, exp se va
        # a infinito y el resultado es 0, que es lo correcto: la advertencia no significa un error.
        warnings.filterwarnings("ignore", message="overflow encountered in exp", category=RuntimeWarning)
        mascara = remove(Image.open(io.BytesIO(png)), session=_sesion, only_mask=True).convert("L")
    salida = io.BytesIO()
    mascara.save(salida, "PNG")
    return salida.getvalue(), resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**2


class Recortador:
    """Un solo modelo en memoria. Cada modelo corre en su propio proceso, que se cierra antes de
    cargar otro: tener los dos a la vez agotó la memoria de una máquina de 14 GB.
    Mientras no cambie el modelo, el proceso sigue vivo y no se vuelve a cargar."""

    def __init__(self):
        self.modelo = None
        self.proceso = None
        self.picos = {}

    def cargar(self, modelo):
        """Deja listo el mejor modelo que quepa, partiendo del que se pidió. Devuelve cuál fue."""
        self.cerrar()
        disponible = memoria_disponible()
        usar = modelo_posible(disponible, modelo)
        if usar is None:
            raise MemoriaInsuficiente(falta_memoria(disponible, RESERVAS[-1]))
        print(f"  Cargando {usar} (la primera vez se descarga)...", flush=True)
        self.proceso = ProcessPoolExecutor(max_workers=1, mp_context=multiprocessing.get_context("spawn"))
        self.modelo = usar
        return usar

    def mascara(self, imagen, modelo):
        """Devuelve la máscara y el modelo que la hizo, que puede ser una reserva."""
        usar = modelo if modelo == self.modelo else self.cargar(modelo)
        entrada = io.BytesIO()
        imagen.save(entrada, "PNG")
        try:
            png, pico = self.proceso.submit(_mascara, entrada.getvalue(), usar).result()
        except BrokenProcessPool:
            self.cerrar()
            raise
        self.picos[usar] = max(pico, self.picos.get(usar, 0))
        print(f"  Recorte con {usar} (pico de memoria {pico:.2f} GB)", flush=True)
        if usar in UN_PROCESO_POR_FOTO:
            self.cerrar()
        return Image.open(io.BytesIO(png)).convert("L"), usar

    def cerrar(self):
        if self.proceso:
            self.proceso.shutdown()
        self.proceso = None
        self.modelo = None


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


def hacer_cara(foto, destino, avisos):
    if not foto.cara:
        avisos.append(f"cara.jpg: no encontré una cara en {foto.ruta.name}; el chip de la agenda sale con iniciales.")
        return
    recorte = recortar(foto, recuadro_cara(*foto.imagen.size, foto.cara))
    guardar_jpg(reducir(recorte, CARA_CHIP_LADO, CARA_CHIP_LADO), destino, avisos)


def hacer_fondo(foto, destino, avisos):
    lado = max(foto.imagen.size)
    if lado < MIN_FONDO_LADO:
        avisos.append(f"fondo.jpg: lado largo de {lado} px, debajo del mínimo {MIN_FONDO_LADO}.")
    guardar_jpg(reducir(foto.imagen, 2400, 2400), destino, avisos)
    if foto.cara:
        avisos.append(f"Sugerencia para fotos.foco: \"{foco_sugerido(*foto.imagen.size, foto.cara)}\".")


def zona_de_recorte(foto, origen, avisos):
    """La foto limitada a caja.txt, con sus caras en las coordenadas nuevas. Sin caja, la misma foto."""
    ruta = origen / "caja.txt"
    if not ruta.exists():
        return foto
    caja = interpretar_caja(ruta.read_text(encoding="utf-8"))
    if caja is None:
        avisos.append('caja.txt no dice qué zona usar; escribe algo como "20% 0% 80% 100%".')
        return foto
    ancho, alto = foto.imagen.size
    izq, arriba, der, abajo = round(caja[0] * ancho), round(caja[1] * alto), round(caja[2] * ancho), round(caja[3] * alto)
    caras = [Cara(c.x - izq, c.y - arriba, c.ancho, c.alto) for c in foto.caras if izq <= c.centro[0] <= der and arriba <= c.centro[1] <= abajo]
    if not caras:
        avisos.append("caja.txt deja fuera la cara de la jugadora; revísalo.")
    return Foto(foto.ruta, recortar(foto, (izq, arriba, der, abajo)), caras)


def hacer_recortes(foto, nombre, modelos, recortador, avisos):
    """Deja en .comparar/<slug>/ un recorte por modelo.

    La inferencia usa una copia reducida (el modelo trabaja a 1024 px de todos modos) y la máscara
    se aplica sobre la foto original. Los bordes se limpian ya recortados, que es mucho menos área.
    """
    foto = zona_de_recorte(foto, ORIGINALES / nombre, avisos)
    carpeta = COMPARAR / nombre
    carpeta.mkdir(parents=True, exist_ok=True)
    original = foto.imagen.convert("RGB")
    copia = reducir(original, INFERENCIA_LADO, INFERENCIA_LADO)
    for modelo in modelos:
        try:
            mascara, usado = recortador.mascara(copia, modelo)
        except MemoriaInsuficiente as error:
            avisos.append(str(error))
            continue
        except BrokenProcessPool:
            avisos.append(f"{modelo}: el proceso murió, seguramente por falta de memoria. Cierra programas y corre de nuevo.")
            continue
        if usado != modelo:
            avisos.append(f"{AVISO_RESERVA} {usado}: no alcanzó la memoria para {modelo}.")
        if mascara.size != original.size:
            mascara = mascara.resize(original.size, Image.Resampling.LANCZOS)
        mascara, encontrada, otras = una_sola_persona(mascara, foto.caras)
        if not encontrada:
            avisos.append(f"{usado}: no encontré su silueta en la cara; dejé la más grande. Revisa cara.txt.")
        if otras:
            avisos.append(f"{usado}: la silueta sigue pegada a {otras} persona(s) más; define caja.txt.")
        cubierto = float(np.asarray(mascara).mean()) / 255
        if not 0.03 <= cubierto <= 0.9:
            avisos.append(f"{usado}: quedó cubierto el {cubierto:.0%} de la imagen; seguramente salió mal. Revísalo.")
        caja = mascara.point(lambda v: 255 if v > 8 else 0).getbbox() or (0, 0, *original.size)
        persona = reducir(original.crop(caja), 2400, MIN_RECORTE_ALTO)
        limpio = limpiar_bordes(persona, mascara.crop(caja).resize(persona.size, Image.Resampling.LANCZOS))
        limpio.save(carpeta / f"{usado}.png", "PNG", optimize=True)
        if usado != modelo:
            break  # con poca memoria los demás caerían en la misma reserva


def recorte_hecho(nombre, modelo):
    """El mejor recorte que ya existe para ese modelo o sus reservas; None si no hay."""
    return next((m for m in opciones_de(modelo) if (COMPARAR / nombre / f"{m}.png").exists()), None)


def falta_recorte(nombre, modelo, disponible):
    """¿Hay que correr el modelo? No si lo mejor que cabe hoy no supera lo que ya está hecho."""
    hecho = recorte_hecho(nombre, modelo)
    if hecho is None:
        return True
    posible = modelo_posible(disponible, modelo)
    orden = opciones_de(modelo)
    return posible is not None and orden.index(posible) < orden.index(hecho)


def aplicar_recorte(nombre, modelo, avisos):
    """recorte.png es una copia del modelo elegido: cambiar de modelo no vuelve a recortar."""
    destino = destino_de(nombre) / "recorte.png"
    hecho = recorte_hecho(nombre, modelo)
    if hecho is None:
        avisos.append(f"recorte.png: todavía no hay recorte de {modelo}; corre npm run fotos otra vez.")
        return
    shutil.copyfile(COMPARAR / nombre / f"{hecho}.png", destino)
    with Image.open(destino) as imagen:
        alto = imagen.height
    if alto < MIN_RECORTE_ALTO:
        avisos.append(f"recorte.png: {alto} px de alto, debajo del mínimo {MIN_RECORTE_ALTO}.")
    revisar_peso(destino, avisos)


def hacer_jugadora(fotos, nombre, avisos):
    carpeta = destino_de(nombre)
    tarjeta = elegir(fotos, "tarjeta", lambda f: (f.cara is not None, -f.proporcion))
    fondo = elegir(fotos, "fondo", lambda f: (f.proporcion, f.imagen.width))
    hacer_tarjeta(tarjeta, carpeta / "tarjeta.jpg", avisos)
    hacer_fondo(fondo, carpeta / "fondo.jpg", avisos)
    hacer_cara(tarjeta, carpeta / "cara.jpg", avisos)


def foto_de_recorte(fotos):
    return elegir(fotos, "recorte", lambda f: (len(f.personas()) == 1, f.cara.alto if f.cara else 0))


def es_de_agenda(foto):
    """seleccion1, seleccion2… son del encabezado de la agenda, no del hero."""
    return re.fullmatch(r"seleccion\d+", foto.ruta.stem.lower()) is not None


def hacer_agenda(fotos, carpeta, avisos):
    for numero, foto in enumerate(sorted(filter(es_de_agenda, fotos), key=lambda f: f.ruta.name), 1):
        guardar_jpg(reducir(foto.imagen, AGENDA_LADO, AGENDA_LADO), carpeta / f"agenda-{numero}.jpg", avisos)


def hacer_seleccion(fotos, nombre, avisos):
    carpeta = destino_de(nombre)
    hacer_agenda(fotos, carpeta, avisos)
    fotos = [f for f in fotos if not es_de_agenda(f)] or fotos
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


def piezas_de(nombre, carpeta, comparar):
    """Lo que va en la fila de una carpeta: (rótulo, ruta, ¿resaltar?)."""
    piezas = [(n, carpeta / n, False) for n in ("hero.jpg", "hero-movil.jpg", "tarjeta.jpg", "fondo.jpg") if (carpeta / n).exists()]
    pedido = modelo_de(ORIGINALES / nombre, [])
    actual = recorte_hecho(nombre, pedido) or pedido
    if not comparar:
        if (carpeta / "recorte.png").exists():
            piezas.append((f"recorte ({actual.removeprefix('birefnet-')})", carpeta / "recorte.png", False))
        return piezas
    for modelo in (*MODELOS_RECORTE, *RESERVAS):
        ruta = COMPARAR / nombre / f"{modelo}.png"
        if ruta.exists():
            corto = modelo.removeprefix("birefnet-")
            piezas.append((f"{corto} (elegido)" if modelo == actual else corto, ruta, modelo == actual))
    return piezas


def hoja_vista_previa(carpetas, avisos, comparar):
    filas = []
    for nombre, carpeta in carpetas:
        piezas = piezas_de(nombre, carpeta, comparar)
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


def credito_lleno(texto):
    """La plantilla sin llenar no es un crédito."""
    limpio = texto.replace("\ufeff", "").strip()
    return bool(limpio) and limpio != PLANTILLA_CREDITO


def credito_pendiente(carpeta):
    ruta = carpeta / "credito.txt"
    if not ruta.exists():
        ruta.touch()
    return not credito_lleno(ruta.read_text(encoding="utf-8"))


def pasar_credito(nombre):
    """Copia el crédito de fotos-originales/. Sin llenar no pisa lo que ya hubiera en el sitio."""
    origen = ORIGINALES / nombre / "credito.txt"
    texto = origen.read_text(encoding="utf-8") if origen.exists() else ""
    if not credito_lleno(texto):
        return
    destino = destino_de(nombre)
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "credito.txt").write_text(texto.replace("\ufeff", "").strip() + "\n", encoding="utf-8")


def preparar_carpetas(slugs):
    """Una carpeta por jugadora y la de la Selección, con su credito.txt. Lo que ya existe no se toca."""
    creados = []
    for nombre in ["seleccion", *sorted(slugs)]:
        carpeta = ORIGINALES / nombre
        carpeta.mkdir(parents=True, exist_ok=True)
        credito = carpeta / "credito.txt"
        if not credito.exists():
            credito.write_text(PLANTILLA_CREDITO + "\n", encoding="utf-8")
            creados.append(nombre)
    guia = ORIGINALES / "LEEME.txt"
    if not guia.exists():
        shutil.copyfile(GUIA, guia)
    return creados


def modelo_de(origen, avisos):
    ruta = origen / "modelo.txt"
    if not ruta.exists():
        return MODELO_DEFECTO
    modelo = interpretar_modelo(ruta.read_text(encoding="utf-8"))
    if modelo is None:
        avisos.append(f"modelo.txt no dice \"portrait\" ni \"general\"; usé {MODELO_DEFECTO}.")
        return MODELO_DEFECTO
    return modelo


def fijar_cara(fotos, origen, avisos):
    """cara.txt manda sobre el detector: esa cara pasa a ser la principal."""
    ruta = origen / "cara.txt"
    if not ruta.exists():
        return
    posicion = interpretar_cara(ruta.read_text(encoding="utf-8"))
    if posicion is None:
        avisos.append('cara.txt no dice dónde está la cara; escribe algo como "36% 39%".')
        return
    for foto in fotos:
        foto.caras.insert(0, cara_fijada(foto, posicion))


def abrir_fotos(archivos, avisos):
    fotos = []
    for ruta in archivos:
        try:
            imagen = abrir(ruta)
        except Exception:  # una foto dañada no debe detener a las demás
            avisos.append(f"No pude abrir {ruta.name}; ¿está dañada o en un formato raro?")
            continue
        fotos.append(Foto(ruta, imagen, detectar_caras(imagen)))
    return fotos


def procesar_seleccion(archivos, firma, previo, cache, forzar):
    nombre = "seleccion"
    completo = all((destino_de(nombre) / s).exists() for s in salidas_de(nombre))
    if not forzar and previo.get("huella") == firma and completo:
        return list(previo.get("avisos", [])), True
    avisos = []
    fotos = abrir_fotos(archivos, avisos)
    if fotos:
        hacer_seleccion(fotos, nombre, avisos)
        cache[nombre] = {"huella": firma, "avisos": list(avisos)}
    return avisos, False


def procesar_carpeta(nombre, archivos, cache, recortador, forzar=False, comparar=False):
    """Hace solo lo que falta. Devuelve (avisos, ¿no hubo nada que hacer?)."""
    carpeta = destino_de(nombre)
    carpeta.mkdir(parents=True, exist_ok=True)
    ajustes = [ORIGINALES / nombre / n for n in ("cara.txt", "caja.txt")]
    firma = huella([*archivos, *(a for a in ajustes if a.exists())])
    previo = cache.get(nombre, {})
    if nombre == "seleccion":
        return procesar_seleccion(archivos, firma, previo, cache, forzar)

    avisos_modelo = []
    modelo = modelo_de(ORIGINALES / nombre, avisos_modelo)
    cambio_foto = forzar or previo.get("huella") != firma or not all((carpeta / s).exists() for s in salidas_de(nombre))
    if cambio_foto:
        for viejo in (COMPARAR / nombre).glob("*.png"):
            viejo.unlink()
    pedidos = MODELOS_RECORTE if comparar else (modelo,)
    disponible = memoria_disponible()
    faltan = [m for m in pedidos if falta_recorte(nombre, m, disponible)]

    if not cambio_foto and not faltan:
        avisos = list(previo.get("avisos", [])) + avisos_modelo
        if not (carpeta / "cara.jpg").exists():
            fotos = abrir_fotos(archivos, avisos)
            fijar_cara(fotos, ORIGINALES / nombre, avisos)
            if fotos:
                hacer_cara(elegir(fotos, "tarjeta", lambda f: (f.cara is not None, -f.proporcion)), carpeta / "cara.jpg", avisos)
        aplicar_recorte(nombre, modelo, avisos)
        sin_cambios = previo.get("modelo") == modelo
        cache[nombre] = {**previo, "modelo": modelo}
        return avisos, sin_cambios

    avisos = [] if cambio_foto else [a for a in previo.get("avisos", []) if not a.startswith(AVISO_RESERVA)]
    fotos = abrir_fotos(archivos, avisos)
    if not fotos:
        return avisos + avisos_modelo, False
    fijar_cara(fotos, ORIGINALES / nombre, avisos)
    if cambio_foto:
        hacer_jugadora(fotos, nombre, avisos)
    hacer_recortes(foto_de_recorte(fotos), nombre, faltan, recortador, avisos)
    guardados = [a for a in avisos if "no lo cargué" not in a]
    if recorte_hecho(nombre, modelo):
        cache[nombre] = {"huella": firma, "modelo": modelo, "avisos": guardados}
    avisos += avisos_modelo
    aplicar_recorte(nombre, modelo, avisos)
    return avisos, False


def segundos(inicio):
    return f"{time.monotonic() - inicio:.1f} s"


def main():
    argumentos = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Ejemplos:\n  npm run fotos\n  npm run fotos -- --comparar --solo samantha-bricio\n  npm run fotos -- --forzar",
    )
    argumentos.add_argument("--comparar", action="store_true", help="recorta con los dos modelos y los pone lado a lado en la hoja de vista previa")
    argumentos.add_argument("--forzar", action="store_true", help="vuelve a procesar aunque nada haya cambiado")
    argumentos.add_argument("--solo", metavar="SLUG", help="procesa solo esa carpeta")
    argumentos.add_argument("--carpetas", action="store_true", help="solo crea las carpetas que falten en fotos-originales/, sin procesar nada")
    opciones = argumentos.parse_args()

    ORIGINALES.mkdir(exist_ok=True)
    jugadoras = json.loads((RAIZ / "data/jugadoras.json").read_text(encoding="utf-8"))
    slugs = {j["slug"] for j in jugadoras}
    creados = preparar_carpetas({j["slug"] for j in jugadoras if j["estado"] != "exseleccionada"})
    if creados:
        print(f"credito.txt creado en: {', '.join(creados)}")
    if opciones.carpetas:
        return
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}

    carpetas = sorted(p for p in ORIGINALES.iterdir() if p.is_dir() and not p.name.startswith("."))
    if opciones.solo:
        carpetas = [p for p in carpetas if p.name == opciones.solo]
    if not carpetas:
        print(f"No hay fotos: deja las originales en {ORIGINALES.relative_to(RAIZ)}/<slug>/ o en seleccion/.")
        return

    inicio_total = time.monotonic()
    recortador = Recortador()
    avisos, procesadas, saltadas, sin_fotos = {}, [], [], []
    try:
        for numero, origen in enumerate(carpetas, 1):
            nombre = origen.name
            print(f"[{numero}/{len(carpetas)}] {nombre}", flush=True)
            if nombre != "seleccion" and nombre not in slugs:
                avisos[nombre] = [f"La carpeta {nombre} no coincide con ningún slug de data/jugadoras.json; la salté."]
                print("  saltada: no es un slug", flush=True)
                continue
            archivos = sorted(p for p in origen.iterdir() if p.suffix.lower() in EXTENSIONES)
            if not archivos:
                sin_fotos.append(nombre)  # lo normal: las carpetas ya están listas antes que las fotos
                print("  sin fotos", flush=True)
                continue
            inicio = time.monotonic()
            lista, salto = procesar_carpeta(nombre, archivos, cache, recortador, opciones.forzar, opciones.comparar)
            (saltadas if salto else procesadas).append(nombre)
            avisos[nombre] = list(lista)
            CACHE.write_text(json.dumps(cache, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            pasar_credito(nombre)
            if credito_pendiente(destino_de(nombre)):
                avisos[nombre].append(f"Falta el crédito: llena fotos-originales/{nombre}/credito.txt. Sin crédito la foto no se publica.")
            print(f"  {'sin cambios' if salto else 'lista'} en {segundos(inicio)}", flush=True)
    finally:
        recortador.cerrar()

    todas = [("seleccion", destino_de("seleccion"))] if (SALIDA / "seleccion").exists() else []
    todas += [(s, destino_de(s)) for s in sorted(slugs)]
    hoja = hoja_vista_previa(todas, avisos, opciones.comparar)

    print(f"\nProcesadas: {len(procesadas)} · sin cambios: {len(saltadas)} · sin fotos: {len(sin_fotos)} · total: {segundos(inicio_total)}")
    con_reserva = sorted(n for n, textos in avisos.items() if any(t.startswith(AVISO_RESERVA) for t in textos))
    if con_reserva:
        print(f"Con modelo de reserva por falta de memoria ({len(con_reserva)}): {', '.join(con_reserva)}")
    for modelo, pico in recortador.picos.items():
        print(f"Pico de memoria de {modelo}: {pico:.2f} GB")
    if procesadas:
        print("Revisa en la vista previa el cabello, el balón y a las personas de atrás.")
    for nombre, textos in avisos.items():
        for texto in textos:
            print(f"  ! {nombre}: {texto}")
    if hoja:
        print(f"\nVista previa: {hoja.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
