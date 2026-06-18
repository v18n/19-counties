const STORAGE_KEY = "viktor-hungary-counties-visited";
const MAP_WIDTH = 920;
const MAP_HEIGHT = 640;
const MAP_PADDING = 24;

const map = document.querySelector("#county-map");
const tooltip = document.querySelector("#tooltip");
const countyList = document.querySelector("#county-list");
const countLabel = document.querySelector("#count-label");
const percentLabel = document.querySelector("#percent-label");
const progressBar = document.querySelector("#progress-bar");
const statusCopy = document.querySelector("#status-copy");
const clearAllButton = document.querySelector("#clear-all");
const markAllButton = document.querySelector("#mark-all");
const copyLinkButton = document.querySelector("#copy-link");

let features = [];
let visited = new Set();

const slugify = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const countyName = (feature) => feature.properties.megye;
const isCounty = (feature) => countyName(feature) !== "Budapest";

const readUrlState = () => {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("visited");
  return raw ? raw.split(",").filter(Boolean) : null;
};

const readSavedState = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...visited]));
};

const buildShareUrl = () => {
  const url = new URL(window.location.href);
  const slugs = [...visited].sort();

  if (slugs.length) {
    url.searchParams.set("visited", slugs.join(","));
  } else {
    url.searchParams.delete("visited");
  }

  return url.toString();
};

const updateUrl = () => {
  window.history.replaceState(null, "", buildShareUrl());
};

const getCoordinates = (geometry) =>
  geometry.type === "MultiPolygon" ? geometry.coordinates.flat(2) : geometry.coordinates.flat(1);

const makeProjection = (allFeatures) => {
  const points = allFeatures.flatMap((feature) => getCoordinates(feature.geometry));
  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const midLatitude = (minLatitude + maxLatitude) / 2;
  const longitudeScale = Math.cos((midLatitude * Math.PI) / 180);
  const projectedMinX = minLongitude * longitudeScale;
  const projectedMaxX = maxLongitude * longitudeScale;
  const longitudeSpan = projectedMaxX - projectedMinX;
  const latitudeSpan = maxLatitude - minLatitude;
  const scale = Math.min(
    (MAP_WIDTH - MAP_PADDING * 2) / longitudeSpan,
    (MAP_HEIGHT - MAP_PADDING * 2) / latitudeSpan
  );
  const offsetX = (MAP_WIDTH - longitudeSpan * scale) / 2;
  const offsetY = (MAP_HEIGHT - latitudeSpan * scale) / 2;

  return ([longitude, latitude]) => [
    offsetX + (longitude * longitudeScale - projectedMinX) * scale,
    offsetY + (maxLatitude - latitude) * scale,
  ];
};

const polygonPath = (coordinates, project) =>
  coordinates
    .map((ring) =>
      ring
        .map((point, index) => {
          const [x, y] = project(point);
          return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ")
    )
    .join(" Z ") + " Z";

const polygonCentroid = (coordinates, project) => {
  const ring = coordinates[0].map(project);
  let twiceArea = 0;
  let x = 0;
  let y = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x0, y0] = ring[index];
    const [x1, y1] = ring[index + 1];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }

  if (!twiceArea) {
    const sums = ring.reduce(
      (accumulator, [pointX, pointY]) => [accumulator[0] + pointX, accumulator[1] + pointY],
      [0, 0]
    );
    return [sums[0] / ring.length, sums[1] / ring.length];
  }

  return [x / (3 * twiceArea), y / (3 * twiceArea)];
};

const setTooltip = (event, name, isVisited) => {
  const stage = event.currentTarget.closest(".map-stage");
  const bounds = stage.getBoundingClientRect();
  tooltip.textContent = `${name}${isVisited ? " visited" : ""}`;
  tooltip.style.left = `${event.clientX - bounds.left}px`;
  tooltip.style.top = `${event.clientY - bounds.top}px`;
  tooltip.hidden = false;
};

const hideTooltip = () => {
  tooltip.hidden = true;
};

const renderMap = () => {
  const project = makeProjection(features);
  map.setAttribute("viewBox", `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`);
  map.innerHTML = "";

  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.id = "map-title";
  title.textContent = "Hungary's 19 counties visited map";
  map.append(title);

  const desc = document.createElementNS("http://www.w3.org/2000/svg", "desc");
  desc.id = "map-desc";
  desc.textContent = "Interactive map of Hungary's 19 counties. Counties can be selected to mark visits.";
  map.append(desc);

  const shapeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const labelGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  map.append(shapeGroup, labelGroup);

  features.forEach((feature) => {
    const name = countyName(feature);
    const slug = slugify(name);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.dataset.slug = slug;
    path.dataset.name = name;
    path.setAttribute("class", "county-shape");
    path.setAttribute("d", polygonPath(feature.geometry.coordinates, project));
    path.setAttribute("tabindex", "0");
    path.setAttribute("role", "button");
    path.setAttribute("aria-pressed", "false");
    path.setAttribute("aria-label", `${name}, not visited`);
    path.addEventListener("click", () => toggleCounty(slug));
    path.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleCounty(slug);
      }
    });
    path.addEventListener("pointermove", (event) => setTooltip(event, name, visited.has(slug)));
    path.addEventListener("pointerleave", hideTooltip);
    shapeGroup.append(path);

    const [x, y] = polygonCentroid(feature.geometry.coordinates, project);
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("class", "county-label");
    label.setAttribute("x", x.toFixed(2));
    label.setAttribute("y", y.toFixed(2));
    label.dataset.slug = slug;
    label.textContent = name === "Jász-Nagykun-Szolnok" ? "Jász-Nk.-Sz." : name;
    labelGroup.append(label);
  });
};

const renderList = () => {
  countyList.innerHTML = "";

  features
    .map(countyName)
    .sort((left, right) => left.localeCompare(right, "hu"))
    .forEach((name) => {
      const slug = slugify(name);
      const button = document.createElement("button");
      button.className = "county-toggle";
      button.dataset.slug = slug;
      button.type = "button";
      button.textContent = name;
      button.addEventListener("click", () => toggleCounty(slug));
      countyList.append(button);
    });
};

const syncState = () => {
  const allSlugs = features.map((feature) => slugify(countyName(feature)));
  const visitedCount = visited.size;
  const percent = Math.round((visitedCount / allSlugs.length) * 100);
  const visitedNames = features
    .filter((feature) => visited.has(slugify(countyName(feature))))
    .map(countyName)
    .sort((left, right) => left.localeCompare(right, "hu"));

  document.querySelectorAll("[data-slug]").forEach((element) => {
    const isVisited = visited.has(element.dataset.slug);
    element.classList.toggle("is-visited", isVisited);

    if (element.classList.contains("county-shape")) {
      const name = element.dataset.name;
      element.setAttribute("aria-pressed", String(isVisited));
      element.setAttribute("aria-label", `${name}, ${isVisited ? "visited" : "not visited"}`);
    }
  });

  countLabel.textContent = `${visitedCount} / ${allSlugs.length}`;
  percentLabel.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;
  statusCopy.textContent = visitedNames.length ? visitedNames.join(", ") : "No counties marked yet.";
};

function toggleCounty(slug) {
  if (visited.has(slug)) {
    visited.delete(slug);
  } else {
    visited.add(slug);
  }

  saveState();
  updateUrl();
  syncState();
}

const setVisited = (slugs) => {
  const allowed = new Set(features.map((feature) => slugify(countyName(feature))));
  visited = new Set(slugs.filter((slug) => allowed.has(slug)));
  saveState();
  updateUrl();
  syncState();
};

clearAllButton.addEventListener("click", () => setVisited([]));
markAllButton.addEventListener("click", () =>
  setVisited(features.map((feature) => slugify(countyName(feature))))
);
copyLinkButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(buildShareUrl());
  copyLinkButton.textContent = "Copied";
  window.setTimeout(() => {
    copyLinkButton.textContent = "Copy link";
  }, 1200);
});

fetch("./data/counties.geojson")
  .then((response) => response.json())
  .then((geojson) => {
    features = geojson.features.filter(isCounty);
    const urlState = readUrlState();
    visited = new Set(urlState || readSavedState());
    renderMap();
    renderList();
    setVisited([...visited]);
  })
  .catch(() => {
    statusCopy.textContent = "The county map could not be loaded.";
  });
