import { describe, expect, it } from 'vitest';
import { digitosQueCambian } from './marcador';

describe('digitosQueCambian', () => {
  it('solo marca lo que cambió', () => {
    expect(digitosQueCambian('59', '58')).toEqual([1]);
    expect(digitosQueCambian('10', '09')).toEqual([0, 1]);
    expect(digitosQueCambian('12', '12')).toEqual([]);
  });
  it('repinta todo si cambia la longitud', () => {
    expect(digitosQueCambian('100', '99')).toEqual([0, 1]);
    expect(digitosQueCambian('', '288')).toEqual([0, 1, 2]);
  });
});
