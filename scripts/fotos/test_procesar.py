"""Pruebas de la geometría. Uso: .venv/bin/python -m unittest discover scripts/fotos"""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from procesar import Cara, caras_fuera, falta_memoria, foco_sugerido, huella, interpretar_modelo, recuadro_proporcion, recuadro_tarjeta


def centro_relativo(recuadro, cara):
    izq, arriba, der, abajo = recuadro
    cx, cy = cara.centro
    return (cx - izq) / (der - izq), (cy - arriba) / (abajo - arriba)


class Tarjeta(unittest.TestCase):
    def proporcion(self, r):
        self.assertAlmostEqual((r[2] - r[0]) / (r[3] - r[1]), 0.8, places=2)

    def dentro(self, r, ancho, alto):
        self.assertGreaterEqual(r[0], 0)
        self.assertGreaterEqual(r[1], 0)
        self.assertLessEqual(r[2], ancho)
        self.assertLessEqual(r[3], alto)

    def test_cara_en_el_tercio_de_arriba(self):
        cara = Cara(1800, 900, 300, 380)
        r = recuadro_tarjeta(4000, 3000, cara)
        self.proporcion(r)
        self.dentro(r, 4000, 3000)
        x, y = centro_relativo(r, cara)
        self.assertLess(y, 1 / 3)
        self.assertAlmostEqual(x, 0.5, places=2)

    def test_cara_pegada_arriba(self):
        cara = Cara(900, 10, 200, 250)
        r = recuadro_tarjeta(2000, 3000, cara)
        self.assertEqual(r[1], 0)
        self.proporcion(r)

    def test_cara_muy_abajo_sigue_en_el_tercio_de_arriba(self):
        cara = Cara(1000, 2300, 200, 250)
        r = recuadro_tarjeta(2400, 3000, cara)
        self.proporcion(r)
        self.dentro(r, 2400, 3000)
        self.assertLess(centro_relativo(r, cara)[1], 1 / 3)

    def test_cara_en_la_orilla_no_se_sale(self):
        cara = Cara(3700, 500, 280, 340)
        r = recuadro_tarjeta(4000, 3000, cara)
        self.dentro(r, 4000, 3000)
        self.proporcion(r)

    def test_foto_chica_usa_lo_que_hay(self):
        r = recuadro_tarjeta(512, 512, Cara(200, 90, 100, 130))
        self.dentro(r, 512, 512)
        self.proporcion(r)

    def test_sin_cara_recorta_desde_arriba(self):
        r = recuadro_tarjeta(3000, 2000, None)
        self.assertEqual(r[1], 0)
        self.assertEqual(r[3], 2000)
        self.assertEqual(r[0], 3000 - r[2])


class Hero(unittest.TestCase):
    def test_horizontal_sobre_foto_vertical(self):
        r = recuadro_proporcion(2000, 3000, 16 / 9)
        self.assertEqual(r[2] - r[0], 2000)
        self.assertAlmostEqual((r[2] - r[0]) / (r[3] - r[1]), 16 / 9, places=2)

    def test_sigue_a_las_caras(self):
        caras = [Cara(3000, 500, 200, 200)]
        r = recuadro_proporcion(4000, 2000, 9 / 16, caras)
        self.assertLess(r[0], 3100)
        self.assertGreater(r[2], 3100)
        self.assertEqual(caras_fuera(r, caras), 0)

    def test_avisa_caras_fuera(self):
        caras = [Cara(100, 500, 200, 200), Cara(3700, 500, 200, 200)]
        r = recuadro_proporcion(4000, 2000, 9 / 16, caras)
        self.assertEqual(caras_fuera(r, caras), 2)


class Otros(unittest.TestCase):
    def test_memoria_suficiente(self):
        self.assertIsNone(falta_memoria(10 * 1024**3, "birefnet-general"))

    def test_memoria_insuficiente_dice_cuanta_hay(self):
        aviso = falta_memoria(int(9.5 * 1024**3), "birefnet-general")
        self.assertIn("9.5 GB", aviso)
        self.assertIn("Chrome", aviso)

    def test_modelo(self):
        self.assertEqual(interpretar_modelo("general\n"), "birefnet-general")
        self.assertEqual(interpretar_modelo(" Birefnet-General "), "birefnet-general")
        self.assertEqual(interpretar_modelo("portrait"), "birefnet-portrait")
        self.assertIsNone(interpretar_modelo("otro"))
        self.assertIsNone(interpretar_modelo(""))

    def test_foco(self):
        self.assertEqual(foco_sugerido(1000, 1000, Cara(600, 200, 100, 100)), "65% 25%")

    def test_huella_cambia_con_el_contenido(self):
        with TemporaryDirectory() as d:
            ruta = Path(d) / "a.jpg"
            ruta.write_bytes(b"uno")
            primera = huella([ruta])
            self.assertEqual(primera, huella([ruta]))
            ruta.write_bytes(b"dos")
            self.assertNotEqual(primera, huella([ruta]))


if __name__ == "__main__":
    unittest.main()
