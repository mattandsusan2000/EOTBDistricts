// -----------------------------
// Data hosting (Cloudflare R2)
// -----------------------------
// -----------------------------
// Phil Berger is an @$$h@t
// -----------------------------
const DATA_BASE = "https://pub-1bacdccb5e824653a18e55522bcb1ac4.r2.dev";

// -----------------------------
// Map setup
// -----------------------------
const map = L.map("map").setView([35.5, -79.0], 7);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "© OpenStreetMap"
}).addTo(map);

let houseLayer, precLayer, labelLayer;
let selected = null;
let searchMarker = null;
let precinctsByDistrict = {};

// -----------------------------
// Styles
// -----------------------------
function houseStyle() {
  return { color: "#111", weight: 1, fillColor: "#000", fillOpacity: 0.08 };
}

function houseSelectedStyle() {
  return { color: "#111", weight: 3, fillColor: "#000", fillOpacity: 0.22 };
}

function precStyle() {
  return { color: "#555", weight: 1, opacity: 0.6 };
}

function makeLabelIcon(text) {
  return L.divIcon({
    className: "district-label",
    html: `
      <div style="
        font-size:11px;
        font-weight:800;
        color:#111;
        background:rgba(255,255,255,0.75);
        border:1px solid rgba(0,0,0,0.25);
        border-radius:4px;
        padding:1px 5px;
        line-height:14px;
        text-align:center;
      ">${text}</div>
    `
  });
}

// -----------------------------
// Utilities
// -----------------------------
async function loadJSON(url) {
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error(`Failed to load ${url} (${r.status})`);
  return r.json();
}

function clearSelection() {
  if (selected) selected.setStyle(houseStyle());
  selected = null;
}

function popupHTML(district) {
  const plist = precinctsByDistrict[String(district)] || [];
  const show = plist.slice(0, 25);
  const more = plist.length - show.length;

  const lines = show.length ? show.join("<br>") : "<em>No precincts matched</em>";
  const moreLine = more > 0 ? `<br><br><strong>…and ${more} more</strong>` : "";
  const copy = plist.join(", ");

  return `
    <div style="font-family:system-ui,Arial;font-size:13px;line-height:1.25">
      <div style="font-size:16px;font-weight:800;margin-bottom:6px">
        NC House District ${district}
      </div>
      <div style="margin-bottom:6px">
        <strong>Precincts:</strong> ${plist.length}
      </div>
      <div style="
        max-height:180px;
        overflow:auto;
        padding:8px;
        border:1px solid #ddd;
        border-radius:6px;
        background:#fafafa">
        ${lines}${moreLine}
      </div>
      <div style="margin-top:10px">
        <strong>Copy precinct list:</strong>
        <div style="
          padding:8px;
          border:1px dashed #bbb;
          border-radius:6px;
          background:#fff;
          word-break:break-word">
          ${copy}
        </div>
      </div>
    </div>
  `;
}

// -----------------------------
// Address search helpers
// -----------------------------
function applyResult(r) {
  const lat = parseFloat(r.lat);
  const lon = parseFloat(r.lon);

  if (searchMarker) map.removeLayer(searchMarker);
  searchMarker = L.marker([lat, lon]).addTo(map);

  map.setView([lat, lon], 13);
}

function showResults(items) {
  const box = document.getElementById("results");

  if (!items.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }

  box.hidden = false;
  box.innerHTML = `
    <div class="hint">
      <strong>Multiple matches found.</strong> Choose the correct address:
    </div>
    <div>
      ${items
        .map(
          (x, i) => `
        <button type="button" data-idx="${i}">
          ${x.display_name}
        </button>
      `
        )
        .join("")}
    </div>
  `;

  box.querySelectorAll("button[data-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-idx"), 10);
      applyResult(items[idx]);
      showResults([]);
    });
  });
}

// -----------------------------
// Address lookup (NC-only bounding box + helpful prompts)
// -----------------------------
async function lookup() {
  const qRaw = document.getElementById("addr").value.trim();
  if (!qRaw) return;

  // If user didn't include NC, add it
  const q = /,\s*nc\b/i.test(qRaw) ? qRaw : `${qRaw}, NC`;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");

  // NC bounding box: west, north, east, south
  url.searchParams.set("viewbox", "-84.6,36.7,-75.4,33.8");
  url.searchParams.set("bounded", "1");
  url.searchParams.set("q", q);

  const r = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
  const results = await r.json();

  if (!results.length) {
    showResults([]);
    alert("No match found. Try adding your city/town and 'NC' (example: 'Mebane, NC').");
    return;
  }

  // Filter to NC results; accept city/town/village/hamlet
  const ncResults = results.filter((x) => {
    const a = x.address || {};
    const isNC = a.state === "North Carolina" || a.state === "NC";
    const hasPlace = a.city || a.town || a.village || a.hamlet;
    return isNC && hasPlace;
  });

  if (!ncResults.length) {
    showResults([]);
    alert("No North Carolina match found. Try adding city/town + NC (example: 'Mebane, NC').");
    return;
  }

  if (ncResults.length === 1) {
    showResults([]);
    applyResult(ncResults[0]);
  } else {
    showResults(ncResults);
  }
}

// -----------------------------
// Label visibility control
// -----------------------------
function updateLabelsForZoom() {
  const z = map.getZoom();
  if (z >= 9) {
    if (!map.hasLayer(labelLayer)) labelLayer.addTo(map);
  } else {
    if (map.hasLayer(labelLayer)) map.removeLayer(labelLayer);
  }
}

// -----------------------------
// Initialization
// -----------------------------
async function init() {
  // Load district->precinct list
  precinctsByDistrict = await loadJSON(`${DATA_BASE}/precincts_by_district.json`);

  // Load GeoJSON layers from R2
  const houseGeo = await loadJSON(`${DATA_BASE}/nc_house.geojson`);
  const precGeo = await loadJSON(`${DATA_BASE}/precincts.geojson`);
  const labelGeo = await loadJSON(`${DATA_BASE}/house_labels.geojson`);

  // Districts to highlight in light red
  const highlightDistricts = ["117", "89", "35", "32", "81", "105"];

  houseLayer = L.geoJSON(houseGeo, {
    style: (feature) => {
      const district = String(feature.properties.DISTRICT);
      if (highlightDistricts.includes(district)) {
        return { color: "#FF9999", weight: 3, fillColor: "#FF9999", fillOpacity: 0.4 };
      }
      return houseStyle();
    },
    onEachFeature: (feature, layer) => {
      const district = String(feature.properties.DISTRICT);
      layer.on("click", () => {
        clearSelection();
        selected = layer;
        layer.setStyle(houseSelectedStyle());
        layer.bindPopup(popupHTML(district), { maxWidth: 420 }).openPopup();
      });
    }
  }).addTo(map);

  precLayer = L.geoJSON(precGeo, { style: precStyle });

  labelLayer = L.geoJSON(labelGeo, {
    pointToLayer: (feature, latlng) =>
      L.marker(latlng, { icon: makeLabelIcon(String(feature.properties.DISTRICT)) })
  }).addTo(map);

  map.fitBounds(houseLayer.getBounds());

  updateLabelsForZoom();
  map.on("zoomend", updateLabelsForZoom);

  // Optional UI toggles (only if the elements exist)
  const showPrec = document.getElementById("showPrec");
  if (showPrec) {
    showPrec.onchange = (e) => (e.target.checked ? precLayer.addTo(map) : map.removeLayer(precLayer));
  }

  const showLabels = document.getElementById("showLabels");
  if (showLabels) {
    showLabels.onchange = (e) => {
      if (!e.target.checked && map.hasLayer(labelLayer)) map.removeLayer(labelLayer);
      if (e.target.checked) updateLabelsForZoom();
    };
  }

  const goBtn = document.getElementById("go");
  if (goBtn) goBtn.onclick = lookup;

  const addr = document.getElementById("addr");
  if (addr) {
    addr.onkeydown = (e) => {
      if (e.key === "Enter") lookup();
    };
  }
}

init().catch((err) => {
  console.error(err);
  alert("Map failed to load. Check the console for details.");
});
