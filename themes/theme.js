// ─── Theme loader ───────────────────────────────────────────────────────────
// Reads theme ID from THEME env var or --theme=xxx CLI arg, loads theme config.

const path = require('path');

function getThemeId() {
  // CLI arg: --theme=buchhalter
  const cliArg = process.argv.find(a => a.startsWith('--theme='));
  if (cliArg) return cliArg.split('=')[1];

  // Env var: THEME=buchhalter
  if (process.env.THEME) return process.env.THEME;

  // Default
  return 'eleonore';
}

function loadTheme(themeId) {
  const id = themeId || getThemeId();
  const themeDir = path.join(__dirname, id);

  const config = require(path.join(themeDir, 'config'));
  const prompts = require(path.join(themeDir, 'prompts'));
  const db = require(path.join(themeDir, 'db'));
  const routes = require(path.join(themeDir, 'routes'));
  const cssPath = path.join(themeDir, 'theme.css');
  const templatesDir = path.join(themeDir, 'templates');

  return { id, config, prompts, db, routes, cssPath, templatesDir, themeDir };
}

module.exports = { getThemeId, loadTheme };
