/**
 * TileAdjacencyValidator - Référence complète de la nomenclature
 * Basé sur la nomenclature du dossier assets/tiles_test
 * 
 * Nomenclature:
 * - Sans chiffre: gauche (côté) ou haut-gauche (coin)
 * - "opposite": haut-gauche et bas-droite OU gauche et droite
 * - "reversed": coin opposé
 * - 2: haut-gauche et haut-droite
 * - 3: tout sauf bas-gauche (3 murs)
 * - 4: 4 côtés
 */

export interface AdjacencyPattern {
  n: boolean;
  s: boolean;
  e: boolean;
  w: boolean;
}

export class TileAdjacencyValidator {
  /**
   * Nomenclature complète avec explications détaillées
   */
  static TEXTURE_PATTERNS = {
    // CIRCUIT BORDERS - Bordures de circuit (adjacences aux murs/piliers)
    circuit_border: {
      side: {
        description: 'Un mur/pilier adjacent - Côté gauche/haut',
        patterns: [
          { n: true, s: false, e: false, w: false }, // Mur NORD
          { n: false, s: false, e: false, w: true },  // Mur OUEST
        ],
      },
      side_opposite: {
        description: 'Côté droit/bas (opposé du côté gauche)',
        patterns: [
          { n: false, s: true, e: false, w: false },  // Mur SUD
          { n: false, s: false, e: true, w: false },  // Mur EST
        ],
      },
      corner: {
        description: 'Coin haut-gauche (NORD + OUEST)',
        patterns: [
          { n: true, s: false, e: false, w: true }, // N + W
        ],
      },
      corner_reversed: {
        description: 'Coin haut-droite (NORD + EST)',
        patterns: [
          { n: true, s: false, e: true, w: false }, // N + E
        ],
      },
      corner_reversed_opposite: {
        description: 'Coin bas-droit (SUD + EST)',
        patterns: [
          { n: false, s: true, e: true, w: false }, // S + E
        ],
      },
      corner_opposite_reversed: {
        description: 'Coin bas-gauche (SUD + OUEST)',
        patterns: [
          { n: false, s: true, e: false, w: true }, // S + W
        ],
      },
      side_and_reversed: {
        description: 'Deux côtés opposés HAUT + BAS (NORD + SUD)',
        patterns: [
          { n: true, s: true, e: false, w: false }, // N + S
        ],
      },
      side_and_reversed2: {
        description: 'Deux côtés opposés GAUCHE + DROITE (OUEST + EST)',
        patterns: [
          { n: false, s: false, e: true, w: true }, // E + W
        ],
      },
      side_and_reversed_alt: {
        description: 'Variante auxiliaire pour configurations mixtes',
        patterns: [
          // Utilisé pour les cas de transition spéciaux
        ],
      },
      side3: {
        description: '3 murs (tout sauf le côté sud) - NORD + OUEST + EST',
        patterns: [
          { n: true, s: false, e: true, w: true }, // N + E + W
        ],
      },
      side4: {
        description: '4 murs (complètement entouré) - NORD + SUD + EST + OUEST',
        patterns: [
          { n: true, s: true, e: true, w: true }, // N + S + E + W
        ],
      },
    },

    // POISON TRANSITIONS
    poison_transition: {
      base: {
        description: 'Poison seul (pas d\'adjacence poison)',
        patterns: [
          { n: false, s: false, e: false, w: false }, // Aucun poison adjacent
        ],
      },
      side: {
        description: 'Un poison adjacent - Côté haut/gauche',
        patterns: [
          { n: true, s: false, e: false, w: false }, // Poison NORD
          { n: false, s: false, e: false, w: true },  // Poison OUEST
        ],
      },
      side_opposite: {
        description: 'Poison adjacent côté bas/droit',
        patterns: [
          { n: false, s: true, e: false, w: false },  // Poison SUD
          { n: false, s: false, e: true, w: false },  // Poison EST
        ],
      },
      corner: {
        description: 'Coin haut-gauche (NORD + OUEST avec poison)',
        patterns: [
          { n: true, s: false, e: false, w: true }, // PN + PW
        ],
      },
      corner_reversed: {
        description: 'Coin haut-droite (NORD + EST avec poison)',
        patterns: [
          { n: true, s: false, e: true, w: false }, // PN + PE
        ],
      },
      corner_reversed_opposite: {
        description: 'Coin bas-droit (SUD + EST avec poison)',
        patterns: [
          { n: false, s: true, e: true, w: false }, // PS + PE
        ],
      },
      side3: {
        description: '3 poisons adjacents',
        patterns: [
          { n: true, s: true, e: true, w: false },  // Tous sauf W
          { n: true, s: true, e: false, w: true },  // Tous sauf E
          { n: true, s: false, e: true, w: true },  // Tous sauf S
          { n: false, s: true, e: true, w: true },  // Tous sauf N
        ],
      },
    },

    // VOID TRANSITIONS
    vide_transition: {
      base: {
        description: 'Vide seul (pas d\'adjacence vide)',
        patterns: [
          { n: false, s: false, e: false, w: false }, // Aucun vide adjacent
        ],
      },
      side: {
        description: 'Un vide adjacent - Côté haut/gauche',
        patterns: [
          { n: true, s: false, e: false, w: false }, // Vide NORD
          { n: false, s: false, e: false, w: true },  // Vide OUEST
        ],
      },
      side_opposite: {
        description: 'Vide adjacent côté bas/droit',
        patterns: [
          { n: false, s: true, e: false, w: false },  // Vide SUD
          { n: false, s: false, e: true, w: false },  // Vide EST
        ],
      },
      corner: {
        description: 'Coin haut-gauche (NORD + OUEST avec vide)',
        patterns: [
          { n: true, s: false, e: false, w: true }, // VN + VW
        ],
      },
      corner_reversed: {
        description: 'Coin haut-droite (NORD + EST avec vide)',
        patterns: [
          { n: true, s: false, e: true, w: false }, // VN + VE
        ],
      },
      corner_reversed_opposite: {
        description: 'Coin bas-droit (SUD + EST avec vide)',
        patterns: [
          { n: false, s: true, e: true, w: false }, // VS + VE
        ],
      },
      side3: {
        description: '3 vides adjacents',
        patterns: [
          { n: true, s: true, e: true, w: false },  // Tous sauf W
          { n: true, s: true, e: false, w: true },  // Tous sauf E
          { n: true, s: false, e: true, w: true },  // Tous sauf S
          { n: false, s: true, e: true, w: true },  // Tous sauf N
        ],
      },
    },
  };

  /**
   * Déterminer quelle texture utiliser en fonction des adjacences
   * Retourne le nom du fichier sans l'extension
   */
  static getTextureForAdjacency(
    type: 'circuit_border' | 'poison_transition' | 'vide_transition',
    pattern: AdjacencyPattern
  ): string {
    const { n, s, e, w } = pattern;
    const count = [n, s, e, w].filter(x => x).length;

    if (type === 'circuit_border') {
      if (count === 0) return 'floor_base';
      if (count === 1) {
        if (n || w) return 'circuit_border_side';
        if (s || e) return 'circuit_border_side_opposite';
      }
      if (count === 2) {
        if (n && e) return 'circuit_border_corner_reversed';
        if (n && w) return 'circuit_border_corner';
        if (s && e) return 'circuit_border_corner_reversed_opposite';
        if (s && w) return 'circuit_border_corner_opposite_reversed';
        if ((n && s) || (e && w)) {
          return n && s ? 'circuit_border_side_and_reversed' : 'circuit_border_side_and_reversed2';
        }
      }
      if (count === 3) {
        if (!s) return 'circuit_border_side3'; // Tout sauf sud
        return 'circuit_border_side_and_reversed_alt'; // Fallback
      }
      if (count === 4) return 'circuit_border_side4';
    }

    if (type === 'poison_transition') {
      if (count === 0) return 'poison_base';
      if (count === 1) {
        if (n || w) return 'poison_transition_side';
        if (s || e) return 'poison_transition_side_opposite';
      }
      if (count === 2) {
        if (n && e) return 'poison_transition_corner_reversed';
        if (n && w) return 'poison_transition_corner';
        if (s && e) return 'poison_transition_corner_reversed_opposite';
        if (s && w) return 'poison_transition_corner';
      }
      if (count === 3) return 'poison_transition_side3';
    }

    if (type === 'vide_transition') {
      if (count === 0) return 'vide_base';
      if (count === 1) {
        if (n || w) return 'vide_transition_side';
        if (s || e) return 'vide_transition_side_opposite';
      }
      if (count === 2) {
        if (n && e) return 'vide_transition_corner_reversed';
        if (n && w) return 'vide_transition_corner';
        if (s && e) return 'vide_transition_corner_reversed_opposite';
        if (s && w) return 'vide_transition_corner';
      }
      if (count === 3) return 'vide_transition_side3';
    }

    return 'floor_base'; // Fallback
  }

  /**
   * Générer un rapport de validation pour une tile donnée
   */
  static validateTile(
    tileType: string,
    adjacencies: AdjacencyPattern
  ): {
    isValid: boolean;
    count: number;
    description: string;
    suggestedTexture: string;
  } {
    const count = [adjacencies.n, adjacencies.s, adjacencies.e, adjacencies.w].filter(x => x).length;
    let type: 'circuit_border' | 'poison_transition' | 'vide_transition' = 'circuit_border';

    if (tileType.includes('poison')) type = 'poison_transition';
    if (tileType.includes('vide') || tileType.includes('void')) type = 'vide_transition';

    const suggestedTexture = this.getTextureForAdjacency(type, adjacencies);

    // Générer description
    const dirs = [];
    if (adjacencies.n) dirs.push('N');
    if (adjacencies.s) dirs.push('S');
    if (adjacencies.e) dirs.push('E');
    if (adjacencies.w) dirs.push('W');

    const description = `${count} adjacenc${count > 1 ? 'ies' : 'y'} (${dirs.join(', ') || 'none'})`;

    return {
      isValid: true,
      count,
      description,
      suggestedTexture,
    };
  }
}
