function clean(value) { return String(value ?? "").trim(); }
function flag(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = clean(value).toLowerCase();
  if (["1", "true", "yes", "oui", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "non", "off"].includes(normalized)) return false;
  return fallback;
}
function normalizeName(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const TARGET_NAMES = new Set(["le hibou ruse", "lehibouruse", "hibou ruse"]);

export function selectPinterestBoard(boards = [], preferredId = "") {
  const candidates = (Array.isArray(boards) ? boards : []).filter((item) => clean(item?.id));
  const configured = clean(preferredId);
  if (configured) {
    const match = candidates.find((item) => clean(item.id) === configured);
    return { board_id: configured, board: match || null, source: "configured" };
  }
  if (candidates.length === 1) return { board_id: clean(candidates[0].id), board: candidates[0], source: "single_board" };
  const named = candidates.filter((item) => TARGET_NAMES.has(normalizeName(item?.name)));
  if (named.length === 1) return { board_id: clean(named[0].id), board: named[0], source: "name_match" };
  return { board_id: "", board: null, source: candidates.length ? "ambiguous" : "none", candidates };
}

async function json(response, label) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.message || data?.error?.message || data?.error || response.statusText || "unknown";
    const error = new Error(`${label} ${response.status}: ${String(detail).slice(0, 500)}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function listPinterestBoards(env = process.env, fetchImpl = fetch, { maxPages = 10 } = {}) {
  const token = clean(env.PINTEREST_ACCESS_TOKEN);
  if (!token) throw new Error("Pinterest access token absent");
  const sandbox = flag(env.PINTEREST_SANDBOX, true);
  const base = sandbox ? "https://api-sandbox.pinterest.com/v5" : "https://api.pinterest.com/v5";
  const boards = [];
  let bookmark = "";
  const seen = new Set();
  for (let page = 0; page < Math.max(1, Math.min(20, Number(maxPages) || 10)); page += 1) {
    const url = new URL(`${base}/boards`);
    url.searchParams.set("page_size", "250");
    if (bookmark) url.searchParams.set("bookmark", bookmark);
    const data = await json(await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" }), "Pinterest boards");
    for (const item of Array.isArray(data?.items) ? data.items : []) {
      const id = clean(item?.id);
      if (id && !seen.has(id)) { seen.add(id); boards.push(item); }
    }
    const next = clean(data?.bookmark);
    if (!next || next === bookmark) break;
    bookmark = next;
  }
  return { boards, sandbox, exhausted: !bookmark };
}

export async function resolvePinterestBoard(env = process.env, fetchImpl = fetch) {
  const preferred = clean(env.PINTEREST_BOARD_ID);
  if (preferred) return { board_id: preferred, source: "configured", sandbox: flag(env.PINTEREST_SANDBOX, true) };
  const listed = await listPinterestBoards(env, fetchImpl);
  const selected = selectPinterestBoard(listed.boards, "");
  if (selected.board_id) return { ...selected, sandbox: listed.sandbox };
  const names = listed.boards.slice(0, 12).map((item) => `${clean(item.name) || "Sans nom"} (${clean(item.id)})`).join(", ");
  if (!listed.boards.length) {
    throw new Error(`Pinterest: aucun board détecté dans ${listed.sandbox ? "Sandbox/Trial" : "Production"}. Créer ou sélectionner un board puis renseigner social_pinterest_board_id.`);
  }
  throw new Error(`Pinterest: plusieurs boards possibles (${names}). Renseigner social_pinterest_board_id dans Airtable pour choisir explicitement le board cible.`);
}
