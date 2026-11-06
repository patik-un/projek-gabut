import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("./PhotoboothEditorAdmin.jsx", import.meta.url), "utf8");
const component = require("@babel/parser").parse(source, { sourceType: "module", plugins: ["jsx"] }).program.body.find((node) => node.type === "ExportDefaultDeclaration").declaration;
function callback(name, context) {
  const declaration = component.body.body.filter((node) => node.type === "VariableDeclaration").flatMap((node) => node.declarations).find((node) => node.id.name === name);
  return vm.runInNewContext(`(${source.slice(declaration.init.start, declaration.init.end)})`, context);
}
test("an overlapping save explicitly reports failure", async () => {
  const result = await callback("saveCatalog", { savingRef: { current: true } })({});
  assert.equal(result, false);
});
test("a composite finishing during another save does not mutate or replace its pending draft", async () => {
  let mutations = 0;
  const context = { savingRef: { current: true }, latestDraft: { current: { stickers: [], texts: [] } },
    upsertStudioSticker() { mutations += 1; return { stickers: [], texts: [] }; },
    dispatch() { mutations += 1; },
    setSaveError() {}, setMessage() {}, setDesigner() {}, saveCatalog: async () => false,
  };
  const result = await callback("createStudioSticker", context)({ id: "scene", content: "image", name: "Scene" });
  assert.equal(result, false);
  assert.equal(mutations, 0);
});
