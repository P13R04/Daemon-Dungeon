import legacyAchievements from "./achievements.json";

type AchievementLike = {
  id?: string;
  name?: string;
  description?: string;
  type?: string;
  target?: number;
  [key: string]: unknown;
};

type AchievementRecord = Record<string, AchievementLike>;

const entryModules = import.meta.glob("./entries/*.json", { eager: true }) as Record<string, unknown>;

function normalizeDefinition(input: AchievementLike): AchievementLike {
  return {
    name: input?.name ?? "Unnamed achievement",
    description: input?.description ?? "",
    type: input?.type === "incremental" ? "incremental" : "oneTime",
    target: Number.isFinite(input?.target) ? Number(input.target) : 1,
    icon: input?.icon,
    conditionLogic: input?.conditionLogic,
    conditions: input?.conditions,
  };
}

export function getMergedAchievementDefinitions(): AchievementRecord {
  const merged: AchievementRecord = {};

  if (legacyAchievements && typeof legacyAchievements === "object" && !Array.isArray(legacyAchievements)) {
    const legacyRecord = legacyAchievements as AchievementRecord;
    Object.entries(legacyRecord).forEach(([id, value]) => {
      merged[id] = normalizeDefinition(value);
    });
  }

  Object.values(entryModules).forEach((moduleValue) => {
    const entry = (moduleValue as any)?.default ?? moduleValue;
    if (!entry || typeof entry !== "object") return;

    const achievementEntry = entry as AchievementLike;
    const id = typeof achievementEntry.id === "string" ? achievementEntry.id : "";
    if (!id) return;

    merged[id] = normalizeDefinition(achievementEntry);
  });

  return merged;
}
