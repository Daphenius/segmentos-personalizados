import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeWorld } from "./fake-foundry.mjs";
import {
  sanitizeSegments, pickSegmentId, displayName, tCount, t, getFolder, folderTree, folderChain, folderPath,
  inheritedFrom, coveringFolderId, segmentHas, resolveSegment, countSegment
} from "../scripts/data.js";
import { registerSettings, getSegments, updateSegments, cleanupInvalidRefs } from "../scripts/store.js";

const KEY = "actorsSegments";
let world;

function setup(options) {
  world = makeWorld(options);
  registerSettings({ onSegmentsChange() {}, onThemeChange() {} });
  // Inimigos > Mortos-vivos > Antigos; Aliados; uma pasta de Itens.
  world.folder("f1", "Inimigos");
  world.folder("f2", "Mortos-vivos", "f1");
  world.folder("f3", "Antigos", "f2");
  world.folder("f4", "Aliados");
  world.folder("fi", "Armas", null, "Item");
  world.actor("a1", "Zumbi", "f2");
  world.actor("a2", "Lich", "f3");
  world.actor("a3", "Bandido", "f1");
  world.actor("a4", "Clériga", "f4");
  world.actor("a5", "Mercador");
}

const seg = (id, folderIds = [], documentIds = [], name = id) => ({ id, name, folderIds, documentIds });

beforeEach(() => setup());

/* Sanitização e dados antigos */

test("valor que não é lista vira lista vazia", () => {
  for (const raw of [undefined, null, "x", 3, {}]) assert.deepEqual(sanitizeSegments(raw), []);
});

test("dados da 1.5.1 passam sem nenhuma alteração", () => {
  const raw = [seg("s1", ["f1"], ["a5"], "Inimigos"), seg("s2", [], [], "Vazio")];
  assert.deepEqual(sanitizeSegments(raw), raw);
});

test("segmento da 1.1.0 (sem folderIds) ganha lista vazia e mantém os documentos", () => {
  assert.deepEqual(sanitizeSegments([{ id: "s1", name: "Antigo", documentIds: ["a1"] }]),
    [{ id: "s1", name: "Antigo", documentIds: ["a1"], folderIds: [] }]);
});

test("IDs repetidos ou inválidos dentro das listas são removidos", () => {
  const [s] = sanitizeSegments([{ id: "s", name: "x", documentIds: ["a1", "a1", "", 7, null, "a2"], folderIds: "f1" }]);
  assert.deepEqual(s.documentIds, ["a1", "a2"]);
  assert.deepEqual(s.folderIds, []);
});

test("segmentos com o mesmo ID são mantidos com IDs distintos e estáveis", () => {
  const raw = [seg("s", ["f1"]), seg("s", ["f4"]), seg("s"), seg("s-2")];
  const first = sanitizeSegments(raw).map(s => s.id);
  assert.deepEqual(first, ["s", "s-2", "s-3", "s-2-2"]);
  assert.equal(new Set(first).size, raw.length);
  assert.deepEqual(sanitizeSegments(raw).map(s => s.id), first, "mesma leitura, mesmos IDs");
});

test("só entradas sem ID são descartadas; nome ausente ou numérico é preservado", () => {
  const out = sanitizeSegments([null, { name: "sem id" }, { id: "" }, { id: "a" }, { id: "b", name: 42 }]);
  assert.deepEqual(out.map(s => [s.id, s.name]), [["a", ""], ["b", "42"]]);
});

test("segmento sem nome aparece como Sem nome / Unnamed, sem gravar o texto traduzido", () => {
  const [s] = sanitizeSegments([{ id: "a" }]);
  assert.equal(s.name, "");
  assert.equal(displayName(s), "Sem nome");
  setup({ lang: "en" });
  assert.equal(displayName(s), "Unnamed");
});

test("nomes longos não são cortados na leitura", () => {
  const name = "x".repeat(120);
  assert.equal(sanitizeSegments([{ id: "s", name }])[0].name, name);
});

/* Seleção */

test("seleção mantém o segmento existente e cai no primeiro quando ele some", () => {
  const list = [seg("a"), seg("b")];
  assert.equal(pickSegmentId(list, "b"), "b");
  assert.equal(pickSegmentId(list, "apagado"), "a");
  assert.equal(pickSegmentId([], "a"), "");
});

/* Pastas e herança */

test("pasta de outro tipo não entra no segmento", () => {
  assert.equal(getFolder("actors", "fi"), null);
  assert.equal(getFolder("items", "fi")?.name, "Armas");
  assert.equal(getFolder("actors", "nao-existe"), null);
});

test("árvore de pastas: pai antes dos filhos, com profundidade, só do tipo pedido", () => {
  assert.deepEqual(folderTree("actors").map(({ folder, depth }) => [folder.id, depth]),
    [["f4", 0], ["f1", 0], ["f2", 1], ["f3", 2]]);
});

test("cadeia e caminho de pastas", () => {
  const f3 = world.folders.get("f3");
  assert.deepEqual(folderChain(f3), ["f3", "f2", "f1"]);
  assert.equal(folderPath(f3), "Inimigos / Mortos-vivos / Antigos");
});

test("ciclo corrompido de pastas não trava a leitura", () => {
  const a = world.folder("c1", "A");
  const b = world.folder("c2", "B", "c1");
  a.folder = b;
  assert.ok(folderChain(a).length <= 50);
});

test("subpasta herda a pasta marcada acima; a própria pasta não conta", () => {
  const s = seg("s", ["f1"]);
  assert.equal(inheritedFrom(world.folders.get("f3"), s)?.id, "f1");
  assert.equal(inheritedFrom(world.folders.get("f1"), s), null);
  assert.equal(inheritedFrom(world.folders.get("f4"), s), null);
});

test("documento entra pela pasta marcada mais próxima", () => {
  const s = seg("s", ["f1", "f2"]);
  assert.equal(coveringFolderId(world.actors.get("a2"), s), "f2");
  assert.equal(coveringFolderId(world.actors.get("a3"), s), "f1");
  assert.equal(coveringFolderId(world.actors.get("a4"), s), null);
});

test("segmentHas cobre pasta, subpasta e avulso", () => {
  const s = seg("s", ["f1"], ["a5"]);
  const has = id => segmentHas(s, world.actors.get(id));
  assert.deepEqual(["a1", "a2", "a3", "a4", "a5"].map(has), [true, true, true, false, true]);
  assert.equal(countSegment("actors", s), 4);
});

test("resolveSegment não repete documentos", () => {
  const s = seg("s", ["f1", "f2"], ["a1", "a5"]);
  const { folders, individuals } = resolveSegment("actors", s);
  const inFolders = folders.flatMap(f => f.docs.map(d => d.id));
  const inIndividuals = individuals.map(i => i.doc.id);
  assert.deepEqual(folders.map(f => [f.folder.id, f.docs.map(d => d.id)]), [["f1", ["a3"]], ["f2", ["a2"]]]);
  assert.deepEqual(inIndividuals, ["a5", "a1"], "Mercador e Zumbi, em ordem alfabética");
  assert.equal(new Set([...inFolders, ...inIndividuals]).size, inFolders.length + inIndividuals.length);
  assert.equal(individuals.find(i => i.doc.id === "a1").viaFolder.id, "f2");
});

test("segmentos diferentes não misturam conteúdo", () => {
  const a = resolveSegment("actors", seg("a", ["f4"]));
  const b = resolveSegment("actors", seg("b", ["f2"]));
  assert.deepEqual(a.folders.flatMap(f => f.docs.map(d => d.id)), ["a4"]);
  assert.deepEqual(b.folders.flatMap(f => f.docs.map(d => d.id)), ["a2", "a1"], "Lich e Zumbi, em ordem alfabética");
});

test("pasta excluída some do resultado sem erro", () => {
  const { folders } = resolveSegment("actors", seg("s", ["apagada", "f4"]));
  assert.deepEqual(folders.map(f => f.folder.id), ["f4"]);
});

/* Gravação */

test("alterações simultâneas do mesmo cliente não se sobrescrevem", async () => {
  await updateSegments("actors", list => { list.push(seg("s")); });
  await Promise.all([
    updateSegments("actors", list => { list[0].folderIds.push("f1"); }),
    updateSegments("actors", list => { list[0].folderIds.push("f4"); }),
    updateSegments("actors", list => { list[0].documentIds.push("a5"); })
  ]);
  assert.deepEqual(getSegments("actors")[0], seg("s", ["f1", "f4"], ["a5"]));
});

test("mutate retornando false não grava", async () => {
  world.store[KEY] = [seg("s")];
  const result = await updateSegments("actors", () => false);
  assert.equal(result, "unchanged");
  assert.deepEqual(world.settingsLog, []);
});

test("jogador não grava", async () => {
  setup({ isGM: false });
  const result = await updateSegments("actors", list => { list.push(seg("x")); });
  assert.equal(result, "failed");
  assert.deepEqual(world.store[KEY], []);
  assert.equal(world.notices[0][0], "warn");
});

test("erro ao preparar a alteração não grava e avisa", async () => {
  world.store[KEY] = [seg("s")];
  const result = await updateSegments("actors", () => { throw new Error("bug"); });
  assert.equal(result, "failed");
  assert.deepEqual(world.store[KEY], [seg("s")]);
  assert.equal(world.notices.at(-1)[0], "error");
});

test("falha ao salvar retorna failed e a fila continua funcionando", async () => {
  world.failNextSave();
  const failed = await updateSegments("actors", list => { list.push(seg("fantasma")); });
  assert.equal(failed, "failed");
  assert.deepEqual(getSegments("actors"), [], "nenhum segmento fantasma");
  const saved = await updateSegments("actors", list => { list.push(seg("ok")); });
  assert.equal(saved, "saved");
  assert.deepEqual(getSegments("actors").map(s => s.id), ["ok"]);
});

test("limpeza tira só referências a pastas e documentos que não existem", async () => {
  world.store[KEY] = [seg("s", ["f1", "apagada", "fi"], ["a5", "sumiu"])];
  const removed = await cleanupInvalidRefs("actors");
  assert.equal(removed, 3);
  assert.deepEqual(getSegments("actors"), [seg("s", ["f1"], ["a5"])]);
});

test("limpeza sem nada a remover não grava", async () => {
  world.store[KEY] = [seg("s", ["f1"], ["a5"])];
  assert.equal(await cleanupInvalidRefs("actors"), 0);
  assert.deepEqual(world.settingsLog, []);
});

test("limpeza só roda no Mestre ativo", async () => {
  setup({ activeGM: false });
  world.store[KEY] = [seg("s", ["apagada"])];
  assert.equal(await cleanupInvalidRefs("actors"), 0);
  assert.deepEqual(world.store[KEY], [seg("s", ["apagada"])]);
});

/* Traduções */

function flatKeys(file) {
  const keys = [];
  const walk = (node, prefix) => {
    for (const [key, value] of Object.entries(node)) {
      const full = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object") walk(value, full);
      else keys.push([full, value]);
    }
  };
  walk(JSON.parse(readFileSync(new URL(`../lang/${file}`, import.meta.url), "utf8")), "");
  return keys;
}

test("pt-BR e en têm as mesmas chaves e os mesmos campos {nome}", () => {
  const pt = Object.fromEntries(flatKeys("pt-BR.json"));
  const en = Object.fromEntries(flatKeys("en.json"));
  assert.deepEqual(Object.keys(pt).sort(), Object.keys(en).sort());
  const fields = text => (text.match(/\{\w+\}/g) ?? []).sort();
  for (const key of Object.keys(pt)) assert.deepEqual(fields(pt[key]), fields(en[key]), key);
});

test("plural segue o idioma", () => {
  assert.equal(tCount("Manager.Count.Folders", 1), "1 pasta");
  assert.equal(tCount("Manager.Count.Folders", 3), "3 pastas");
  setup({ lang: "en" });
  assert.equal(tCount("Manager.Count.Documents", 1), "1 document");
  assert.equal(tCount("Manager.Count.Documents", 0), "0 documents");
});

test("aviso de limpeza sai no idioma do Mestre", async () => {
  setup({ lang: "en" });
  world.store[KEY] = [seg("s", ["apagada"])];
  await cleanupInvalidRefs("actors");
  assert.equal(world.notices.at(-1)[1], "Custom Segments: 1 reference(s) to deleted entries were removed from the Actors segments.");
  assert.equal(t("Type.actors.Title"), "Actor Segments");
});
