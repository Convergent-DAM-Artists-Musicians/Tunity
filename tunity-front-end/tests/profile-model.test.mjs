import test from "node:test";
import assert from "node:assert/strict";
import { emptyProfile, validateProfile } from "../lib/profile-model.ts";

test("normalizes editable fields and discards identity or privilege fields", () => {
  const result = validateProfile({
    ...emptyProfile,
    preferredName: "  Alex  ",
    goal: "  A warmer tone  ",
    uid: "someone-else",
    admin: true,
  });
  assert.equal(result.preferredName, "Alex");
  assert.equal(result.goal, "A warmer tone");
  assert.equal("uid" in result, false);
  assert.equal("admin" in result, false);
});
test("accepts empty optional text and both practice-minute boundaries", () => {
  assert.equal(
    validateProfile({ ...emptyProfile, dailyMinutes: 5 }).dailyMinutes,
    5,
  );
  assert.equal(
    validateProfile({ ...emptyProfile, dailyMinutes: 120 }).dailyMinutes,
    120,
  );
});
test("rejects out-of-range, fractional, nonnumeric, or missing daily minutes", () => {
  for (const dailyMinutes of [
    0,
    4,
    121,
    -1,
    20.5,
    NaN,
    Infinity,
    "20",
    undefined,
  ]) {
    assert.throws(() => validateProfile({ ...emptyProfile, dailyMinutes }));
  }
});
test("rejects unsupported instruments and experience levels", () => {
  assert.throws(() =>
    validateProfile({ ...emptyProfile, instrument: "unlisted" }),
  );
  assert.throws(() =>
    validateProfile({ ...emptyProfile, experience: "unlisted" }),
  );
});
test("rejects malformed saved records and oversized text", () => {
  for (const value of [
    null,
    false,
    {},
    { ...emptyProfile, goal: "x".repeat(301) },
    { ...emptyProfile, preferredName: "x".repeat(61) },
  ]) {
    assert.throws(() => validateProfile(value));
  }
});
