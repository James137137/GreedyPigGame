export const FACE_OPTIONS = {
  skin: [
    { id: "pink", label: "Pink", color: "#f4a1b4" },
    { id: "peach", label: "Peach", color: "#f2b593" },
    { id: "rose", label: "Rose", color: "#c77b91" },
    { id: "cocoa", label: "Cocoa", color: "#a87356" },
    { id: "slate", label: "Slate", color: "#8b91a6" },
  ],
  eyes: [
    { id: "brown", label: "Brown", color: "#764733" },
    { id: "blue", label: "Blue", color: "#4798cb" },
    { id: "green", label: "Green", color: "#4e9768" },
    { id: "hazel", label: "Hazel", color: "#b98a42" },
    { id: "violet", label: "Violet", color: "#9774bb" },
  ],
  hat: [
    { id: "none", label: "None" },
    { id: "cap", label: "Cap" },
    { id: "beanie", label: "Beanie" },
    { id: "bucket", label: "Bucket hat" },
    { id: "crown", label: "Crown" },
  ],
  scarf: [
    { id: "none", label: "None" },
    { id: "mint", label: "Mint", color: "#72c6a4" },
    { id: "violet", label: "Violet", color: "#9a80db" },
    { id: "coral", label: "Coral", color: "#e78878" },
    { id: "blue", label: "Blue", color: "#68a6cf" },
  ],
  jewelry: [
    { id: "none", label: "None" },
    { id: "gold-hoops", label: "Gold hoops" },
    { id: "silver-studs", label: "Silver studs" },
    { id: "nose-ring", label: "Nose ring" },
  ],
} as const;

type Feature = keyof typeof FACE_OPTIONS;
export type PigFace = { [K in Feature]: (typeof FACE_OPTIONS)[K][number]["id"] } & { freckles: boolean };

export const DEFAULT_FACE: PigFace = {
  skin: "pink", eyes: "brown", hat: "none", scarf: "none", jewelry: "none", freckles: false,
};

const features = Object.keys(FACE_OPTIONS) as Feature[];

export function isPigFace(value: unknown): value is PigFace {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const face = value as Record<string, unknown>;
  return Object.keys(face).length === features.length + 1
    && typeof face.freckles === "boolean"
    && features.every(feature => FACE_OPTIONS[feature].some(option => option.id === face[feature]));
}
