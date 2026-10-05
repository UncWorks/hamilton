// HISTORICAL — frozen copy of the pre-AoE presumed jammer geometry, kept only
// so the archive and decision stories still show the design record they were
// decided on. Superseded by HS-20 ("the jammer's location is never presumed",
// docs/URS.md; docs/plans/jammer-aoe.md W22 / W26): no production component,
// fixture or operator story may import this. The live COP draws the emitter
// estimate's area of effect instead (FR-06a).

/** The old hard-coded jammer point (1.3 km east of B). HISTORICAL. */
export const PRESUMED_JAMMER_POINT = { lat: 48.142, lon: 37.762 } as const;

/** The old mock FR-04a candidate geolocations around it (C1–C3). HISTORICAL. */
export const PRESUMED_CANDIDATE_SITES = [
  { lat: PRESUMED_JAMMER_POINT.lat - 0.0012, lon: PRESUMED_JAMMER_POINT.lon - 0.0035, label: 'C1' },
  { lat: PRESUMED_JAMMER_POINT.lat + 0.0022, lon: PRESUMED_JAMMER_POINT.lon + 0.0035, label: 'C2' },
  { lat: PRESUMED_JAMMER_POINT.lat - 0.0024, lon: PRESUMED_JAMMER_POINT.lon + 0.0045, label: 'C3' },
] as const;
