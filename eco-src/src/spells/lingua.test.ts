import { describe, expect, it } from 'vitest';
import { buildLexicon, decode, spell } from './decode';
import { describe as read, materialize, plan, wordEssence } from './essence';
import { interpret, type Cast } from './interpret';
import { phon, soundDistance, toPhonemes } from './phonetics';

const lex = buildLexicon();
const text = (heard: string): string | null => {
  const d = decode(heard, lex);
  return d ? spell(d.words) : null;
};
const cast = (heard: string, weak = false, confidence = 0.9): Extract<Cast, { kind: 'spell' }> => {
  const c = interpret([{ text: heard, confidence }], lex, { rng: () => 0, weak });
  if (c?.kind !== 'spell') throw new Error(`esperava magia para "${heard}"`);
  return c;
};

describe('fonética', () => {
  it('lê como um brasileiro', () => {
    expect(phon('gelus')).toBe('jelus');
    expect(phon('ventos')).toBe('ventus');
    expect(phon('quero')).toBe('keru');
    expect(phon('guerra')).toBe('gera');
    expect(toPhonemes('Lá vem tus')).toBe('laventus');
  });
  it('sons parecidos custam pouco', () => {
    expect(soundDistance('agua', 'akua')).toBeLessThan(0.5);
    expect(soundDistance('ventus', 'ventus')).toBe(0);
    expect(soundDistance('banana', 'ventus')).toBeGreaterThan(3);
  });
});

describe('o microfone entende a língua do jogo', () => {
  it('decodifica a escrita da língua', () => {
    expect(text('ventus')).toBe('ventus');
    expect(text('laventus gel')).toBe('laventus gel');
    expect(text('kopirigelor')).toBe('kopirigelor');
    expect(text('ventus gelus')).toBe('ventus gelus');
  });
  it('decodifica o que o Chrome escreveria em português', () => {
    expect(text('ventos')).toBe('ventus');
    expect(text('lá ventos gel')).toBe('laventus gel');
    expect(text('vento gelos')).toBe('ventigelus');
    expect(text('lava')).toBe('lava');
    expect(text('terra')).toBe('tera');
    expect(text('ter um')).toBe('terum');
    expect(text('pirar')).toBe('pirar');
    expect(text('Lá vem tus')).toBe('laventus');
  });
  it('conversa comum não vira magia', () => {
    expect(cast('abacaxi com banana').echo).toBe('sem_eco');
    expect(cast('hoje eu fui no mercado').echo).toBe('sem_eco');
    expect(interpret([{ text: 'é', confidence: 1 }], lex, { rng: () => 0 })).toBeNull();
  });
  it('escolhe a alternativa que soa mais perto', () => {
    const c = interpret(
      [
        { text: 'lavagem', confidence: 0.9 },
        { text: 'lá ventos', confidence: 0.4 },
      ],
      lex,
      { rng: () => 0 },
    );
    expect(c?.kind === 'spell' && c.plan?.text).toBe('laventus');
  });
  it('comandos passam direto', () =>
    expect(interpret([{ text: 'Vassoura', confidence: 1 }], lex, { rng: () => 0 })).toEqual({
      kind: 'command',
      id: 'vassoura',
    }));
});

describe('só encantamento vira magia', () => {
  const magic = (t: string, strict = false): boolean => {
    const c = interpret([{ text: t, confidence: 0.9 }], lex, { rng: () => 0, strict });
    return c?.kind === 'spell' && c.echo !== 'sem_eco';
  };
  it('fala comum não conjura', () => {
    for (const t of [
      'bom dia',
      'vamos lá',
      'cara',
      'agora',
      'terra',
      'lava',
      'correr',
      'pirar',
      'terror',
      'que calor',
      'olha ali',
      'vem cá',
      'cor',
    ])
      expect(magic(t), t).toBe(false);
  });
  it('palavra sem terminação não é encantamento', () => expect(magic('ventigel')).toBe(false));
  it('curta só com -us; o resto precisa de 3 peças', () => {
    expect(magic('ventus')).toBe(true);
    expect(magic('gelor')).toBe(false);
    expect(magic('magelor')).toBe(true);
    expect(magic('pirigelor')).toBe(true);
  });
  it('microfone aberto ignora palavras comuns que soam como magia; segurando, valem', () => {
    expect(magic('pires')).toBe(true);
    expect(magic('ventos', true)).toBe(true); // raiz + -us limpa é magia curta de verdade
    expect(magic('carros', true)).toBe(false);
    expect(magic('ventos', false)).toBe(true);
    expect(magic('matéria', true)).toBe(false);
  });
});

describe('segurando o botão tem margem', () => {
  const hold = (t: string): Extract<Cast, { kind: 'spell' }> | null => {
    const c = interpret([{ text: t, confidence: 0.9 }], lex, { rng: () => 0, lenient: true });
    return c?.kind === 'spell' ? c : null;
  };
  it('raiz sozinha vira projétil fraco', () => {
    expect(hold('gelo')).toMatchObject({ echo: 'fraco' });
    expect(hold('gelo')?.plan?.text).toBe('gelor');
  });
  it('vogal sobrando e palavra partida não derrubam', () => {
    expect(hold('vento gelo')?.echo).toBe('fraco');
    expect(hold('mag é lor')?.plan?.text).toBe('magelor');
  });
  it('conversa continua de fora', () => {
    expect(hold('abacaxi com banana')?.echo).toBe('sem_eco');
    expect(hold('bom dia')?.echo).toBe('sem_eco');
  });
});

describe('eco da pronúncia', () => {
  it('limpo, fraco, torto, sem força', () => {
    expect(cast('ventus').echo).toBe('limpo');
    expect(cast('vendus gelus').echo).toBe('limpo');
    expect(cast('bentus jeros').echo).toBe('fraco');
    expect(cast('ventus', true).echo).toBe('sem_forca');
    expect(cast('ventus', false, 0.2).echo).toBe('sem_forca');
    expect(cast('ventus', false, 0).echo).toBe('limpo'); // Android manda confiança 0
  });
  it('eco torto troca um morfema e sai outra magia', () => {
    const c = cast('ventus kelus');
    expect(c.echo).toBe('torto');
    expect(c.plan?.text).not.toBe('ventus gelus');
  });
});

describe('motor de essências', () => {
  const p = (heard: string) => {
    const d = decode(heard, lex);
    const out = d && plan(d.words);
    if (!out) throw new Error(heard);
    return out;
  };
  it('a ordem das raízes muda a essência', () => {
    const a = wordEssence({ prefixes: [], roots: ['vent', 'gel'], ending: 'us' });
    const b = wordEssence({ prefixes: [], roots: ['gel', 'vent'], ending: 'us' });
    expect(a).not.toEqual(b);
    expect(read(a)).toContain('leve');
    expect(read(b)).toContain('gélido');
  });
  it('"la" vira a essência do avesso', () => {
    const fire = p('piror').body.essence;
    const anti = p('lapiror').body.essence;
    expect(anti[0]).toBe(-(fire[0] ?? 0));
    expect(read(anti)).toContain('gélido');
  });
  it('afins são harmônicos, opostos são instáveis, "ko" liga', () => {
    expect(p('piriventor').state).toBe('harmonico');
    expect(p('ventus gelus').state).toBe('turbulento');
    expect(p('pirigelor').state).toBe('instavel');
    expect(p('pirigelor').conflict).toBe('pir × gel');
    const bound = p('kopirigelor');
    expect(bound.state).toBe('ligado');
    expect(bound.power).toBeGreaterThan(1.2);
  });
  it('prefixos mudam tamanho, repetição e origem', () => {
    expect(p('maventus').scale).toBeGreaterThan(1.5);
    expect(p('miventus').scale).toBeLessThan(0.6);
    expect(p('reventor').echoes).toBe(3);
    expect(p('alteror').fromAbove).toBe(true);
    expect(p('maventus').cost).toBeGreaterThan(p('ventus').cost);
  });
  it('sem terminação na infusão ela só se mistura', () =>
    expect(p('laventus gel').infusion?.shape).toBeNull());
  it('a matéria sai da essência, não de tabela', () => {
    const stone = materialize(p('terum').body.essence);
    const wind = materialize(p('ventus').body.essence);
    const mix = materialize(p('terilavum').body.essence);
    expect(stone.gravity).toBeGreaterThan(10);
    expect(stone.box).toBe(true);
    expect(wind.gravity).toBeLessThan(0);
    expect(wind.swirl).toBeGreaterThan(5);
    expect(mix.gravity).not.toBe(stone.gravity);
    expect(mix.colors[0]?.getHex()).not.toBe(stone.colors[0]?.getHex());
  });
  it('descreve o que saiu', () =>
    expect(p('ventus gelus').reading).toMatch(/^vórtice .*leve.* \+ vórtice .*gélido/));
});
