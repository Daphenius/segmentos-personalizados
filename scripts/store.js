import { MODULE_ID, TYPES, THEMES, t, sanitizeSegments, getFolder } from "./data.js";

const writeQueues = {};
const cleanupTimers = {};

export function registerSettings({ onSegmentsChange, onThemeChange }) {
  game.settings.register(MODULE_ID, "theme", {
    name: "SEGMENTOS.Settings.Theme.Name",
    hint: "SEGMENTOS.Settings.Theme.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: Object.fromEntries(Object.keys(THEMES).map(key => [key, `SEGMENTOS.Themes.${key}`])),
    default: "ambar",
    onChange: onThemeChange
  });

  for (const type of Object.keys(TYPES)) {
    game.settings.register(MODULE_ID, `${type}Segments`, {
      name: `SEGMENTOS.Type.${type}.Title`,
      scope: "world",
      config: false,
      type: Array,
      default: [],
      onChange: () => onSegmentsChange(type)
    });
  }
}

export function currentTheme() {
  const value = game.settings.get(MODULE_ID, "theme");
  return Object.hasOwn(THEMES, value) ? value : "ambar";
}

export function getSegments(type) {
  return sanitizeSegments(game.settings.get(MODULE_ID, `${type}Segments`));
}

/**
 * Altera os segmentos de um tipo. `mutate` recebe uma cópia lida na hora e a modifica;
 * se retornar false, nada é gravado.
 *
 * As alterações deste cliente entram numa fila: cada uma lê o estado deixado pela
 * anterior, então cliques rápidos não se sobrescrevem. Entre dois Mestres a fila não
 * ajuda: o Foundry não oferece gravação condicional de configurações, e se os dois
 * gravarem no mesmo instante vale a última gravação (ver README, "Limitações").
 *
 * Retorna "saved", "unchanged" ou "failed".
 */
export function updateSegments(type, mutate) {
  const run = async () => {
    if (!game.user.isGM) {
      ui.notifications.warn(t("Notify.GMOnlyEdit"));
      return "failed";
    }
    const segments = getSegments(type);
    try {
      if (mutate(segments) === false) return "unchanged";
    } catch (err) {
      console.error(`${MODULE_ID} | Erro ao preparar a alteração dos segmentos de ${type}`, err);
      ui.notifications.error(t("Notify.PrepareError"));
      return "failed";
    }
    try {
      await game.settings.set(MODULE_ID, `${type}Segments`, sanitizeSegments(segments));
      return "saved";
    } catch (err) {
      console.error(`${MODULE_ID} | Falha ao salvar os segmentos de ${type}`, err);
      ui.notifications.error(t("Notify.SaveError"));
      return "failed";
    }
  };
  const next = (writeQueues[type] ?? Promise.resolve()).then(run, run);
  writeQueues[type] = next;
  return next;
}

/** Excluir uma pasta com conteúdo dispara um hook por documento; a limpeza roda uma vez só no fim. */
export function scheduleCleanup(type) {
  clearTimeout(cleanupTimers[type]);
  cleanupTimers[type] = setTimeout(() => {
    delete cleanupTimers[type];
    cleanupInvalidRefs(type);
  }, 300);
}

/**
 * Tira dos segmentos os IDs de pastas e documentos que não existem mais. Não apaga nada do mundo.
 * Só o Mestre ativo executa, para dois Mestres não gravarem a mesma limpeza.
 */
export async function cleanupInvalidRefs(type) {
  if (!game.users.activeGM?.isSelf) return 0;
  let removed = 0;
  const docs = TYPES[type].collection();
  const result = await updateSegments(type, segments => {
    removed = 0;
    for (const segment of segments) {
      const documentIds = segment.documentIds.filter(id => docs.has(id));
      const folderIds = segment.folderIds.filter(id => getFolder(type, id));
      removed += segment.documentIds.length - documentIds.length + segment.folderIds.length - folderIds.length;
      segment.documentIds = documentIds;
      segment.folderIds = folderIds;
    }
    return removed > 0;
  });
  if (result !== "saved") return 0;
  ui.notifications.info(t("Notify.Cleanup", { count: removed, type: t(`Type.${type}.Label`) }));
  return removed;
}

export async function setHidden(doc, hidden) {
  if (!doc || !game.user.isGM) return false;
  try {
    if (hidden) await doc.setFlag(MODULE_ID, "hidden", true);
    else await doc.unsetFlag(MODULE_ID, "hidden");
    const key = doc.documentName === "Folder"
      ? (hidden ? "Notify.FolderHidden" : "Notify.FolderRestored")
      : (hidden ? "Notify.Hidden" : "Notify.Restored");
    ui.notifications.info(t(key, { name: doc.name }));
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | Falha ao ocultar/restaurar ${doc.name}`, err);
    ui.notifications.error(t("Notify.HideError", { name: doc.name }));
    return false;
  }
}
