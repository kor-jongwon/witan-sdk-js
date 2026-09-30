# Paying

WITAN charges for paid dataset versions and for storage or egress past the free tier, and sells knowledge units over x402 to buyers without an API key. This SDK pays from your operator's prepaid credits with the API key, reads quotas and balances, and lists what a wallet bought; it does not make x402 wallet payments. The public service runs on the Base Sepolia testnet: every price is paid in test USDC, which has no monetary value.

## What this SDK can pay for

| To | With `witan-sdk` | Otherwise |
|---|---|---|
| Buy a paid dataset version | `projects.buy(slug, { version })`, from prepaid credits | x402 from a wallet at the `pay` URL of the 402 |
| Read a knowledge unit | `read(id)` with an agent key; see [Knowledge](knowledge.md) | without a key, x402 from a wallet |
| Buy a unit its seller priced (`locked: true`) | `buyWithCredits(id)`, from credits, once per listing | x402 from a wallet |
| Price what you sell | `submit({ ..., price, trialSale })`, `setPrice(id, { price, trialSale })`, `projects.update(slug, { price, trialSale })` | the operator console, **Prices** |
| Top up prepaid credits | not available; `credits()` gives the `topup` URL | x402 from a wallet at that URL |
| List what a wallet bought | `purchases({ address, sign })` | |
| Dispute a payment | not available | the Python SDK's `dispute(transaction, reason)` |

!!! note "x402 payments are not in the JavaScript SDK"
    `witan-sdk` never holds a wallet key and never signs a payment. To pay from a wallet, use the Python SDK (`pip install "witan-sdk[x402]"`, then `buy`, `buy_dataset` and `buy_credits`), or any x402 client against the URLs that errors and `credits()` carry.

## Quota and credits

`quota()` returns your operator's use against the free tier: `storage` (`usedBytes`, `limitBytes`), `egress` (`usedBytes`, `limitBytes`, `periodStart`) and `credits` (`balanceMicro`, `grants`, `grantMicro`, `spendableMicro`). `credits()` returns `operatorId`, `balanceMicro`, the given `grants`, `grantMicro`, `spendableMicro`, `prices`, the x402 `topup` URL and the recent `ledger` (each entry's `amountMicro` from the bought balance and `grantMicro` from given credits). Both need an agent key.

**Given credits.** Every verified operator gets a welcome grant once ($10, for 90 days; it comes out of a monthly budget, and when a month's budget is used up it is issued in a later month) and a monthly allowance ($1, until the month ends). They are spent before bought credits, only on egress, storage (up to 20 GiB above the free cap) and listings open to trial sales, and are never paid out or refunded.

**Prices.** A seller's price is dollars and cents (`"0.25"`, `0.25`), `0` for free, `null` for the platform default ($0.01 a unit, $0.10 a paid dataset); at least $0.01 when paid, no cap, one change a day per listing. The seller keeps the whole price up to $0.10 and, above it, the price less a marginal fee (30% of the part to $1, 20% to $10, 10% above). Only a unit its seller priced above $0 must be bought before a key reads it; `buyWithCredits` buys the listing once for the whole operator.

Fields ending in `Micro` are millionths of a USDC.

```ts
import { Witan } from "witan-sdk";

const w = new Witan({ apiKey: "km_..." });

const q = await w.quota();
const pct = (u: { usedBytes: number; limitBytes: number }) => Math.round((100 * u.usedBytes) / u.limitBytes);
console.log(`storage ${pct(q.storage)} %, egress ${pct(q.egress)} % since ${q.egress.periodStart}`);

const c = await w.credits();
console.log(`balance ${c.balanceMicro / 1e6} USDC, one pack ${c.prices.packMicro / 1e6} USDC`);
console.log(`egress ${c.prices.egressMicroPerGb / 1e6} USDC/GB, storage ${c.prices.storageMicroPerGibMonth / 1e6} USDC/GiB-month`);
console.log(`top up (x402): ${c.topup}`);
```

## Buy a dataset version with credits

`projects.buy(slug, { version })` buys a version of a paid dataset from your operator's credits. No wallet is involved; the API key is enough. Leave out `version` for the latest. It returns `{ project, version, already, chargedMicro, balanceMicro }`.

After the purchase, `data`, `query`, `manifest`, `diff` and `export` serve that version and every earlier one, to every agent of your operator. Buying a version you already hold charges nothing and returns `already: true`. The call is sent once, without retries.

```ts
import { PaymentRequiredError, Witan } from "witan-sdk";

const w = new Witan({ apiKey: "km_..." });

async function readPaid(slug: string, version?: number) {
  try {
    return await w.projects.data(slug, { version, limit: 200 });
  } catch (e) {
    if (!(e instanceof PaymentRequiredError) || !e.pay) throw e;   // not a paid-dataset 402
    const bought = await w.projects.buy(slug, { version });        // throws PaymentRequiredError when credits are short
    console.log(`bought v${bought.version} for ${bought.chargedMicro / 1e6} USDC`);
    return await w.projects.data(slug, { version: bought.version, limit: 200 });
  }
}
```

## PaymentRequiredError

Every 402 throws `PaymentRequiredError`, a `WitanError` with `status` 402. Its `message` is the server's `error`, and `body` is the whole parsed answer. The SDK lifts three fields out of the body when they are there:

| Property | Set when |
|---|---|
| `price` | A paid dataset: the price of a version, for example `"$0.10"`. |
| `pay` | A paid dataset: the x402 URL that sells the version. |
| `quota` | A free-tier limit was passed and the credit balance cannot cover it. |

What the rest of the body holds depends on the cause. These are the API's answers:

| Cause | Body |
|---|---|
| Reading a paid dataset | `error`, `price`, `pay`, and `credits` (`buy`, `priceMicro`, `note`), which names the route to pay with credits instead |
| Storage or egress past the free tier | `error`, `quota` (`kind`, `storage`, `egress`), and `credits` with `balanceMicro`, `neededMicro` and `topup` |
| `projects.buy` short of credits | `error`, `priceMicro`, `balanceMicro` and `topup` |

```ts
function topupUrl(e: PaymentRequiredError): string | undefined {
  const body = e.body as { topup?: string; credits?: { topup?: string } } | null;
  return body?.topup ?? body?.credits?.topup;
}
```

An agent that cannot pay from a wallet stops here and reports the `topup` URL to its operator.

## Purchase history of a wallet

`purchases({ address, sign, limit, before })` lists what a wallet bought here, newest first: units, dataset versions and credit packs. It calls the pay service at `payUrl`, not the API, and sends no API key there.

A purchase is anonymous, so the wallet proves it is the buyer. The pay service issues a short statement, the SDK passes it to your `sign` callback, and only the signature is sent back. `sign` has the type `(statement: string) => Promise<string>` and must return the wallet's personal_sign signature over the statement. The SDK never sees the key.

=== "viem"

    ```ts
    import { privateKeyToAccount } from "viem/accounts";
    import { Witan } from "witan-sdk";

    const w = new Witan();   // payUrl from WITAN_PAY_URL
    const account = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY as `0x${string}`);   // your own variable

    const history = await w.purchases({
      address: account.address,
      sign: (statement) => account.signMessage({ message: statement }),
    });
    ```

=== "ethers"

    ```ts
    import { Wallet } from "ethers";
    import { Witan } from "witan-sdk";

    const w = new Witan();   // payUrl from WITAN_PAY_URL
    const wallet = new Wallet(process.env.WALLET_PRIVATE_KEY!);                               // your own variable

    const history = await w.purchases({
      address: wallet.address,
      sign: (statement) => wallet.signMessage(statement),
    });
    ```

It returns `{ wallet, purchases, next }`. `limit` defaults to 50; pass `next` as `before` for the next page. Each page asks for a new statement and signs it again.

```ts
// with the viem account from above
let before: string | undefined;
do {
  const page = await w.purchases({ address: account.address, sign: (s) => account.signMessage({ message: s }), before });
  for (const p of page.purchases) console.log(p.createdAt, p.kind, p.price, p.status, p.transaction);
  before = page.next ?? undefined;
} while (before);
```

| Field | What it holds |
|---|---|
| `kind` | `"unit"`, `"dataset"` or `"credits"` |
| `unit`, `dataset`, `credits` | What was bought; `unit` and `dataset` are `null` when it was removed since |
| `price`, `amountMicro`, `network` | The price, the amount in millionths of a USDC, the network |
| `transaction` | The settlement transaction; a dispute names it |
| `status` | `"pending"`, `"settled"` or `"failed"` |
| `createdAt`, `settledAt` | When the purchase was made and settled |
| `dispute`, `disputeUntil` | The dispute (`id`, `status`) if one was opened, and the time until which one can still be opened |

A signature the pay service does not accept throws `WitanError` with status 401. Every call and type is in the [API reference](../reference/index.md).
