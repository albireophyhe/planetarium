const BSC_GREEK_LETTERS = Object.freeze({
  Alp: "α",
  Bet: "β",
  Gam: "γ",
  Del: "δ",
  Eps: "ε",
  Zet: "ζ",
  Eta: "η",
  The: "θ",
  Iot: "ι",
  Kap: "κ",
  Lam: "λ",
  Mu: "μ",
  Nu: "ν",
  Xi: "ξ",
  Omi: "ο",
  Pi: "π",
  Rho: "ρ",
  Sig: "σ",
  Tau: "τ",
  Ups: "υ",
  Phi: "φ",
  Chi: "χ",
  Psi: "ψ",
  Ome: "ω",
} as const);

const BSC_DESIGNATION_PATTERN =
  /^([1-9]\d{0,2})(Alp|Bet|Gam|Del|Eps|Zet|Eta|The|Iot|Kap|Lam|Mu|Nu|Xi|Omi|Pi|Rho|Sig|Tau|Ups|Phi|Chi|Psi|Ome)([1-9]?)[ ]*([A-Z][a-z]{2})$/;

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> =
  Object.freeze({
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
  });

/**
 * Formats the fixed-width BSC5P Name field for presentation only.
 *
 * The source label, catalogue identifiers, and event hashes remain untouched.
 * Proper names that do not match the BSC designation grammar pass through.
 */
export function formatOccultationTargetLabel(
  bscLabel: string,
  localizedLabel: string | null,
): string {
  if (localizedLabel !== null) {
    return localizedLabel;
  }
  const match = BSC_DESIGNATION_PATTERN.exec(bscLabel);
  if (!match) {
    return bscLabel;
  }
  const [, flamsteedNumber, greekCode, component, constellation] =
    match;
  if (
    flamsteedNumber === undefined ||
    greekCode === undefined ||
    component === undefined ||
    constellation === undefined
  ) {
    return bscLabel;
  }
  const greekLetter =
    BSC_GREEK_LETTERS[
      greekCode as keyof typeof BSC_GREEK_LETTERS
    ];
  const componentSuffix =
    component.length === 0
      ? ""
      : SUPERSCRIPT_DIGITS[component];
  if (!greekLetter || componentSuffix === undefined) {
    return bscLabel;
  }
  return `${flamsteedNumber} ${greekLetter}${componentSuffix} ${constellation}`;
}
