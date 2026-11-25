// Live map card for nearby health centers (Leaflet + OpenStreetMap)

const MAIN_CENTER_MATCH = "Tandag City Health Office";
const DEFAULT_START = { lat: 9.0785, lng: 126.1980 };

const MAP_TEXT = {
  en: {
    locating: "Getting your location...",
    youAre: "You are here",
    main: "Main center",
    fallback: "Location is off, so distances start from Tandag City.",
    located: "Distances are from your location.",
    retry: "Try location again",
    directions: "Directions",
    call: "Call",
    km: "km",
    mapError: "Map could not load. The list below still works.",
  },
  ceb: {
    locating: "Gikuha ang imong lokasyon...",
    youAre: "Nahimutang ka dinhi",
    main: "Main nga center",
    fallback: "Gipalong ang lokasyon, mao nga gikan sa Tandag City ang distansya.",
    located: "Gikan sa imong lokasyon ang distansya.",
    retry: "Sulayi usab ang lokasyon",
    directions: "Direksyon",
    call: "Tawag",
    km: "km",
    mapError: "Dili ma-load ang mapa. Gamita gihapon ang lista sa ubos.",
  },
};

function mapText(key) {
  const pack = MAP_TEXT[currentLang] || MAP_TEXT.en;
  return pack[key] || MAP_TEXT.en[key];
}

function mapEsc(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function isMainCenter(c) {
  return typeof c.center === "string" && c.center.includes(MAIN_CENTER_MATCH);
}

// Main center first, then the rest by distance
function orderCenters(centers) {
  const main = centers.filter(isMainCenter);
  const rest = centers
    .filter(c => !isMainCenter(c))
    .sort((a, b) => a.distance_km - b.distance_km);
  return [...main, ...rest];
}

// Never hangs: resolves after 12 seconds at most
function getLocation() {
  const request = new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve({ ok: false });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ ok: false }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
  const timeout = new Promise(resolve => setTimeout(() => resolve({ ok: false }), 12000));
  return Promise.race([request, timeout]);
}

function renderMap(container, centers, userLoc, locOk, onRetry) {
  const ordered = orderCenters(centers);

  const status = document.createElement("div");
  status.className = "map-status";
  status.textContent = locOk ? mapText("located") : mapText("fallback");
  container.appendChild(status);

  if (!locOk) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "retry-btn";
    btn.textContent = mapText("retry");
    btn.addEventListener("click", onRetry);
    container.appendChild(btn);
  }

  const mapBox = document.createElement("div");
  mapBox.className = "map-box";
  container.appendChild(mapBox);

  if (typeof L === "undefined") {
    mapBox.textContent = mapText("mapError");
    return;
  }

  const map = L.map(mapBox, { scrollWheelZoom: false });
  map.setMinZoom(12);
  map.setMaxBounds([[8.98, 126.08], [9.16, 126.30]]);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  const bounds = [];

  ordered.forEach(c => {
    if (c.lat == null || c.lng == null) return;
    const main = isMainCenter(c);
    L.circleMarker([c.lat, c.lng], {
      radius: main ? 11 : 8,
      color: "#FFFFFF",
      weight: 2,
      fillColor: main ? "#087F75" : "#12B8A6",
      fillOpacity: 1,
    })
      .addTo(map)
      .bindPopup(
        `<strong>${mapEsc(c.center)}</strong>` +
        (main ? `<br>${mapEsc(mapText("main"))}` : "") +
        `<br>${mapEsc(String(c.distance_km))} ${mapText("km")}`
      );
    bounds.push([c.lat, c.lng]);
  });

  if (userLoc) {
    L.circleMarker([userLoc.lat, userLoc.lng], {
      radius: 7,
      color: "#FFFFFF",
      weight: 3,
      fillColor: "#2563EB",
      fillOpacity: 1,
    }).addTo(map).bindPopup(mapText("youAre"));
    bounds.push([userLoc.lat, userLoc.lng]);
  }

  if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [24, 24] });
  } else {
    map.setView([DEFAULT_START.lat, DEFAULT_START.lng], 14);
  }

  setTimeout(() => map.invalidateSize(), 100);
}