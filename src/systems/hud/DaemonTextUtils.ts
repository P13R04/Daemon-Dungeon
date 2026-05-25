export function stripAllSpecialMarkers(text: string): string {
  return text.replace(/\{pause:[^}]+\}|\{crash\}|\{glitch:[^}]+\}/g, '');
}

export type SpecialMarker = 
  | { type: 'pause'; duration: number; markerLength: number }
  | { type: 'crash'; markerLength: number }
  | { type: 'glitch'; length: number; markerLength: number };

export function getSpecialMarkerAtDisplayIndex(fullText: string, displayIndex: number): SpecialMarker | null {
  let displayCount = 0;
  let i = 0;

  while (i < fullText.length) {
    // Check for pause: {pause:1.5}
    const pauseMatch = fullText.substring(i).match(/^\{pause:([\d.]+)\}/);
    if (pauseMatch) {
      if (displayCount === displayIndex) {
        return {
          type: 'pause',
          duration: parseFloat(pauseMatch[1]),
          markerLength: pauseMatch[0].length,
        };
      }
      i += pauseMatch[0].length;
      continue;
    }

    // Check for crash: {crash}
    const crashMatch = fullText.substring(i).match(/^\{crash\}/);
    if (crashMatch) {
      if (displayCount === displayIndex) {
        return {
          type: 'crash',
          markerLength: crashMatch[0].length,
        };
      }
      i += crashMatch[0].length;
      continue;
    }

    // Check for glitch: {glitch:5}
    const glitchMatch = fullText.substring(i).match(/^\{glitch:(\d+)\}/);
    if (glitchMatch) {
      if (displayCount === displayIndex) {
        return {
          type: 'glitch',
          length: parseInt(glitchMatch[1], 10),
          markerLength: glitchMatch[0].length,
        };
      }
      i += glitchMatch[0].length;
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

/** @deprecated Use stripAllSpecialMarkers */
export function stripPauseMarkers(text: string): string {
  return stripAllSpecialMarkers(text);
}

/** @deprecated Use getSpecialMarkerAtDisplayIndex */
export function getPauseAtDisplayIndex(fullText: string, displayIndex: number): { duration: number; markerLength: number } | null {
  const marker = getSpecialMarkerAtDisplayIndex(fullText, displayIndex);
  if (marker && marker.type === 'pause') {
    return { duration: marker.duration, markerLength: marker.markerLength };
  }
  return null;
}
