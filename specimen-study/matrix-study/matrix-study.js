const response = await fetch("corpus-v0.2/scenes/habitat_response_matrix.json");
if (!response.ok) throw new Error(`Could not load matrix scene: ${response.status}`);
const scene = await response.json();
const table = document.querySelector("#matrix-table");
const head = document.createElement("thead");
const headingRow = document.createElement("tr");
const corner = document.createElement("th"); corner.scope = "col"; corner.textContent = "Response band"; headingRow.append(corner);
scene.data.xCategories.forEach((habitat) => { const th = document.createElement("th"); th.scope = "col"; th.textContent = habitat; headingRow.append(th); });
head.append(headingRow);
const body = document.createElement("tbody");
scene.responseBands.forEach((band, rowIndex) => {
  const row = document.createElement("tr");
  const th = document.createElement("th"); th.scope = "row"; th.textContent = `${band.label} (${band.displayRange})`; row.append(th);
  scene.data.xCategories.forEach((habitat, columnIndex) => {
    const count = scene.derived.countMatrix[rowIndex][columnIndex];
    const share = scene.derived.shareMatrix[rowIndex][columnIndex];
    const td = document.createElement("td");
    td.textContent = `${(share * 100).toFixed(1)}% · n=${count}`;
    td.dataset.habitat = habitat; td.dataset.band = band.label; td.dataset.count = String(count); td.dataset.share = String(share);
    row.append(td);
  });
  body.append(row);
});
table.append(head, body);
window.__FIGURESTEAD_MATRIX_STUDY__ = Object.freeze({ scene, table });
document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const rect = target.getBoundingClientRect();
  if (rect.top < 12 || rect.bottom > window.innerHeight - 12) {
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  }
});
document.documentElement.dataset.matrixReady = "true";
