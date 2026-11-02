import { MODULE_ID, TYPES, typeOfFolder } from "./data.js";
import { registerSettings, currentTheme, scheduleCleanup, cleanupInvalidRefs } from "./store.js";
import { renderDirectoryControls, addContextOptions, addFolderContextOptions } from "./sidebar.js";
import { managers, refreshManager } from "./manager.js";

// Só estes campos aparecem na janela de segmentos. Outras mudanças (PV, atributos,
// itens da ficha) acontecem o tempo todo em combate e não pedem redesenho.
const DISPLAYED_FIELDS = ["name", "img", "folder"];

function applyTheme() {
  document.body.dataset.spTheme = currentTheme();
  for (const app of managers.values()) app.requestRender();
}

Hooks.once("init", () => {
  registerSettings({
    onSegmentsChange: type => {
      ui[type]?.render();
      refreshManager(type);
    },
    onThemeChange: applyTheme
  });
  applyTheme();

  for (const [type, { documentName }] of Object.entries(TYPES)) {
    Hooks.on(`render${documentName}Directory`, (app, element) => renderDirectoryControls(type, element));
    Hooks.on(`get${documentName}ContextOptions`, (app, options) => addContextOptions(type, options));
    Hooks.on(`create${documentName}`, () => refreshManager(type));
    Hooks.on(`update${documentName}`, (doc, changes) => {
      const hiddenChanged = changes.flags?.[MODULE_ID] !== undefined;
      // Ocultar/restaurar só muda uma flag, e o Foundry não redesenha a barra lateral por isso.
      // O hook roda em todos os clientes, então todos veem a mudança.
      if (hiddenChanged) ui[type]?.render();
      if (hiddenChanged || DISPLAYED_FIELDS.some(field => field in changes)) refreshManager(type);
    });
    Hooks.on(`delete${documentName}`, () => {
      refreshManager(type);
      scheduleCleanup(type);
    });
  }

  Hooks.on("getFolderContextOptions", addFolderContextOptions);
  Hooks.on("createFolder", folder => {
    const type = typeOfFolder(folder);
    if (type) refreshManager(type);
  });
  Hooks.on("updateFolder", (folder, changes) => {
    const type = typeOfFolder(folder);
    if (!type) return;
    // Ocultar ou restaurar uma pasta só muda uma flag; a barra lateral precisa ser redesenhada.
    if (changes.flags?.[MODULE_ID] !== undefined) ui[type]?.render();
    refreshManager(type);
  });
  Hooks.on("deleteFolder", folder => {
    const type = typeOfFolder(folder);
    if (!type) return;
    refreshManager(type);
    scheduleCleanup(type);
  });
});

// Remove referências a elementos apagados enquanto nenhum Mestre estava conectado.
Hooks.once("ready", () => {
  for (const type of Object.keys(TYPES)) cleanupInvalidRefs(type);
});
