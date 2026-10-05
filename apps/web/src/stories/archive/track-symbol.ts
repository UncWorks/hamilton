// ARCHIVED — the Branding §5.2 n-gon geometry and affiliation RGB mirrors. The
// live renderers draw the decided FM 1-02 / MCRP 5-12A symbol
// (src/components/symbol) instead; this is kept for the G01 reference stories.

import {
  type Affiliation,
  type SensorType,
  sensorTypeSides,
} from '@hamilton/contracts';

export interface SymbolGeometry {
  /** Polygon vertices in unit-circle space (radius = 1, centered at 0,0). */
  vertices: Array<[number, number]>;
  /** Rotation in degrees. Enemy is rotated 45° per Branding §5.2. */
  rotation_deg: number;
}

/**
 * Polygon vertices for the track symbol per Branding §5.2.
 * side_count = sensor type, rotation 45° if enemy.
 */
export function symbolGeometry(
  affiliation: Affiliation,
  sensor_type: SensorType,
): SymbolGeometry {
  const sides = sensorTypeSides[sensor_type];
  const offset = sensor_type === 'offense' && affiliation !== 'enemy' ? -Math.PI / 2 : 0;
  const vertices: Array<[number, number]> = [];
  for (let i = 0; i < sides; i++) {
    const angle = offset + (2 * Math.PI * i) / sides;
    vertices.push([Math.cos(angle), Math.sin(angle)]);
  }
  return {
    vertices,
    rotation_deg: affiliation === 'enemy' ? 45 : 0,
  };
}

const AFFILIATION_TO_HEX: Record<Affiliation, [number, number, number]> = {
  // Approximations of the OKLCH affiliation hues — deck.gl needs RGB triples.
  friendly: [70, 140, 220],
  enemy: [180, 70, 80],
  neutral: [180, 175, 165],
  unknown: [120, 165, 130],
};

export function affiliationRgb(affiliation: Affiliation): [number, number, number] {
  return AFFILIATION_TO_HEX[affiliation];
}
