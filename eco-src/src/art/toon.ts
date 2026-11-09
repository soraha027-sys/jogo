import { DataTexture, MeshToonMaterial, NearestFilter, RGBAFormat } from 'three';
import type { BufferGeometry, ColorRepresentation } from 'three';

let ramp: DataTexture | null = null;

/** Rampa toon de 3 faixas compartilhada por todo o jogo. */
export function toonRamp(): DataTexture {
  if (ramp) return ramp;
  const bands = [150, 208, 255];
  const data = new Uint8Array(bands.flatMap((v) => [v, v, v, 255]));
  ramp = new DataTexture(data, bands.length, 1, RGBAFormat);
  ramp.minFilter = ramp.magFilter = NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

export function toonMat(
  color: ColorRepresentation = 0xffffff,
  vertexColors = false,
): MeshToonMaterial {
  return new MeshToonMaterial({ color, gradientMap: toonRamp(), vertexColors });
}

/** Normais por face: o look facetado low-poly. */
export function facet<T extends BufferGeometry>(geo: T): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}
