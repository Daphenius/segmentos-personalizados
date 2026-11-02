import {
  MODULE_ID, TYPES, THEMES, NAME_MAX_LENGTH, t, tCount, displayName,
  typeOfFolder, pickSegmentId, isHidden, isConcealed, hiddenFolderIn, folderTree, folderChain, folderPath, inheritedFrom,
  coveringFolderId, countSegment, resolveSegment
} from "./data.js";
import { getSegments, updateSegments, setHidden, currentTheme } from "./store.js";

const { ApplicationV2, DialogV2 } = foundry.applications.api;

// Uma janela por tipo (Atores, Itens), criada sob demanda e descartada ao fechar.
export const managers = new Map();

export function openManager(type) {
  if (!game.user.isGM) {
    ui.notifications.warn(t("Notify.GMOnlyManage"));
    return;
  }
  let app = managers.get(type);
  if (!app) {
    app = new SegmentManager(type);
    managers.set(type, app);
  }
  app.render({ force: true });
}

/** Pede um redesenho da janela do tipo, se ela estiver aberta. */
export function refreshManager(type) {
  managers.get(type)?.requestRender();
}

// Operações em lote (excluir uma pasta cheia, importar vários atores) disparam um hook por
// documento. Os pedidos de redesenho que chegam dentro deste intervalo viram um só.
const RENDER_DELAY = 50;

export class SegmentManager extends ApplicationV2 {
  constructor(type, options = {}) {
    super({ ...options, id: `${MODULE_ID}-${type}` });
    this.type = type;
    this.mode = "view";
    this.search = "";
    this.selectedId = pickSegmentId(getSegments(type), "");
    this._renderTimer = null;
  }

  static DEFAULT_OPTIONS = {
    classes: ["sp-manager"],
    window: { icon: "fa-solid fa-layer-group", resizable: true },
    position: { width: 780, height: 600 },
    actions: {
      setMode: SegmentManager.onSetMode,
      selectSegment: SegmentManager.onSelect,
      createSegment: SegmentManager.onCreate,
      renameSegment: SegmentManager.onRename,
      deleteSegment: SegmentManager.onDelete,
      openDocument: SegmentManager.onOpenDocument,
      removeFolder: SegmentManager.onRemoveFolder,
      removeDocument: SegmentManager.onRemoveDocument,
      restoreDocument: SegmentManager.onRestore,
      restoreFolder: SegmentManager.onRestoreFolder,
      setTheme: SegmentManager.onSetTheme
    }
  };

  get title() {
    return t(`Type.${this.type}.Title`);
  }

  requestRender() {
    if (!this.rendered) return;
    clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => {
      this._renderTimer = null;
      this.render();
    }, RENDER_DELAY);
  }

  async _renderHTML() {
    const segments = getSegments(this.type);
    this.selectedId = pickSegmentId(segments, this.selectedId);
    const current = segments.find(s => s.id === this.selectedId);
    const hiddenDocs = TYPES[this.type].collection().filter(isHidden);
    const hiddenFolders = folderTree(this.type).map(({ folder }) => folder).filter(isHidden);
    const showHidden = this.mode === "hidden";
    const theme = currentTheme();

    const segmentList = segments.map(s => `
      <li><button type="button" class="sp-nav-item ${!showHidden && s.id === this.selectedId ? "active" : ""}" data-action="selectSegment" data-segment-id="${esc(s.id)}">
        <i class="fa-solid fa-layer-group" inert></i>
        <span class="sp-nav-label">${esc(displayName(s))}</span>
        <span class="sp-badge">${countSegment(this.type, s)}</span>
      </button></li>`).join("");

    const themeButtons = Object.entries(THEMES).map(([key, swatch]) => {
      const label = t(`Themes.${key}`);
      return `
      <button type="button" class="sp-swatch ${key === theme ? "active" : ""}" style="--swatch: ${swatch}"
        data-action="setTheme" data-theme="${key}" data-tooltip-text="${esc(label)}" aria-label="${esc(t("Manager.ThemeButton", { name: label }))}"></button>`;
    }).join("");

    let main;
    if (showHidden) main = this.renderHidden(hiddenFolders, hiddenDocs);
    else if (current) main = this.renderSegment(current);
    else main = emptyState("fa-layer-group", t("Manager.EmptyTitle"), t("Manager.EmptyText"),
      `<button type="button" class="sp-btn sp-btn-primary" data-action="createSegment"><i class="fa-solid fa-plus" inert></i> ${esc(t("Manager.Create"))}</button>`);

    return `
      <aside class="sp-side">
        <div class="sp-side-head">
          <span>${esc(t("Manager.Segments"))}</span>
          <button type="button" class="sp-icon-btn" data-action="createSegment" data-tooltip-text="${esc(t("Manager.NewSegment"))}" aria-label="${esc(t("Manager.NewSegment"))}">
            <i class="fa-solid fa-plus" inert></i>
          </button>
        </div>
        <ul class="sp-nav">${segmentList || `<li class="sp-nav-empty">${esc(t("Manager.NoneYet"))}</li>`}</ul>
        <div class="sp-side-foot">
          <button type="button" class="sp-nav-item ${showHidden ? "active" : ""}" data-action="setMode" data-mode="hidden">
            <i class="fa-solid fa-eye-slash" inert></i>
            <span class="sp-nav-label">${esc(t("Manager.HiddenTitle"))}</span>
            <span class="sp-badge">${hiddenFolders.length + hiddenDocs.length}</span>
          </button>
          <div class="sp-themes" role="group" aria-label="${esc(t("Manager.Theme"))}">${themeButtons}</div>
          <p class="sp-hint">${esc(t("Manager.Hint"))}</p>
        </div>
      </aside>
      <section class="sp-main">${main}</section>`;
  }

  renderSegment(segment) {
    const resolved = resolveSegment(this.type, segment);
    const total = resolved.folders.reduce((n, f) => n + f.docs.length, 0) + resolved.individuals.length;
    const tab = (mode, icon, label) => `
      <button type="button" class="${this.mode === mode ? "active" : ""}" data-action="setMode" data-mode="${mode}">
        <i class="fa-solid ${icon}" inert></i> ${esc(label)}
      </button>`;

    return `
      <header class="sp-head">
        <div class="sp-head-text">
          <h2>${esc(displayName(segment))}</h2>
          <span class="sp-meta">${esc(t("Manager.Meta", {
            folders: tCount("Manager.Count.Folders", segment.folderIds.length),
            individuals: tCount("Manager.Count.Individuals", segment.documentIds.length),
            total: tCount("Manager.Count.Documents", total)
          }))}</span>
        </div>
        <div class="sp-head-actions">
          ${iconButton("renameSegment", "fa-pen", t("Manager.Rename"))}
          ${iconButton("deleteSegment", "fa-trash", t("Manager.Delete"), "", "sp-danger")}
        </div>
      </header>
      <div class="sp-bar">
        <nav class="sp-tabs">${tab("view", "fa-list", t("Manager.TabView"))}${tab("edit", "fa-square-check", t("Manager.TabEdit"))}</nav>
        ${searchBox(this.search)}
      </div>
      <div class="sp-scroll">${this.mode === "edit" ? this.renderEdit(segment) : this.renderView(resolved)}</div>`;
  }

  renderView({ folders, individuals }) {
    if (!folders.length && !individuals.length) {
      return emptyState("fa-box-open", t("Manager.SegmentEmptyTitle"), t("Manager.SegmentEmptyText"),
        `<button type="button" class="sp-btn sp-btn-primary" data-action="setMode" data-mode="edit"><i class="fa-solid fa-plus" inert></i> ${esc(t("Manager.AddContent"))}</button>`);
    }

    const folderCards = folders.map(({ folder, docs }) => `
      <div class="sp-card" data-search-group="${esc(searchKey(folder.name))}">
        <div class="sp-card-head">
          ${folderIcon(folder, true)}
          <div class="sp-title">
            <strong>${esc(folder.name)}</strong>
            <small>${esc(folder.folder ? t("Manager.InFolder", { path: folderPath(folder.folder) }) : t("Manager.RootFolder"))}</small>
          </div>
          <span class="sp-badge">${docs.length}</span>
          ${iconButton("removeFolder", "fa-xmark", t("Manager.RemoveFolder"), `data-folder-id="${esc(folder.id)}"`)}
        </div>
        ${docs.length
          ? `<div class="sp-chips">${docs.map(doc => `
              <a class="sp-chip ${isConcealed(doc) ? "sp-is-hidden" : ""}" data-action="openDocument" data-doc-id="${esc(doc.id)}" data-search="${esc(searchKey(doc.name))}"
                ${doc.folder?.id !== folder.id ? `data-tooltip-text="${esc(t("Manager.ChipIn", { name: doc.folder.name }))}"` : ""}>
                ${avatar(doc)}<span>${esc(doc.name)}</span>${isConcealed(doc) ? `<i class="fa-solid fa-eye-slash" inert></i>` : ""}
              </a>`).join("")}</div>`
          : `<p class="sp-muted">${esc(t("Manager.FolderEmpty"))}</p>`}
      </div>`).join("");

    const individualRows = individuals.map(({ doc, viaFolder }) => `
      <div class="sp-row" data-search="${esc(searchKey(doc.name))}">
        ${avatar(doc)}
        <div class="sp-title">
          <a data-action="openDocument" data-doc-id="${esc(doc.id)}">${esc(doc.name)}</a>${isConcealed(doc) ? ` <span class="sp-tag">${esc(t("Manager.HiddenTag"))}</span>` : ""}
          <small>${esc(doc.folder ? folderPath(doc.folder) : t("Manager.NoFolder"))}${viaFolder ? ` · ${esc(t("Manager.AlsoVia", { name: viaFolder.name }))}` : ""}</small>
        </div>
        ${iconButton("removeDocument", "fa-xmark", t("Manager.RemoveDocument"), `data-doc-id="${esc(doc.id)}"`)}
      </div>`).join("");

    return `
      ${folders.length ? `<div class="sp-group"><h3 class="sp-section">${esc(t("Manager.Folders"))} <span>${folders.length}</span></h3>${folderCards}</div>` : ""}
      ${individuals.length ? `<div class="sp-group"><h3 class="sp-section">${esc(t("Manager.Individuals"))} <span>${individuals.length}</span></h3><div class="sp-list">${individualRows}</div></div>` : ""}
      ${noResults()}`;
  }

  renderEdit(segment) {
    const docs = [...TYPES[this.type].collection()].sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

    // Pasta direta: marcada pelo Mestre. Herdada: uma pasta acima está marcada (caixa travada).
    // Uma pasta pode ser direta e herdada ao mesmo tempo; nesse caso continua editável.
    const folderRows = folderTree(this.type).map(({ folder, depth }) => {
      const direct = segment.folderIds.includes(folder.id);
      const parent = inheritedFrom(folder, segment);
      const inheritedOnly = !direct && Boolean(parent);
      const note = parent
        ? `<span class="sp-tag sp-tag-soft"><i class="fa-solid fa-turn-up" inert></i> ${esc(t(direct ? "Manager.AlsoInheritedFrom" : "Manager.InheritedFrom", { name: parent.name }))}</span>`
        : "";
      return `
        <label class="sp-check ${inheritedOnly ? "sp-inherited" : ""}" style="--depth: ${depth}" data-search="${esc(searchKey(folder.name))}"
          ${inheritedOnly ? `data-tooltip-text="${esc(t("Manager.InheritedTooltip", { name: parent.name }))}"` : ""}>
          <input type="checkbox" data-kind="folder" data-ref-id="${esc(folder.id)}"
            ${direct ? "checked" : ""} ${inheritedOnly ? "disabled data-inherited" : ""}>
          ${folderIcon(folder, direct || Boolean(parent))}
          <span class="sp-check-label">${esc(folder.name)}</span>
          ${note}
        </label>`;
    }).join("");

    const docRows = docs.map(doc => {
      const via = coveringFolderId(doc, segment);
      return `
        <label class="sp-check" data-search="${esc(searchKey(doc.name))}">
          <input type="checkbox" data-kind="document" data-ref-id="${esc(doc.id)}" ${segment.documentIds.includes(doc.id) ? "checked" : ""}>
          ${avatar(doc)}
          <span class="sp-check-label">${esc(doc.name)}${doc.folder ? `<small>${esc(folderPath(doc.folder))}</small>` : ""}</span>
          ${via ? `<span class="sp-tag sp-tag-soft"><i class="fa-solid fa-folder" inert></i> ${esc(t("Manager.Via", { name: game.folders.get(via)?.name ?? "" }))}</span>` : ""}
        </label>`;
    }).join("");

    return `
      <div class="sp-group">
        <h3 class="sp-section">${esc(t("Manager.Folders"))} <span>${esc(t("Manager.CheckedFolders", { count: segment.folderIds.length }))}</span></h3>
        <p class="sp-hint">${esc(t("Manager.FolderHint"))}</p>
        <div class="sp-list">${folderRows || `<p class="sp-muted">${esc(t("Manager.NoFolders"))}</p>`}</div>
      </div>
      <div class="sp-group">
        <h3 class="sp-section">${esc(t("Manager.Individuals"))} <span>${esc(t("Manager.CheckedDocuments", { count: segment.documentIds.length }))}</span></h3>
        <div class="sp-list">${docRows || `<p class="sp-muted">${esc(t("Manager.NoDocuments"))}</p>`}</div>
      </div>
      ${noResults()}`;
  }

  renderHidden(hiddenFolders, hiddenDocs) {
    const docs = TYPES[this.type].collection();
    const folderRows = hiddenFolders.map(folder => {
      const inside = docs.filter(doc => folderChain(doc.folder).includes(folder.id)).length;
      const parent = hiddenFolderIn(folder.folder);
      const where = folder.folder ? t("Manager.InFolder", { path: folderPath(folder.folder) }) : t("Manager.RootFolder");
      return `
          <div class="sp-row" data-search="${esc(searchKey(folder.name))}">
            ${folderIcon(folder, false)}
            <div class="sp-title">
              <strong>${esc(folder.name)}</strong>${parent ? ` <span class="sp-tag sp-tag-soft">${esc(t("Manager.InsideHidden", { name: parent.name }))}</span>` : ""}
              <small>${esc(where)} · ${esc(tCount("Manager.Count.Documents", inside))}</small>
            </div>
            <button type="button" class="sp-btn" data-action="restoreFolder" data-folder-id="${esc(folder.id)}"><i class="fa-solid fa-eye" inert></i> ${esc(t("Manager.Restore"))}</button>
          </div>`;
    }).join("");

    const docRows = hiddenDocs.map(doc => `
          <div class="sp-row" data-search="${esc(searchKey(doc.name))}">
            ${avatar(doc)}
            <div class="sp-title">
              <a data-action="openDocument" data-doc-id="${esc(doc.id)}">${esc(doc.name)}</a>
              <small>${esc(doc.folder ? folderPath(doc.folder) : t("Manager.NoFolder"))}</small>
            </div>
            <button type="button" class="sp-btn" data-action="restoreDocument" data-doc-id="${esc(doc.id)}"><i class="fa-solid fa-eye" inert></i> ${esc(t("Manager.Restore"))}</button>
          </div>`).join("");

    const any = hiddenFolders.length || hiddenDocs.length;
    const body = any
      ? `${hiddenFolders.length ? `<div class="sp-group"><h3 class="sp-section">${esc(t("Manager.HiddenFolders"))} <span>${hiddenFolders.length}</span></h3><div class="sp-list">${folderRows}</div></div>` : ""}
          ${hiddenDocs.length ? `<div class="sp-group"><h3 class="sp-section">${esc(t("Manager.HiddenDocuments"))} <span>${hiddenDocs.length}</span></h3><div class="sp-list">${docRows}</div></div>` : ""}
          ${noResults()}`
      : emptyState("fa-eye", t("Manager.NothingHiddenTitle"), t("Manager.NothingHiddenText"));

    return `
      <header class="sp-head">
        <div class="sp-head-text">
          <h2>${esc(t("Manager.HiddenTitle"))}</h2>
          <span class="sp-meta">${esc(t("Manager.HiddenMeta"))}</span>
        </div>
      </header>
      ${any ? `<div class="sp-bar">${searchBox(this.search)}</div>` : ""}
      <div class="sp-scroll">${body}</div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  async _preRender(context, options) {
    await super._preRender(context, options);
    this._scrollTop = this.element?.querySelector(".sp-scroll")?.scrollTop ?? 0;
    // Um redesenho vindo de outro cliente não pode tirar o cursor de quem está digitando na busca.
    const search = this.element?.querySelector(".sp-search input");
    this._searchFocus = search && search === document.activeElement
      ? { start: search.selectionStart, end: search.selectionEnd }
      : null;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;
    const scroll = el.querySelector(".sp-scroll");
    if (scroll) scroll.scrollTop = this._scrollTop;

    // O HTML é trocado a cada render, então estes listeners são sempre de elementos novos.
    const input = el.querySelector(".sp-search input");
    input?.addEventListener("input", () => {
      this.search = input.value;
      this.applySearch();
    });
    if (input && this._searchFocus) {
      input.focus();
      input.setSelectionRange(this._searchFocus.start, this._searchFocus.end);
    }
    this._searchFocus = null;
    this.applySearch();

    // "indeterminate" só existe como propriedade do elemento, não como atributo HTML.
    for (const box of el.querySelectorAll("input[data-inherited]")) box.indeterminate = true;

    for (const box of el.querySelectorAll("input[data-kind]:not([disabled])")) {
      box.addEventListener("change", () => this.setMembership(box.dataset.kind, box.dataset.refId, box.checked, box));
    }
  }

  _onClose(options) {
    super._onClose(options);
    clearTimeout(this._renderTimer);
    this._renderTimer = null;
    managers.delete(this.type);
  }

  applySearch() {
    const root = this.element?.querySelector(".sp-scroll");
    if (!root) return;
    const query = searchKey(this.search.trim());
    const matches = item => item.dataset.search.includes(query);

    for (const group of root.querySelectorAll("[data-search-group]")) {
      const groupMatch = !query || group.dataset.searchGroup.includes(query);
      let visible = 0;
      for (const item of group.querySelectorAll("[data-search]")) {
        item.hidden = !groupMatch && !matches(item);
        if (!item.hidden) visible++;
      }
      group.hidden = !groupMatch && !visible;
    }
    for (const item of root.querySelectorAll("[data-search]")) {
      if (!item.closest("[data-search-group]")) item.hidden = Boolean(query) && !matches(item);
    }

    const visibleSelector = "[data-search]:not([hidden]), [data-search-group]:not([hidden])";
    for (const group of root.querySelectorAll(".sp-group")) {
      group.hidden = Boolean(query) && !group.querySelector(visibleSelector);
    }
    const noResults = root.querySelector(".sp-no-results");
    if (noResults) {
      const hasItems = root.querySelector("[data-search], [data-search-group]");
      noResults.hidden = !hasItems || Boolean(root.querySelector(visibleSelector));
    }
  }

  async setMembership(kind, refId, checked, box) {
    const key = kind === "folder" ? "folderIds" : "documentIds";
    // O segmento é o da hora do clique. A alteração pode esperar na fila, e até lá
    // o Mestre já pode ter trocado de segmento na janela.
    const segmentId = this.selectedId;
    const result = await updateSegments(this.type, segments => {
      const segment = segments.find(s => s.id === segmentId);
      if (!segment || segment[key].includes(refId) === checked) return false;
      segment[key] = checked ? [...segment[key], refId] : segment[key].filter(id => id !== refId);
    });
    if (result === "failed" && box.isConnected) box.checked = !checked;
    // Nada mudou (outro Mestre excluiu o segmento, por exemplo): redesenha com o estado real.
    if (result === "unchanged") this.requestRender();
  }

  removeRef(key, refId) {
    const segmentId = this.selectedId;
    return updateSegments(this.type, segments => {
      const segment = segments.find(s => s.id === segmentId);
      if (!segment || !segment[key].includes(refId)) return false;
      segment[key] = segment[key].filter(id => id !== refId);
    });
  }

  static onSetMode(event, target) {
    const mode = target.dataset.mode;
    this.mode = mode === "edit" || mode === "hidden" ? mode : "view";
    this.render();
  }

  static onSelect(event, target) {
    this.selectedId = target.dataset.segmentId;
    if (this.mode === "hidden") this.mode = "view";
    this.search = "";
    this.render();
  }

  // Criar, renomear e excluir: a janela só muda de estado depois que a gravação confirma.
  static async onCreate() {
    const name = await promptName(t("Manager.NewSegment"));
    if (!name) return;
    const id = foundry.utils.randomID();
    const result = await updateSegments(this.type, segments => {
      segments.push({ id, name, documentIds: [], folderIds: [] });
    });
    if (result !== "saved") return;
    this.selectedId = id;
    this.mode = "edit";
    this.search = "";
    this.requestRender();
  }

  static async onRename() {
    const current = getSegments(this.type).find(s => s.id === this.selectedId);
    if (!current) return;
    const name = await promptName(t("Manager.RenameSegment"), current.name);
    if (!name || name === current.name) return;
    const result = await updateSegments(this.type, segments => {
      const segment = segments.find(s => s.id === current.id);
      if (!segment) return false;
      segment.name = name;
    });
    if (result === "unchanged") {
      ui.notifications.warn(t("Notify.RenameMissing", { name: displayName(current) }));
      this.requestRender();
    }
  }

  static async onDelete() {
    const current = getSegments(this.type).find(s => s.id === this.selectedId);
    if (!current) return;
    const confirmed = await DialogV2.confirm({
      window: { title: t("Manager.Delete") },
      // A tradução tem <strong>; só o nome do segmento, que vem do usuário, é escapado.
      content: `<p>${t("Manager.DeleteConfirm", { name: esc(displayName(current)) })}</p>`,
      rejectClose: false
    });
    if (!confirmed) return;
    const result = await updateSegments(this.type, segments => {
      const index = segments.findIndex(s => s.id === current.id);
      if (index < 0) return false;
      segments.splice(index, 1);
    });
    if (result === "unchanged") this.requestRender();
  }

  static onOpenDocument(event, target) {
    TYPES[this.type].collection().get(target.dataset.docId)?.sheet?.render(true);
  }

  static onRemoveFolder(event, target) {
    return this.removeRef("folderIds", target.dataset.folderId);
  }

  static onRemoveDocument(event, target) {
    return this.removeRef("documentIds", target.dataset.docId);
  }

  static onSetTheme(event, target) {
    if (Object.hasOwn(THEMES, target.dataset.theme)) game.settings.set(MODULE_ID, "theme", target.dataset.theme);
  }

  static onRestore(event, target) {
    return setHidden(TYPES[this.type].collection().get(target.dataset.docId), false);
  }

  static onRestoreFolder(event, target) {
    const folder = game.folders.get(target.dataset.folderId);
    if (typeOfFolder(folder) === this.type) return setHidden(folder, false);
  }
}

function iconButton(action, icon, label, attrs = "", extraClass = "") {
  return `<button type="button" class="sp-icon-btn ${extraClass}" data-action="${action}" ${attrs}
    data-tooltip-text="${esc(label)}" aria-label="${esc(label)}"><i class="fa-solid ${icon}" inert></i></button>`;
}

function noResults() {
  return `<p class="sp-muted sp-no-results" hidden>${esc(t("Manager.NoResults"))}</p>`;
}

/** Minúsculas e sem acentos, para "carnical" achar "Carniçal". */
function searchKey(text) {
  return String(text ?? "").toLocaleLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function searchBox(value) {
  return `
    <div class="sp-search">
      <i class="fa-solid fa-magnifying-glass" inert></i>
      <input type="search" placeholder="${esc(t("Manager.Search"))}" value="${esc(value)}" aria-label="${esc(t("Manager.Search"))}">
    </div>`;
}

function emptyState(icon, title, text, action = "") {
  return `
    <div class="sp-empty-state">
      <i class="fa-solid ${icon}" inert></i>
      <strong>${esc(title)}</strong>
      <p>${esc(text)}</p>
      ${action}
    </div>`;
}

function avatar(doc) {
  return doc.img
    ? `<img class="sp-avatar" src="${esc(doc.img)}" alt="" loading="lazy">`
    : `<span class="sp-avatar"></span>`;
}

function folderIcon(folder, open) {
  // A cor vai para um atributo style, então só passa se for um hexadecimal.
  const raw = folder.color?.css ?? folder.color;
  const color = typeof raw === "string" && /^#[0-9a-f]{3,8}$/i.test(raw) ? ` style="color: ${raw}"` : "";
  return `<i class="sp-folder-icon fa-solid ${open ? "fa-folder-open" : "fa-folder"}"${color} inert></i>`;
}

async function promptName(title, initial = "") {
  const value = await DialogV2.prompt({
    window: { title },
    content: `<div class="form-group">
      <label>${esc(t("Manager.Name"))}</label>
      <input type="text" name="segmentName" value="${esc(initial)}" maxlength="${NAME_MAX_LENGTH}" required autofocus>
    </div>`,
    ok: {
      label: t("Manager.Confirm"),
      callback: (event, button) => button.form.elements.segmentName.value
    },
    rejectClose: false
  });
  return typeof value === "string" ? value.trim().slice(0, NAME_MAX_LENGTH) : "";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
