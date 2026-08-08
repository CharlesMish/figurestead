export function panelContract(figure, panel) {
  return {
    schemaVersion: figure.schemaVersion,
    rendererApiVersion: figure.rendererApiVersion,
    theme: figure.theme,
    profile: figure.profile,
    timeline: figure.timeline,
    motion: figure.motion,
    view: figure.view,
    style: figure.style,
    applicationProfile: figure.applicationProfile,
    seriesStyles: figure.seriesStyles,
    renderer: panel.renderer,
    spec: {
      ...figure.spec,
      ...panel.spec,
      title: panel.spec.title || figure.spec.title,
      subtitle: panel.spec.subtitle || (figure.panels.length === 1 ? figure.spec.subtitle : ""),
      xLabel: panel.spec.xLabel || panel.xScale?.label || figure.spec.xLabel,
      yLabel: panel.spec.yLabel || panel.yScale?.label || figure.spec.yLabel,
    },
    data: panel.data,
    xScale: panel.xScale,
    yScale: panel.yScale,
    annotations: panel.annotations,
    presentation: panel.presentation ?? null,
    encoding: panel.encoding ?? { interpolation: panel.presentation?.curve ?? "linear" },
  };
}

export function unionDomains(domains) {
  const present = domains.filter((value) => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite));
  if (!present.length) return null;
  return [Math.min(...present.map((value) => value[0])), Math.max(...present.map((value) => value[1]))];
}

export function resolvePanelDomains(figure, preparedPanels) {
  const raw = preparedPanels.map(({ definition, contract, prepared }) => definition.domains(contract, prepared) || {});
  const sharedX = figure.layout.sharedX ? unionDomains(raw.map((value) => value.x)) : null;
  const sharedY = figure.layout.sharedY ? unionDomains(raw.map((value) => value.y)) : null;
  return raw.map((value) => ({ ...value, x: sharedX || value.x, y: sharedY || value.y }));
}
