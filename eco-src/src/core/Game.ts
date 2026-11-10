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
import { buildLexicon, decode, spell, type Morph, type ParsedWord } from '../spells/decode';
import { Grimoire } from '../spells/Grimoire';
import { interpret, type Alt, type Cast } from '../spells/interpret';
import { LINGUA } from '../spells/lingua';
import { SpellSystem, type Target } from '../spells/SpellSystem';
import { LocalFighter, RemoteFighter } from '../combat/Fighters';
import { rayAabb } from '../physics/aabb';
import { Vitals } from '../ui/Vitals';
import { Hud } from '../ui/Hud';
import { SpellHud, type CastView } from '../ui/SpellHud';
import { AdminPanel } from '../ui/Admin';
import { Dust } from '../vfx/Dust';
import { Voice } from '../voice/Voice';
import { createArena } from '../world/Arena';
import { Dummy } from '../world/Dummies';
import { Zones } from '../spells/Zones';
import { Popups } from '../ui/Popups';
import { Net } from '../net/Net';
import type { CastMsg } from '../net/protocol';
import { RemotePlayer } from '../net/RemotePlayer';
import { localTransport, trysteroTransport, type Transport } from '../net/transport';
import { plan as makePlan } from '../spells/essence';
import { Events, type GameEvents } from './Events';
import { FixedLoop } from './Loop';

const SUN_OFFSET = { x: 14, y: 30, z: 18 } as const;
/** Todo mundo que abre o link cai na mesma sala. `?sala=nome` separa; `?net=local` testa entre abas; `?net=off` desliga. */
const APP_ID = 'eco-soraha027-jogo';
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
  // cada um nasce num ponto um pouco diferente: na sala ninguém aparece dentro do outro
  const spawn = world.spawn
    .clone()
    .add(new Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 4));
  const player = new Player(spawn, world.half, events);
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
    rig.shoulder = 0;
    rig.pitch = 0.04;
    rig.yaw = { front: Math.PI, side: Math.PI / 2, q: Math.PI * 0.8 }[view] ?? 0;
  }
  const zones = new Zones(scene);
  const popups = new Popups(hudRoot);
  const DUMMY_SPOTS: [number, number][] = [
    [-5, -3],
    [0, -4],
    [5, -3],
    [-2.5, -8],
    [2.5, -8],
  ];
  const dummies = DUMMY_SPOTS.map(
    ([x, z]) =>
      new Dummy(scene, x, z, world.colliders, (at) => {
        spells.smoke(at, 30, 5);
        dust.land(at.clone().setY(0));
        popups.spawn('QUEBROU', at.clone().setY(2.4), 'solid', true);
      }),
  );

  // PvP: a própria bruxa também é alvo (das magias dos outros) e cada um é dono da própria vida
  const me = new LocalFighter(player, () => rig.shake(0.18));
  const targets: Target[] = [...dummies, me];
  const fighters = new Map<string, RemoteFighter>();

  const data = LINGUA;
  const lexicon = buildLexicon(data);
  const grimoire = new Grimoire();
  const spells: SpellSystem = new SpellSystem(data, scene, world.colliders, targets, zones, {
    popup: (text, at, kind, big) => popups.spawn(text, at, kind, big),
    drain: (amount) => (spells.mana = Math.min(data.manaMax, spells.mana + amount)),
    recoil: (v) => player.impulse(v),
  });
  spells.camera = rig.camera;
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
    if (me.held) return;
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
    if (me.held) return; // presa, congelada ou derrubada não lança
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
      view.why = `Ouvi “${cast.heard}”. ${cast.why || 'Isso não é a língua do Eco.'}`;
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

    // mira: o ponto que a bolinha do centro da tela marca (?view=side: de lado, pra inspeção)
    const sideView = query.get('view') === 'side';
    const aimYaw = rig.yaw + (sideView ? Math.PI / 2 : 0);
    const point = sideView ? null : aimPoint();
    const aimFrom = (from: Vector3): Vector3 =>
      point
        ? point.clone().sub(from).normalize()
        : new Vector3(-Math.sin(aimYaw), 0.03, -Math.cos(aimYaw));
    const aim = aimFrom(player.pos.clone().setY(player.pos.y + 1.2));
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
        const aim = aimFrom(hand);
        const ok = spells.cast(plan, power, hand, aim, player.pos);
        net?.sendCast({
          words: [plan.body, ...(plan.infusion ? [plan.infusion] : [])].map((w) => ({
            prefixes: w.prefixes,
            roots: w.roots,
            ending: w.ending,
          })),
          power,
          origin: [hand.x, hand.y, hand.z],
          aim: [aim.x, aim.y, aim.z],
        });
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
  /** Onde a bolinha da mira aponta: chão, parede, boneco ou outra bruxa (até 60 m). */
  const aimPoint = (): Vector3 => {
    const cam = rig.camera;
    const o = cam.position;
    const d = cam.getWorldDirection(new Vector3());
    // em 3ª pessoa ignora o que está entre a câmera e a bruxa
    const minT = rig.firstPerson ? 0.3 : o.distanceTo(player.renderPos) + 0.3;
    let t = 60;
    if (d.y < -1e-4) t = Math.min(t, -o.y / d.y);
    for (const b of world.colliders) {
      const h = rayAabb(o.x, o.y, o.z, d.x, d.y, d.z, b, t);
      if (h >= minT) t = Math.min(t, h);
    }
    for (const tg of targets) {
      if (tg === me || !tg.alive) continue;
      const c = tg.pos
        .clone()
        .setY(tg.pos.y + 1)
        .sub(o);
      const tca = c.dot(d);
      const d2 = c.lengthSq() - tca * tca;
      const r2 = (tg.radius + 0.35) ** 2;
      if (d2 > r2) continue;
      const h = tca - Math.sqrt(r2 - d2);
      if (h >= minT) t = Math.min(t, h);
    }
    return o.clone().addScaledVector(d, Math.max(t, minT));
  };
  const say = (alts: Alt[], weak: boolean, strict = false): void => {
    const cast = interpret(alts, lexicon, { rng: Math.random, weak, strict, lenient: !strict });
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
    { toggleMic: () => void voice.toggle(), holdMic: (d) => void voice.hold(d), say: simulate },
    PRESETS,
  );

  // ---------- ADM: pegar qualquer feitiço sem falar ----------
  let infiniteMana = false;
  const adminCast = (words: ParsedWord[]): Extract<Cast, { kind: 'spell' }> | null => {
    const p = makePlan(words, data);
    if (!p) return null;
    const morphs: Morph[] = words.flatMap((w) => [
      ...w.prefixes.map((id) => ({ kind: 'prefix' as const, id, cost: 0 })),
      ...w.roots.map((id) => ({ kind: 'root' as const, id, cost: 0 })),
      ...(w.ending ? [{ kind: 'ending' as const, id: w.ending, cost: 0 }] : []),
    ]);
    return {
      kind: 'spell',
      echo: 'limpo',
      plan: p,
      morphs,
      heard: p.text,
      phonemes: '',
      cost: 0,
      why: '',
    };
  };
  new AdminPanel(hudRoot, data, {
    preview: (words) => {
      const p = makePlan(words, data);
      return p ? { reading: p.reading, state: p.state } : null;
    },
    equip: (words) => {
      const c = adminCast(words);
      if (!c?.plan) return;
      equipped = c;
      touch.setEquipped(c.plan.text);
      spellHud.showCast({
        echo: 'limpo',
        morphs: c.morphs,
        reading: c.plan.reading,
        state: c.plan.state,
        why: 'Pegou. E / clique / ataque lançam.',
        isNew: false,
      });
    },
    cast: (words) => {
      const c = adminCast(words);
      if (c) onCast(c);
    },
    setInfinite: (on) => (infiniteMana = on),
  });

  // ---------- multiplayer: abriu o link, está na sala ----------
  let net: Net | null = null;
  const remotes = new Map<string, RemotePlayer>();
  const remoteFx = {
    step: (p: Vector3, running: boolean) => dust.step(p, running),
    jump: (p: Vector3, double: boolean) => dust.jump(p, double),
    land: (p: Vector3) => dust.land(p),
  };
  const netStatus = (status: GameEvents['net:changed']['status'], detail?: string): void =>
    events.emit('net:changed', { count: net?.count ?? 1, status, detail });
  const onRemoteCast = (id: string, m: CastMsg): void => {
    const r = remotes.get(id);
    const p = makePlan(m.words, data);
    if (!r || !p) return;
    r.witch.trigger('cast');
    const at = new Vector3(r.state.x, r.state.y, r.state.z);
    const ok = spells.cast(p, m.power, new Vector3(...m.origin), new Vector3(...m.aim), at, id);
    if (!ok) {
      r.witch.trigger('fail');
      r.witch.setSoot(4);
    }
  };
  const connect = async (): Promise<void> => {
    const mode = query.get('net');
    if (mode === 'off') return netStatus('offline');
    const room = query.get('sala') ?? 'praca';
    netStatus('conectando');
    let t: Transport;
    try {
      t = mode === 'local' ? localTransport(room) : await trysteroTransport(APP_ID, room);
    } catch (err) {
      return netStatus('erro', err instanceof Error ? err.message : String(err));
    }
    net = new Net(t, {
      join: (id) => {
        netStatus(t.kind === 'local' ? 'local' : 'online');
        void RemotePlayer.create(remoteFx).then((r) => {
          if (!net?.buffers.has(id)) return; // saiu antes de carregar
          remotes.set(id, r);
          scene.add(r.object);
          const f = new RemoteFighter(id, r);
          fighters.set(id, f);
          targets.push(f);
        });
      },
      leave: (id) => {
        const r = remotes.get(id);
        if (r) scene.remove(r.object);
        remotes.delete(id);
        const f = fighters.get(id);
        if (f) targets.splice(targets.indexOf(f), 1);
        fighters.delete(id);
        netStatus(t.kind === 'local' ? 'local' : 'online');
      },
      cast: onRemoteCast,
    });
    netStatus(t.kind === 'local' ? 'local' : 'online');
    addEventListener('pagehide', () => net?.leave());
  };
  void connect();

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

  // 1ª / 3ª pessoa (P ou botão 3P/1P); a bolinha da mira some só na câmera de inspeção
  const toggleView = (): void => {
    rig.firstPerson = !rig.firstPerson;
    vitals.setView(rig.firstPerson);
  };
  const vitals = new Vitals(hudRoot, toggleView);
  vitals.showCrosshair(!view);
  const HELD = { moveX: 0, moveY: 0, jump: false, jumpPressed: false, sprint: false };

  let castHeld = false;
  const loop = new FixedLoop({
    begin: (dt) => input.sample(dt),
    fixed: (step) => {
      const f = input.frame;
      if (f.micPressed) void voice.toggle();
      if (f.castHeld !== castHeld) {
        castHeld = f.castHeld;
        void voice.hold(castHeld);
      }
      if (f.debugPressed) events.emit('debug:changed', debug.toggle());
      if (f.sitPressed) witch.toggleSit();
      if (f.wavePressed) witch.trigger('wave');
      if (f.attackPressed) attack();
      if (f.viewPressed) toggleView();
      if (f.debugSay) simulate('', f.debugSay);
      player.fixedUpdate(
        step,
        me.held ? { ...f, ...HELD } : f,
        rig.yaw,
        rig.pitch,
        world.colliders,
      );
      input.consumeEdges();
    },
    frame: (dt, alpha) => {
      time += dt;
      const life = me.update(dt);
      if (life === 'down') {
        popups.spawn('DERRUBADA', player.pos.clone().setY(player.pos.y + 2.2), 'burn', true);
        spells.smoke(player.pos.clone().setY(player.pos.y + 1), 30, 4);
        rig.shake(0.5);
        navigator.vibrate?.([60, 40, 120]);
      } else if (life === 'up') {
        player.teleport(spawn);
        spells.mana = data.manaMax;
      }
      // em 1ª pessoa a bruxa some (a câmera está nos olhos) e vira junto com a câmera
      witch.root.visible = me.alive && !rig.firstPerson;
      if (rig.firstPerson && !player.flying) player.face(rig.yaw + Math.PI, 0.05);
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
      net?.update(dt, {
        x: player.pos.x,
        y: player.pos.y,
        z: player.pos.z,
        yaw: player.yaw,
        speed: player.speed,
        grounded: player.grounded,
        flying: player.flying,
        jumpCount: player.jumpCount,
        lastJumpDouble: player.lastJumpDouble,
        landCount: player.landCount,
        mouth,
        hp: me.hp01,
      });
      const now = performance.now() / 1000;
      for (const [id, r] of remotes) r.update(dt, now, net?.buffers.get(id));
      for (const fg of fighters.values()) fg.update(dt, rig.camera);
      spells.update(dt);
      if (infiniteMana) spells.mana = data.manaMax;
      dust.update(dt);
      zones.update(dt);
      player.surface = player.grounded ? zones.surface(player.pos.x, player.pos.z) : null;
      for (const d of dummies) {
        d.surface = zones.surface(d.pos.x, d.pos.z);
        d.update(dt, rig.camera);
      }
      popups.update(dt, rig.camera, innerWidth, innerHeight);
      world.sky.position.copy(rig.camera.position);
      world.sun.target.position.copy(player.renderPos);
      world.sun.position.copy(player.renderPos).add(SUN_OFFSET);
      world.fill.target.position.copy(player.renderPos);
      world.fill.position.copy(rig.camera.position).setY(rig.camera.position.y + 1.5);
      quality.render(dt);
      spellHud.update(dt, spells.mana / data.manaMax, mouth);
      vitals.update(dt, me.hp01, me.downLeft);
      debug.update(dt, () => ({
        quality: quality.id + (quality.auto ? ' (medindo)' : ''),
        state: player.flying ? 'voo' : player.grounded ? 'chão' : 'ar',
        pos: player.pos,
        mic: voice.on,
        ping: net?.ping ?? null,
        voice:
          (net ? `sala: ${net.count} · ${net.kind}${net.isHost ? ' · anfitrião' : ''}\n` : '') +
          diag,
      }));
    },
  });

  loop.timeScale = Number(query.get('lento') ?? 1) || 1;
  return { start: () => loop.start() };
}
