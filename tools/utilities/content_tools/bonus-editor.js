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
  classRestriction: document.getElementById("classRestriction"),
  rarity: document.getElementById("rarity"),
  visual: document.getElementById("visual"),
  bonusType: document.getElementById("bonusType"),
  stackable: document.getElementById("stackable"),
  effectStat: document.getElementById("effectStat"),
  valueType: document.getElementById("valueType"),
  effectValue: document.getElementById("effectValue"),
  procChance: document.getElementById("procChance"),
  cooldownSeconds: document.getElementById("cooldownSeconds"),
  conditionLogic: document.getElementById("conditionLogic"),
  conditionsList: document.getElementById("conditionsList"),
  extraList: document.getElementById("extraList"),
  statusBox: document.getElementById("statusBox"),
  jsonPreview: document.getElementById("jsonPreview"),
  batchPreview: document.getElementById("batchPreview"),
  selectFolderBtn: document.getElementById("selectFolderBtn"),
  saveBtn: document.getElementById("saveBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  addBatchBtn: document.getElementById("addBatchBtn"),
  downloadAggregateBtn: document.getElementById("downloadAggregateBtn"),
  addConditionBtn: document.getElementById("addConditionBtn"),
  addExtraBtn: document.getElementById("addExtraBtn"),
};

let folderHandle = null;
const batch = new Map();

const CONDITION_TYPES = [
  "kill_count",
  "damage_taken_max",
  "damage_dealt_min",
  "specific_enemy_kills",
  "reach_room",
  "class_is",
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
    <input type="text" value="${condition?.value ?? "10"}" placeholder="value" />
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

function createExtraRow(extra) {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <input type="text" value="${extra?.key ?? "newField"}" placeholder="field name" />
    <input type="text" value="${extra?.value ?? ""}" placeholder="field value" />
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

  el.extraList.appendChild(row);
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

function readExtraFields() {
  const rows = Array.from(el.extraList.querySelectorAll(".item-row"));
  const extra = {};

  rows.forEach((row) => {
    const [keyEl, valueEl] = row.querySelectorAll("input");
    const key = keyEl.value.trim();
    if (!key) return;
    extra[key] = parseLooseValue(valueEl.value);
  });

  return extra;
}

function buildBonusObject() {
  const id = sanitizeId(el.id.value || el.name.value, "bonus");
  el.id.value = id;

  const effect = {
    stat: el.effectStat.value.trim() || "damage",
    value: Number(el.effectValue.value || 0),
    type: el.valueType.value,
    procChance: Number(el.procChance.value || 0),
    cooldownSeconds: Number(el.cooldownSeconds.value || 0),
    conditionLogic: el.conditionLogic.value,
    conditions: readConditions(),
    extra: readExtraFields(),
  };

  return {
    id,
    name: el.name.value.trim() || id,
    description: el.description.value.trim() || "",
    classRestriction: el.classRestriction.value,
    rarity: el.rarity.value,
    visual: el.visual.value.trim(),
    type: el.bonusType.value,
    stackable: !!el.stackable.checked,
    effect,
  };
}

function toLegacyAggregate(entries) {
  const output = {};

  entries.forEach((entry) => {
    output[entry.id] = {
      name: entry.name,
      description: entry.description,
      type: entry.type,
      stackable: entry.stackable,
      effect: {
        ...entry.effect,
      },
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
      itemsJsonCompatible: aggregate,
    },
    null,
    2
  );
}

function refreshPreview() {
  const bonus = buildBonusObject();
  el.jsonPreview.value = JSON.stringify(bonus, null, 2);
}

async function selectFolder() {
  folderHandle = await pickDirectory(folderHandle, el.statusBox, "bonus");
}

async function saveCurrentBonus() {
  const bonus = buildBonusObject();
  if (!folderHandle) {
    folderHandle = await pickDirectory(folderHandle, el.statusBox, "bonus");
    if (!folderHandle) return;
  }

  await writeJsonFile(folderHandle, `${bonus.id}.json`, bonus, el.statusBox);
}

function downloadCurrentBonus() {
  const bonus = buildBonusObject();
  downloadJson(`${bonus.id}.json`, bonus);
  setStatus(el.statusBox, `Downloaded ${bonus.id}.json`, "ok");
}

function addCurrentToBatch() {
  const bonus = buildBonusObject();
  batch.set(bonus.id, bonus);
  refreshBatchPreview();
  setStatus(el.statusBox, `Added ${bonus.id} to batch.`, "ok");
}

function downloadAggregate() {
  const entries = Array.from(batch.values());
  if (entries.length === 0) {
    setStatus(el.statusBox, "Batch is empty.", "error");
    return;
  }

  const aggregate = toLegacyAggregate(entries);
  downloadJson("items.json", aggregate);
  setStatus(el.statusBox, "Downloaded items.json aggregate.", "ok");
}

el.selectFolderBtn.addEventListener("click", selectFolder);
el.saveBtn.addEventListener("click", saveCurrentBonus);
el.downloadBtn.addEventListener("click", downloadCurrentBonus);
el.addBatchBtn.addEventListener("click", addCurrentToBatch);
el.downloadAggregateBtn.addEventListener("click", downloadAggregate);
el.addConditionBtn.addEventListener("click", () => {
  createConditionRow();
  refreshPreview();
});
el.addExtraBtn.addEventListener("click", () => {
  createExtraRow();
  refreshPreview();
});

[
  el.id,
  el.name,
  el.description,
  el.classRestriction,
  el.rarity,
  el.visual,
  el.bonusType,
  el.stackable,
  el.effectStat,
  el.valueType,
  el.effectValue,
  el.procChance,
  el.cooldownSeconds,
  el.conditionLogic,
].forEach((input) => {
  input.addEventListener("input", refreshPreview);
});

createConditionRow({ type: "kill_count", operator: "gte", value: 10 });
createExtraRow({ key: "tags", value: "[\"starter\", \"damage\"]" });
refreshPreview();
refreshBatchPreview();
