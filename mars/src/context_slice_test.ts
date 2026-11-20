import { assertEquals } from "@std/assert";
import { CHARS_PER_TOKEN, sliceContext, TRUNCATION_MARKER } from "./context_slice.ts";

const chars = (tokens: number) => "x".repeat(tokens * CHARS_PER_TOKEN);

Deno.test("keeps whole blocks while they fit", () => {
  assertEquals(sliceContext({ maxTokens: 100, blocks: [chars(30), chars(30), chars(30)] }).length, 3);
});

Deno.test("cuts the first block that does not fit and drops the rest", () => {
  const out = sliceContext({ maxTokens: 150, blocks: [chars(60), chars(120), chars(10)] });
  assertEquals(out.length, 2);
  assertEquals(out[0], chars(60));
  assertEquals(out[1], chars(90) + TRUNCATION_MARKER);
});

Deno.test("does not keep a sliver smaller than the minimum", () => {
  const out = sliceContext({ maxTokens: 100, blocks: [chars(80), chars(80)] });
  assertEquals(out, [chars(80)]);
});

Deno.test("a zero or negative budget keeps nothing", () => {
  assertEquals(sliceContext({ maxTokens: 0, blocks: ["a"] }), []);
  assertEquals(sliceContext({ maxTokens: -5, blocks: ["a"] }), []);
  assertEquals(sliceContext({ maxTokens: 100, blocks: [] }), []);
});
