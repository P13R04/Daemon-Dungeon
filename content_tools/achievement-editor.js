import {
  sanitizeId,
  downloadJson,
  setStatus,
  pickDirectory,
  writeJsonFile,
  parseLooseValue,
} from "./common.js";

const el = {
  id: document.getElementById("id"),
  name: document.getElementById("name"),
  description: document.getElementById("description"),
  icon: document.getElementById("icon"),
  type: document.getElementById("type"),
  target: document.getElementById("target"),
  conditionLogic: document.getElementById("conditionLogic"),
  conditionsList: document.getElementById("conditionsList"),
  metaList: document.getElementById("metaList"),
  statusBox: document.getElementById("statusBox"),
  jsonPreview: document.getElementById("jsonPreview"),
  batchPreview: document.getElementById("batchPreview"),
  selectFolderBtn: document.getElementById("selectFolderBtn"),
  saveBtn: document.getElementById("saveBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  addBatchBtn: document.getElementById("addBatchBtn"),
  downloadAggregateBtn: document.getElementById("downloadAggregateBtn"),
  addConditionBtn: document.getElementById("addConditionBtn"),
  addMetaBtn: document.getElementById("addMetaBtn"),
};

let folderHandle = null;
const batch = new Map();

const CONDITION_TYPES = [
  "kill_count",
  "specific_enemy_kills",
  "damage_taken_max",
  "damage_dealt_min",
  "reach_room",
  "bonus_collected_count",
  "win_without_damage",
  "custom",
];

const OPERATORS = ["gte", "lte", "eq", "neq", "contains", "custom"];

function makeSelect(values, selected = "") {
  return `<select>${values
    .map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`)
    .join("")}</select>`;
}

function createConditionRow(condition) {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    ${makeSelect(CONDITION_TYPES, condition?.type || "kill_count")}
    ${makeSelect(OPERATORS, condition?.operator || "gte")}
    <input type="text" value="${condition?.value ?? "100"}" placeholder="value" />
    <button class="btn warn" type="button">Remove</button>
  `;

  row.querySelector("button").addEventListener("click", () => {
    row.remove();
    refreshPreview();
  });

  row.querySelectorAll("select, input").forEach((input) => {
    input.addEventListener("input", refreshPreview);
  });

  el.conditionsList.appendChild(row);
}

function createMetaRow(meta) {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <input type="text" value="${meta?.key ?? "roomScope"}" placeholder="field name" />
    <input type="text" value="${meta?.value ?? ""}" placeholder="field value" />
    <div></div>
    <button class="btn warn" type="button">Remove</button>
  `;

  row.querySelector("button").addEventListener("click", () => {
    row.remove();
    refreshPreview();
  });

  row.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", refreshPreview);
  });

  el.metaList.appendChild(row);
}

function readConditions() {
  const rows = Array.from(el.conditionsList.querySelectorAll(".item-row"));
  return rows.map((row) => {
    const [typeEl, opEl] = row.querySelectorAll("select");
    const valueEl = row.querySelector("input[type='text']");
    return {
      type: typeEl.value,
      operator: opEl.value,
      value: parseLooseValue(valueEl.value),
    };
  });
}

function readMetadata() {
  const rows = Array.from(el.metaList.querySelectorAll(".item-row"));
  const metadata = {};

  rows.forEach((row) => {
    const [keyEl, valueEl] = row.querySelectorAll("input");
    const key = keyEl.value.trim();
    if (!key) return;
    metadata[key] = parseLooseValue(valueEl.value);
  });

  return metadata;
}

function buildAchievementObject() {
  const id = sanitizeId(el.id.value || el.name.value, "achievement");
  el.id.value = id;

  return {
    id,
    name: el.name.value.trim() || id,
    description: el.description.value.trim() || "",
    icon: el.icon.value.trim(),
    type: el.type.value,
    target: Math.max(1, Number(el.target.value || 1)),
    conditionLogic: el.conditionLogic.value,
    conditions: readConditions(),
    metadata: readMetadata(),
  };
}

function toLegacyAggregate(entries) {
  const output = {};

  entries.forEach((entry) => {
    output[entry.id] = {
      name: entry.name,
      description: entry.description,
      type: entry.type,
      target: entry.target,
      icon: entry.icon,
      conditionLogic: entry.conditionLogic,
      conditions: entry.conditions,
    };
  });

  return output;
}

function refreshBatchPreview() {
  const values = Array.from(batch.values());
  const aggregate = toLegacyAggregate(values);
  el.batchPreview.value = JSON.stringify(
    {
      count: values.length,
      ids: values.map((v) => v.id),
      achievementsJsonCompatible: aggregate,
    },
    null,
    2
  );
}

function refreshPreview() {
  const achievement = buildAchievementObject();
  el.jsonPreview.value = JSON.stringify(achievement, null, 2);
}

async function selectFolder() {
  folderHandle = await pickDirectory(folderHandle, el.statusBox, "achievement");
}

async function saveCurrentAchievement() {
  const achievement = buildAchievementObject();
  if (!folderHandle) {
    folderHandle = await pickDirectory(folderHandle, el.statusBox, "achievement");
    if (!folderHandle) return;
  }

  await writeJsonFile(folderHandle, `${achievement.id}.json`, achievement, el.statusBox);
}

function downloadCurrentAchievement() {
  const achievement = buildAchievementObject();
  downloadJson(`${achievement.id}.json`, achievement);
  setStatus(el.statusBox, `Downloaded ${achievement.id}.json`, "ok");
}

function addCurrentToBatch() {
  const achievement = buildAchievementObject();
  batch.set(achievement.id, achievement);
  refreshBatchPreview();
  setStatus(el.statusBox, `Added ${achievement.id} to batch.`, "ok");
}

function downloadAggregate() {
  const entries = Array.from(batch.values());
  if (entries.length === 0) {
    setStatus(el.statusBox, "Batch is empty.", "error");
    return;
  }

  const aggregate = toLegacyAggregate(entries);
  downloadJson("achievements.json", aggregate);
  setStatus(el.statusBox, "Downloaded achievements.json aggregate.", "ok");
}

el.selectFolderBtn.addEventListener("click", selectFolder);
el.saveBtn.addEventListener("click", saveCurrentAchievement);
el.downloadBtn.addEventListener("click", downloadCurrentAchievement);
el.addBatchBtn.addEventListener("click", addCurrentToBatch);
el.downloadAggregateBtn.addEventListener("click", downloadAggregate);
el.addConditionBtn.addEventListener("click", () => {
  createConditionRow();
  refreshPreview();
});
el.addMetaBtn.addEventListener("click", () => {
  createMetaRow();
  refreshPreview();
});

[
  el.id,
  el.name,
  el.description,
  el.icon,
  el.type,
  el.target,
  el.conditionLogic,
].forEach((input) => {
  input.addEventListener("input", refreshPreview);
});

createConditionRow({ type: "kill_count", operator: "gte", value: 100 });
createConditionRow({ type: "reach_room", operator: "gte", value: 10 });
createMetaRow({ key: "season", value: "1" });
refreshPreview();
refreshBatchPreview();
