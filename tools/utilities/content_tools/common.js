const DIRECTORY_HINTS = {
  bonus: "src/data/items/entries",
  achievement: "src/data/achievements/entries",
};

export function sanitizeId(value, prefix) {
  const normalized = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s_-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_");

  if (!normalized) return `${prefix}_custom`;
  return normalized.startsWith(`${prefix}_`) ? normalized : `${prefix}_${normalized}`;
}

export function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function setStatus(element, message, type = "idle") {
  if (!element) return;
  element.textContent = message;
  element.dataset.state = type;
}

export async function pickDirectory(currentHandle, statusElement, kind) {
  if (typeof window.showDirectoryPicker !== "function") {
    setStatus(statusElement, "Browser does not support direct folder writes.", "error");
    return null;
  }

  let handle = currentHandle;

  try {
    if (!handle) {
      handle = await window.showDirectoryPicker({ mode: "readwrite" });
    }

    if (!handle) return null;

    if (typeof handle.queryPermission === "function") {
      let permission = await handle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted" && typeof handle.requestPermission === "function") {
        permission = await handle.requestPermission({ mode: "readwrite" });
      }
      if (permission !== "granted") {
        setStatus(statusElement, "Write permission denied.", "error");
        return null;
      }
    }

    const expectedPath = DIRECTORY_HINTS[kind] || "project data folder";
    const isExpectedLeaf =
      (kind === "bonus" && handle.name === "entries") ||
      (kind === "achievement" && handle.name === "entries");

    if (!isExpectedLeaf) {
      const proceed = window.confirm(
        `Selected folder: '${handle.name}'. Continue?\nRecommended: ${expectedPath}`
      );
      if (!proceed) {
        setStatus(statusElement, "No folder selected.", "idle");
        return null;
      }
    }

    setStatus(statusElement, `Selected folder: ${handle.name}`, "ok");
    return handle;
  } catch (error) {
    if (error && error.name === "AbortError") return null;
    console.error(error);
    setStatus(statusElement, "Failed to select folder.", "error");
    return null;
  }
}

export async function writeJsonFile(handle, filename, payload, statusElement) {
  if (!handle) {
    setStatus(statusElement, "No folder selected.", "error");
    return false;
  }

  try {
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    setStatus(statusElement, `Saved ${filename}`, "ok");
    return true;
  } catch (error) {
    console.error(error);
    setStatus(statusElement, `Failed to save ${filename}`, "error");
    return false;
  }
}

export function parseLooseValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  if (raw === "true") return true;
  if (raw === "false") return false;

  const num = Number(raw);
  if (!Number.isNaN(num) && raw !== "") return num;

  if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  return raw;
}
