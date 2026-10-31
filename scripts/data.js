// Regras dos segmentos que não dependem de interface. Leem `game`, mas não gravam nada.

export const MODULE_ID = "segmentos-personalizados";

export const TYPES = {
  actors: { documentName: "Actor", collection: () => game.actors },
  items: { documentName: "Item", collection: () => game.items }
};

// Os nomes dos temas ficam nos arquivos de tradução, em SEGMENTOS.Themes.<chave>.
export const THEMES = {
  ambar: "#e8913a",
  esmeralda: "#3fb37f",
  arcano: "#9b6bff",
  gelo: "#4aa8e8",
  carmesim: "#e0525a",
  ouro: "#d4af37",
  pergaminho: "#f3ead7",
  obsidiana: "#2a2638"
};

export const NAME_MAX_LENGTH = 80;

/** Texto traduzido de lang/*.json. Com `data`, preenche os campos {nome}. */
export function t(key, data) {
  const full = `SEGMENTOS.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

/** Escolhe a forma singular ou plural conforme as regras do idioma ativo. */
export function tCount(key, count) {
  const form = new Intl.PluralRules(game.i18n.lang).select(count) === "one" ? "one" : "other";
  return t(`${key}.${form}`, { count });
}

export function displayName(segment) {
  return segment.name || t("Manager.Unnamed");
}

function uniqueIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(id => typeof id === "string" && id))];
}

// Nome ausente fica vazio no dado salvo; a interface mostra "Sem nome" no idioma de quem vê.
function segmentName(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

/**
 * Normaliza a lista gravada para { id, name, documentIds, folderIds }.
 * Só descarta entradas sem ID, que não teriam como ser selecionadas nem editadas.
 * Segmentos da 1.1.0 não têm folderIds e recebem uma lista vazia.
 * Um ID repetido ganha o sufixo -2, -3...: assim nenhum segmento some e seleção,
 * edição e exclusão deixam de ser ambíguas. O sufixo é estável entre leituras.
 */
export function sanitizeSegments(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const segments = [];
  for (const entry of raw) {
    if (typeof entry?.id !== "string" || !entry.id) continue;
    let id = entry.id;
    for (let n = 2; seen.has(id); n++) id = `${entry.id}-${n}`;
    seen.add(id);
    segments.push({
      id,
      name: segmentName(entry.name),
      documentIds: uniqueIds(entry.documentIds),
      folderIds: uniqueIds(entry.folderIds)
    });
  }
  return segments;
}

/** Mantém a seleção se o segmento ainda existe; senão, cai no primeiro (ou em nenhum). */
export function pickSegmentId(segments, id) {
  return segments.some(s => s.id === id) ? id : segments[0]?.id ?? "";
}

export function isHidden(doc) {
  return Boolean(doc?.getFlag(MODULE_ID, "hidden"));
}

export function typeOfFolder(folder) {
  return Object.keys(TYPES).find(type => TYPES[type].documentName === folder?.type) ?? null;
}

/** Pasta de Atores só vale para segmentos de Atores, e pasta de Itens só para Itens. */
export function getFolder(type, id) {
  const folder = game.folders.get(id);
  return folder?.type === TYPES[type].documentName ? folder : null;
}

const byName = (a, b) => a.name.localeCompare(b.name, game.i18n.lang);

/** Pastas do tipo em ordem de árvore (pai antes dos filhos), com a profundidade de cada uma. */
export function folderTree(type) {
  const children = new Map();
  for (const folder of game.folders.filter(f => f.type === TYPES[type].documentName)) {
    const parentId = folder.folder?.id ?? null;
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(folder);
  }
  const tree = [];
  const seen = new Set();
  const walk = (parentId, depth) => {
    for (const folder of (children.get(parentId) ?? []).sort(byName)) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      tree.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return tree;
}

// O Foundry limita a profundidade das pastas; o teto de 50 só protege contra dados corrompidos em ciclo.
const MAX_CHAIN = 50;

/** IDs da pasta e de todas as pastas acima dela, da mais próxima para a raiz. */
export function folderChain(folder) {
  const ids = [];
  for (let f = folder, depth = 0; f && depth < MAX_CHAIN; f = f.folder, depth++) ids.push(f.id);
  return ids;
}

export function folderPath(folder) {
  const names = [];
  for (let f = folder, depth = 0; f && depth < MAX_CHAIN; f = f.folder, depth++) names.unshift(f.name);
  return names.join(" / ");
}

/** Pasta marcada acima desta, ou null. Não conta a própria pasta. */
export function inheritedFrom(folder, segment) {
  const id = folderChain(folder.folder).find(fid => segment.folderIds.includes(fid));
  return id ? game.folders.get(id) ?? null : null;
}

/** Pasta marcada mais próxima que contém o documento, direto ou por subpasta, ou null. */
export function coveringFolderId(doc, segment) {
  return folderChain(doc.folder).find(id => segment.folderIds.includes(id)) ?? null;
}

export function segmentHas(segment, doc) {
  return segment.documentIds.includes(doc.id) || Boolean(coveringFolderId(doc, segment));
}

export function countSegment(type, segment) {
  return TYPES[type].collection().filter(doc => segmentHas(segment, doc)).length;
}

/**
 * Conteúdo do segmento sem repetir documentos: cada documento de pasta aparece só
 * na pasta marcada mais próxima, e os avulsos ficam só na lista de avulsos.
 */
export function resolveSegment(type, segment) {
  const folders = segment.folderIds
    .map(id => getFolder(type, id))
    .filter(Boolean)
    .map(folder => ({ folder, docs: [] }));
  const byId = new Map(folders.map(entry => [entry.folder.id, entry]));
  const individualIds = new Set(segment.documentIds);

  const individuals = [];
  for (const doc of TYPES[type].collection()) {
    const via = coveringFolderId(doc, segment);
    if (individualIds.has(doc.id)) individuals.push({ doc, viaFolder: byId.get(via)?.folder ?? null });
    else if (via) byId.get(via)?.docs.push(doc);
  }

  for (const entry of folders) entry.docs.sort(byName);
  folders.sort((a, b) => folderPath(a.folder).localeCompare(folderPath(b.folder), game.i18n.lang));
  individuals.sort((a, b) => byName(a.doc, b.doc));
  return { folders, individuals };
}
