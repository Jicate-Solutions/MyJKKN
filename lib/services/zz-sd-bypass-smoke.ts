// smoke test — hand-rolls the virtual records, should trip the invariant guard. Will not merge.
export async function zzBypass(sb: any, id: string) {
  await sb.from('degrees').insert({ degree_code: 'K12', institution_id: id });
}
