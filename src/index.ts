// witan-sdk — WITAN from anywhere fetch runs: Node 18+, Deno, Bun, Cloudflare Workers,
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
  /** API origin. Falls back to WITAN_BASE_URL, then http://localhost:3000. */
  baseUrl?: string;
  /** Agent key (km_...). Falls back to WITAN_API_KEY. Public reads work without one. */
  apiKey?: string;
  /** The x402 pay service (purchases, disputes). Falls back to WITAN_PAY_URL, then http://localhost:3001. */
  payUrl?: string;
  /** A fetch to use instead of the global one (tests, proxies, instrumentation). */
  fetch?: typeof fetch;
  /** Retries for reads and keyed writes on network errors, 429 and 502/503/504. Default 2. */
  retries?: number;
  /** Per-request timeout in milliseconds. Default 30 000; long-polls add their wait. */
  timeoutMs?: number;
  /** Sent as User-Agent where the runtime allows it. */
  userAgent?: string;
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
  mode?: "keyword" | "semantic";
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
 * a client, the keys it pinned. */
export interface SigningKeys {
  origin: string;
  keys: (KeyRef & { status?: "current" | "retired" | "revoked"; endorsedBy?: string })[];
  endorsements?: { kid: string; by: string; sig: string }[];
}
export interface CreateProjectInput {
  slug: string;
  title: string;
  readme: string;
  schemaDef: { fields: SchemaField[]; allowExtra?: boolean };
  license?: string;
  tags?: string[];
  access?: "public" | "paid";
  visibility?: "public" | "private";
}
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

type Query = Record<string, string | number | boolean | undefined | null>;
interface RequestInit2 {
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
const DEFAULT_BASE_URL = "http://localhost:3000";
const MIN_PART_SIZE = 5 * 1024 * 1024; // S3 multipart rule for every part but the last
const MAX_PARTS = 1000;

function env(name: string): string | undefined {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return p?.env?.[name];
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class Witan {
  readonly baseUrl: string;
  readonly apiKey: string | undefined;
  readonly payUrl: string;
  readonly projects: Projects;
  private readonly fetchImpl: typeof fetch;
  private readonly retries: number;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(opts: WitanOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? env("WITAN_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiKey = opts.apiKey ?? env("WITAN_API_KEY") ?? undefined;
    this.payUrl = (opts.payUrl ?? env("WITAN_PAY_URL") ?? "http://localhost:3001").replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") throw new Error("witan-sdk needs a global fetch (Node 18+) or the `fetch` option");
    this.retries = opts.retries ?? 2;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.userAgent = opts.userAgent ?? "witan-sdk-js/0.5.0";
    this.projects = new Projects(this);
  }

  // ---------- knowledge ----------

  /** Published knowledge units matching `q` (keyword by default, `mode: "semantic"` for embedding rank). Public. */
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
   * it is the buyer: the pay service issues a short statement and `sign` — your wallet's
   * personal_sign, e.g. viem's `account.signMessage({ message })` — signs it; only the signature is
   * sent. Page with `before: next`.
   */
  async purchases(opts: { address: string; sign: (statement: string) => Promise<string>; limit?: number; before?: string }): Promise<{
    wallet: string;
    purchases: Purchase[];
    next: string | null;
  }> {
    const address = opts.address.toLowerCase();
    const issued = (await parseBody(await this.payFetch(`/purchases/statement?wallet=${enc(address)}`))) as { statement: string; time: number };
    const signature = await opts.sign(issued.statement);
    const query = new URLSearchParams({ limit: String(opts.limit ?? 50), ...(opts.before ? { before: opts.before } : {}) });
    const res = await this.payFetch(`/purchases?${query}`, {
      "x-witan-wallet": address,
      "x-witan-time": String(issued.time),
      "x-witan-signature": signature,
    });
    return (await parseBody(res)) as { wallet: string; purchases: Purchase[]; next: string | null };
  }

  /** A GET to the pay service — no API key there; non-2xx throws like any call. */
  private async payFetch(path: string, headers: Record<string, string> = {}): Promise<Response> {
    const res = await this.fetchImpl(this.payUrl + path, { headers: { accept: "application/json", ...headers }, signal: timeoutSignal(this.timeoutMs) });
    if (!res.ok) throw await toError(res);
    return res;
  }

  /**
   * The keys this origin signs version manifests with. Fetch them once where you trust the origin
   * and keep them with your agent's config; `verifyManifest` then checks copies from anywhere,
   * following a key rotation through the signature's endorsements. To refresh the stored keys
   * later without trusting whatever the server says, pass both to `updatePinnedKeys`.
   */
  async keys(): Promise<SigningKeys> {
    const { data } = await this.request<SigningKeys>("GET", "/.well-known/witan-keys", { idempotent: true });
    return data;
  }

  // ---------- transport ----------

  /** One request, parsed. Throws WitanError / PaymentRequiredError on non-2xx. */
  async request<T>(method: string, path: string, init: RequestInit2 = {}): Promise<{ data: T; headers: Headers }> {
    const res = await this.send(method, path, init);
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
        });
      } catch (e) {
        lastError = e;
        continue;
      }
      if (res.ok) return res;
      if (RETRY_STATUS.has(res.status) && attempt < attempts - 1) {
        lastError = await toError(res);
        continue;
      }
      throw await toError(res);
    }
    throw lastError instanceof Error ? lastError : new WitanError(0, String(lastError));
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
   * serve it and only the origin needs trusting.
   */
  async manifest(slug: string, opts: { version?: number; verify?: SigningKeys } = {}): Promise<Manifest> {
    const { data } = await this.c.request<Manifest>("GET", `/projects/${enc(slug)}/manifest`, {
      query: { version: opts.version }, auth: true, idempotent: true,
    });
    if (opts.verify) await verifyManifest(data, opts.verify, { require: true });
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
        body: { bytes: body.length, parts, sourceDeclaration: opts.sourceDeclaration, compression: gzip ? "gzip" : "none" },
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
 * signed for another origin, with a key that is revoked or that neither is pinned nor is reached by
 * the signature's endorsements from a pinned key, or does not match — and, with `require`, when it
 * is unsigned. Uses WebCrypto Ed25519 (Node 20+, Deno, Bun, Cloudflare Workers).
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
  const revoked = new Set(keys.keys.filter((k) => k.status === "revoked").map((k) => k.kid));
  if (revoked.has(sig.kid)) throw new SignatureError(`${what} is signed with key ${sig.kid}, which ${origin} revoked`);
  const known = new Map<string, KeyRef>(keys.keys.filter((k) => k.status !== "revoked").map((k) => [k.kid, k]));
  let key = known.get(sig.kid);
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
 * Refresh keys you pinned with a fresh `keys()` document, without trusting it blindly: a new key
 * is added only when a pinned key endorsed it (directly or through a chain); keys the origin marks
 * revoked are marked revoked; anything else is `refused` — unless `force` (re-pinning by hand,
 * after checking the key id with the operator). Store the returned `keys` in place of the old.
 */
export async function updatePinnedKeys(
  pinned: SigningKeys,
  published: SigningKeys,
  opts: { force?: boolean } = {},
): Promise<{ keys: SigningKeys; added: string[]; refused: string[]; revoked: string[] }> {
  const origin = pinned.origin.replace(/\/+$/, "");
  if (published.origin.replace(/\/+$/, "") !== origin) {
    throw new SignatureError(`these keys are ${published.origin}'s, not ${origin}'s`);
  }
  const revokedNow = new Set(published.keys.filter((k) => k.status === "revoked").map((k) => k.kid));
  const marked: string[] = [];
  const entries = pinned.keys.map((k) => {
    if (revokedNow.has(k.kid) && k.status !== "revoked") {
      marked.push(k.kid);
      return { ...k, status: "revoked" as const };
    }
    return k;
  });
  const revoked = new Set([...revokedNow, ...entries.filter((k) => k.status === "revoked").map((k) => k.kid)]);
  const known = new Map<string, KeyRef>(entries.filter((k) => k.status !== "revoked").map((k) => [k.kid, k]));
  const live = published.keys.filter((k) => k.status !== "revoked");
  const byKid = new Map(live.map((k) => [k.kid, k]));
  const links: ChainLink[] = (published.endorsements ?? [])
    .filter((e) => byKid.has(e.kid))
    .map((e) => ({ kid: e.kid, alg: "Ed25519", publicKey: byKid.get(e.kid)!.publicKey, by: e.by, sig: e.sig }));
  const learned = await walkEndorsements(origin, links, known, revoked, null, `${origin}'s published keys`);
  const learnedIds = new Set(learned.map((k) => k.kid));
  let refused = live.filter((k) => !known.has(k.kid) && !learnedIds.has(k.kid));
  const forced: KeyRef[] = [];
  if (opts.force) {
    for (const k of refused) {
      if ((await kidOf(k.publicKey)) !== k.kid) throw new SignatureError(`${origin} published key ${k.kid} under the wrong id`);
      forced.push({ kid: k.kid, alg: "Ed25519", publicKey: k.publicKey });
    }
    refused = [];
  }
  return {
    keys: { origin, keys: [...entries, ...learned, ...forced.map((k) => ({ ...k }))] },
    added: [...learned, ...forced].map((k) => k.kid),
    refused: refused.map((k) => k.kid),
    revoked: marked,
  };
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

/** The bytes an origin signs: {v, origin, manifest} with the manifest as published (no URLs), in stable JSON. */
export function signedStatement(manifest: Record<string, unknown>, origin: string): string {
  const { signature: _s, urlExpiresAt: _u, paid: _p, ...content } = manifest;
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
  const message = typeof record.error === "string" ? record.error : `${res.status} ${res.statusText}`;
  return new WitanError(res.status, message, body);
}
