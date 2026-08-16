import { CORE_REGISTRY } from "./core-renderers.js";
import { composeResolvedScene } from "./composition.js";
import { resolveTerminalScene, resolvedTerminalGeometry } from "./resolved-scene.js";
import { resolvedSceneToSvg } from "./svg-export.js";
import { compileTerminalScene, evidenceFingerprint } from "./terminal-scene.js";
import { auditPhysicalTypography, resolveExportSize } from "./physical-export.js";

export const EXPORT_MANIFEST_VERSION = "figurestead.export-manifest/1";
export const FIGURESTEAD_PACKAGE_VERSION = "0.9.0-alpha.2";

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
}

export function stableStringify(value, space = 2) {
  return JSON.stringify(sorted(value), null, space);
}

function contentFingerprint(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function dimension(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be a positive finite number`);
  return value;
}

export function exportFigureArtifacts(input, options = {}) {
  const registry = options.registry ?? CORE_REGISTRY;
  const exportSize = resolveExportSize(options), width = dimension(exportSize.width, "width"), height = dimension(exportSize.height, "height");
  const scene = input?.schemaVersion === "figurestead.scene/1" ? input : compileTerminalScene(input, { registry });
  const resolved = resolveTerminalScene(scene, { width, height }), composed = composeResolvedScene(resolved);
  const svg = resolvedSceneToSvg(composed, { ...options, exportSize, sourceScene: scene });
  const sceneJson = stableStringify(scene);
  const geometryJson = stableStringify({ schemaVersion: "figurestead.geometry-export/1", width, height, panels: resolvedTerminalGeometry(composed), composition: composed.panels.map((panel) => ({ panelId: panel.id, legend: panel.layout.legend, annotations: panel.composedAnnotations })) });
  const manifest = {
    formatVersion: EXPORT_MANIFEST_VERSION,
    packageVersion: FIGURESTEAD_PACKAGE_VERSION,
    sourceSceneVersion: scene.schemaVersion,
    resolvedSceneVersion: resolved.schemaVersion,
    composedSceneVersion: composed.schemaVersion,
    contractSchemaVersion: scene.contractSchemaVersion,
    rendererApiVersion: scene.rendererApiVersion,
    evidenceFingerprint: evidenceFingerprint(scene),
    dimensions: { width, height },
    physical: exportSize.physical ? { ...exportSize.physical, typographyAudit: auditPhysicalTypography(composed, exportSize.physical) } : null,
    profile: scene.applicationProfile?.key ?? scene.view?.profile ?? null,
    theme: { key: scene.theme.key, name: scene.theme.name },
    appearanceAudit: scene.appearanceReport,
    evidenceCoverage: scene.evidenceCoverage,
    renderers: scene.panels.map((panel) => ({ panelId: panel.id, renderer: panel.renderer, marks: panel.marks.length })),
    annotationAudit: composed.compositionAudit,
    contentFingerprints: {
      algorithm: "fnv1a32",
      svg: contentFingerprint(svg),
      scene: contentFingerprint(sceneJson),
      geometry: contentFingerprint(geometryJson),
    },
    artifacts: { svg: "figure.svg", scene: "scene.json", geometry: "geometry.json", manifest: "manifest.json", png: "figure.png" },
  };
  return Object.freeze({
    scene,
    resolved,
    composed,
    svg,
    sceneJson,
    geometryJson,
    manifest: Object.freeze(manifest),
    manifestJson: stableStringify(manifest),
  });
}

export function canvasToPngBlob(canvas, options = {}) {
  if (!canvas || typeof canvas.toBlob !== "function") return Promise.reject(new TypeError("canvasToPngBlob requires a canvas with toBlob"));
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG encoding returned no data")), "image/png", options.quality));
}
