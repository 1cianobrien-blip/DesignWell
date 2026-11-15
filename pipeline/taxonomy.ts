// Controlled vocabularies shared by the pipeline and the public filters.
export const ENTRY_TYPES = ["case_study", "launch", "brand", "talk", "process", "post"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  case_study: "Case study",
  launch: "Launch",
  brand: "Brand",
  talk: "Talk",
  process: "Process",
  post: "Post",
};

export const TAGS = [
  "product design",
  "ux",
  "ui",
  "design systems",
  "brand identity",
  "logo",
  "typography",
  "illustration",
  "motion",
  "3d",
  "icons",
  "colour",
  "research",
  "accessibility",
  "prototyping",
  "design ops",
  "design engineering",
  "design leadership",
  "content design",
  "data visualisation",
  "mobile",
  "web",
  "marketing site",
  "onboarding",
  "ai",
  "hardware",
  "packaging",
  "spatial",
  "sound",
  "redesign",
] as const;
export type Tag = (typeof TAGS)[number];
