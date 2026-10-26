import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { patternToRegex, matchesAny } from "../src/github/patterns.js";

describe("patternToRegex", () => {
  it("converts glob '*' to match any suffix", () => {
    assert.ok(patternToRegex("pj-rehearse*").test("pj-rehearse-123"));
    assert.ok(patternToRegex("pj-rehearse*").test("pj-rehearse"));
    assert.ok(!patternToRegex("pj-rehearse*").test("other-ci"));
  });

  it("converts glob '?' to a single character", () => {
    assert.ok(patternToRegex("job-?").test("job-1"));
    assert.ok(!patternToRegex("job-?").test("job-12"));
    assert.ok(!patternToRegex("job-?").test("job-"));
  });

  it("escapes regex special characters", () => {
    assert.ok(patternToRegex("foo.bar").test("foo.bar"));
    assert.ok(!patternToRegex("foo.bar").test("fooxbar"));
    assert.ok(patternToRegex("a[b]c").test("a[b]c"));
  });

  it("is case-insensitive", () => {
    assert.ok(patternToRegex("PJ-REHEARSE*").test("pj-rehearse-1"));
    assert.ok(patternToRegex("*e2e*").test("Unit-E2E-Test"));
  });

  it("anchors the full string (no partial matches)", () => {
    assert.ok(patternToRegex("pj-rehearse").test("pj-rehearse"));
    assert.ok(!patternToRegex("pj-rehearse").test("x-pj-rehearse"));
    assert.ok(!patternToRegex("pj-rehearse").test("pj-rehearse-extra"));
  });
});

describe("matchesAny", () => {
  it("returns true if any pattern matches", () => {
    assert.ok(matchesAny("pj-rehearse-1", ["pj-rehearse*", "*e2e*"]));
    assert.ok(matchesAny("unit-e2e-test", ["pj-rehearse*", "*e2e*"]));
  });

  it("returns false when nothing matches", () => {
    assert.ok(!matchesAny("lint", ["pj-rehearse*", "*e2e*"]));
  });

  it("returns false for an empty pattern list", () => {
    assert.ok(!matchesAny("anything", []));
  });
});
