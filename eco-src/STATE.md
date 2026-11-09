# ECO — STATE
Stack: TS estrito + Vite + Three.js r187. Repo `jogo`: fonte em `eco-src/`, build publicado em `eco/` (GitHub Pages serve a branch).
Rodar: `cd eco-src && npm i && npm run dev` · checar e publicar: `npm run lint && npm test && npm run build` (o build escreve em `../eco`; commitar junto).
Cenário: pós-apocalíptico (ainda não existe; hoje é uma arena cinza de testes). URL: `?debug` `?net=local|off` `?sala=nome` `?view=front|side|back|q&dist=2.2` `?lang=pt-BR`.

## Arquitetura (src/)
- core/ `Game.ts` raiz de composição (async, sem globais) · `Loop.ts` passo fixo 60 Hz · `Events.ts` barramento tipado
- input/ `InputManager` → `InputFrame`: `KeyboardMouse`, `Touch`, `Gamepad`
- camera/ `ThirdPersonCamera`: órbita, colisão, modo voo, `shake()`, `kick()`, FOV abre na corrida
- player/ `Player` física cinemática · witch/ `build.ts` (malha: tubos, mechas, skin de 2 ossos) · `rig.ts` (bruxa no design de
  referência, ossos `mixamorig*`) · `face.ts` (rosto em canvas, atlas boca x olhos) · `clips.ts` (15 clipes amostrados de funções)
  · `springs.ts` (cabelo, saia, mangas) · `Witch.ts` (GLB ou placeholder; máquina de animação + olhar, amassa-e-estica, poeira)
- spells/ `data/lingua.json` (TODA a língua) · `phonetics.ts` · `decode.ts` (fala em pt → morfemas da língua) ·
  `essence.ts` (essência, tensão, plano, matéria) · `interpret.ts` (alternativas → Cast) · `SpellSystem.ts` (formas = emissores) · `Grimoire.ts`
- voice/ `SpeechInput.ts` (Web Speech + viés `phrases`) · `Voice.ts` (liga/desliga, volume só no PC, boca)
- vfx/ `Particles.ts`, `Dust.ts` · world/ `Arena.ts`, `Dummies.ts` · physics/ `aabb.ts` (provisória) · quality/ · art/ · ui/ · debug/
- net/ `transport.ts` (Trystero/Nostr ou BroadcastChannel) · `protocol.ts` (snapshot, magia, anfitrião) · `interp.ts` · `Net.ts` · `RemotePlayer.ts`
- Ainda não existem: audio/, save/

## Feito
- M0 base · bruxa v2 + árvore de animação (andar/correr por velocidade, tronco aditivo, molas físicas) · botão de atacar · multiplayer: todo mundo do link na mesma sala · língua do Eco + decodificador + motor de essências (v1 da mecânica de magia)

## Próximo
- Calibrar o decodificador com fala real (o overlay de debug mostra o que o Chrome ouviu, os fonemas e o custo)
- Testar a sala com 2+ aparelhos reais · voz por proximidade · identificar cada jogador (nome/cor)
- Fechar a mecânica de magia com o Rafael · mundo pós-apocalíptico + Rapier
