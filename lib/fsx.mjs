import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath, content, mode) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, { encoding: "utf8" });
  if (mode !== undefined) fs.chmodSync(filePath, mode);
}

export function ensureDir(dirPath) {
  if (dirPath) fs.mkdirSync(dirPath, { recursive: true });
}

export function exists(target) {
  return fs.existsSync(target);
}

export function isFile(target) {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

export function isDir(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

export function fileSize(target) {
  return fs.statSync(target).size;
}

export function isExecutable(target) {
  try {
    fs.accessSync(target, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Absolute path with symlinks resolved, like Python's `Path.resolve()`. */
export function realpath(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

export function isAbsolute(target) {
  return path.isAbsolute(target);
}

export function listDir(dirPath) {
  return fs.readdirSync(dirPath).sort();
}

/** `*.md` entries of a directory, sorted, as absolute paths. */
export function globMarkdown(dirPath) {
  if (!isDir(dirPath)) return [];
  return listDir(dirPath)
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(dirPath, name));
}

/**
 * Python's `shutil.move` for the cases here: rename, falling back to copy+unlink
 * when the destination lives on another filesystem.
 */
export function moveFile(source, destination) {
  try {
    fs.renameSync(source, destination);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    fs.copyFileSync(source, destination);
    fs.unlinkSync(source);
  }
  return destination;
}

/** True when the module at `importMetaUrl` is the script Node was asked to run. */
export function isMainModule(importMetaUrl) {
  if (!process.argv[1]) return false;
  return realpath(process.argv[1]) === realpath(fileURLToPath(importMetaUrl));
}
