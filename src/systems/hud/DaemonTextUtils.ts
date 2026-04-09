export function stripPauseMarkers(text: string): string {
  return text.replace(/\{pause:[^}]+\}/g, '');
}

export function getPauseAtDisplayIndex(fullText: string, displayIndex: number): { duration: number; markerLength: number } | null {
  let displayCount = 0;
  let i = 0;

  while (i < fullText.length) {
    const match = fullText.substring(i).match(/^\{pause:([\d.]+)\}/);
    if (match) {
      if (displayCount === displayIndex) {
        return {
          duration: parseFloat(match[1]),
          markerLength: match[0].length,
        };
      }
      i += match[0].length;
      continue;
    }

    if (displayCount === displayIndex) {
      return null;
    }
    displayCount += 1;
    i += 1;
  }

  return null;
}
