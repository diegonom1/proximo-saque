import { describe, expect, it } from 'vitest';
import { iconoPlataforma, iconoRed } from './iconos';

describe('iconoPlataforma', () => {
  it('reconoce la marca por el nombre', () => {
    expect(iconoPlataforma({ nombre: 'Twitch', tipo: 'streaming', url: 'https://ejemplo.tv/x' }).titulo).toBe('Twitch');
  });
  it('reconoce la marca por el dominio', () => {
    expect(iconoPlataforma({ nombre: 'Canal de la liga', tipo: 'streaming', url: 'https://www.twitch.tv/liga' }).titulo).toBe('Twitch');
  });
  it('usa YouTube para ese tipo aunque el nombre sea otro', () => {
    expect(iconoPlataforma({ nombre: 'Canal Vôlei', tipo: 'youtube', url: 'https://youtu.be/x' }).titulo).toBe('YouTube');
  });
  it('sin marca usa el genérico del tipo', () => {
    expect(iconoPlataforma({ nombre: 'Canal desconocido', tipo: 'tv', url: 'https://canal-xyz-desconocido.mx' }).titulo).toBe('Televisión');
  });
});

describe('iconoRed', () => {
  it.each(['instagram', 'tiktok', 'x', 'facebook', 'youtube'])('tiene icono para %s', (red) => {
    expect(iconoRed(red)?.path).toBeTruthy();
  });
});
