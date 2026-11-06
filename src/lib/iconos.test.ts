import { describe, expect, it } from 'vitest';
import { iconoRed } from './iconos';

describe('iconoRed', () => {
  it.each(['instagram', 'tiktok', 'x', 'facebook', 'youtube'])('tiene icono para %s', (red) => {
    expect(iconoRed(red)?.path).toBeTruthy();
  });
});
