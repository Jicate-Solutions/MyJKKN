import { describe, expect, it } from 'vitest';

import { parseMapCoordinates } from '@/lib/utils/parse-map-coordinates';

const val = (s: string) => {
  const r = parseMapCoordinates(s);
  return r.ok ? r.value : r;
};

describe('parseMapCoordinates', () => {
  it('reads a right-click copy', () => {
    expect(val('11.445056, 77.125139')).toEqual({ lat: 11.445056, lng: 77.125139 });
  });

  it('reads degrees-minutes-seconds', () => {
    const v = val(`11°26'40.2"N 77°7'30.5"E`) as { lat: number; lng: number };
    expect(v.lat).toBeCloseTo(11.4445, 4);
    expect(v.lng).toBeCloseTo(77.125139, 4);
  });

  it('applies southern and western hemispheres as negative', () => {
    const v = val(`33°51'0"S 151°12'0"W`) as { lat: number; lng: number };
    expect(v.lat).toBeCloseTo(-33.85, 4);
    expect(v.lng).toBeCloseTo(-151.2, 4);
  });

  it('prefers the pin over the map centre in a place link', () => {
    const url =
      'https://www.google.com/maps/place/Hospital/@11.4000,77.1000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d11.4445!4d77.1251';
    expect(val(url)).toEqual({ lat: 11.4445, lng: 77.1251 });
  });

  it('reads @lat,lng and ?q= links', () => {
    expect(val('https://www.google.com/maps/@11.4445,77.1251,15z')).toEqual({ lat: 11.4445, lng: 77.1251 });
    expect(val('https://maps.google.com/?q=11.4445,77.1251')).toEqual({ lat: 11.4445, lng: 77.1251 });
    expect(val('https://www.google.com/maps?q=11.4445%2C77.1251')).toEqual({ lat: 11.4445, lng: 77.1251 });
  });

  it('refuses short links, empty and nonsense', () => {
    expect(parseMapCoordinates('https://maps.app.goo.gl/abc123')).toEqual({ ok: false, reason: 'short_link' });
    expect(parseMapCoordinates('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(parseMapCoordinates('District Hospital')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('rejects out-of-range values', () => {
    expect(parseMapCoordinates('95.0, 77.0')).toEqual({ ok: false, reason: 'not_found' });
    expect(parseMapCoordinates('11.0, 190.0')).toEqual({ ok: false, reason: 'not_found' });
  });
});
