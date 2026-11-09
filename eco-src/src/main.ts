import { createGame } from './core/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const hud = document.querySelector<HTMLElement>('#hud');
const loading = document.querySelector<HTMLElement>('#loading');
if (!canvas || !hud) throw new Error('index.html sem #game/#hud');

createGame(canvas, hud)
  .then((game) => {
    game.start();
    loading?.classList.add('done');
  })
  .catch((err: unknown) => {
    if (loading)
      loading.textContent = `Erro ao iniciar: ${err instanceof Error ? err.message : String(err)}`;
    throw err;
  });
