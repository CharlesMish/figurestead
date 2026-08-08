const response = await fetch("./public-alpha-set.json");
if (!response.ok) throw new Error(`Theme data failed: ${response.status}`);
const data = await response.json();
if (data.themes.length !== 6) throw new Error("Theme data count differs");
document.documentElement.dataset.cardsReady = "true";
