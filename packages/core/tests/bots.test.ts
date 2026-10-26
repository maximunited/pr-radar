import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseQodo,
  parseCodeRabbit,
  isIgnoredBot,
  isCodeRabbitBot,
} from "../src/github/bots.js";

const comment = (login: string | null, body: string) => ({ body, user: login ? { login } : null });

describe("parseQodo / parseCodeRabbit", () => {
  it("returns missing when there are no bot comments", () => {
    assert.deepStrictEqual(parseQodo([]), { state: "missing" });
    assert.deepStrictEqual(parseCodeRabbit([]), { state: "missing" });
  });

  it("detects a rate-limited bot", () => {
    assert.deepStrictEqual(
      parseQodo([comment("qodo-merge[bot]", "Rate limit exceeded, try again later")]),
      { state: "rate_limited" },
    );
    assert.deepStrictEqual(
      parseCodeRabbit([comment("coderabbitai[bot]", "quota exceeded")]),
      { state: "rate_limited" },
    );
  });

  it("detects a thinking bot (short body with a thinking keyword)", () => {
    assert.deepStrictEqual(
      parseQodo([comment("qodo-merge[bot]", "Generating review...")]),
      { state: "thinking" },
    );
    assert.deepStrictEqual(
      parseCodeRabbit([comment("coderabbitai[bot]", "Analyzing your PR")]),
      { state: "thinking" },
    );
  });

  it("treats a long body with a thinking keyword as real content (not thinking)", () => {
    const state = parseQodo([comment("qodo-merge[bot]", "Generating review..." + "x".repeat(500))]);
    assert.deepStrictEqual(state, { state: "clean" });
  });

  it("counts unchecked checkboxes as open action items", () => {
    assert.deepStrictEqual(
      parseQodo([comment("qodo-merge[bot]", "- [ ] fix this\n- [x] already done")]),
      { state: "open", count: 1 },
    );
  });

  it("reads CodeRabbit's 'Actionable comments posted: N' header", () => {
    assert.deepStrictEqual(
      parseCodeRabbit([comment("coderabbitai[bot]", "Actionable comments posted: 3")]),
      { state: "open", count: 3 },
    );
  });

  it("combines checkboxes and the CodeRabbit header count", () => {
    assert.deepStrictEqual(
      parseCodeRabbit([comment("coderabbitai[bot]", "- [ ] one\nActionable comments posted: 2")]),
      { state: "open", count: 3 },
    );
  });

  it("classifies by the latest comment when earlier ones had items", () => {
    assert.deepStrictEqual(
      parseQodo([
        comment("qodo-merge[bot]", "- [ ] old item"),
        comment("qodo-merge[bot]", "Generating review..."),
      ]),
      { state: "thinking" },
    );
  });
});

describe("isIgnoredBot / isCodeRabbitBot", () => {
  it("ignores known automation accounts", () => {
    assert.ok(isIgnoredBot("github-actions[bot]"));
    assert.ok(isIgnoredBot("dependabot[bot]"));
    assert.ok(isIgnoredBot("renovate[bot]"));
    assert.ok(isIgnoredBot("openshift-ci"));
    assert.ok(isIgnoredBot("openshift-merge-bot"));
    assert.ok(!isIgnoredBot("maximunited")); // human
    assert.ok(isIgnoredBot("qodo-merge[bot]")); // review bots are excluded from peer metrics
    assert.ok(isIgnoredBot("coderabbitai[bot]")); // review bots are excluded from peer metrics
  });

  it("detects CodeRabbit logins (incl. org-suffixed ones)", () => {
    assert.ok(isCodeRabbitBot("coderabbitai[bot]"));
    assert.ok(isCodeRabbitBot("coderabbit-2-for-medik8s[bot]"));
    assert.ok(!isCodeRabbitBot("qodo-merge[bot]"));
    assert.ok(!isCodeRabbitBot("maximunited"));
  });
});
