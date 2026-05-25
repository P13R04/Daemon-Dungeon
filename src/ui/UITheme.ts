export const UITheme = {
  colors: {
    bgVoid: 'rgba(4, 8, 15, 0.95)',
    bgPanel: 'rgba(10, 24, 34, 0.85)',
    bgPanelSolid: '#0A1822',
    
    borderBright: '#00F0FF',
    borderDim: '#1A4B5C',
    
    textHighlight: '#39FF14', // Matrix green
    textNormal: '#CFFCF3', // Light cyan
    textDim: '#5B8A88', // Muted text
    
    danger: '#FF003C', // Magenta/Red for destructive or boss elements
    dangerDim: '#660018',
    
    hoverBg: 'rgba(0, 240, 255, 0.15)',
    hoverText: '#FFFFFF',
    
    scrollBar: '#00D4FF',
    scrollBg: 'rgba(5, 16, 20, 0.85)',
  },
  
  fonts: {
    primary: 'Consolas, monospace',
    titleSize: 38,
    headerSize: 22,
    normalSize: 17,
    smallSize: 14,
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

