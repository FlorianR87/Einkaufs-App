const STORAGE_KEY = "shopping-list-state-v1";
const DAY_MS = 24 * 60 * 60 * 1000;

const defaultItems = [
  { id: "milk", name: "Milch", emoji: "🥛" },
  { id: "toilet_paper", name: "Toilettenpapier", emoji: "🧻" },
  { id: "paprika", name: "Paprika", emoji: "🫑" },
  { id: "cheese", name: "Käse", emoji: "🧀" },
  { id: "bread", name: "Brot", emoji: "🍞" },
  { id: "eggs", name: "Eier", emoji: "🥚" },
  { id: "apples", name: "Äpfel", emoji: "🍎" },
  { id: "pasta", name: "Nudeln", emoji: "🍝" },
  { id: "coffee", name: "Kaffee", emoji: "☕" },
  { id: "water", name: "Wasser", emoji: "💧" },
  { id: "yogurt", name: "Joghurt", emoji: "🥣" },
  { id: "bananas", name: "Bananen", emoji: "🍌" },
];

const catalogList = document.getElementById("catalogList");
const activeList = document.getElementById("activeList");
const activeCount = document.getElementById("activeCount");
const catalogCount = document.getElementById("catalogCount");
const topItems = document.getElementById("topItems");
const predictions = document.getElementById("predictions");
const itemTemplate = document.getElementById("itemTemplate");

const itemMap = Object.fromEntries(defaultItems.map((item) => [item.id, item]));

const state = loadState();

render();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const fallback = {
    activeItemIds: [],
    purchaseHistory: {},
  };

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      activeItemIds: Array.isArray(parsed.activeItemIds)
        ? parsed.activeItemIds.filter((id) => itemMap[id])
        : [],
      purchaseHistory: parsed.purchaseHistory && typeof parsed.purchaseHistory === "object"
        ? sanitizePurchaseHistory(parsed.purchaseHistory)
        : {},
    };
  } catch {
    return fallback;
  }
}

function sanitizePurchaseHistory(history) {
  const sanitized = {};
  Object.entries(history).forEach(([itemId, timestamps]) => {
    if (!itemMap[itemId] || !Array.isArray(timestamps)) {
      return;
    }
    sanitized[itemId] = timestamps
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)
      .slice(-20);
  });
  return sanitized;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function addToActive(itemId) {
  if (!state.activeItemIds.includes(itemId)) {
    state.activeItemIds.unshift(itemId);
    persist();
    render();
  }
}

function markAsBought(itemId) {
  state.activeItemIds = state.activeItemIds.filter((id) => id !== itemId);
  const now = Date.now();
  const itemHistory = state.purchaseHistory[itemId] ?? [];
  itemHistory.push(now);
  state.purchaseHistory[itemId] = itemHistory.slice(-20);
  persist();
  render();
}

function createTile(item, onClick, title) {
  const tile = itemTemplate.content.firstElementChild.cloneNode(true);
  tile.querySelector(".emoji").textContent = item.emoji;
  tile.querySelector(".label").textContent = item.name;
  tile.title = title;
  tile.addEventListener("click", () => onClick(item.id));
  return tile;
}

function render() {
  renderActiveItems();
  renderCatalogItems();
  renderInsights();
}

function renderActiveItems() {
  activeList.textContent = "";

  if (!state.activeItemIds.length) {
    activeList.append(createEmptyMessage("Noch nichts auf der Liste."));
  } else {
    state.activeItemIds.forEach((itemId) => {
      const item = itemMap[itemId];
      if (!item) {
        return;
      }
      activeList.append(
        createTile(
          item,
          markAsBought,
          `${item.name} als eingekauft markieren`
        )
      );
    });
  }

  activeCount.textContent = String(state.activeItemIds.length);
}

function renderCatalogItems() {
  catalogList.textContent = "";
  const activeSet = new Set(state.activeItemIds);
  const availableItems = defaultItems.filter((item) => !activeSet.has(item.id));

  availableItems.forEach((item) => {
    catalogList.append(
      createTile(item, addToActive, `${item.name} zur Liste hinzufügen`)
    );
  });

  catalogCount.textContent = String(availableItems.length);
}

function renderInsights() {
  const frequency = Object.entries(state.purchaseHistory)
    .map(([itemId, timestamps]) => ({
      itemId,
      count: timestamps.length,
    }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  if (!frequency.length) {
    topItems.textContent = "Noch keine Einkäufe erfasst.";
  } else {
    const summary = frequency
      .map(({ itemId, count }) => `${itemMap[itemId].emoji} ${itemMap[itemId].name} (${count}x)`)
      .join(" • ");
    topItems.textContent = `Am häufigsten gekauft: ${summary}`;
  }

  predictions.textContent = "";

  const predictionItems = Object.entries(state.purchaseHistory)
    .map(([itemId, timestamps]) => ({
      itemId,
      nextDueInDays: predictNextDueDays(timestamps),
    }))
    .filter(({ nextDueInDays }) => Number.isFinite(nextDueInDays))
    .sort((a, b) => a.nextDueInDays - b.nextDueInDays)
    .slice(0, 4);

  if (!predictionItems.length) {
    predictions.append(createPrediction("Sobald du häufiger etwas kaufst, erscheinen hier Vorschläge."));
    return;
  }

  predictionItems.forEach(({ itemId, nextDueInDays }) => {
    const item = itemMap[itemId];
    predictions.append(
      createPrediction(
        `${item.emoji} ${item.name}: vermutlich in ${formatDays(nextDueInDays)} wieder nötig.`
      )
    );
  });
}

function predictNextDueDays(timestamps) {
  if (!timestamps || timestamps.length < 2) {
    return Number.NaN;
  }

  const sorted = [...timestamps].sort((a, b) => a - b);
  const intervals = [];

  for (let i = 1; i < sorted.length; i += 1) {
    intervals.push(sorted[i] - sorted[i - 1]);
  }

  const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  const lastPurchase = sorted[sorted.length - 1];
  const dueAt = lastPurchase + averageInterval;
  const remaining = (dueAt - Date.now()) / DAY_MS;

  return Math.max(0, Math.round(remaining));
}

function formatDays(days) {
  if (days <= 0) {
    return "0 Tagen (jetzt)";
  }
  if (days === 1) {
    return "1 Tag";
  }
  return `${days} Tagen`;
}

function createPrediction(text) {
  const li = document.createElement("li");
  li.textContent = text;
  return li;
}

function createEmptyMessage(text) {
  const div = document.createElement("div");
  div.className = "empty-message";
  div.textContent = text;
  return div;
}
