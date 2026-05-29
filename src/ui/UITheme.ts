export const BASE_TEXT_SCALE = 1.3;

export const UITheme = {
  colors: {
    bgVoid: 'rgba(4, 8, 15, 0.95)',
    bgPanel: 'rgba(8, 22, 34, 0.88)',
    bgPanelSolid: '#081622',
    buttonBg: 'rgba(6, 16, 28, 0.98)',
    
    borderBright: '#5AA7FF',
    borderDim: '#17415A',
    
    textHighlight: '#B4D8FF', // Bright blue
    textNormal: '#EAF9FF', // Light icy white
    textDim: '#7B9BA8', // Muted blue-grey
    
    danger: '#FF003C', // Magenta/Red for destructive or boss elements
    dangerDim: '#660018',
    
    hoverBg: 'rgba(0, 212, 255, 0.18)',
    hoverText: '#FFFFFF',
    
    scrollBar: '#5AA7FF',
    scrollBg: 'rgba(5, 16, 20, 0.85)',
  },
  
  fonts: {
    primary: 'Consolas, monospace',
    titleSize: 38,
    headerSize: 22,
    normalSize: Math.round(17 * BASE_TEXT_SCALE),
    smallSize: Math.round(14 * BASE_TEXT_SCALE),
  },
  
  shapes: {
    cornerRadius: 2,
    borderThickness: 1,
    borderThicknessThick: 2,
  },

  glitch: {
    // Screen tear bar colors (semi-transparent)
    tearColor1: 'rgba(0, 240, 255, 0.85)',    // cyan — main tear
    tearColor2: 'rgba(204, 0, 255, 0.70)',    // magenta — secondary tear
    // Ambient flicker alpha (applied as a sin wave, this is the max amplitude)
    ambientAlpha: 0.035,
    // Chromatic aberration shift in pixels
    chromaticShift: 4,
  },
};

