# DECISIONS
- D1 Repo `jogo`: fonte em `eco-src/`, build commitado em `eco/`. O Pages do repo serve a branch e não dá pra mudar a configuração daqui; por isso o build vai junto no commit. A raiz (`index.html`, jogo de terror) não é tocada.
- D2 O workflow só confere (lint, testes, build) a cada push em `eco-src/`; não publica.
- D3 TypeScript 6.0 (não 7): o typescript-eslint ainda não aceita o 7.
- D4 Rapier adiado até existir mundo: a arena é um chão plano e a colisão AABB própria basta.
- D5 Pós-processamento com os passes do three (GTAO + bloom) em chunk lazy.
- D6 Qualidade automática: começa no médio, mede 2,5 s, sobe/desce e confirma; escolha manual fica salva.
- D7 Toque: correr é botão de alternar; voo pela vassoura (comando de voz "vassoura", tecla F, botão).
- D8 `base: './'` no Vite: o build roda em qualquer subpasta.

## Língua e voz
- D9 O Chrome não aceita vocabulário próprio no reconhecimento em nuvem. Solução: deixar ele ouvir em pt-BR e DECODIFICAR o resultado: texto → fonemas → melhor segmentação em morfemas da língua (programação dinâmica com custo por som parecido), ignorando onde o Chrome cortou as palavras. "lá ventos", "Lá vem tus" e "laventus" viram todos `la·vent·us`. A tela nunca mostra o português ouvido (só no debug).
- D10 Onde existir, `SpeechRecognition.phrases` (viés de contexto, experimental) recebe as palavras da língua; se o navegador recusar, segue sem.
- D11 Morfemas escolhidos pra soarem como sílabas comuns do português (vent, pir, gel, lav, ter, kor · us, or, a, um, ar, ia), porque é isso que o reconhecedor consegue devolver.
- D12 Limiares do eco (`lingua.json` → `echo`): limpo ≤ 0,12 · fraco ≤ 0,24 · torto ≤ 0,36 · acima = sem eco. São chute inicial: calibrar com fala real.
- D13 Android manda confiança 0 com frequência: 0 = "sem informação", não "fraco". Lá não se usa getUserMedia (o Chrome não divide o mic).

## Magia (v1, proposta pra fechar junto)
- D14 Nada de poderes prontos. Raiz = essência em 6 eixos (calor, massa, fluxo, coesão, brilho, dobra). Palavra = prefixos + raízes + terminação. A 1ª raiz domina, as outras infundem. Terminação = forma (emissor genérico). 2ª palavra = sub-feitiço que nasce nos pontos de efeito da 1ª.
- D15 A matéria (cor, peso, arrasto, giro, quique, forma da partícula, velocidade, arco) é função contínua da essência (`materialize`). Qualquer mistura gera um material próprio.
- D16 Lei da tensão: forças opostas no mesmo eixo se anulam. < 0,6 harmônico (dura mais) · < 1,2 turbulento (instável no trajeto, dura menos) · acima estoura na mão. `ko-` liga os opostos e converte a tensão em potência. `la-` inverte a essência inteira.
- D17 "Batizar" feitiço com nome livre foi removido: palavra nova só existe se obedecer a gramática.
- D18 Feitiços ainda são só visuais + bonecos de treino; efeito no mundo depende da mecânica final.

## Personagem
- D19 Bruxa procedural v2: uma malha skinned (cor por vértice, ~3 mil triângulos) + rosto em canvas = 2 draw calls. Luz de preenchimento segue a câmera pra o rosto nunca ficar escuro.
- D20 Animações são funções de pose amostradas a 30 fps (curvas suaves, antecipação e acomodação) + camadas em tempo real: olhar pra mira, molas, amassa-e-estica, piscar, boca, poeira.
- D21 Pra ficar idêntica à arte, o caminho é um GLB modelado: `assets/characters/witch.glb` com ossos `mixamorig*` e clipes com os nomes de `ANIMS` entra sem mexer no código.
- D22 Animação: os ossos voltam pra pose de descanso todo quadro antes do mixer e todo clipe escreve o esqueleto inteiro. Antes, o olhar pra mira girava o peito um pouco a cada quadro em clipes sem trilha do peito, e ela rodava 360°.
- D23 Árvore própria: pesos por estado com fade; andar e correr tocam juntos com a mesma fase, misturados pela velocidade, e a fase anda pela distância (passada de 1,5 m andando e 3,3 m correndo). Velocidades 2,6 e 7,2 m/s.
- D24 Feitiço, aceno e dar de ombros em movimento tocam como camada aditiva só do tronco; parada, corpo inteiro. Pouso correndo não trava a corrida.
- D25 Molas do cabelo, saia e mangas: pêndulo amortecido em passos de 1/120 s, amortecendo a velocidade relativa ao apoio (correr não deixa a manga esticada pra trás). A versão anterior corrigia 100% da posição por quadro e tremia.
- D26 Botão de atacar (do build que o Rafael enviou) agora está no código: E, clique esquerdo com o mouse travado, RB ou botão na tela relançam a última magia falada, com recarga de 0,45 s.

## Multiplayer
- D27 Sem código de convite: quem abre o link entra na sala `praca` (pedido do Rafael). `?sala=nome` cria uma separada. Até 8; além disso o cliente ignora quem chega.
- D28 Trystero 0.26 com relés Nostr públicos (só apresentam os pares; o jogo vai direto por WebRTC). Carregado sob demanda: se falhar, o jogo segue solo e o ícone da sala fica vermelho.
- D29 Snapshots a 15 Hz (array de 10 números), exibidos 100 ms atrasados e interpolados; a própria bruxa é 100% local. Contadores de pulo/pouso viajam no snapshot pra animação remota disparar igual.
- D30 Magia na rede = só as palavras já decodificadas + potência + origem + mira. Cada cliente recalcula a magia pela mesma lógica e valida tudo que chega (raiz/prefixo/terminação têm que existir na língua).
- D31 Anfitrião = menor id da sala, sem troca de mensagem; se ele sai, o próximo assume sozinho. Hoje ele não decide nada (não há estado compartilhado ainda); fica pronto pra quando houver inimigos/objetos.
- D32 Voz por proximidade fica pra depois: no Android o Chrome não divide o microfone entre o reconhecimento de feitiço e uma chamada.

## Fala com sentido (09/11)
- D33 Medido com as 20 mil palavras mais comuns do português (wordfreq): antes, 40% das frases comuns de um teste viravam magia. Regras de forma: a 1ª palavra precisa de terminação; pelo menos 3 peças (prefixo/raiz/terminação), ou raiz + `-us`; no máximo 1 som sobrando; tolerância por peça menor; "eco torto" só quando UMA peça escorregou. Resultado: 0,85% das palavras e 0,14% dos pares.
- D34 Microfone padrão = segurar pra falar (botão do mic, Q, X do controle). Toque rápido / M = sempre aberto, que ainda ignora as 166 palavras comuns de `comuns.json` (geradas da lista de frequência).
- D35 Magia de 2 peças só com `-us` (`pirus`, `ventus`). `piror`, `lava`, `terum` não valem mais; vira `mapiror`, `malava`, `materum` etc.

## Poderes (09/11)
- D36 Cada raiz tem verbos (`lingua.json` → `verbs`): pir queima, vent empurra/levanta, gel esfria, lav molha, ter dano bruto/atordoa/sólido, kor puxa/rouba mana. `la-` troca pelo oposto. Opostos se anulam sem `ko-`; com `ko-` ficam os dois, e calor + frio/água explode em vapor.
- D37 Estados: queimando, molhado, frio (3 = congela), congelado, tonto. Reações saem do encontro dos estados, venham de quem vierem.
- D38 Formas: -or um alvo em cheio (kor puxa pra quem lançou) · -us funil que puxa e ergue · -a onda que empurra cada um uma vez · -um brota e lança pra cima; sólido (pedra/gelo) vira coluna com colisão por 7 s · -ar jato, vento dá coice em quem lança · -ia chuva com atraso.
- D39 Zonas no chão: poça, gelo, fogo, vapor. Frio na poça = gelo, fogo na poça = vapor, fogo no gelo = poça. Poça e gelo fazem escorregar.
- D40 Bonecos: 120 de vida, física, quebram e voltam em 3 s. Cada cliente simula os próprios (não sincroniza) — ok pra treino.
- D41 Correção (09/11, "nada tá indo"): toque rápido no mic liga o modo aberto, e ele bloqueava "ventos". Agora raiz + -us dita limpa nunca é bloqueada; `-us` também aceita "-is" ("pires" = pirus); entre as 5 alternativas do reconhecedor vale a melhor que vira encantamento. Lista de comuns regenerada (251): no modo aberto só 9 das 20 mil palavras passam, todas raiz + -us. Toda fala que falha mostra o que foi ouvido e o motivo ("Faltou a terminação: tente gelus", "Curta demais…").
- D42 Margem (09/11): segurando o botão é intenção de magia, então a escuta é generosa — limites maiores, peças julgadas uma a uma (som sobrando só enfraquece), vogal sobrando no fim custa pouco (gel → "gelo"), raiz sozinha ganha `-or` com eco fraco, "é" solto não vira "i". Modo aberto continua rígido (9 em 20 mil palavras comuns). Motor de voz alternativo no navegador (Whisper/Vosk) foi descartado: modelo de dezenas de MB, lento no celular e também só escreve palavras reais.
- D43 Visual por elemento (09/11): sprites com 7 desenhos no shader (`vfx/Sprites.ts`) + peças sólidas. Fogo = línguas de chama opacas + brilho + brasas; vento = riscos esticados no movimento; gelo = cristais apontando pra onde voam; água = gotas que caem e quicam; pedra = pedras que rolam; matéria = bolhas de vazio sugadas pro centro. Cada partícula de uma mistura sorteia a raiz pelo peso, então `ventigelus` mostra vento E gelo.
- D44 Formas com corpo: cabeça do projétil por raiz (lança de gelo, pedregulho, bolha d'água, lâmina de vento; fogo e matéria são núcleo de luz), funil do vórtice, anel da onda, coluna de energia, cone do jato, nuvem da chuva; pilar sólido de gelo = aglomerado de cristais, de pedra = coluna irregular. Impacto: anel de choque + flash de luz (3 luzes reaproveitadas).
- D45 Estados no boneco: chamas, gotas, cristais de geada que crescem a cada acúmulo de frio, bloco de gelo facetado, estrelas.
- D46 Câmera por cima do ombro direito (0,6 m) no chão: a bruxa não tampa a mira nem a magia. Em voo volta pro centro.
- D47 Visual estilizado (09/11), no estilo das referências: fitas pintadas com 3 faixas de tom e ruído que se desfaz (`vfx/Stylized.ts`, `vfx/Ribbon.ts`), orbes de núcleo claro, rastro por distância com fios em espiral, corte em meia-lua no lançar, riscos no chão, anel de choque com espinhos, hélice de 3 fios no vórtice/coluna, raio com fios enrolados, prisão de bolha d'água (água pura em pilar prende o alvo) e onomatopeia de quadrinho por raiz (`vfx/Style.ts`). `?lento=0.3` deixa o jogo em câmera lenta pra conferir efeitos.
- D48 Painel ADM (09/11): botão ADM no topo monta qualquer feitiço por peças (prefixos, até 3 raízes, terminação, 2ª palavra) e o entrega direto ao motor de essências, sem passar pela escuta (o filtro anti-conversa não se aplica). Pegar = equipa; Lançar = agora. Mana infinita opcional, salva no aparelho.
- D49 PvP entre amigos (09/11): toda bruxa da sala é alvo; magia nunca acerta o próprio dono (`Target.owner`). Cada um é dono da própria vida: a magia do outro é recalculada aqui e o dano daqui é o que vale; a vida (0..1) vai no snapshot (campo 11, aceita o formato antigo de 10). No outro aparelho a magia mostra o acerto, mas empurrão e vida são do dono. Zerou: derrubada 3 s, reaparece no ponto de nascer. Presa/congelada não anda nem lança.
- D50 Mira e 1ª pessoa: bolinha no centro; a magia vai da mão até o ponto que ela marca (raio da câmera em chão, paredes, bonecos e bruxas, ignorando o que está entre a câmera e a bruxa). Magias de chão usam só a direção horizontal. P / botão 3P-1P troca a câmera; em 1ª pessoa a bruxa some e vira com a câmera.
