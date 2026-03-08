#!/usr/bin/env node
// Replaces hardcoded version strings in HTML files with the latest git tag.
// Falls back to package.json version if no git tag is found.
// Runs automatically as a postbuild step.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

let version;
try {
  const tag = execFileSync("git", ["describe", "--tags", "--abbrev=0"], { encoding: "utf8" }).trim();
  version = tag.startsWith("v") ? tag : `v${tag}`;
} catch {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
  version = `v${pkg.version}`;
  console.warn(`[inject-version] No git tag found, falling back to package.json: ${version}`);
}

const htmlFiles = ["index.html", "view.html", "delete.html"].map((f) =>
  path.join(__dirname, "../", f)
);

const versionPattern = /(?<=class="version-display">)v\d+\.\d+\.\d+(?=<\/a>)/g;

for (const file of htmlFiles) {
  if (!fs.existsSync(file)) continue;
  const original = fs.readFileSync(file, "utf8");
  const updated = original.replace(versionPattern, version);
  if (updated !== original) {
    fs.writeFileSync(file, updated, "utf8");
    console.log(`[inject-version] ${path.basename(file)}: updated to ${version}`);
  } else {
    console.log(`[inject-version] ${path.basename(file)}: already ${version} (or pattern not found)`);
  }
}
