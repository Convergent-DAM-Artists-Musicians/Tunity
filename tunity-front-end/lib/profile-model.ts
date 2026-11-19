export const instruments = [
  "Trumpet",
  "Trombone",
  "French horn",
  "Tuba",
  "Flute",
  "Clarinet",
  "Saxophone",
  "Violin",
  "Voice",
  "Other",
] as const;
export const levels = [
  "Just starting",
  "Finding my rhythm",
  "Building confidence",
  "Experienced player",
] as const;
export type Profile = {
  preferredName: string;
  instrument: string;
  experience: string;
  goal: string;
  dailyMinutes: number;
};
export const emptyProfile: Profile = {
  preferredName: "",
  instrument: "Trumpet",
  experience: "Finding my rhythm",
  goal: "",
  dailyMinutes: 20,
};

/** Only editable preferences are stored; identity always comes from Firebase Auth. */
export function validateProfile(value: unknown): Profile {
  if (!value || typeof value !== "object")
    throw new Error("Please complete your practice preferences.");
  const p = value as Record<string, unknown>;
  if (
    typeof p.preferredName !== "string" ||
    p.preferredName.trim().length > 60 ||
    typeof p.instrument !== "string" ||
    !instruments.some((i) => i === p.instrument) ||
    typeof p.experience !== "string" ||
    !levels.some((l) => l === p.experience) ||
    typeof p.goal !== "string" ||
    p.goal.trim().length > 300 ||
    typeof p.dailyMinutes !== "number" ||
    !Number.isInteger(p.dailyMinutes) ||
    p.dailyMinutes < 5 ||
    p.dailyMinutes > 120
  ) {
    throw new Error(
      "Check your details. Use a name under 60 characters, a goal under 300 characters, and 5–120 daily minutes.",
    );
  }
  return {
    preferredName: p.preferredName.trim(),
    instrument: p.instrument,
    experience: p.experience,
    goal: p.goal.trim(),
    dailyMinutes: p.dailyMinutes,
  };
}
