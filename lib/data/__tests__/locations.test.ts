import { describe, it, expect } from 'vitest';
import {
  indianStates,
  getDistrictsByState,
  getTaluksByDistrict,
  getLocationIdByName,
} from '@/lib/data/locations';

// BUG-003982 / BUG-003020 / BUG-003746: the address picker on the learner
// profile forms is fed ONLY by this file, so a district or taluk missing here
// cannot be entered at all. Production had 31 Kerala learners stored under
// "Kochi" (a city, then one of the only Kerala options).
describe('location picker data', () => {
  it('offers all 14 Kerala districts', () => {
    const names = getDistrictsByState('kerala').map((d) => d.name);
    for (const district of [
      'Thiruvananthapuram', 'Kollam', 'Pathanamthitta', 'Alappuzha',
      'Kottayam', 'Idukki', 'Ernakulam', 'Thrissur', 'Palakkad',
      'Malappuram', 'Kozhikode', 'Wayanad', 'Kannur', 'Kasaragod',
    ]) {
      expect(names).toContain(district);
    }
  });

  it('offers all seven Dharmapuri taluks', () => {
    const names = getTaluksByDistrict('tamil_nadu', 'dharmapuri').map((t) => t.name);
    for (const taluk of [
      'Dharmapuri', 'Harur', 'Karimangalam', 'Nallampalli',
      'Palacode', 'Pappireddipatti', 'Pennagaram',
    ]) {
      expect(names).toContain(taluk);
    }
  });

  it('resolves a stored Kerala district name back to its picker id', () => {
    expect(getLocationIdByName('THRISSUR', 'district')).toBe('thrissur');
  });

  // Id lookups search every state, so a duplicated id would silently resolve
  // to the wrong place. Guards the additions above.
  it('has no duplicate district or taluk ids across states', () => {
    const districtIds = indianStates.flatMap((s) => s.districts.map((d) => d.id));
    const talukIds = indianStates.flatMap((s) =>
      s.districts.flatMap((d) => d.taluks.map((t) => t.id))
    );
    expect(districtIds.length).toBe(new Set(districtIds).size);
    expect(talukIds.length).toBe(new Set(talukIds).size);
  });
});
