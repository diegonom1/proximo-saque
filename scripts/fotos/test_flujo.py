"""Flujo de procesar_carpeta con un recortador falso: no carga modelos ni necesita memoria."""

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

import procesar


class RecortadorFalso:
    def __init__(self, sin_memoria=False):
        self.llamadas = []
        self.sin_memoria = sin_memoria

    def mascara(self, imagen, modelo):
        if self.sin_memoria:
            raise procesar.MemoriaInsuficiente(procesar.falta_memoria(1024**3, modelo))
        self.llamadas.append(modelo)
        mascara = Image.new("L", imagen.size, 0)
        mascara.paste(255, (imagen.width // 4, imagen.height // 4, imagen.width * 3 // 4, imagen.height * 3 // 4))
        return mascara


class Flujo(unittest.TestCase):
    def setUp(self):
        temporal = tempfile.TemporaryDirectory()
        self.addCleanup(temporal.cleanup)
        raiz = Path(temporal.name)
        self.origen = raiz / "originales/ana"
        self.origen.mkdir(parents=True)
        for nombre, valor in (("ORIGINALES", raiz / "originales"), ("SALIDA", raiz / "salida"), ("COMPARAR", raiz / "originales/.comparar")):
            parche = mock.patch.object(procesar, nombre, valor)
            parche.start()
            self.addCleanup(parche.stop)
        parche = mock.patch.object(procesar, "detectar_caras", lambda imagen: [])
        parche.start()
        self.addCleanup(parche.stop)
        self.foto = self.origen / "foto.jpg"
        Image.new("RGB", (300, 400), "#336699").save(self.foto)
        self.cache = {}
        self.salida = raiz / "salida/jugadoras/ana"

    def correr(self, recortador=None, **opciones):
        recortador = recortador or RecortadorFalso()
        avisos, salto = procesar.procesar_carpeta("ana", [self.foto], self.cache, recortador, **opciones)
        return recortador, avisos, salto

    def test_por_defecto_un_solo_modelo_general(self):
        r, _, salto = self.correr()
        self.assertEqual(r.llamadas, ["birefnet-general"])
        self.assertFalse(salto)
        self.assertTrue((self.salida / "recorte.png").exists())

    def test_sin_cambios_no_recorta(self):
        self.correr()
        r, _, salto = self.correr()
        self.assertEqual(r.llamadas, [])
        self.assertTrue(salto)

    def test_cambiar_modelo_reprocesa_sin_forzar(self):
        self.correr()
        (self.origen / "modelo.txt").write_text("portrait")
        r, _, salto = self.correr()
        self.assertEqual(r.llamadas, ["birefnet-portrait"])
        self.assertFalse(salto)

    def test_volver_a_un_modelo_ya_hecho_no_recorta_y_no_cuenta_como_sin_cambios(self):
        self.correr()
        (self.origen / "modelo.txt").write_text("portrait")
        self.correr()
        (self.origen / "modelo.txt").write_text("general")
        r, _, salto = self.correr()
        self.assertEqual(r.llamadas, [])
        self.assertFalse(salto)
        _, _, salto = self.correr()
        self.assertTrue(salto)

    def test_comparar_hace_los_dos_una_vez(self):
        r, _, _ = self.correr(comparar=True)
        self.assertEqual(sorted(r.llamadas), ["birefnet-general", "birefnet-portrait"])
        r, _, salto = self.correr(comparar=True)
        self.assertEqual(r.llamadas, [])
        self.assertTrue(salto)

    def test_comparar_despues_solo_agrega_el_que_falta(self):
        self.correr()
        r, _, _ = self.correr(comparar=True)
        self.assertEqual(r.llamadas, ["birefnet-portrait"])

    def test_foto_nueva_descarta_recortes_viejos(self):
        self.correr(comparar=True)
        Image.new("RGB", (300, 400), "#993366").save(self.foto)
        r, _, _ = self.correr()
        self.assertEqual(r.llamadas, ["birefnet-general"])
        self.assertFalse((procesar.COMPARAR / "ana/birefnet-portrait.png").exists())

    def test_forzar_repite(self):
        self.correr()
        r, _, _ = self.correr(forzar=True)
        self.assertEqual(r.llamadas, ["birefnet-general"])

    def test_sin_memoria_avisa_y_reintenta_la_siguiente_vez(self):
        _, avisos, _ = self.correr(RecortadorFalso(sin_memoria=True))
        self.assertTrue(any("no lo cargué" in a for a in avisos))
        self.assertFalse((self.salida / "recorte.png").exists())
        r, _, _ = self.correr()
        self.assertEqual(r.llamadas, ["birefnet-general"])


class CaraFijada(unittest.TestCase):
    def foto(self, caras=()):
        return procesar.Foto(Path("a.jpg"), Image.new("RGB", (1000, 2000)), list(caras))

    def test_lee_el_porcentaje(self):
        self.assertEqual(procesar.interpretar_cara("36% 39%\n"), (0.36, 0.39))

    def test_rechaza_lo_que_no_entiende(self):
        for texto in ("", "36%", "a b", "150% 20%", "1 2 3"):
            self.assertIsNone(procesar.interpretar_cara(texto), texto)

    def test_manda_sobre_el_detector(self):
        with tempfile.TemporaryDirectory() as temporal:
            origen = Path(temporal)
            (origen / "cara.txt").write_text("30% 40%", encoding="utf-8")
            otra = procesar.Cara(800, 1800, 100, 100)
            foto = self.foto([otra])
            procesar.fijar_cara([foto], origen, [])
        self.assertEqual(foto.cara.centro, (300, 800))
        self.assertIn(otra, foto.caras)

    def test_avisa_si_no_lo_entiende(self):
        with tempfile.TemporaryDirectory() as temporal:
            origen = Path(temporal)
            (origen / "cara.txt").write_text("arriba", encoding="utf-8")
            foto, avisos = self.foto(), []
            procesar.fijar_cara([foto], origen, avisos)
        self.assertEqual(foto.caras, [])
        self.assertEqual(len(avisos), 1)


class Credito(unittest.TestCase):
    def setUp(self):
        temporal = tempfile.TemporaryDirectory()
        self.addCleanup(temporal.cleanup)
        self.raiz = Path(temporal.name)
        for nombre, valor in (("ORIGINALES", self.raiz / "originales"), ("SALIDA", self.raiz / "salida")):
            parche = mock.patch.object(procesar, nombre, valor)
            parche.start()
            self.addCleanup(parche.stop)
        self.origen = self.raiz / "originales/ana"
        self.origen.mkdir(parents=True)
        self.destino = self.raiz / "salida/jugadoras/ana/credito.txt"

    def escribir(self, ruta, texto):
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text(texto, encoding="utf-8")

    def test_la_plantilla_no_es_un_credito(self):
        self.assertFalse(procesar.credito_lleno(procesar.PLANTILLA_CREDITO + "\n"))
        self.assertFalse(procesar.credito_lleno("\ufeff  \n"))
        self.assertTrue(procesar.credito_lleno("Foto: FMVB — https://fmvb.org"))

    def test_copia_el_credito_lleno(self):
        self.escribir(self.origen / "credito.txt", "\ufeffFoto: FMVB — https://fmvb.org\n\n")
        procesar.pasar_credito("ana")
        self.assertEqual(self.destino.read_text(encoding="utf-8"), "Foto: FMVB — https://fmvb.org\n")

    def test_un_credito_nuevo_reemplaza_al_anterior(self):
        self.escribir(self.destino, "Foto: vieja\n")
        self.escribir(self.origen / "credito.txt", "Foto: nueva\n")
        procesar.pasar_credito("ana")
        self.assertEqual(self.destino.read_text(encoding="utf-8"), "Foto: nueva\n")

    def test_la_plantilla_no_llega_al_sitio_ni_pisa_lo_que_hay(self):
        self.escribir(self.origen / "credito.txt", procesar.PLANTILLA_CREDITO + "\n")
        procesar.pasar_credito("ana")
        self.assertFalse(self.destino.exists())
        self.escribir(self.destino, "Foto: escrita a mano\n")
        procesar.pasar_credito("ana")
        self.assertEqual(self.destino.read_text(encoding="utf-8"), "Foto: escrita a mano\n")

    def test_sin_archivo_no_pasa_nada(self):
        procesar.pasar_credito("ana")
        self.assertFalse(self.destino.exists())

    def test_la_plantilla_en_el_sitio_cuenta_como_pendiente(self):
        self.escribir(self.destino, procesar.PLANTILLA_CREDITO)
        self.assertTrue(procesar.credito_pendiente(self.destino.parent))

    def test_prepara_las_carpetas_y_la_guia(self):
        creados = procesar.preparar_carpetas({"ana", "eva"})
        self.assertEqual(creados, ["seleccion", "ana", "eva"])
        for nombre in creados:
            self.assertEqual((self.raiz / "originales" / nombre / "credito.txt").read_text(encoding="utf-8"), procesar.PLANTILLA_CREDITO + "\n")
        self.assertIn("Tamaños mínimos", (self.raiz / "originales/LEEME.txt").read_text(encoding="utf-8"))

    def test_preparar_no_toca_lo_que_ya_existe(self):
        self.escribir(self.origen / "credito.txt", "Foto: mía\n")
        self.escribir(self.origen / "foto.jpg", "no es una imagen")
        self.escribir(self.raiz / "originales/LEEME.txt", "mis notas")
        self.assertEqual(procesar.preparar_carpetas({"ana"}), ["seleccion"])
        self.assertEqual((self.origen / "credito.txt").read_text(encoding="utf-8"), "Foto: mía\n")
        self.assertEqual((self.origen / "foto.jpg").read_text(encoding="utf-8"), "no es una imagen")
        self.assertEqual((self.raiz / "originales/LEEME.txt").read_text(encoding="utf-8"), "mis notas")


if __name__ == "__main__":
    unittest.main()
