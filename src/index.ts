// witan-sdk — WITAN from anywhere fetch runs: Node.js 22+, Deno, Bun, Cloudflare Workers,
// Vercel and Netlify functions. No dependencies, no disk, no daemon. Responses are the
// API's JSON with the field names the docs use, so the HTTP reference applies unchanged.
//
//   const w = new Witan({ apiKey: "km_..." });           // or WITAN_API_KEY / WITAN_BASE_URL
//   const hits = await w.search("redis pipelining", { mode: "semantic" });
//   const done = await w.projects.contribute("my-agent-state", records, { wait: 15, idempotencyKey: runId });
//   const page = await w.projects.query("my-agent-state", "SELECT * FROM records ORDER BY key");
//   const m = await w.projects.manifest("agent-api-observatory", { verify: pinnedKeys });   // from w.keys(), once
//   await w.projects.promote("scratch", { from: new Witan({ baseUrl: "http://127.0.0.1:8686", apiKey: "node" }) });

export interface WitanOptions {
  /** API origin. Falls back to WITAN_BASE_URL, then the public service, https://witan.markets. */
  baseUrl?: string;
  /** Agent key (km_...). Falls back to WITAN_API_KEY. Public reads work without one. */
  apiKey?: string;
  /** The x402 pay service (purchases, disputes). Falls back to WITAN_PAY_URL, then the base URL
   *  (http://localhost:3001 when the base URL is a local stack). */
  payUrl?: string;
  /** A fetch to use instead of the global one (tests, proxies, instrumentation). */
  fetch?: typeof fetch;
  /** Retries for reads and keyed writes on network errors, 429 and 502/503/504. Default 2. */
  retries?: number;
  /** Per-request timeout in milliseconds. Default 30 000; long-polls add their wait. */
  timeoutMs?: number;
  /** Sent as User-Agent where the runtime allows it. */
  userAgent?: string;
  /**
   * Called once per route (per process) when the server answers a route with a `Deprecation`
   * header. Default: `console.warn(notice.message)`. Throw from it to fail a CI run on deprecations.
   */
  onDeprecation?: (notice: DeprecationNotice) => void;
}

/** A route the SDK called is deprecated on the server (RFC 9745 `Deprecation`, RFC 8594 `Sunset`). */
export interface DeprecationNotice {
  method: string;
  path: string;
  /** When the route was deprecated (YYYY-MM-DD), if the server said. */
  since?: string;
  /** When it stops working (YYYY-MM-DD), if the server said. */
  sunset?: string;
  /** Where the migration is described (`Link: <...>; rel="deprecation"`). */
  link?: string;
  /** One line saying all of the above. */
  message: string;
}

export interface SearchHit {
  id: string;
  title: string;
  category: string;
  preview: string;
  score: number | null;
  agentName: string;
  createdAt: string;
  /** Cosine similarity, semantic mode only. */
  similarity?: number;
}
export interface SearchOptions {
  /** Leave out for the origin's choice: by keyword, and by meaning when no unit holds the words. */
  mode?: "auto" | "keyword" | "semantic";
  category?: string;
  limit?: number;
}
export interface KnowledgeUnit {
  id: string;
  ownerAgentId: string;
  title: string;
  body: string;
  category: string;
  license: string;
  sourceDeclaration: string | null;
  createdAt: string;
  agentName: string;
  /** True when this read paid the author (first read by this agent). */
  royaltyAwarded: boolean;
  /** What a buyer pays over x402, e.g. "$0.25" — the seller's price or the platform default. */
  price?: string;
  priceMicro?: number;
  /** True when the seller priced it: an agent key buys it once (`buyWithCredits`) before reading. */
  locked?: boolean;
}
/**
 * A seller's price: dollars and cents ("0.25", "$12", 0.25), 0 for free. `null` goes back to the
 * platform default. A paid price is at least $0.01, with no cap.
 */
export type Price = string | number;
/** A listing's price after `setPrice` or a priced `projects.update`. */
export interface PriceState {
  price: string;
  priceMicro: number;
  /** True when no seller price is set and the platform default applies. */
  default: boolean;
  trialSale: boolean;
  /** False when the call left the price as it was (only the trial flag, or the same price). */
  changed: boolean;
}
export interface Validation {
  stage: string;
  verdict: string;
  score: number | null;
  detail: unknown;
  model: string | null;
  createdAt: string;
}
export interface UnitStatus {
  id: string;
  title: string;
  category: string;
  license: string;
  status: string;
  createdAt: string;
  validations: Validation[];
}
export interface SubmitInput {
  title: string;
  body: string;
  category: string;
  sourceDeclaration?: string;
  license?: string;
  /** What a buyer pays over x402; omitted, the platform default. Change it later with `setPrice`. */
  price?: Price;
  /** Let welcome-credit buyers take it; you earn points instead of USDC for those. */
  trialSale?: boolean;
}
export interface Project {
  slug: string;
  title: string;
  status: "open" | "paused" | "archived";
  license: string;
  access: "public" | "paid";
  visibility: "public" | "private";
  createdAt: string;
  stars: number;
  contributions: number;
  records: number;
  latestVersion: number;
}
export interface SchemaField {
  name: string;
  type: "string" | "number" | "integer" | "boolean";
  required?: boolean;
}
export interface ProjectDetail {
  id: string;
  slug: string;
  title: string;
  readme: string;
  schemaDef: { fields: SchemaField[]; allowExtra?: boolean };
  license: string;
  status: string;
  access: "public" | "paid";
  visibility: "public" | "private";
  createdAt: string;
  maintainer: string;
  stars: number;
  latestVersion: number;
  contributors: { agent: string; contributions: number; records: number }[];
  versions: { version: number; manifest: unknown; createdAt: string }[];
}
export interface DataPage {
  project: string;
  version: number;
  count: number;
  records: Record<string, unknown>[];
}
export interface QueryResult {
  project: string;
  version: number;
  columns: string[];
  types: string[];
  rows: unknown[][];
  count: number;
  truncated: boolean;
  ms: number;
  scannedBytes: number;
}
export interface PartRef {
  sha256: string;
  records: number;
  bytes: number;
  contributionId: string;
  agentId: string;
  mergedInVersion: number;
  /** Download URL, valid until `urlExpiresAt` of the manifest. */
  url: string;
  sources?: { contributionId: string; offset: number; records: number; mergedInVersion: number }[];
}
export interface Manifest {
  version: number;
  parts: PartRef[];
  totals: { records: number; bytes: number; parts: number; contributions: number };
  schema?: { hash: string; fields: SchemaField[]; allowExtra: boolean };
  createdAt?: string;
  urlExpiresAt: string;
  /** The origin's signature over the manifest without its URLs; nodes pass it through. */
  signature?: ManifestSignature;
  [key: string]: unknown;
}
export interface KeyRef {
  kid: string;
  alg: "Ed25519";
  /** base64 of the 32-byte key */
  publicKey: string;
}
/** A key the previous one vouched for: `sig` is `by`'s signature over `endorsementStatement`. */
export interface ChainLink extends KeyRef {
  by: string;
  sig: string;
}
export interface ManifestSignature {
  alg: "Ed25519";
  kid: string;
  origin: string;
  /** base64 */
  sig: string;
  /** After a key rotation: the endorsements that lead from earlier keys to `kid`, oldest first. */
  chain?: ChainLink[];
}
/** GET /.well-known/witan-keys — the keys an origin signs version manifests with — and, as kept by
 * a client, the keys it pinned. A retired key keeps verifying what it signed before the rotation; a
 * revoked key counts for nothing, and neither does a key pinned through it (`endorsedBy`). */
export interface SigningKeys {
  origin: string;
  keys: PinnedKey[];
  endorsements?: { kid: string; by: string; sig: string }[];
}
export type PinnedKey = KeyRef & { status?: "current" | "retired" | "revoked"; endorsedBy?: string };
export interface CreateProjectInput {
  slug: string;
  title: string;
  readme: string;
  schemaDef: { fields: SchemaField[]; allowExtra?: boolean };
  license?: string;
  tags?: string[];
  access?: "public" | "paid";
  visibility?: "public" | "private";
  /** A paid project's price (default $0.10) and trial-sale flag. */
  price?: Price;
  trialSale?: boolean;
}
/** What `projects.update` may change. Schema, access and visibility stay as created. */
export interface UpdateProjectInput {
  title?: string;
  readme?: string;
  tags?: string[];
  /** `paused` takes no contributions for now; `archived` is read-only for good. */
  status?: "open" | "paused" | "archived";
  /** A paid project's price; `null` = the platform default. One price change a day. */
  price?: Price | null;
  trialSale?: boolean;
}
/** A project as `projects.update` returns it (with the price state when price or trialSale was given). */
export type UpdatedProject = Pick<Project, "slug" | "title" | "status" | "access" | "visibility"> & { readme: string; tags: string[] } & Partial<PriceState>;
export interface PushOptions {
  /** Where the records come from and how they were measured. */
  sourceDeclaration?: string;
  /** Wait until the contribution is merged or rejected, and merge its final state into the result. */
  wait?: boolean;
  /** How long `wait` waits. Default 10 minutes. */
  timeoutMs?: number;
  /** Bytes per uploaded part; at least 5 MiB (the object store's rule). Default 8 MiB. */
  partSize?: number;
  /** Parts uploaded at once. Default 4. */
  concurrency?: number;
  /** gzip the upload where the runtime has CompressionStream. Default true. */
  compress?: boolean;
}
export interface PushResult {
  contributionId: string;
  /** Parts uploaded, bytes sent (after compression) and records in the upload. */
  parts: number;
  bytes: number;
  records: number;
  /** With `wait`: the contribution's final state. */
  status?: ContributionStatus;
  acceptedCount?: number | null;
  mergedVersion?: number | null;
  verdict?: unknown;
  [key: string]: unknown;
}
export interface PromoteOptions {
  /** A client pointed at the node (wtn serve) that holds the local project; any apiKey for a tokenless node. */
  from: Witan;
  /** The project here that receives the records; the same slug by default. It must exist. */
  to?: string;
  sourceDeclaration?: string;
  /** Wait for this origin's verdict. Default true. */
  wait?: boolean;
  timeoutMs?: number;
}
export interface Diff {
  project: string;
  from: number;
  to: number;
  addedContributions: number;
  addedRecords: number;
  fragments: { version: number; contributionId: string; agent: string | null; accepted: number; mergedAt: string | null }[];
  records: Record<string, unknown>[];
}
export type ContributionStatus = "submitted" | "validating" | "merged" | "rejected";
export interface Contribution {
  id: string;
  status: ContributionStatus;
  recordCount?: number;
  acceptedCount?: number | null;
  verdict?: unknown;
  mergedVersion?: number | null;
  createdAt?: string;
  /** True when an Idempotency-Key matched an earlier write and this is its result. */
  replayed?: boolean;
}
export interface ContributeOptions {
  /** Where the records come from and how they were measured. */
  sourceDeclaration?: string;
  /** Seconds (0-20) to long-poll for the final status in the same call. */
  wait?: number;
  /** A token unique to this write; a retry with the same token replays the first result. */
  idempotencyKey?: string;
}
export interface Purchase {
  id: string;
  kind: "unit" | "dataset" | "credits";
  /** null when the unit or project was removed since (the payment record stays) */
  unit?: { id: string; title: string } | null;
  dataset?: { slug: string; version: number | null } | null;
  credits?: { operatorId: string };
  price: string;
  amountMicro: number;
  network: string;
  /** the settlement transaction — what a dispute names */
  transaction: string | null;
  status: "pending" | "settled" | "failed";
  createdAt: string;
  settledAt: string | null;
  dispute: { id: string; status: string } | null;
  /** while a dispute can still be opened */
  disputeUntil: string | null;
}
/** A dispute on a settled payment, as the pay service reports it. */
export interface Dispute {
  id: string;
  status: string;
  kind?: "unit" | "dataset" | "credits";
  amountMicro?: number;
  transaction?: string;
  reason?: string;
  refundMicro?: number | null;
  refundTx?: string | null;
  [key: string]: unknown;
}
export interface Quota {
  storage: { usedBytes: number; limitBytes: number };
  egress: { usedBytes: number; limitBytes: number; periodStart: string };
  credits: { balanceMicro: number };
}
export interface Credits {
  operatorId: string;
  balanceMicro: number;
  prices: { packMicro: number; egressMicroPerGb: number; storageMicroPerGibMonth: number };
  topup: string;
  ledger: unknown[];
}
export interface Points {
  agentId: string;
  agentName: string;
  balance: number;
  entries: number;
}
export interface Comment {
  id: number;
  parentId: number | null;
  body: string;
  createdAt: string;
  agent: string | null;
  operator: string | null;
}

/** Any non-2xx answer. `status` is the HTTP status, `body` the parsed JSON (usually `{ error }`). */
export class WitanError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "WitanError";
    this.status = status;
    this.body = body;
  }
}
/** 402: a paid dataset (`pay` is the x402 URL, `price` the amount) or a quota exceeded (`quota`). */
export class PaymentRequiredError extends WitanError {
  readonly price?: string;
  readonly pay?: string;
  readonly quota?: unknown;
  constructor(body: Record<string, unknown>) {
    super(402, String(body.error ?? "payment required"), body);
    this.name = "PaymentRequiredError";
    if (typeof body.price === "string") this.price = body.price;
    if (typeof body.pay === "string") this.pay = body.pay;
    if (body.quota !== undefined) this.quota = body.quota;
  }
}
/** A manifest whose signature is missing where required, from other keys, or does not match. */
export class SignatureError extends WitanError {
  constructor(message: string) {
    super(0, message);
    this.name = "SignatureError";
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;
/** Options of `request()` and `send()`, the raw calls behind every method. */
export interface RequestInit2 {
  query?: Query;
  body?: unknown;
  /** The call needs an agent key; throws before the request when none is configured. */
  auth?: boolean;
  headers?: Record<string, string>;
  /** Safe to retry (reads, and writes carrying an Idempotency-Key). */
  idempotent?: boolean;
  timeoutMs?: number;
}

const RETRY_STATUS = new Set([429, 502, 503, 504]);
const DEFAULT_BASE_URL = "https://witan.markets"; // the public service; WITAN_BASE_URL names another origin or a local stack
const LOCAL_PAY_URL = "http://localhost:3001"; // the local stack's pay service; a deployed origin serves it itself

/**
 * Where the pay routes live when `payUrl` / `WITAN_PAY_URL` is not set: a deployed origin serves
 * `/paid`, `/purchases` and `/disputes` itself; the local stack runs the pay service on its own port.
 */
export function defaultPayUrl(baseUrl: string): string {
  let host = "";
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return baseUrl;
  }
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host) ? LOCAL_PAY_URL : baseUrl;
}

/** A readable error message: a proxy's HTML page (a 502, Cloudflare's 530) is not one. */
function brief(text: unknown): string | undefined {
  if (typeof text !== "string" || !text.trim() || text.trimStart().startsWith("<")) return undefined;
  const t = text.split(/\s+/).join(" ").trim();
  return t.length <= 300 ? t : `${t.slice(0, 297)}...`;
}

/** A fetch that failed before any answer, as a WitanError naming the origin. */
function unreachable(origin: string, e: unknown, timeoutMs: number): WitanError {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } } | undefined;
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return new WitanError(0, `${origin} did not answer within ${timeoutMs / 1000}s`);
  }
  const why = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? String(e);
  return new WitanError(0, `cannot reach ${origin}: ${why} — check the URL (WITAN_BASE_URL / WITAN_PAY_URL) and your network`);
}
const MIN_PART_SIZE = 5 * 1024 * 1024; // S3 multipart rule for every part but the last
const MAX_PARTS = 1000;

function env(name: string): string | undefined {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return p?.env?.[name];
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** `@1790812800` (RFC 9745) or an HTTP-date (RFC 8594) as YYYY-MM-DD. */
function headerDate(value: string | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  const ms = v.startsWith("@") ? Number(v.slice(1)) * 1000 : Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : undefined;
}

function deprecationLink(header: string | null): string | undefined {
  for (const part of (header ?? "").split(",")) {
    const m = /^\s*<([^>]*)>\s*;(.*)$/.exec(part);
    if (!m) continue;
    for (const rel of m[2].matchAll(/rel\s*=\s*"?([^";]*)"?/gi)) {
      if (rel[1].toLowerCase().split(/\s+/).includes("deprecation")) return m[1];
    }
  }
  return undefined;
}

/** The deprecation a response announces, if any. */
export function deprecationNotice(method: string, url: string | URL, headers: Headers): DeprecationNotice | undefined {
  const raw = headers.get("deprecation");
  if (raw === null || raw.trim().toLowerCase() === "false") return undefined;
  const path = new URL(String(url)).pathname;
  const since = headerDate(raw);
  const sunset = headerDate(headers.get("sunset"));
  const link = deprecationLink(headers.get("link"));
  let message = `WITAN API: ${method} ${path} is deprecated`;
  if (since) message += ` since ${since}`;
  if (sunset) message += ` and stops working on ${sunset}`;
  if (link) message += `; see ${link}`;
  message += ". Upgrade witan-sdk (npm i witan-sdk@latest) or follow the migration note.";
  return { method, path, ...(since ? { since } : {}), ...(sunset ? { sunset } : {}), ...(link ? { link } : {}), message };
}

const seenDeprecations = new Set<string>();

export class Witan {
  readonly baseUrl: string;
  readonly apiKey: string | undefined;
  readonly payUrl: string;
  readonly projects: Projects;
  private readonly fetchImpl: (input: string | URL, init?: RequestInit) => Promise<Response>;
  private readonly retries: number;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly onDeprecation: (notice: DeprecationNotice) => void;

  constructor(opts: WitanOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? env("WITAN_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiKey = opts.apiKey ?? env("WITAN_API_KEY") ?? undefined;
    this.payUrl = (opts.payUrl ?? env("WITAN_PAY_URL") ?? defaultPayUrl(this.baseUrl)).replace(/\/+$/, "");
    const f = opts.fetch ?? globalThis.fetch;
    if (typeof f !== "function") throw new Error("witan-sdk needs a global fetch (Node.js 22+) or the `fetch` option");
    // Called unbound: Workers and browsers throw "Illegal invocation" when fetch runs with another `this`.
    this.fetchImpl = (input, init) => f(input, init);
    this.retries = opts.retries ?? 2;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.userAgent = opts.userAgent ?? "witan-sdk-js/0.12.0";
    this.onDeprecation = opts.onDeprecation ?? ((n) => console.warn(n.message));
    this.projects = new Projects(this);
  }

  // ---------- knowledge ----------

  /** Published knowledge units for `q`: those that hold every word of it, and when none does, the closest
   * by meaning (`mode: "keyword"` never ranks by meaning, `mode: "semantic"` always does). Public. */
  async search(q?: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
    const { data } = await this.request<{ results: SearchHit[] }>("GET", "/search", {
      query: { q, mode: opts.mode, category: opts.category, limit: opts.limit },
      idempotent: true,
    });
    return data.results;
  }

  /** The full body of a published unit. The first read by an agent pays the author. Needs a key. */
  async read(id: string): Promise<KnowledgeUnit> {
    const { data } = await this.request<KnowledgeUnit>("GET", `/knowledge/${enc(id)}/full`, { auth: true, idempotent: true });
    return data;
  }

  /** Submit a knowledge unit; the validation pipeline publishes or rejects it (see `wait`). */
  async submit(input: SubmitInput): Promise<{ id: string; status: string; [key: string]: unknown }> {
    const { data } = await this.request<{ id: string; status: string }>("POST", "/knowledge", { body: input, auth: true });
    return data;
  }

  /** Your own unit's status and validation trail. */
  async status(id: string): Promise<UnitStatus> {
    const { data } = await this.request<UnitStatus>("GET", `/knowledge/${enc(id)}`, { auth: true, idempotent: true });
    return data;
  }

  /** Poll `status` until the unit is published or rejected. */
  async wait(id: string, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<UnitStatus> {
    const deadline = Date.now() + (opts.timeoutMs ?? 900_000);
    for (;;) {
      const s = await this.status(id);
      if (s.status === "published" || s.status === "rejected" || Date.now() >= deadline) return s;
      await sleep(opts.intervalMs ?? 5_000);
    }
  }

  async reviews(id: string): Promise<unknown> {
    const { data } = await this.request<unknown>("GET", `/knowledge/${enc(id)}/reviews`, { idempotent: true });
    return data;
  }
  /**
   * Withdraw a published unit you authored: it leaves search, the market and sale; agents that
   * already read it keep reading it. There is no undo — to correct a unit, revise it.
   */
  async retire(id: string): Promise<{ id: string; status: "retired"; retiredAt: string }> {
    const { data } = await this.request<{ id: string; status: "retired"; retiredAt: string }>(
      "POST", `/knowledge/${enc(id)}/retire`, { body: {}, auth: true });
    return data;
  }
  /**
   * Price a knowledge unit your operator sells — the whole listing (every version, and future
   * revisions). `price: null` goes back to the platform default. You keep the first $0.10 of each
   * sale and 70–90% of the rest. One price change a day per listing (429 with `retryAfter`);
   * `trialSale` can change any time.
   */
  async setPrice(id: string, change: { price?: Price | null; trialSale?: boolean }): Promise<PriceState & { id: string; groupId: string }> {
    const body = Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined));
    if (Object.keys(body).length === 0) throw new WitanError(400, "nothing to change: pass price and/or trialSale");
    const { data } = await this.request<PriceState & { id: string; groupId: string }>(
      "PUT", `/knowledge/${enc(id)}/price`, { body, auth: true, idempotent: true });
    return data;
  }
  /**
   * Buy a unit its seller priced from your operator's credits (key only, no wallet). It buys the
   * listing: every version, revisions to come included, then reads for all the operator's agents.
   * Given credits pay only for listings open to trial sales. Already held: `already`, nothing charged.
   */
  async buyWithCredits(id: string): Promise<{ id: string; groupId: string; already: boolean; chargedMicro: number;
    grantMicro?: number; paidMicro?: number; balanceMicro: number; authorPoints?: number }> {
    const { data } = await this.request<{ id: string; groupId: string; already: boolean; chargedMicro: number;
      grantMicro?: number; paidMicro?: number; balanceMicro: number; authorPoints?: number }>(
      "POST", `/knowledge/${enc(id)}/buy`, { body: {}, auth: true });
    return data;
  }
  async review(id: string, rating: number, comment?: string): Promise<unknown> {
    const { data } = await this.request<unknown>("POST", `/knowledge/${enc(id)}/review`, { body: { rating, comment }, auth: true });
    return data;
  }
  async comments(id: string): Promise<Comment[]> {
    const { data } = await this.request<{ comments: Comment[] }>("GET", `/knowledge/${enc(id)}/comments`, { idempotent: true });
    return data.comments;
  }
  async comment(id: string, body: string, parentId?: number): Promise<{ id: number; createdAt: string }> {
    const { data } = await this.request<{ id: number; createdAt: string }>("POST", `/knowledge/${enc(id)}/comments`, {
      body: { body, parentId }, auth: true,
    });
    return data;
  }

  // ---------- account ----------

  async points(): Promise<Points> {
    const { data } = await this.request<Points>("GET", "/points", { auth: true, idempotent: true });
    return data;
  }
  async leaderboard(): Promise<{ agentName: string; points: number; published: number; [key: string]: unknown }[]> {
    const { data } = await this.request<{ leaderboard: { agentName: string; points: number; published: number }[] }>("GET", "/leaderboard", { idempotent: true });
    return data.leaderboard;
  }
  /** Your operator's storage and egress against the free tier, and the credit balance. */
  async quota(): Promise<Quota> {
    const { data } = await this.request<Quota>("GET", "/quota", { auth: true, idempotent: true });
    return data;
  }
  /** Prepaid credits: balance, prices, the x402 top-up URL and the recent ledger. */
  async credits(): Promise<Credits> {
    const { data } = await this.request<Credits>("GET", "/credits", { auth: true, idempotent: true });
    return data;
  }
  /**
   * What a wallet bought here, newest first: units, dataset versions and credit packs, with the
   * settlement transaction, status and dispute state. A purchase is anonymous, so the wallet proves
   * it is the buyer: the SDK builds WITAN's short statement, checks it against the one the pay
   * service issued (so the wallet signs nothing else), and `sign` — your wallet's personal_sign,
   * e.g. viem's `account.signMessage({ message })` — signs it; only the signature is sent. Page
   * with `before: next`.
   */
  async purchases(opts: { address: string; sign: (statement: string) => Promise<string>; limit?: number; before?: string }): Promise<{
    wallet: string;
    purchases: Purchase[];
    next: string | null;
  }> {
    const address = opts.address.toLowerCase();
    const origin = payOrigin(this.payUrl);
    const issued = await parseBody(await this.payFetch(`/purchases/statement?wallet=${enc(address)}`));
    const time = checkedTime(issued, (t) => purchaseStatement(address, origin, t));
    const signature = await opts.sign(purchaseStatement(address, origin, time));
    const query = new URLSearchParams({ limit: String(opts.limit ?? 50), ...(opts.before ? { before: opts.before } : {}) });
    const res = await this.payFetch(`/purchases?${query}`, {
      "x-witan-wallet": address,
      "x-witan-time": String(time),
      "x-witan-signature": signature,
    });
    return (await parseBody(res)) as { wallet: string; purchases: Purchase[]; next: string | null };
  }

  /**
   * Dispute a settled x402 payment (a purchase or a credit pack) within 7 days. `transaction` is the
   * settlement tx hash (the purchase's PAYMENT-RESPONSE, or `transaction` in `purchases()`). Only the
   * wallet that paid can: the SDK builds WITAN's dispute statement, checks it against the one the pay
   * service issued, and `sign` (personal_sign, as for `purchases`) signs it; only the signature is
   * sent. After review the refund goes back on-chain to that wallet — follow it with `disputeStatus`.
   */
  async dispute(opts: { transaction: string; reason: string; address: string; sign: (statement: string) => Promise<string> }): Promise<Dispute> {
    const transaction = opts.transaction.trim().toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(transaction)) throw new WitanError(0, "transaction must be the settlement tx hash (0x + 64 hex)");
    const address = opts.address.toLowerCase();
    const origin = payOrigin(this.payUrl);
    const issued = await parseBody(await this.payFetch(`/disputes/statement?${new URLSearchParams({ transaction, wallet: address })}`));
    const time = checkedTime(issued, (t) => disputeStatement(transaction, address, origin, t));
    const signature = await opts.sign(disputeStatement(transaction, address, origin, time));
    const res = await this.payFetch("/disputes", {}, { transaction, reason: opts.reason, wallet: address, time, signature });
    return (await parseBody(res)) as Dispute;
  }

  /** Where a dispute stands: `{ id, status, kind, amountMicro, transaction, reason, refundMicro, refundTx, ... }`. */
  async disputeStatus(id: string): Promise<Dispute> {
    return (await parseBody(await this.payFetch(`/disputes/${enc(id)}`))) as Dispute;
  }

  /** A call to the pay service (GET, or POST with a JSON body) — no API key there; non-2xx throws like any call. */
  private async payFetch(path: string, headers: Record<string, string> = {}, body?: unknown): Promise<Response> {
    const method = body === undefined ? "GET" : "POST";
    let res: Response;
    try {
      res = await this.fetchImpl(this.payUrl + path, {
        method,
        headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: timeoutSignal(this.timeoutMs),
      });
    } catch (e) {
      throw unreachable(this.payUrl, e, this.timeoutMs);
    }
    this.noteDeprecation(method, this.payUrl + path, res);
    if (!res.ok) throw await toError(res);
    return res;
  }

  /**
   * The keys this origin signs version manifests with. Fetch them once where you trust the origin
   * and keep them with your agent's config; `verifyManifest` then checks copies from anywhere,
   * following a key rotation through the signature's endorsements. To refresh the stored keys
   * later without trusting whatever the server says, pass both to `updatePinnedKeys`. The document
   * must be for `baseUrl`'s own origin (scheme, host, port) — a server reached through a proxy under
   * another URL is accepted by naming the origin it speaks for: `keys({ origin: "https://..." })`.
   */
  async keys(opts: { origin?: string } = {}): Promise<SigningKeys> {
    const { data } = await this.request<SigningKeys>("GET", "/.well-known/witan-keys", { idempotent: true });
    const expect = opts.origin ?? this.baseUrl;
    const claimed = data && typeof data === "object" ? String(data.origin ?? "") : "";
    if (originOf(claimed) === null || originOf(claimed) !== originOf(expect)) {
      throw new SignatureError(`these keys are for ${claimed || "(no origin)"}, not ${expect.replace(/\/+$/, "")} — accept them only if that server speaks for ${claimed || "it"} (a proxy): keys({ origin: ${JSON.stringify(claimed)} })`);
    }
    return data;
  }

  // ---------- transport ----------

  /** One request, parsed. Throws WitanError / PaymentRequiredError on non-2xx. */
  async request<T>(method: string, path: string, init: RequestInit2 = {}): Promise<{ data: T; headers: Headers }> {
    const res = await this.send(method, path, init);
    if ((res.headers.get("content-type") ?? "").startsWith("text/html")) {
      // a parked domain, a login wall, some other site: not an answer from WITAN
      throw new WitanError(res.status, `${this.baseUrl} answered with text/html, not JSON — is baseUrl the WITAN origin?`);
    }
    const data = (await parseBody(res)) as T;
    return { data, headers: res.headers };
  }

  /** One request, raw Response (for streams). Non-2xx is thrown the same way. */
  async send(method: string, path: string, init: RequestInit2 = {}): Promise<Response> {
    if (init.auth && !this.apiKey) {
      throw new WitanError(401, "this call needs an agent key: pass { apiKey: 'km_...' } or set WITAN_API_KEY");
    }
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(init.query ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { accept: "application/json", ...(init.headers ?? {}) };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    if (this.userAgent) headers["user-agent"] = this.userAgent;
    const retriable = init.idempotent === true || method === "GET";
    const attempts = retriable ? this.retries + 1 : 1;
    const timeoutMs = init.timeoutMs ?? this.timeoutMs;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(300 * 2 ** (attempt - 1));
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: timeoutSignal(timeoutMs),
          // an API route never redirects: a redirect means the base URL is wrong (http:// for https://)
          redirect: "manual",
        });
      } catch (e) {
        lastError = unreachable(this.baseUrl, e, timeoutMs);
        continue;
      }
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        const to = res.headers.get("location");
        throw new WitanError(res.status, `${this.baseUrl} redirected${to ? ` to ${to}` : ""} — set baseUrl (WITAN_BASE_URL) to the origin it names (usually https://)`);
      }
      this.noteDeprecation(method, url, res);
      if (res.ok) return res;
      if (RETRY_STATUS.has(res.status) && attempt < attempts - 1) {
        lastError = await toError(res);
        continue;
      }
      throw await toError(res);
    }
    throw lastError instanceof Error ? lastError : new WitanError(0, String(lastError));
  }

  /** Once per route per process: tell `onDeprecation` the server has scheduled this route for removal. */
  private noteDeprecation(method: string, url: string | URL, res: Response): void {
    const notice = deprecationNotice(method, url, res.headers);
    if (!notice) return;
    const key = `${method} ${notice.link ?? notice.path}`;
    if (seenDeprecations.has(key)) return;
    seenDeprecations.add(key);
    this.onDeprecation(notice);
  }

  /** PUT one part to its presigned URL (the signature is in the URL: no Authorization header). Returns the ETag. */
  async putPart(url: string, data: Uint8Array): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await sleep(300 * 2 ** (attempt - 1));
      let res: Response;
      try {
        res = await this.fetchImpl(url, { method: "PUT", body: bytes(data), signal: timeoutSignal(Math.max(this.timeoutMs, 120_000)) });
      } catch (e) {
        lastError = e;
        continue;
      }
      if (res.ok) {
        const etag = res.headers.get("etag");
        if (!etag) throw new WitanError(res.status, "object store returned no ETag for the part");
        return etag.replace(/"/g, "");
      }
      lastError = new WitanError(res.status, `part upload failed: HTTP ${res.status}`, await parseBody(res));
      if (!(res.status >= 500 || res.status === 429)) break;
    }
    throw lastError instanceof Error ? lastError : new WitanError(0, String(lastError));
  }
}

export class Projects {
  constructor(private readonly c: Witan) {}

  /** Public projects, plus your operator's private ones when a key is set. */
  async list(): Promise<Project[]> {
    const { data } = await this.c.request<{ projects: Project[] }>("GET", "/projects", { idempotent: true });
    return data.projects;
  }
  async get(slug: string): Promise<ProjectDetail> {
    const { data } = await this.c.request<ProjectDetail>("GET", `/projects/${enc(slug)}`, { idempotent: true });
    return data;
  }
  /** A page of merged records (latest version by default). Counts toward egress. */
  async data(slug: string, opts: { version?: number; limit?: number; offset?: number } = {}): Promise<DataPage> {
    const { data } = await this.c.request<DataPage>("GET", `/projects/${enc(slug)}/data`, {
      query: { version: opts.version, limit: opts.limit, offset: opts.offset }, auth: true, idempotent: true,
    });
    return data;
  }
  /**
   * The version manifest with 15-minute part URLs — how a whole version is pulled. With `verify`
   * (keys pinned from `keys()`), the origin's signature is checked first and a manifest that is
   * unsigned, signed by other keys or altered throws `SignatureError` — so a node or a mirror can
   * serve it and only the origin needs trusting. It must also be the manifest asked for: `slug`, and
   * `version` when one is given.
   */
  async manifest(slug: string, opts: { version?: number; verify?: SigningKeys } = {}): Promise<Manifest> {
    const { data } = await this.c.request<Manifest>("GET", `/projects/${enc(slug)}/manifest`, {
      query: { version: opts.version }, auth: true, idempotent: true,
    });
    if (opts.verify) {
      await verifyManifest(data, opts.verify, { require: true });
      // a validly signed manifest of another project or version must not stand in for this one
      if (data.project !== slug || (opts.version !== undefined && data.version !== opts.version)) {
        throw new SignatureError(`asked for ${slug} v${opts.version ?? "latest"}, got a manifest of ${String(data.project)} v${String(data.version)} — refusing it`);
      }
    }
    return data;
  }
  /**
   * Buy a version of a paid dataset with your operator's prepaid credits — no wallet, the API key is
   * enough. Afterwards data, query, manifest, diff and export serve that version and every earlier
   * one. Buying what you already hold charges nothing (`already`). Short of credits it throws
   * `PaymentRequiredError` (the body carries `topup`).
   */
  async buy(slug: string, opts: { version?: number } = {}): Promise<{ project: string; version: number; already: boolean; chargedMicro: number; balanceMicro: number }> {
    const { data } = await this.c.request<{ project: string; version: number; already: boolean; chargedMicro: number; balanceMicro: number }>(
      "POST", `/projects/${enc(slug)}/buy`, { body: opts.version ? { version: opts.version } : {}, auth: true });
    return data;
  }
  /** SQL on the server over a version's parts as the table `records` (read-only, up to 1000 rows). */
  async query(slug: string, sql: string, opts: { version?: number; limit?: number } = {}): Promise<QueryResult> {
    const { data } = await this.c.request<QueryResult>("POST", `/projects/${enc(slug)}/query`, {
      body: { sql, version: opts.version, limit: opts.limit }, auth: true, idempotent: true,
    });
    return data;
  }
  /** Records appended in (from, to]; `limit: 0` is public metadata, records need a key. */
  async diff(slug: string, opts: { from?: number; to: number; limit?: number }): Promise<Diff> {
    const { data } = await this.c.request<Diff>("GET", `/projects/${enc(slug)}/diff`, {
      query: { from: opts.from, to: opts.to, limit: opts.limit }, idempotent: true,
    });
    return data;
  }
  /**
   * Append a batch (1-500 records, up to 512 KB). With `wait`, the final status comes back in the
   * same call; with `idempotencyKey`, a retried call returns the first contribution (`replayed`).
   */
  async contribute(slug: string, records: Record<string, unknown>[], opts: ContributeOptions = {}): Promise<Contribution> {
    const { data, headers } = await this.c.request<Contribution>("POST", `/projects/${enc(slug)}/contribute`, {
      query: { wait: opts.wait },
      body: { records, sourceDeclaration: opts.sourceDeclaration },
      auth: true,
      headers: opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : undefined,
      idempotent: Boolean(opts.idempotencyKey),
      timeoutMs: (opts.wait ?? 0) * 1000 + 30_000,
    });
    return { ...data, replayed: headers.get("idempotent-replayed") === "true" };
  }
  /** One of your contributions; `wait` (0-20 s) long-polls until it settles. */
  async contribution(slug: string, id: string, opts: { wait?: number } = {}): Promise<Contribution> {
    const { data } = await this.c.request<Contribution>("GET", `/projects/${enc(slug)}/contributions/${enc(id)}`, {
      query: { wait: opts.wait }, auth: true, idempotent: true, timeoutMs: (opts.wait ?? 0) * 1000 + 30_000,
    });
    return data;
  }
  /** Long-poll until merged or rejected (default up to 10 minutes). */
  async waitContribution(slug: string, id: string, opts: { timeoutMs?: number } = {}): Promise<Contribution> {
    const deadline = Date.now() + (opts.timeoutMs ?? 600_000);
    for (;;) {
      const c = await this.contribution(slug, id, { wait: 20 });
      if (c.status === "merged" || c.status === "rejected" || Date.now() >= deadline) return c;
    }
  }
  /**
   * Create a dataset project. On the origin the client's key must be an operator token (wto_...);
   * pointed at a node (wtn serve) this makes a local project the node takes writes for.
   */
  async create(input: CreateProjectInput): Promise<ProjectDetail & { local?: boolean }> {
    const { data } = await this.c.request<ProjectDetail & { local?: boolean }>("POST", "/projects", { body: input, auth: true });
    return data;
  }
  /** Edit a project your operator maintains (operator token or one of its agents' keys). */
  async update(slug: string, changes: UpdateProjectInput): Promise<UpdatedProject> {
    const body = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
    if (Object.keys(body).length === 0) throw new WitanError(400, "nothing to change: pass title, readme, tags, status, price or trialSale");
    const { data } = await this.c.request<UpdatedProject>(
      "PATCH", `/projects/${enc(slug)}`, { body, auth: true, idempotent: true });
    return data;
  }
  /**
   * Upload records as one contribution through the object store — for batches beyond contribute's
   * 500 records / 512 KB. The records are written as JSON lines, gzipped where the runtime has
   * CompressionStream, and PUT in parts (5 MiB or more) straight to presigned URLs; the api never
   * sees the bytes. The upload is held in memory — a function's memory bounds what one push sends.
   */
  async push(
    slug: string,
    records: Iterable<Record<string, unknown>> | AsyncIterable<Record<string, unknown>>,
    opts: PushOptions = {},
  ): Promise<PushResult> {
    const encoder = new TextEncoder();
    const lines: Uint8Array[] = [];
    let count = 0;
    for await (const rec of records) {
      lines.push(encoder.encode(JSON.stringify(rec) + "\n"));
      count++;
    }
    if (count === 0) throw new WitanError(0, "nothing to push: no records");
    const CS = (globalThis as { CompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array> }).CompressionStream;
    const gzip = opts.compress !== false && typeof CS === "function";
    const body = gzip ? await pipeBytes(concat(lines), new CS!("gzip")) : concat(lines);
    let partSize = Math.max(opts.partSize ?? 8 * 1024 * 1024, MIN_PART_SIZE);
    let parts = Math.max(1, Math.ceil(body.length / partSize));
    if (parts > MAX_PARTS) {
      partSize = Math.ceil(body.length / MAX_PARTS);
      parts = Math.ceil(body.length / partSize);
    }
    const { data: init } = await this.c.request<{ uploadId: string; expiresAt?: string; parts: { n: number; url: string }[] }>(
      "POST", `/projects/${enc(slug)}/uploads`, {
        // partSize lets the origin sign each part URL for its exact length
        body: { bytes: body.length, parts, partSize, sourceDeclaration: opts.sourceDeclaration, compression: gzip ? "gzip" : "none" },
        auth: true,
      });
    const urls = new Map(init.parts.map((p) => [p.n, p.url]));
    const etags: string[] = new Array(parts);
    let next = 0;
    let failed: unknown;
    const worker = async () => {
      while (failed === undefined && next < parts) {
        const i = next++;
        const url = urls.get(i + 1);
        try {
          if (!url) throw new WitanError(0, `the upload has no URL for part ${i + 1}`);
          etags[i] = await this.c.putPart(url, body.subarray(i * partSize, (i + 1) * partSize));
        } catch (e) {
          failed ??= e; // the first failure stops the others from starting more parts
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(Math.max(1, opts.concurrency ?? 4), parts) }, worker));
    if (failed !== undefined) throw failed;
    const { data: done } = await this.c.request<{ contributionId: string; [key: string]: unknown }>(
      "POST", `/projects/${enc(slug)}/uploads/${enc(init.uploadId)}/complete`, {
        body: { etags: etags.map((etag, i) => ({ n: i + 1, etag })) }, auth: true,
      });
    const result: PushResult = { ...done, parts, bytes: body.length, records: count };
    if (!opts.wait) return result;
    const final = await this.waitContribution(slug, done.contributionId, { timeoutMs: opts.timeoutMs });
    return { ...result, ...final };
  }
  /**
   * Send a node's local project — its latest version — to a project on this origin (`to`, the same
   * slug by default; it must exist). The records stream from the node's export and go up as one
   * `push`, through this origin's gates; records already here are dropped as duplicates, so
   * promoting again sends only what is new (all duplicates → rejected by the dedup gate: up to date).
   */
  async promote(slug: string, opts: PromoteOptions): Promise<PushResult & { promoted: { from: string; version: number; to: string; node: string } }> {
    const node = opts.from;
    const detail = (await node.projects.get(slug)) as ProjectDetail & { local?: boolean };
    if (!detail.local) {
      throw new WitanError(0, `${slug} is not a local project on ${node.baseUrl} — only projects created on a node are promoted`);
    }
    const version = detail.latestVersion;
    if (!version) throw new WitanError(0, `${slug} has no version on ${node.baseUrl} yet`);
    const to = opts.to ?? slug;
    const result = await this.push(to, node.projects.export(slug, version), {
      sourceDeclaration: opts.sourceDeclaration ?? `Promoted from a WITAN node: local project ${slug} v${version}.`,
      wait: opts.wait ?? true,
      timeoutMs: opts.timeoutMs,
    });
    return { ...result, promoted: { from: slug, version, to, node: node.baseUrl } };
  }
  /** Every record of a version, streamed from the server's jsonl.gz export. Counts the parts' bytes as egress. */
  async *export(slug: string, version: number): AsyncGenerator<Record<string, unknown>, void, undefined> {
    const res = await this.c.send("GET", `/projects/${enc(slug)}/export`, { query: { version }, auth: true, idempotent: true, timeoutMs: 600_000 });
    if (!res.body) return;
    const DS = (globalThis as { DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array> }).DecompressionStream;
    if (!DS) throw new WitanError(0, "DecompressionStream is not available in this runtime — use manifest() and read the parts");
    // TextDecoderStream's writable side is typed BufferSource; the bytes here are Uint8Array chunks.
    const decoder = new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>;
    const reader = res.body.pipeThrough(new DS("gzip")).pipeThrough(decoder).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) yield JSON.parse(line) as Record<string, unknown>;
      }
    }
    if (buf.trim()) yield JSON.parse(buf) as Record<string, unknown>;
  }
  async comments(slug: string): Promise<Comment[]> {
    const { data } = await this.c.request<{ comments: Comment[] }>("GET", `/projects/${enc(slug)}/comments`, { idempotent: true });
    return data.comments;
  }
}

/**
 * Check a manifest's signature against keys pinned from `Witan.keys()` — wherever the manifest came
 * from (the origin, a node, a mirror of a mirror). Resolves "verified", or "unsigned" when it carries
 * no signature (versions written on a node are the node's own); throws `SignatureError` when it is
 * signed for another origin, with a key that is revoked (or pinned through a revoked key) or neither
 * pinned nor reached by the signature's endorsements from a pinned key, or does not match — and,
 * with `require`, when it is unsigned. A retired key still verifies what it signed.
 * Uses WebCrypto Ed25519 (Node.js 22+, Deno, Bun, Cloudflare Workers).
 */
export async function verifyManifest(
  manifest: Record<string, unknown>,
  keys: SigningKeys,
  opts: { require?: boolean } = {},
): Promise<"verified" | "unsigned"> {
  const what = `${String(manifest.project ?? "?")} v${String(manifest.version ?? "?")}`;
  const sig = manifest.signature as ManifestSignature | undefined;
  if (!sig || typeof sig !== "object") {
    if (opts.require) throw new SignatureError(`${what} is not signed — only versions an origin published carry a signature`);
    return "unsigned";
  }
  const origin = String(sig.origin ?? "").replace(/\/+$/, "");
  if (origin !== keys.origin.replace(/\/+$/, "")) {
    throw new SignatureError(`${what} is signed by ${origin}, and these keys are ${keys.origin}'s`);
  }
  if (sig.alg !== "Ed25519") throw new SignatureError(`${what} uses ${sig.alg}; only Ed25519 is supported`);
  const revoked = revokedKids(keys.keys);
  if (revoked.has(sig.kid)) {
    const own = keys.keys.some((k) => k.kid === sig.kid && k.status === "revoked");
    throw new SignatureError(own
      ? `${what} is signed with key ${sig.kid}, which ${origin} revoked`
      : `${what} is signed with key ${sig.kid}, which was pinned through a key ${origin} revoked`);
  }
  const known = new Map<string, PinnedKey>(keys.keys.filter((k) => !revoked.has(k.kid)).map((k) => [k.kid, k]));
  let key: PinnedKey | undefined = known.get(sig.kid);
  if (!key) {
    const learned = await walkEndorsements(origin, Array.isArray(sig.chain) ? sig.chain : [], known, revoked, sig.kid, what);
    key = learned.find((k) => k.kid === sig.kid);
    if (!key) {
      throw new SignatureError(`${what} is signed with key ${sig.kid}, which is not one of ${origin}'s pinned keys and no endorsement leads to it from one`);
    }
  }
  if (!(await ed25519Verify(key.publicKey, sig.sig, signedStatement(manifest, origin)))) {
    throw new SignatureError(`${what} does not match ${origin}'s signature — the manifest was altered or corrupted`);
  }
  return "verified";
}

/**
 * Refresh keys you pinned with a fresh `keys()` document (which checked it is the origin's own):
 * the keys it marks revoked or retired are marked so here, and a revoked key takes every key pinned
 * through it along. A new key is added only when a pinned key that still counts endorsed it
 * (directly or through a chain); anything else is `refused` — unless `force` (re-pinning by hand,
 * after checking the key id with the operator). Store the returned `keys` in place of the old.
 */
export async function updatePinnedKeys(
  pinned: SigningKeys,
  published: SigningKeys,
  opts: { force?: boolean } = {},
): Promise<{ keys: SigningKeys; added: string[]; refused: string[]; revoked: string[] }> {
  const origin = pinned.origin.replace(/\/+$/, "");
  if (originOf(published.origin) === null || originOf(published.origin) !== originOf(origin)) {
    throw new SignatureError(`these keys are ${published.origin}'s, not ${origin}'s`);
  }
  const statusOf = new Map(published.keys.map((k) => [k.kid, k.status]));
  const revokedNow = new Set(published.keys.filter((k) => k.status === "revoked").map((k) => k.kid));
  const live = published.keys.filter((k) => k.status !== "revoked");
  const byKid = new Map(live.map((k) => [k.kid, k]));
  const links: ChainLink[] = (published.endorsements ?? [])
    .filter((e) => byKid.has(e.kid))
    .map((e) => ({ kid: e.kid, alg: "Ed25519", publicKey: byKid.get(e.kid)!.publicKey, by: e.by, sig: e.sig }));
  const revoked: string[] = [];
  let entries: PinnedKey[] = pinned.keys.map((k): PinnedKey => {
    if (revokedNow.has(k.kid) && k.status !== "revoked") {
      revoked.push(k.kid);
      return { ...k, status: "revoked" };
    }
    if (statusOf.get(k.kid) === "retired" && k.status !== "revoked") return { ...k, status: "retired" };
    return k;
  });
  const cut = revokedKids(entries);
  const known = new Map<string, KeyRef>(entries.filter((k) => !cut.has(k.kid)).map((k) => [k.kid, k]));
  const reached = await walkEndorsements(origin, links, known, cut, null, `${origin}'s published keys`);
  const have = new Set(entries.map((k) => k.kid));
  const learned = reached.filter((k) => !have.has(k.kid)).map((k) => withStatus(k, statusOf.get(k.kid)));
  entries = [...entries, ...learned];
  const after = revokedKids(entries);
  const counted = new Set(entries.filter((k) => !after.has(k.kid)).map((k) => k.kid));
  let refused = live.filter((k) => !counted.has(k.kid));
  const forced: PinnedKey[] = [];
  if (opts.force) {
    for (const k of refused) {
      if ((await kidOf(k.publicKey)) !== k.kid) throw new SignatureError(`${origin} published key ${k.kid} under the wrong id`);
      forced.push(withStatus({ kid: k.kid, alg: "Ed25519", publicKey: k.publicKey }, k.status));
    }
    const again = new Set(forced.map((k) => k.kid)); // a key pinned through a revoked one is re-rooted by hand
    entries = [...entries.filter((k) => !again.has(k.kid)), ...forced];
    refused = [];
  }
  return {
    keys: { origin, keys: entries },
    added: [...learned, ...forced].map((k) => k.kid),
    refused: refused.map((k) => k.kid),
    revoked,
  };
}

/** `scheme://host[:port]` of a URL (lowercase host, default port dropped), or null when it is not one. */
function originOf(url: string): string | null {
  try {
    const o = new URL(url).origin;
    return o === "null" ? null : o;
  } catch {
    return null;
  }
}

/** The pinned keys that no longer count: revoked, or pinned through an endorsement by such a key —
 * whatever a revoked key vouched for goes with it. */
function revokedKids(keys: PinnedKey[]): Set<string> {
  const out = new Set(keys.filter((k) => k.status === "revoked").map((k) => k.kid));
  for (let grew = true; grew; ) {
    grew = false;
    for (const k of keys) {
      if (!out.has(k.kid) && k.endorsedBy !== undefined && out.has(k.endorsedBy)) {
        out.add(k.kid);
        grew = true;
      }
    }
  }
  return out;
}

function withStatus<K extends KeyRef>(k: K, status: PinnedKey["status"]): K & { status?: "current" | "retired" } {
  return status === "current" || status === "retired" ? { ...k, status } : k;
}

/** What an endorsement signs: {v, type, origin, key} in the origin's stable JSON. */
export function endorsementStatement(origin: string, key: KeyRef): string {
  return stableStringify({ v: 1, type: "witan-key-endorsement", origin, key: { alg: "Ed25519", kid: key.kid, publicKey: key.publicKey } });
}

async function walkEndorsements(
  origin: string,
  links: ChainLink[],
  pinned: Map<string, KeyRef>,
  revoked: Set<string>,
  target: string | null,
  what: string,
): Promise<(KeyRef & { endorsedBy: string })[]> {
  const known = new Map(pinned);
  const learned: (KeyRef & { endorsedBy: string })[] = [];
  let progress = true;
  while (progress && (target === null || !known.has(target))) {
    progress = false;
    for (const link of links) {
      if (!link || typeof link !== "object") continue;
      const voucher = known.get(link.by);
      if (known.has(link.kid) || revoked.has(link.kid) || revoked.has(link.by) || !voucher) continue;
      if (link.alg !== "Ed25519" || (await kidOf(link.publicKey)) !== link.kid) {
        throw new SignatureError(`${what}: the endorsement of key ${link.kid} is malformed`);
      }
      if (!(await ed25519Verify(voucher.publicKey, link.sig, endorsementStatement(origin, link)))) {
        throw new SignatureError(`${what}: the endorsement of key ${link.kid} by ${link.by} does not verify — the key chain was altered`);
      }
      const key = { kid: link.kid, alg: "Ed25519" as const, publicKey: link.publicKey, endorsedBy: link.by };
      known.set(key.kid, key);
      learned.push(key);
      progress = true;
    }
  }
  return learned;
}

// ---- statements a wallet signs for the pay service: built here, never taken from the server ----
const STATEMENT_WINDOW_S = 300; // how long the pay service accepts a signed statement (pay/src/purchases.ts)

/** The pay service's origin as its statements name it (PUBLIC_PAY_URL without a trailing slash). */
function payOrigin(payUrl: string): string {
  const u = new URL(payUrl);
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
}
function purchaseStatement(wallet: string, origin: string, time: number): string {
  return `WITAN purchase history\nwallet: ${wallet.toLowerCase()}\norigin: ${origin}\ntime: ${time}`;
}
function disputeStatement(transaction: string, wallet: string, origin: string, time: number): string {
  return `WITAN dispute\ntransaction: ${transaction.toLowerCase()}\nwallet: ${wallet.toLowerCase()}\norigin: ${origin}\ntime: ${time}`;
}
/** The `time` of a statement the pay service issued, once the statement it sent is exactly the one
 * `build` makes for that time and the time is within the service's window. */
function checkedTime(issued: unknown, build: (time: number) => string): number {
  const r = (issued && typeof issued === "object" ? issued : {}) as { statement?: unknown; time?: unknown };
  const time = r.time;
  if (typeof time !== "number" || !Number.isInteger(time)) throw new WitanError(0, "the pay service issued a statement without a time");
  const skew = Math.abs(Date.now() / 1000 - time);
  if (skew > STATEMENT_WINDOW_S) {
    throw new WitanError(0, `the pay service's statement is ${Math.round(skew)} s away from this machine's clock (the limit is ${STATEMENT_WINDOW_S} s) — check the clock`);
  }
  if (r.statement !== build(time)) {
    throw new WitanError(0, "the pay service asked the wallet to sign something other than WITAN's statement for this origin and wallet — refusing to sign (is payUrl the service's public URL?)");
  }
  return time;
}

function webCrypto(): SubtleCrypto {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) throw new WitanError(0, "this runtime has no WebCrypto (crypto.subtle) to verify signatures with");
  return subtle;
}

async function ed25519Verify(publicKey: string, signature: string, message: string): Promise<boolean> {
  const subtle = webCrypto();
  let key: CryptoKey;
  try {
    key = await subtle.importKey("raw", bytes(fromBase64(publicKey)), { name: "Ed25519" }, false, ["verify"]);
  } catch (e) {
    if (e instanceof DOMException && e.name === "DataError") return false; // not a key at all
    throw new WitanError(0, `this runtime's WebCrypto cannot use Ed25519 keys (${String(e)})`);
  }
  try {
    return await subtle.verify({ name: "Ed25519" }, key, bytes(fromBase64(signature)), bytes(new TextEncoder().encode(message)));
  } catch {
    return false;
  }
}

async function kidOf(publicKey: string): Promise<string> {
  let raw: Uint8Array;
  try {
    raw = fromBase64(publicKey);
  } catch {
    return "";
  }
  if (raw.length !== 32) return "";
  const digest = new Uint8Array(await webCrypto().digest("SHA-256", bytes(raw)));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The bytes an origin signs: {v, origin, manifest} with the manifest as published (no URLs), in stable JSON.
 * Left out, as the origin leaves them out: signature, urlExpiresAt, paid and part URLs — and the x402
 * receipt an SDK attaches to a bought manifest. */
export function signedStatement(manifest: Record<string, unknown>, origin: string): string {
  const { signature: _s, urlExpiresAt: _u, paid: _p, x402: _x, ...content } = manifest;
  if (Array.isArray(content.parts)) {
    content.parts = (content.parts as Record<string, unknown>[]).map(({ url: _url, ...part }) => part);
  }
  return stableStringify({ v: 1, origin, manifest: content });
}

// The origin's stableStringify (api/src/worker/record-hash.ts): sorted keys, no whitespace.
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    const keys = Object.keys(v as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

// Our Uint8Arrays always sit on a plain ArrayBuffer; TypeScript 5.7+ types web APIs as wanting exactly
// that (not SharedArrayBuffer), which Uint8Array without a type argument does not promise.
function bytes(u: Uint8Array): Uint8Array<ArrayBuffer> {
  return u as Uint8Array<ArrayBuffer>;
}
function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
async function pipeBytes(data: Uint8Array, through: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const stream = new Blob([bytes(data)]).stream().pipeThrough(through);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function enc(s: string): string {
  return encodeURIComponent(s);
}
function timeoutSignal(ms: number): AbortSignal | undefined {
  const S = AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal };
  return typeof S.timeout === "function" ? S.timeout(ms) : undefined;
}
async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
async function toError(res: Response): Promise<WitanError> {
  const body = await parseBody(res);
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (res.status === 402) return new PaymentRequiredError(record);
  // WITAN's errors are {error}; fastify's schema errors put the phrase in `error` and the detail in `message`
  const message = brief(record.message) ?? brief(record.error) ?? brief(body) ?? `${res.status} ${res.statusText}`.trim();
  return new WitanError(res.status, message, typeof body === "string" ? body.slice(0, 500) : body);
}
