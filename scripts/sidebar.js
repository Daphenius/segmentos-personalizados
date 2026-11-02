// O Foundry não tem API para filtrar a barra lateral. Este arquivo trabalha sobre o HTML
// que o diretório já desenhou e é reaplicado a cada renderActorDirectory/renderItemDirectory.

import { TYPES, t, displayName, isHidden, segmentHas, folderChain } from "./data.js";
import { getSegments, setHidden } from "./store.js";
import { openManager } from "./manager.js";

// Filtro escolhido em cada barra lateral. Fica em memória para sobreviver aos redesenhos.
export const activeFilter = { actors: "", items: "" };

function getDocId(element) {
  return element?.dataset?.entryId || null;
}

function iconButton(className, label, icon) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.tooltipText = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = `<i class="fa-solid ${icon}" inert></i>`;
  return button;
}

export function renderDirectoryControls(type, root) {
  const header = root?.querySelector(".directory-header");
  if (!header) return;

  root.querySelector(".sp-controls")?.remove();

  const select = document.createElement("select");
  select.className = "sp-filter";
  select.setAttribute("aria-label", t("Sidebar.Filter"));
  const addOption = (value, text) => select.append(new Option(text, value));
  addOption("", t(`Type.${type}.All`));
  addOption("__unassigned", t("Sidebar.Unassigned"));
  for (const segment of getSegments(type)) addOption(segment.id, displayName(segment));
  if (game.user.isGM) addOption("__hidden", t("Sidebar.Hidden"));

  // Segmento excluído, ou opção que este usuário não vê: volta para "Todos".
  if (![...select.options].some(o => o.value === activeFilter[type])) activeFilter[type] = "";
  select.value = activeFilter[type];

  const controls = document.createElement("div");
  controls.className = "sp-controls";
  controls.classList.toggle("sp-active", Boolean(activeFilter[type]));

  const field = document.createElement("div");
  field.className = "sp-filter-field";
  field.innerHTML = '<i class="fa-solid fa-filter" inert></i>';
  const clear = iconButton("sp-clear", t("Sidebar.ClearFilter"), "fa-xmark");
  field.append(select, clear);
  controls.append(field);

  const setFilter = value => {
    activeFilter[type] = value;
    select.value = value;
    controls.classList.toggle("sp-active", Boolean(value));
    applyFilter(type, root);
  };
  select.addEventListener("change", () => setFilter(select.value));
  clear.addEventListener("click", () => setFilter(""));

  if (game.user.isGM) {
    const manage = iconButton("sp-manage", t("Sidebar.Manage"), "fa-layer-group");
    manage.addEventListener("click", () => openManager(type));
    controls.append(manage);
  }

  header.append(controls);
  applyFilter(type, root);
}

export function applyFilter(type, root) {
  const selected = activeFilter[type];
  const segments = getSegments(type);
  const segment = segments.find(s => s.id === selected);
  const collection = TYPES[type].collection();

  const isVisible = doc => {
    const hidden = isHidden(doc);
    if (selected === "__hidden") return hidden;
    if (hidden) return false;
    if (selected === "__unassigned") return !segments.some(s => segmentHas(s, doc));
    if (segment) return segmentHas(segment, doc);
    return true;
  };

  for (const row of root.querySelectorAll("li.directory-item[data-entry-id]")) {
    const doc = collection.get(getDocId(row));
    if (doc) row.classList.toggle("sp-hidden", !isVisible(doc));
  }

  // Pastas são decididas pelos dados, não pelo HTML: o conteúdo de uma pasta fechada pode
  // não estar desenhado. Uma pasta aparece se tiver algum documento visível nela ou abaixo dela.
  const foldersWithContent = new Set();
  if (selected) {
    for (const doc of collection) {
      if (isVisible(doc)) for (const id of folderChain(doc.folder)) foldersWithContent.add(id);
    }
  }
  for (const li of root.querySelectorAll("li.folder[data-folder-id]")) {
    li.classList.toggle("sp-hidden", Boolean(selected) && !foldersWithContent.has(li.dataset.folderId));
  }
}

export function addContextOptions(type, options) {
  if (!game.user.isGM) return;
  const getDoc = li => TYPES[type].collection().get(getDocId(li)) ?? null;

  // Formato do Foundry 14: label, visible(target) e onClick(event, target).
  options.push(
    {
      label: t("Sidebar.Hide"),
      icon: "fa-solid fa-eye-slash",
      visible: target => {
        const doc = getDoc(target);
        return Boolean(doc) && !isHidden(doc);
      },
      onClick: (event, target) => setHidden(getDoc(target), true)
    },
    {
      label: t("Sidebar.Restore"),
      icon: "fa-solid fa-eye",
      visible: target => isHidden(getDoc(target)),
      onClick: (event, target) => setHidden(getDoc(target), false)
    }
  );
}
