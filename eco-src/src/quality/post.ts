import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three';
import type { Camera, Scene, WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/** Pós-processamento do perfil alto (chunk separado: só baixa quem usa). */
export function createComposer(r: WebGLRenderer, scene: Scene, camera: Camera): EffectComposer {
  const s = r.getDrawingBufferSize(new Vector2());
  const composer = new EffectComposer(
    r,
    new WebGLRenderTarget(s.x, s.y, { type: HalfFloatType, samples: 4 }),
  );
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, s.x, s.y);
  ao.blendIntensity = 0.8;
  composer.addPass(ao);
  composer.addPass(new UnrealBloomPass(new Vector2(s.x, s.y), 0.28, 0.7, 0.92));
  composer.addPass(new OutputPass());
  return composer;
}
