import { lineIdentityContract } from "./line-identity.js";

// Synthetic numeric admission fixtures, shared by Node and native browsers.
export function numericContract(theme, renderer = "line") {
  const contract = lineIdentityContract(theme), panel = contract.panels[0];
  contract.spec.title = "Synthetic numeric admission";
  panel.renderer = renderer;
  if (renderer === "line") {
    panel.data.series = panel.data.series.slice(0, 2);
    panel.data.series.forEach((series, index) => { series.key = ["A", "B"][index]; });
    contract.style.series.B = { lineStyle: "dash" };
  } else if (renderer === "scatter") {
    panel.data = { x: [0, 1, 2], y: [1, 2, 3], series: ["A", "A", "B"] };
  } else {
    panel.xScale = { type: "band" };
    panel.data = { groups: ["G"], group: ["G", "G", "G"], values: [1, 2, 3], summary: "median" };
  }
  return contract;
}

const fields = [
  ["line", "x"], ["line", "series[0].y"],
  ["scatter", "x"], ["scatter", "y"], ["strip_summary", "values"],
];
const mutations = [
  ["hole-first", 0, values => { delete values[0]; }],
  ["hole-middle", 1, values => { delete values[1]; }],
  ["hole-last", 2, values => { delete values[2]; }],
  ["all-holes", 0, () => new Array(3)],
  ["inherited-slot", 1, values => {
    delete values[1];
    // Confine inherited numeric data to this array; never alter Array.prototype.
    Object.setPrototypeOf(values, Object.create(Array.prototype, { 1: { value: 2, enumerable: true } }));
  }],
  ...[["undefined", undefined], ["null", null], ["nan", NaN], ["infinity", Infinity],
    ["negative-infinity", -Infinity], ["boolean", true], ["numeric-string", "2"]]
    .map(([name, value]) => [name, 1, values => { values[1] = value; }]),
  ["typed-array", null, values => new Float64Array(values)],
  ["empty", null, () => []],
];

export function numericRejectionCases(theme) {
  return fields.flatMap(([renderer, field]) => mutations.map(([mutation, index, change]) => ({
    name: `${renderer}/${field}/${mutation}`, renderer,
    dataPath: `${field}${index === null ? "" : `[${index}]`}`,
    make() {
      const contract = numericContract(theme, renderer), data = contract.panels[0].data;
      const owner = field === "series[0].y" ? data.series[0] : data;
      const key = field === "series[0].y" ? "y" : field;
      owner[key] = change(owner[key]) ?? owner[key];
      return contract;
    },
  })));
}
