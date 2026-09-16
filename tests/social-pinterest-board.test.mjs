import test from "node:test";
import assert from "node:assert/strict";
import { listPinterestBoards, selectPinterestBoard } from "../lib/social-pinterest-board.mjs";
import { dispatchSocialPost, socialGatewayStatus } from "../lib/social-gateway-complete.mjs";

test("un board unique est sélectionné automatiquement", () => {
  const selected = selectPinterestBoard([{ id: "b1", name: "Fiscalité" }]);
  assert.equal(selected.board_id, "b1");
  assert.equal(selected.source, "single_board");
});

test("un board Le Hibou Rusé est sélectionné par nom parmi plusieurs boards", () => {
  const selected = selectPinterestBoard([
    { id: "b1", name: "Archives" },
    { id: "b2", name: "Le Hibou Rusé" },
    { id: "b3", name: "Personnel" },
  ]);
  assert.equal(selected.board_id, "b2");
  assert.equal(selected.source, "name_match");
});

test("plusieurs boards ambigus restent explicitement non sélectionnés", () => {
  const selected = selectPinterestBoard([{ id: "b1", name: "A" }, { id: "b2", name: "B" }]);
  assert.equal(selected.board_id, "");
  assert.equal(selected.source, "ambiguous");
});

test("le listing Sandbox suit les bookmarks même si une première page est vide", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) return new Response(JSON.stringify({ items: [], bookmark: "next-page" }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ items: [{ id: "sandbox-board", name: "Le Hibou Rusé" }], bookmark: null }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await listPinterestBoards({ PINTEREST_ACCESS_TOKEN: "token", PINTEREST_SANDBOX: "true" }, fetchImpl);
  assert.equal(result.boards[0].id, "sandbox-board");
  assert.equal(calls.length, 2);
  assert.match(calls[0], /api-sandbox\.pinterest\.com\/v5\/boards/);
  assert.match(calls[0], /page_size=250/);
  assert.match(calls[1], /bookmark=next-page/);
});

test("le gateway annonce l'auto-discovery si le token existe mais board_id est absent", () => {
  const pinterest = socialGatewayStatus({ PINTEREST_ACCESS_TOKEN: "token", PINTEREST_SANDBOX: "true" }).find((item) => item.provider === "pinterest");
  assert.equal(pinterest.direct_configured, true);
  assert.equal(pinterest.mode, "direct");
  assert.ok(pinterest.constraints.includes("pinterest_board_auto_discovery_at_dispatch"));
});

test("le dry-run Pinterest n'effectue aucun listing de board", async () => {
  const previous = global.fetch;
  global.fetch = async () => { throw new Error("network should not be called during dry run"); };
  try {
    const result = await dispatchSocialPost({ provider: "pinterest", media_url: "https://cdn.example.com/card.png", caption: "Test", metadata: { media_type: "image" }, dry_run: true }, { PINTEREST_ACCESS_TOKEN: "token", PINTEREST_SANDBOX: "true" });
    assert.equal(result.dry_run, true);
    assert.equal(result.pinterest_board_resolution, "auto_discover_at_dispatch");
  } finally {
    global.fetch = previous;
  }
});
