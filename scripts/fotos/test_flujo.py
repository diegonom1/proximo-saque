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


if __name__ == "__main__":
    unittest.main()
