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
