import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial } from 'three';

/** Paleta estilizada de cada raiz: núcleo quase branco, cor principal, borda escura/saturada. */
export interface Palette {
  core: Color;
  main: Color;
  edge: Color;
}
const pal = (core: number, main: number, edge: number): Palette => ({
  core: new Color(core),
  main: new Color(main),
  edge: new Color(edge),
});
export const PALETTES: Record<string, Palette> = {
  pir: pal(0xfff6c8, 0xffa21e, 0xe0330f),
  vent: pal(0xffffff, 0xd8fff0, 0x6fcfae),
  gel: pal(0xffffff, 0x9fe8ff, 0x3d7bff),
  lav: pal(0xeaf8ff, 0x4aa8ff, 0x1b4fd0),
  ter: pal(0xf4e6c8, 0xc0a072, 0x5a4a3c),
  kor: pal(0xffdcff, 0xa45cff, 0x34106a),
};
export const paletteOf = (root: string): Palette => PALETTES[root] ?? (PALETTES.kor as Palette);

/** Ruído de valor 2D (barato) usado por todos os shaders estilizados. */
export const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) { return noise(p) * 0.6 + noise(p * 2.3 + 7.1) * 0.3 + noise(p * 5.1 + 3.7) * 0.1; }`;

/**
 * Material de faixa estilizada (rastro, meia-lua, espiral, anel):
 * uv.x = comprimento (0 cauda → 1 cabeça), uv.y = largura (0..1).
 * Três tons de borda dura (núcleo, cor, borda), ruído que corre e "come" a forma (dissolve).
 */
export function ribbonMaterial(
  p: Palette,
  o: { additive?: boolean; scroll?: number; noiseScale?: number; erosion?: number } = {},
): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: o.additive ? AdditiveBlending : NormalBlending,
    uniforms: {
      uCore: { value: p.core.clone() },
      uMain: { value: p.main.clone() },
      uEdge: { value: p.edge.clone() },
      uTime: { value: 0 },
      uDissolve: { value: 0 },
      uScroll: { value: o.scroll ?? 2.5 },
      uNoise: { value: o.noiseScale ?? 4 },
      uErosion: { value: o.erosion ?? 0.35 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore, uMain, uEdge;
      uniform float uTime, uDissolve, uScroll, uNoise, uErosion;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        float across = 1.0 - abs(vUv.y * 2.0 - 1.0);               // 1 no meio, 0 na borda
        float n = fbm(vec2(vUv.x * uNoise - uTime * uScroll, vUv.y * 2.0 + uTime * 0.3));
        float body = across * (0.55 + 0.45 * smoothstep(0.0, 0.35, vUv.x)) - n * uErosion;
        float cut = uDissolve * 0.9 + 0.08;
        if (body < cut) discard;                                    // borda dura, comida pelo ruído
        float k = body - cut;
        vec3 col = k > 0.42 ? uCore : (k > 0.16 ? uMain : uEdge);   // 3 faixas de tom
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * Orbe com borda acesa (fresnel) em faixas duras: núcleo branco que olha pra câmera,
 * corpo colorido, aro escuro; ruído girando na superfície.
 */
export function orbMaterial(p: Palette, o: { bubble?: boolean } = {}): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uCore: { value: p.core.clone() },
      uMain: { value: p.main.clone() },
      uEdge: { value: p.edge.clone() },
      uTime: { value: 0 },
      uBubble: { value: o.bubble ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore, uMain, uEdge; uniform float uTime, uBubble;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      ${NOISE}
      void main() {
        float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0);
        float n = fbm(vP.xy * 3.0 + vec2(uTime * 1.3, uTime * 0.7));
        float k = f + (n - 0.5) * 0.25;
        vec3 col; float a;
        if (uBubble > 0.5) {
          // bolha: miolo quase transparente, aro forte, reflexo branco
          col = k > 0.72 ? uEdge : (k > 0.45 ? uMain : uCore);
          a = k > 0.45 ? 0.9 : 0.28;
          vec2 hl = normalize(vN).xy - vec2(-0.35, 0.45);
          if (length(hl) < 0.22) { col = vec3(1.0); a = 1.0; }
        } else {
          col = k < 0.38 ? uCore : (k < 0.72 ? uMain : uEdge);
          a = 1.0;
        }
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
}
