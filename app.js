const STORAGE_KEY = "shopping-smart-v1";

const defaultItems = [
  { id: "milk", name: "Milch", icon: "🥛" },
  { id: "toilet-paper", name: "Toilettenpapier", icon: "🧻" },
  { id: "pepper", name: "Paprika", icon: "🫑" },
  { id: "cheese", name: "Käse", icon: "🧀" },
  { id: "bread", name: "Brot", icon: "🍞" },
  { id: "apples", name: "Äpfel", icon: "🍎" },
  { id: "eggs", name: "Eier", icon: "🥚" },
  { id: "pasta", name: "Nudeln", icon: "🍝" },
  { id: "coffee", name: "Kaffee", icon: "☕" },
  { id: "water", name: "Wasser", icon: "💧" },
  { id: "yogurt", name: "Joghurt", icon: "🥣" },
  { id: "rice", name: "Reis", icon: "🍚" },
];

const state = loadState();

const ui = {
  activeList: document.querySelector("#active-list"),
  catalog: document.querySelector("#catalog"),
  activeEmpty: document.querySelector("#active-empty"),
  activeCount: document.querySelector("#active-count"),
  mostFrequent: document.querySelector("#most-frequent"),
  nextNeeded: document.querySelector("#next-needed"),
};

render();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { active: [], history: {} };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      active: Array.isArray(parsed.active) ? parsed.active : [],
      history: typeof parsed.history === "object" && parsed.history ? parsed.history : {},
    };
  } catch {
    return { active: [], history: {} };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getItemById(id) {
  return defaultItems.find((item) => item.id === id);
}

function toggleItem(itemId) {
  const index = state.active.indexOf(itemId);

  if (index === -1) {
    state.active.unshift(itemId);
  } else {
    state.active.splice(index, 1);
    addPurchaseHistory(itemId);
  }

  saveState();
  render();
}

function addPurchaseHistory(itemId) {
  if (!state.history[itemId]) {
    state.history[itemId] = [];
  }

  state.history[itemId].push(new Date().toISOString());

  if (state.history[itemId].length > 30) {
    state.history[itemId] = state.history[itemId].slice(-30);
  }
}

function itemTile(item, active = false) {
  const button = document.createElement("button");
  button.className = "item-tile";
  button.type = "button";
  button.title = active
    ? `${item.name} als eingekauft markieren`
    : `${item.name} zur Liste hinzufügen`;

  button.innerHTML = `
    <span class="icon" aria-hidden="true">${item.icon}</span>
    <span class="label">${item.name}</span>
  `;

  button.addEventListener("click", () => toggleItem(item.id));
  return button;
}

function render() {
  ui.activeList.innerHTML = "";
  ui.catalog.innerHTML = "";

  const activeSet = new Set(state.active);
  const activeItems = state.active.map(getItemById).filter(Boolean);

  activeItems.forEach((item) => ui.activeList.append(itemTile(item, true)));

  defaultItems
    .filter((item) => !activeSet.has(item.id))
    .forEach((item) => ui.catalog.append(itemTile(item)));

  ui.activeCount.textContent = String(activeItems.length);
  ui.activeEmpty.style.display = activeItems.length ? "none" : "block";

  renderInsights();
}

function renderInsights() {
  const entries = Object.entries(state.history).filter(([, purchases]) => purchases.length > 0);

  if (entries.length === 0) {
    ui.mostFrequent.textContent = "Noch keine Daten";
    ui.nextNeeded.textContent = "Noch keine Prognose möglich";
    return;
  }

  const [topItemId, topPurchases] = entries.reduce((best, current) =>
    current[1].length > best[1].length ? current : best
  );

  const topItem = getItemById(topItemId);
  ui.mostFrequent.textContent = `${topItem?.icon ?? "🛒"} ${topItem?.name ?? topItemId} (${topPurchases.length}×)`;

  const prediction = predictNextNeed(entries);
  if (!prediction) {
    ui.nextNeeded.textContent = "Zu wenig Daten für eine solide Prognose";
    return;
  }

  const dateText = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(prediction.when);

  ui.nextNeeded.textContent = `${prediction.item.icon} ${prediction.item.name} voraussichtlich am ${dateText}`;
}

function predictNextNeed(entries) {
  let best = null;

  entries.forEach(([itemId, purchases]) => {
    if (purchases.length < 2) {
      return;
    }

    const timestamps = purchases
      .map((iso) => new Date(iso).getTime())
      .filter((value) => !Number.isNaN(value))
      .sort((a, b) => a - b);

    if (timestamps.length < 2) {
      return;
    }

    const intervals = [];
    for (let i = 1; i < timestamps.length; i += 1) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    const avgInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    const nextTime = timestamps[timestamps.length - 1] + avgInterval;

    if (!best || nextTime < best.when.getTime()) {
      best = {
        item: getItemById(itemId) ?? { name: itemId, icon: "🛒" },
        when: new Date(nextTime),
      };
    }
  });

  return best;
}
