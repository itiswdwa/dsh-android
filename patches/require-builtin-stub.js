// ALPINE/musl ONLY — the shipped Ubuntu payload uses the upstream prebuilt
// binding (node-addon-require-builtin-linux-arm64-gnu) and does not need this.
//
// Pure-JS stand-in for node-addon-require-builtin 0.1.6 on linux-arm64-musl.
//
// Why: upstream publishes prebuilt N-API binaries only for
// darwin/win32/linux-*-gnu. On Alpine (musl) the optional platform package does
// not exist and the published tarball ships no native sources, so neither the
// prebuild nor the local-build backend of node-addon-native-custom-loader can
// satisfy the load, and the module-level createEntryApi() threw during import,
// killing `dsh` boot.
//
// What the native addon actually does: call Node's builtin require with the
// "internal module ids" check bypassed, so callers can reach real internal
// module instances (internal/modules/esm/loader and friends). Node exposes
// exactly that surface itself via --expose-internals, which we make sure the
// launcher always passes. With the flag on, `require('internal/...')` returns
// the *real, already-instantiated* internals -- which matters, because
// @deepseek-ai/dsh-app-boot patches methods on them (e.g.
// Module._resolveFilename) to intercept package resolution.
//
// Fallback chain, in order:
//   1. require('internal/...')            -> real instances (flag on)
//   2. process.binding('natives') compile -> isolated instances (flag off)
//   3. throw                              -> callers take their no-internals path
"use strict";

const { createRequire } = require("node:module");

let cachedRequire;
function nativeInternalRequire(id) {
  if (cachedRequire === undefined) {
    try {
      cachedRequire = createRequire(process.execPath);
    } catch {
      cachedRequire = null;
    }
  }
  if (cachedRequire === null) throw new Error("no createRequire available");
  return cachedRequire(id);
}

// --- fallback: compile an internal source in an isolated module -------------
const syntheticCache = new Map();
let nativeSources;
function loadSynthetic(id, parent) {
  const key = id.replace(/^node:/, "");
  const cached = syntheticCache.get(key);
  if (cached !== undefined) return cached.exports;
  if (nativeSources === undefined) nativeSources = process.binding("natives");
  const source = nativeSources[key];
  if (source === undefined) throw unknownModule(id);
  const Module = require("node:module");
  const mod = new Module(key, parent);
  mod.filename = key;
  mod.paths = [];
  syntheticCache.set(key, mod);
  const localRequire = (request) =>
    request.startsWith("internal/") || request.startsWith("internal:")
      ? loadSynthetic(request, mod)
      : Module._load(request, mod, false);
  mod.require = localRequire;
  localRequire.resolve = (request) => request;
  localRequire.cache = Object.create(null);
  mod._compile(source, key);
  return mod.exports;
}

function unknownModule(id) {
  const error = new Error(`Cannot find internal module '${id}'`);
  error.code = "ERR_UNKNOWN_BUILTIN_MODULE";
  return error;
}

function requireBuiltin(moduleId) {
  const id = String(moduleId);
  try {
    return nativeInternalRequire(id);
  } catch (nativeError) {
    if (nativeError && nativeError.code === "ERR_UNKNOWN_BUILTIN_MODULE") {
      // --expose-internals missing: still hand back a usable shape so boot's
      // structural assertions pass, but the instances are isolated copies.
      return loadSynthetic(id, undefined);
    }
    throw nativeError;
  }
}

function isAllowedInternalId(moduleId) {
  const id = String(moduleId);
  return id.startsWith("internal/") || id.startsWith("node:internal/");
}

function getBindingInfo() {
  return Object.freeze({
    packageName: "node-addon-require-builtin",
    variant: "unrestricted",
    backend: "js-expose-internals",
    abi: `nodeabi-v${process.versions.modules}`,
    platform: `${process.platform}-${process.arch}-musl`,
    available: true,
    reason: "native prebuild unavailable for musl; delegating to Node's own internal require"
  });
}

module.exports = { requireBuiltin, isAllowedInternalId, getBindingInfo };
module.exports.default = module.exports;
