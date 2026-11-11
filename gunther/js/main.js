// Starts the game: loads pictures, builds the island, then runs the main loop.
// The loop asks the current scene to update (move things) and draw, about 60 times a second.

import { ctx, overlay, resize, setScene, getScene } from './core.js';
import { loadAssets } from './sprites.js';
import { buildTerrain } from './terrain.js';
import { game, newGame, loadSave, save } from './state.js';
import { mapScene, populate } from './world.js';
import { battleScene } from './battle.js';
import { titleScene } from './menus.js';
import { SETTLEMENTS } from './data.js';

let last = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // cap so a paused tab doesn't teleport everything
  last = now;
  // Keep the loop alive even if one frame hits a bug, so the game doesn't freeze.
  try {
    getScene().update(dt);
    ctx.imageSmoothingEnabled = false;
    getScene().draw();
  } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}

loadAssets().then(() => {
  resize();
  buildTerrain();
  // Show the island behind the title screen: the saved game if there is one, otherwise a fresh one.
  if (!loadSave()) { newGame(false); populate(); }
  setScene(titleScene);
  last = performance.now();
  requestAnimationFrame(frame);
  // Save when the tab is hidden, so closing a phone browser keeps progress.
  document.addEventListener('visibilitychange', () => { if (document.hidden && getScene() !== titleScene) save(); });
  // Handy for testing from the browser console.
  window.__gunther = { game, SETTLEMENTS, scenes: { titleScene, mapScene, battleScene }, getScene, setScene };
}).catch(err => {
  overlay.classList.add('show');
  overlay.innerHTML = '<div class="panel"><h2>Could not start</h2><p>' + err.message + '</p></div>';
  console.error(err);
});
