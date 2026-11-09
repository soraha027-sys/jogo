import { NeutralToneMapping, Scene, Vector3, WebGLRenderer } from 'three';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { DebugOverlay } from '../debug/DebugOverlay';
import { GamepadSource } from '../input/Gamepad';
import { InputManager } from '../input/InputManager';
import { KeyboardMouse } from '../input/KeyboardMouse';
import { angleDelta } from '../input/math';
import { TouchSource } from '../input/Touch';
import { Player } from '../player/Player';
import { Witch } from '../player/witch/Witch';
import { QualityManager } from '../quality/Quality';
import { buildLexicon, decode, spell } from '../spells/decode';
import { Grimoire } from '../spells/Grimoire';
import { interpret, type Alt, type Cast } from '../spells/interpret';
import { LINGUA } from '../spells/lingua';
import { SpellSystem } from '../spells/SpellSystem';
import { Hud } from '../ui/Hud';
import { SpellHud, type CastView } from '../ui/SpellHud';
import { Dust } from '../vfx/Dust';
import { Voice } from '../voice/Voice';
import { createArena } from '../world/Arena';
import { Dummy } from '../world/Dummies';
import { Events, type GameEvents } from './Events';
import { FixedLoop } from './Loop';

const SUN_OFFSET = { x: 14, y: 30, z: 18 } as const;
/** Teclas 1-5: harmônica com infusão · opostos ligados por ko · avesso · opostos sem ko (estoura) · não é a língua. */
const PRESETS = ['ventus gelus', 'kopirigelor', 'laventus gel', 'pirigelor', 'abacaxi com banana'];

/** Raiz de composição: monta os módulos e liga uns nos outros. Nada é global. */
export async function createGame(
  canvas: HTMLCanvasElement,
  hudRoot: HTMLElement,
): Promise<{ start(): void }> {
  const query = new URLSearchParams(location.search);
  const events = new Events<GameEvents>();
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.toneMapping = NeutralToneMapping;
  const scene = new Scene();
  const world = createArena(scene);
  const dust = new Dust(scene);
  const rig = new ThirdPersonCamera();
  const player = new Player(world.spawn, world.half, events);
  const witch = await Witch.load({
    step: (p, running) => dust.step(p, running),
    jump: (p, double) => dust.jump(p, double),
    land: (p) => {
      dust.land(p);
      rig.kick(0.16);
      navigator.vibrate?.(18);
    },
  });
  player.object.add(witch.root);
  scene.add(player.object);
  // ?view=front|side|back|q&dist=2.2: câmera de inspeção do modelo
  const view = query.get('view');
  if (view) {
    rig.distance = Number(query.get('dist') ?? 2.2);
    rig.pitch = 0.04;
    rig.yaw = { front: Math.PI, side: Math.PI / 2, q: Math.PI * 0.8 }[view] ?? 0;
  }
  const dummies = [-3.5, 0, 3.5].map(
    (x) => new Dummy(scene, x, -1 + Math.abs(x) * 0.25, world.colliders),
  );

  const data = LINGUA;
  const lexicon = buildLexicon(data);
  const grimoire = new Grimoire();
  const spells = new SpellSystem(data, scene, world.colliders, dummies);
  const pending: { at: number; run: () => void }[] = [];
  let time = 0;
  let diag = '';
  // magia equipada: a última falada; E / clique / RB / botão relançam sem falar
  let equipped: Cast | null = null;
  let cooldown = 0;
  const attack = (): void => {
    if (time < cooldown) return;
    if (!equipped) {
      spellHud.showCast({
        echo: 'sem_eco',
        morphs: [],
        reading: '',
        state: null,
        why: 'Recite uma magia primeiro.',
        isNew: false,
      });
      return;
    }
    cooldown = time + 0.45;
    onCast(equipped, true);
  };

  const hud = new Hud(hudRoot, events, {
    cycleQuality: () => quality.cycle(),
    toggleDebug: () => events.emit('debug:changed', debug.toggle()),
  });

  /** Tudo que é falado (mic, tecla de teste ou texto) passa por aqui. */
  const onCast = (cast: Cast, fromButton = false): void => {
    if (cast.kind === 'command') {
      if (cast.id === 'vassoura') player.setFlying(!player.flying);
      else if (cast.id === 'sentar') witch.toggleSit();
      else if (cast.id === 'acenar') witch.trigger('wave');
      return;
    }
    const plan = cast.plan;
    const view: CastView = {
      echo: cast.echo,
      morphs: cast.morphs,
      reading: plan?.reading ?? '',
      state: plan?.state ?? null,
      why: '',
      isNew: false,
    };
    diag = `ouviu "${cast.heard}"\n/${cast.phonemes}/ → ${plan?.parts ?? '—'}  custo ${cast.cost.toFixed(2)}`;
    if (!plan || cast.echo === 'sem_eco') {
      view.why = 'Isso não é a língua do Eco.';
      witch.trigger('shrug');
      spells.smoke(witch.handPosition(new Vector3()), 6, 1.5);
      return spellHud.showCast(view);
    }
    if (!fromButton) {
      equipped = { ...cast, echo: 'limpo' };
      touch.setEquipped(plan.text);
    }
    let power = cast.echo === 'fraco' ? 0.6 : 1;
    if (cast.echo === 'torto') view.why = 'Um som escorregou e a magia virou outra.';
    if (cast.echo === 'sem_forca') {
      view.why = 'Faltou voz.';
      power = 0.25;
    } else if (spells.mana < plan.cost) {
      view.echo = 'sem_forca';
      view.why = `Faltou mana (${plan.cost}).`;
      power = 0.25;
    } else spells.mana -= plan.cost;

    const aim = new Vector3(
      -Math.sin(rig.yaw),
      player.flying ? -Math.sin(rig.pitch) : 0.03,
      -Math.cos(rig.yaw),
    );
    player.face(Math.atan2(aim.x, aim.z));
    const unstable = plan.state === 'instavel';
    if (unstable) {
      view.echo = 'instavel';
      view.why = `${plan.conflict} se anulam. Tente ligar com ko-.`;
    }
    witch.trigger('cast');
    view.isNew = !unstable && power >= 0.6 && grimoire.record(plan);
    spellHud.showCast(view);
    // o efeito sai no golpe do braço, não no começo da animação
    pending.push({
      at: time + 0.26,
      run: () => {
        const hand = witch.handPosition(new Vector3());
        const ok = spells.cast(plan, power, hand, aim, player.pos);
        witch.punch(ok ? -1.6 : -3);
        rig.kick(ok ? 0.05 : 0);
        if (ok) return;
        witch.trigger('fail');
        player.knock(-aim.x * 5, 5.5, -aim.z * 5);
        witch.setSoot(4);
        rig.shake(0.6);
        navigator.vibrate?.([40, 30, 80]);
      },
    });
  };
  const say = (alts: Alt[], weak: boolean): void => {
    const cast = interpret(alts, lexicon, { rng: Math.random, weak });
    if (cast) onCast(cast);
  };
  /** Fala parcial: já mostra na língua do jogo, nunca o português que o Chrome achou que ouviu. */
  const live = (text: string): void => {
    const d = decode(text, lexicon);
    events.emit('voice:interim', d && d.cost <= data.echo.bent ? spell(d.words, '·') : '…');
  };
  const phrases = Object.keys(data.roots).flatMap((r) => [
    r,
    ...Object.keys(data.endings).map((e) => r + e),
  ]);
  const voice = new Voice(
    events,
    { weakVolume: data.weakVolume, lang: query.get('lang') ?? 'pt-BR', phrases },
    live,
    say,
  );
  const simulate = (text: string, preset = 0): void => {
    const line = preset ? (PRESETS[preset - 1] ?? '') : text;
    voice.talk(0.5 + line.length * 0.04);
    say([{ text: line, confidence: 1 }], false);
  };
  const spellHud = new SpellHud(
    hudRoot,
    events,
    data,
    grimoire,
    { toggleMic: () => void voice.toggle(), say: simulate },
    PRESETS,
  );

  const input = new InputManager();
  const touch = new TouchSource(canvas, hudRoot);
  input.add(new KeyboardMouse(canvas, (locked) => hud.setLocked(locked)));
  input.add(touch);
  input.add(new GamepadSource());
  events.on('fly:changed', (on) => touch.setFlying(on));

  const quality = new QualityManager(renderer, scene, rig.camera, world.sun, events);
  const debug = new DebugOverlay(hudRoot, renderer, import.meta.env.DEV || query.has('debug'));
  events.emit('debug:changed', debug.visible);

  const resize = (): void => {
    rig.resize(innerWidth, innerHeight);
    quality.resize(innerWidth, innerHeight);
  };
  addEventListener('resize', resize);
  resize();

  const loop = new FixedLoop({
    begin: (dt) => input.sample(dt),
    fixed: (step) => {
      const f = input.frame;
      if (f.micPressed) void voice.toggle();
      if (f.debugPressed) events.emit('debug:changed', debug.toggle());
      if (f.sitPressed) witch.toggleSit();
      if (f.wavePressed) witch.trigger('wave');
      if (f.attackPressed) attack();
      if (f.debugSay) simulate('', f.debugSay);
      player.fixedUpdate(step, f, rig.yaw, rig.pitch, world.colliders);
      input.consumeEdges();
    },
    frame: (dt, alpha) => {
      time += dt;
      player.render(alpha, dt);
      const mouth = voice.mouth(dt);
      const look = angleDelta(player.yaw, rig.yaw + Math.PI);
      witch.lookYaw = Math.abs(look) < 1.9 ? look : 0;
      witch.update(dt, player, mouth);
      const f = input.frame;
      rig.update(
        dt,
        f.lookX,
        f.lookY,
        player.renderPos,
        player.flying,
        world.colliders,
        player.speed,
      );
      for (let i = pending.length - 1; i >= 0; i--) {
        const p = pending[i];
        if (p && time >= p.at) {
          pending.splice(i, 1);
          p.run();
        }
      }
      spells.update(dt);
      dust.update(dt);
      for (const d of dummies) d.update(dt);
      world.sky.position.copy(rig.camera.position);
      world.sun.target.position.copy(player.renderPos);
      world.sun.position.copy(player.renderPos).add(SUN_OFFSET);
      world.fill.target.position.copy(player.renderPos);
      world.fill.position.copy(rig.camera.position).setY(rig.camera.position.y + 1.5);
      quality.render(dt);
      spellHud.update(dt, spells.mana / data.manaMax, mouth);
      debug.update(dt, () => ({
        quality: quality.id + (quality.auto ? ' (medindo)' : ''),
        state: player.flying ? 'voo' : player.grounded ? 'chão' : 'ar',
        pos: player.pos,
        mic: voice.on,
        ping: null,
        voice: diag,
      }));
    },
  });

  return { start: () => loop.start() };
}
