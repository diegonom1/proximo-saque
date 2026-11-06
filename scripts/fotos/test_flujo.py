"""Flujo de procesar_carpeta con un recortador falso: no carga modelos ni necesita memoria."""

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

import procesar


GB = 1024**3


class RecortadorFalso:
    def __init__(self, sin_memoria=False, reserva=None):
        self.llamadas = []
        self.sin_memoria = sin_memoria
        self.reserva = reserva

    def mascara(self, imagen, modelo):
        if self.sin_memoria:
            raise procesar.MemoriaInsuficiente(procesar.falta_memoria(1024**3, modelo))
        usado = self.reserva or modelo
        self.llamadas.append(usado)
        mascara = Image.new("L", imagen.size, 0)
        mascara.paste(255, (imagen.width // 4, imagen.height // 4, imagen.width * 3 // 4, imagen.height * 3 // 4))
        return mascara, usado


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
        self.memoria = 64 * GB
        parche = mock.patch.object(procesar, "memoria_disponible", lambda: self.memoria)
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


    def test_sin_memoria_usa_la_reserva_y_lo_dice(self):
        self.memoria = 8.5 * GB
        r, avisos, _ = self.correr(RecortadorFalso(reserva=procesar.MODELO_LIGERO))
        self.assertEqual(r.llamadas, [procesar.MODELO_LIGERO])
        self.assertTrue(any(a.startswith(procesar.AVISO_RESERVA) for a in avisos))
        self.assertTrue((self.salida / "recorte.png").exists())

    def test_la_reserva_no_se_repite_si_sigue_sin_memoria(self):
        self.memoria = 8.5 * GB
        self.correr(RecortadorFalso(reserva=procesar.MODELO_LIGERO))
        r, avisos, salto = self.correr()
        self.assertEqual(r.llamadas, [])
        self.assertTrue(salto)
        self.assertTrue(any(a.startswith(procesar.AVISO_RESERVA) for a in avisos))

    def test_con_memoria_mejora_el_recorte_de_reserva(self):
        self.memoria = 8.5 * GB
        self.correr(RecortadorFalso(reserva=procesar.MODELO_LIGERO))
        self.memoria = 12 * GB
        r, avisos, _ = self.correr()
        self.assertEqual(r.llamadas, ["birefnet-general"])
        self.assertFalse(any(a.startswith(procesar.AVISO_RESERVA) for a in avisos))

    def test_con_menos_memoria_no_empeora_un_recorte_hecho(self):
        self.memoria = 8.5 * GB
        self.correr(RecortadorFalso(reserva=procesar.MODELO_LIGERO))
        self.memoria = 4 * GB
        r, _, _ = self.correr()
        self.assertEqual(r.llamadas, [])

    def test_comparar_con_poca_memoria_hace_una_sola_reserva(self):
        self.memoria = 8.5 * GB
        r, _, _ = self.correr(RecortadorFalso(reserva=procesar.MODELO_LIGERO), comparar=True)
        self.assertEqual(r.llamadas, [procesar.MODELO_LIGERO])

    def test_comparar_con_poca_memoria_no_repite_la_reserva(self):
        self.memoria = 8.5 * GB
        self.correr(RecortadorFalso(reserva=procesar.MODELO_LIGERO), comparar=True)
        r, _, _ = self.correr(comparar=True)
        self.assertEqual(r.llamadas, [])

    def test_caja_nueva_vuelve_a_recortar(self):
        self.correr()
        (self.origen / "caja.txt").write_text("0% 0% 50% 100%")
        r, _, _ = self.correr()
        self.assertEqual(r.llamadas, ["birefnet-general"])


class EscaleraDeModelos(unittest.TestCase):
    def test_elige_el_mejor_que_cabe(self):
        self.assertEqual(procesar.modelo_posible(12 * GB, "birefnet-general"), "birefnet-general")
        self.assertEqual(procesar.modelo_posible(11.9 * GB, "birefnet-general"), procesar.MODELO_LIGERO)
        self.assertEqual(procesar.modelo_posible(8 * GB, "birefnet-portrait"), procesar.MODELO_LIGERO)
        self.assertEqual(procesar.modelo_posible(7 * GB, "birefnet-general"), procesar.MODELO_MINIMO)
        self.assertIsNone(procesar.modelo_posible(2 * GB, "birefnet-general"))

    def test_modelo_txt_acepta_las_reservas(self):
        self.assertEqual(procesar.interpretar_modelo("general-lite"), procesar.MODELO_LIGERO)
        self.assertEqual(procesar.interpretar_modelo("isnet-general-use"), procesar.MODELO_MINIMO)


class UnaSolaPersona(unittest.TestCase):
    def mascara(self, *cajas):
        imagen = Image.new("L", (400, 400), 0)
        for caja in cajas:
            imagen.paste(255, caja)
        return imagen

    def test_conserva_la_silueta_de_la_cara_aunque_otra_sea_mayor(self):
        mascara = self.mascara((20, 20, 80, 120), (200, 20, 380, 380))
        limpia, encontrada, otras = procesar.una_sola_persona(mascara, [procesar.Cara(40, 30, 20, 20)])
        self.assertTrue(encontrada)
        self.assertEqual(otras, 0)
        self.assertEqual(limpia.getpixel((50, 80)), 255)
        self.assertEqual(limpia.getpixel((300, 200)), 0)

    def test_conserva_el_balon_que_toca_la_mano(self):
        mascara = self.mascara((20, 20, 80, 200), (80, 150, 140, 210))
        limpia, _, _ = procesar.una_sola_persona(mascara, [procesar.Cara(40, 30, 20, 20)])
        self.assertEqual(limpia.getpixel((120, 180)), 255)

    def test_guarda_el_borde_suave(self):
        mascara = self.mascara((20, 20, 80, 120))
        mascara.paste(60, (80, 20, 82, 120))
        limpia, _, _ = procesar.una_sola_persona(mascara, [procesar.Cara(40, 30, 20, 20)])
        self.assertEqual(limpia.getpixel((81, 60)), 60)

    def test_avisa_si_sigue_pegada_a_otra_cara(self):
        mascara = self.mascara((20, 20, 300, 120))
        caras = [procesar.Cara(40, 30, 20, 20), procesar.Cara(250, 30, 20, 20), procesar.Cara(250, 300, 20, 20)]
        _, _, otras = procesar.una_sola_persona(mascara, caras)
        self.assertEqual(otras, 1)

    def test_sin_cara_deja_la_mas_grande_y_lo_dice(self):
        mascara = self.mascara((20, 20, 80, 120), (200, 20, 380, 380))
        limpia, encontrada, _ = procesar.una_sola_persona(mascara, [])
        self.assertFalse(encontrada)
        self.assertEqual(limpia.getpixel((300, 200)), 255)
        self.assertEqual(limpia.getpixel((50, 80)), 0)

    def test_si_la_cara_no_toca_ninguna_silueta_lo_dice(self):
        mascara = self.mascara((20, 20, 80, 120))
        _, encontrada, _ = procesar.una_sola_persona(mascara, [procesar.Cara(300, 300, 20, 20)])
        self.assertFalse(encontrada)

    def test_mascara_vacia_no_truena(self):
        limpia, encontrada, _ = procesar.una_sola_persona(self.mascara(), [])
        self.assertTrue(encontrada)
        self.assertEqual(limpia.getbbox(), None)


class Caja(unittest.TestCase):
    def foto(self):
        return procesar.Foto(Path("a.jpg"), Image.new("RGB", (1000, 2000)), [procesar.Cara(400, 400, 100, 100), procesar.Cara(50, 50, 10, 10)])

    def correr(self, texto):
        with tempfile.TemporaryDirectory() as temporal:
            origen, avisos = Path(temporal), []
            (origen / "caja.txt").write_text(texto, encoding="utf-8")
            return procesar.zona_de_recorte(self.foto(), origen, avisos), avisos

    def test_lee_la_caja(self):
        self.assertEqual(procesar.interpretar_caja("20% 0% 80% 100%\n"), (0.2, 0, 0.8, 1))

    def test_rechaza_lo_que_no_entiende(self):
        for texto in ("", "20% 0%", "80% 0% 20% 100%", "0% 90% 100% 10%", "0 0 150 100", "a b c d"):
            self.assertIsNone(procesar.interpretar_caja(texto), texto)

    def test_recorta_y_mueve_las_caras(self):
        foto, avisos = self.correr("20% 10% 80% 60%")
        self.assertEqual(foto.imagen.size, (600, 1000))
        self.assertEqual(len(foto.caras), 1)
        self.assertEqual((foto.cara.x, foto.cara.y), (200, 200))
        self.assertEqual(avisos, [])

    def test_avisa_si_deja_fuera_la_cara(self):
        _, avisos = self.correr("60% 60% 100% 100%")
        self.assertEqual(len(avisos), 1)

    def test_avisa_si_no_la_entiende(self):
        foto, avisos = self.correr("arriba")
        self.assertEqual(foto.imagen.size, (1000, 2000))
        self.assertEqual(len(avisos), 1)

    def test_sin_caja_devuelve_la_misma_foto(self):
        foto = self.foto()
        with tempfile.TemporaryDirectory() as temporal:
            self.assertIs(procesar.zona_de_recorte(foto, Path(temporal), []), foto)


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
