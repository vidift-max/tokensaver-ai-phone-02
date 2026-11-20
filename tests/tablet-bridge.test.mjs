import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, "tablet-bridge", file), "utf8");

test("PWA declares an Android Web Share Target using an explicit POST form", async () => {
  const manifest = JSON.parse(await read("manifest.webmanifest"));
  assert.equal(manifest.share_target.action, "./share-target/");
  assert.equal(manifest.share_target.method, "POST");
  assert.equal(manifest.share_target.enctype, "multipart/form-data");
  assert.equal(manifest.share_target.params.text, "text");
  assert.ok(manifest.icons.length > 0);
});

test("service worker receives shared text and limits its size", async () => {
  const sw = await read("sw.js");
  assert.match(sw, /request\.formData\(\)/);
  assert.match(sw, /slice\(0, 100000\)/);
  assert.match(sw, /cache\.put\(INBOX/);
  assert.match(sw, /cache\.delete\(INBOX\)/);
});

test("UI provides explicit mission, reply, copy and clear controls", async () => {
  const html = await read("index.html");
  for (const id of ["mission", "reply", "paste-mission", "paste-reply", "share-mission", "send-reply", "clear"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /Você mantém o controle/);
});

test("client stores only local text and requires user-initiated sharing", async () => {
  const js = await read("app.js");
  assert.match(js, /localStorage\.setItem/);
  assert.match(js, /navigator\.share\(\{title: label, text\}\)/);
  assert.match(js, /navigator\.clipboard\.writeText/);
  assert.match(js, /navigator\.clipboard\?\.readText/);
  assert.match(js, /confirm\(/);
  assert.doesNotMatch(js, /fetch\(["']https?:\/\//);
});

test("service worker is scoped to the PWA and caches the required shell", async () => {
  const sw = await read("sw.js");
  for (const asset of ["./index.html", "./styles.css", "./app.js", "./manifest.webmanifest"]) {
    assert.ok(sw.includes(asset), "missing cached asset: " + asset);
  }
});
