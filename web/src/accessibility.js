const el = (name, text) => { const node = document.createElement(name); if (text != null) node.textContent = text; return node; };

function appendTable(root, panel, description, { interactive = false } = {}) {
  if (!description?.headers?.length || !Array.isArray(description.rows)) return;
  const table = el("table");
  table.append(el("caption", `${panel.spec.title || panel.renderer} data`));
  const head = el("thead"), body = el("tbody"), headingRow = el("tr");
  description.headers.forEach((value) => headingRow.append(el("th", value))); head.append(headingRow);
  description.rows.forEach((row) => { const tr = el("tr"); row.forEach((value, index) => { const cell = el(index === 0 ? "th" : "td", String(value)); if (index === 0) cell.scope = "row"; tr.append(cell); }); body.append(tr); });
  table.append(head, body);
  if (!interactive) { root.append(table); return; }
  const details = el("details"), summary = el("summary", `View ${panel.spec.title || panel.renderer} data`);
  details.append(summary, table); root.append(details);
}

export function prepareAccessibilityCompanion(canvas, contract, registry, { visible = false, table = true } = {}) {
  const id = `figurestead-${Math.random().toString(36).slice(2)}`, root = el("section");
  root.className = visible ? "figurestead-accessibility" : "figurestead-accessibility figurestead-sr-only";
  if (!visible) Object.assign(root.style, { position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: "0" });
  const title = el("h2", contract.spec.title); title.id = `${id}-title`; root.append(title);
  if (contract.spec.subtitle) root.append(el("p", contract.spec.subtitle));
  const description = el("p", contract.spec.description || `${contract.panels.length}-panel scientific figure.`); description.id = `${id}-description`; root.append(description);
  contract.panels.forEach((panel, index) => {
    const section = el("section"), panelTitle = panel.spec.title || `${panel.renderer.replaceAll("_", " ")} panel`, definition = registry.get(panel.renderer), described = definition.describe({ ...contract, renderer: panel.renderer, spec: { ...contract.spec, ...panel.spec }, data: panel.data });
    const repeatsContractTitle = contract.panels.length === 1 && panelTitle.trim() === contract.spec.title.trim();
    if (repeatsContractTitle) section.setAttribute("aria-labelledby", title.id);
    else {
      const heading = el("h3", panelTitle); heading.id = `${id}-panel-${index + 1}`;
      section.setAttribute("aria-labelledby", heading.id); section.append(heading);
    }
    if (panel.spec.description || described.summary) section.append(el("p", panel.spec.description || described.summary));
    panel.annotations.filter((item) => item?.type === "focus" && typeof item.label === "string" && item.label.trim()).forEach((item) => {
      section.append(el("p", `Focus annotation: ${item.label} at x ${item.x}, y ${item.y}.`));
    });
    const dl = el("dl");
    [["Horizontal axis", panel.spec.xLabel || panel.xScale.label || "Unlabelled"], ["Vertical axis", panel.spec.yLabel || panel.yScale.label || "Unlabelled"], ["Renderer", panel.renderer.replaceAll("_", " ")]].forEach(([term, value]) => dl.append(el("dt", term), el("dd", value)));
    section.append(dl); if (table) appendTable(section, panel, described, { interactive: visible }); root.append(section);
  });
  const labelledBy = `${title.id} ${description.id}`;
  let attached = false;
  return {
    root,
    attach() {
      if (attached) return;
      canvas.setAttribute("role", "img"); canvas.setAttribute("aria-labelledby", labelledBy); canvas.after(root); attached = true;
    },
    destroy() {
      root.remove();
      if (canvas.getAttribute("aria-labelledby") === labelledBy) { canvas.removeAttribute("role"); canvas.removeAttribute("aria-labelledby"); }
      attached = false;
    },
  };
}

export function createAccessibilityCompanion(canvas, contract, registry, options) {
  const companion = prepareAccessibilityCompanion(canvas, contract, registry, options);
  companion.attach();
  return companion;
}
