#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { marked } = require("marked");

const baseline = "0f077b7fd5ab4840e73b65c133f09bad89187e39";
const variants = {
  before: execFileSync("git", ["show", `${baseline}:README.md`], { encoding: "utf8" }),
  after: readFileSync("README.md", "utf8"),
};

const style = `
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#fff;color:#1f2328;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.markdown-body{max-width:1012px;margin:0 auto;padding:40px 32px 72px}.markdown-body h1,.markdown-body h2{padding-bottom:.3em;border-bottom:1px solid #d0d7de}.markdown-body h1{font-size:2em}.markdown-body h2{margin-top:24px;font-size:1.5em}.markdown-body h3{margin-top:24px;font-size:1.25em}.markdown-body a{color:#0969da;text-decoration:none}.markdown-body img{max-width:100%;height:auto;background:#fff}.markdown-body pre{overflow:auto;padding:16px;border-radius:6px;background:#f6f8fa}.markdown-body code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:85%}.markdown-body :not(pre)>code{padding:.2em .4em;border-radius:6px;background:#afb8c133}.markdown-body blockquote{margin:0;padding:0 1em;color:#59636e;border-left:.25em solid #d0d7de}.markdown-body li+li{margin-top:.25em}@media(max-width:544px){.markdown-body{padding:24px 16px 48px}.markdown-body h1{font-size:1.75em}.markdown-body h2{font-size:1.35em}}
`;

for (const [name, markdown] of Object.entries(variants)) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="../../"><title>Figurestead README ${name}</title><style>${style}</style></head><body><main class="markdown-body" data-readme-variant="${name}">${marked.parse(markdown)}</main></body></html>`;
  writeFileSync(`docs/readme-review/${name}.html`, html);
}
