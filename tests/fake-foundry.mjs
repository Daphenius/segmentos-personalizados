// Imitação mínima das partes do Foundry que data.js e store.js usam.
// Serve para testar a lógica; não prova nada sobre o comportamento dentro do Foundry.

import { readFileSync } from "node:fs";

function loadLang(lang) {
  const file = new URL(`../lang/${lang}.json`, import.meta.url);
  const flat = {};
  const walk = (node, prefix) => {
    for (const [key, value] of Object.entries(node)) {
      const full = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object") walk(value, full);
      else flat[full] = value;
    }
  };
  walk(JSON.parse(readFileSync(file, "utf8")), "");
  return flat;
}

export class Collection extends Map {
  *[Symbol.iterator]() { yield* this.values(); }
  filter(fn) { return [...this.values()].filter(fn); }
}

export function makeWorld({ isGM = true, activeGM = true, lang = "pt-BR" } = {}) {
  const strings = loadLang(lang);
  const folders = new Collection();
  const actors = new Collection();
  const items = new Collection();
  const store = {};
  const registered = {};
  const notices = [];
  const settingsLog = [];
  let failNextSave = false;

  const world = {
    folders, actors, items, store, notices, settingsLog,
    failNextSave() { failNextSave = true; },
    folder(id, name, parent = null, type = "Actor") {
      const folder = { id, name, type, folder: parent ? folders.get(parent) : null };
      folders.set(id, folder);
      return folder;
    },
    actor(id, name, folder = null, flags = {}) {
      const doc = {
        id, name, flags, folder: folder ? folders.get(folder) : null,
        getFlag(scope, key) { return this.flags[scope]?.[key]; }
      };
      actors.set(id, doc);
      return doc;
    }
  };

  globalThis.game = {
    folders, actors, items,
    i18n: {
      lang,
      localize: key => strings[key] ?? key,
      format: (key, data) => (strings[key] ?? key).replace(/{(\w+)}/g, (m, name) => data[name] ?? m)
    },
    user: { isGM },
    users: { activeGM: activeGM ? { isSelf: true } : null },
    settings: {
      register(scope, key, options) {
        registered[key] = options;
        if (!(key in store)) store[key] = structuredClone(options.default);
      },
      get(scope, key) { return structuredClone(store[key]); },
      async set(scope, key, value) {
        await Promise.resolve();
        if (failNextSave) {
          failNextSave = false;
          throw new Error("falha simulada");
        }
        store[key] = structuredClone(value);
        settingsLog.push(key);
        registered[key]?.onChange?.(value);
        return value;
      }
    }
  };
  globalThis.ui = {
    notifications: {
      info: m => notices.push(["info", m]),
      warn: m => notices.push(["warn", m]),
      error: m => notices.push(["error", m])
    }
  };
  return world;
}
