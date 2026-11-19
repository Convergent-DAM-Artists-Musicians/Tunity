export const TRIAL_DAYS = 30;
export const TRIAL_UPLOADS = 5;
export const TRIAL_MS = TRIAL_DAYS * 86400000;
export type BandAccount = {
  bandName: string; plan: "trial" | "demo"; uploadCount: number;
  trialStartedAt: number | null; noticeAcceptedAt: number | null;
  sheetUses: Record<string, number>;
};
export function accountStatus(a: BandAccount, now = Date.now()) {
  const endsAt = a.trialStartedAt === null ? null : a.trialStartedAt + TRIAL_MS;
  const expired = a.plan !== "demo" && endsAt !== null && now >= endsAt;
  return { endsAt, expired, daysLeft: endsAt === null ? TRIAL_DAYS : Math.max(0, Math.min(TRIAL_DAYS, Math.ceil((endsAt - now) / 86400000))),
    canUpload: !expired && (a.plan === "demo" || a.uploadCount < TRIAL_UPLOADS) };
}
export function requireUpload(a: BandAccount, now = Date.now()) {
  const status = accountStatus(a, now);
  if (status.expired) throw new Error("Your 30-day trial has ended. Upgrade to continue.");
  if (!status.canUpload) throw new Error("Your band has used its five trial uploads. Upgrade to upload more; deleting takes does not reset the allowance.");
}
export function readAccount(d: Record<string, unknown>): BandAccount {
  const millis = (v: unknown): number | null => {
    if (v === null) return null;
    const result = (v as { toMillis?: () => number })?.toMillis?.();
    if (!Number.isFinite(result)) throw new Error("Invalid account timestamp.");
    return result!;
  };
  if (typeof d.bandName !== "string" || !["trial", "demo"].includes(String(d.plan))
    || !Number.isSafeInteger(d.uploadCount) || Number(d.uploadCount) < 0
    || !d.sheetUses || typeof d.sheetUses !== "object") throw new Error("Invalid band account.");
  const uses = d.sheetUses as Record<string, number>;
  if (Object.values(uses).some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error("Invalid PDF references.");
  return { bandName: d.bandName, plan: d.plan as BandAccount["plan"], uploadCount: Number(d.uploadCount),
    trialStartedAt: millis(d.trialStartedAt), noticeAcceptedAt: millis(d.noticeAcceptedAt), sheetUses: uses };
}
