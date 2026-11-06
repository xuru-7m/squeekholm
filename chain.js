// Chain access: Sepolia reads, simulated and gas-checked writes, and replay logs.
import {
  createPublicClient, createWalletClient, custom, http, getAddress, isAddress, parseAbiItem, parseEventLogs,
} from "https://esm.sh/viem@2.21.0";
import { sepolia } from "https://esm.sh/viem@2.21.0/chains";
import { GAME_ABI } from "./abi.js";
import { GAME_ADDRESS, RPC_URL, API_BASE } from "./config.js";

const params = new URLSearchParams(location.search);
const qsGame = params.get("game");
export const gameAddress = isAddress(qsGame ?? "") ? getAddress(qsGame)
  : (isAddress(GAME_ADDRESS) ? getAddress(GAME_ADDRESS) : null);
// ?rpc= is for local testing against an anvil fork.
export const pub = createPublicClient({ chain: sepolia, transport: http(params.get("rpc") || RPC_URL), batch: { multicall: true } });

const NFT_ABI = [
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "string" }] },
];
const ADVANCED = parseAbiItem(
  "event Advanced(uint256 indexed runId, uint256 indexed tokenId, address indexed player, uint16 fromFloor, uint16 toFloor, uint32 score, bool dead, bool fled, bool won, bytes tape)",
);
/** Stay well under what Sepolia blocks accept for one checkpoint transaction. */
export const GAS_BUDGET = 25_000_000n;

export const read = (functionName, args = []) =>
  pub.readContract({ address: gameAddress, abi: GAME_ABI, functionName, args });

let wallet = null;
export let account = null;

export async function connectWallet() {
  if (!window.ethereum) throw new Error("No injected wallet found. Install MetaMask or Rabby.");
  wallet = createWalletClient({ chain: sepolia, transport: custom(window.ethereum) });
  const [addr] = await wallet.requestAddresses();
  try { await wallet.switchChain({ id: sepolia.id }); } catch {
    try { await wallet.addChain({ chain: sepolia }); } catch { /* declined */ }
  }
  account = getAddress(addr);
  window.ethereum.on?.("accountsChanged", () => location.reload());
  window.ethereum.on?.("chainChanged", () => location.reload());
  return account;
}

/** Gas a call would use from the connected account, or null if it would revert. */
export async function estimate(functionName, args) {
  try {
    return await pub.estimateContractGas({ address: gameAddress, abi: GAME_ABI, functionName, args, account });
  } catch { return null; }
}

/** Simulate from the signer first, then ask the wallet to sign. Returns the receipt's decoded events. */
export async function write(functionName, args, onStatus, gas) {
  onStatus?.("Simulating…");
  const { request } = await pub.simulateContract({ address: gameAddress, abi: GAME_ABI, functionName, args, account, ...(gas ? { gas } : {}) });
  onStatus?.("Confirm in your wallet…");
  const hash = await wallet.writeContract(request);
  onStatus?.("Waiting for confirmation…", hash);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction reverted (${hash})`);
  return { hash, receipt, events: parseEventLogs({ abi: GAME_ABI, logs: receipt.logs }) };
}

/** Squeek IDs the API suggests for an address; eligibility is always re-checked onchain. */
export async function suggestedSqueeks(addr) {
  const ids = [];
  try {
    let cursor = null;
    do {
      const q = new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) });
      const page = await (await fetch(`${API_BASE}/v1/accounts/${addr}?${q}`)).json();
      if (page.status !== "available") break;
      page.tokens.forEach((t) => ids.push(BigInt(t.tokenId)));
      cursor = page.nextCursor;
    } while (cursor);
  } catch { /* the player can still add IDs by hand */ }
  return ids;
}

/** The Squeek's onchain metadata: SVG image (as text, treated strictly as data). */
export async function squeekArt(nftAddress, tokenId) {
  try {
    const uri = await pub.readContract({ address: nftAddress, abi: NFT_ABI, functionName: "tokenURI", args: [tokenId] });
    if (!uri.startsWith("data:application/json;base64,")) return null;
    const json = JSON.parse(atob(uri.split(",")[1]));
    if (typeof json.image !== "string" || !json.image.startsWith("data:image/svg+xml;base64,")) return null;
    return { image: json.image, svg: atob(json.image.split(",")[1]) };
  } catch { return null; }
}

/** Every checkpointed tape of a run, in order, from its Advanced logs. */
export async function runTape(runId, startBlock) {
  const latest = await pub.getBlockNumber();
  const STEP = 9000n;
  const tapes = [];
  for (let from = BigInt(startBlock); from <= latest; from += STEP) {
    const to = from + STEP - 1n > latest ? latest : from + STEP - 1n;
    const logs = await pub.getLogs({ address: gameAddress, event: ADVANCED, args: { runId }, fromBlock: from, toBlock: to });
    for (const l of logs) tapes.push(l.args.tape);
  }
  return tapes;
}

export async function liveWheel() {
  try {
    const s = await (await fetch(`${API_BASE}/v1/status`, { headers: { accept: "application/json" } })).json();
    const m = s.measurement ?? {};
    if (m.freshness !== "online") return { known: false };
    return { known: true, spinning: m.coreStatus && m.coreStatus !== "IDLE", rpm: (m.rpmMilli ?? 0) / 1000 };
  } catch { return { known: false }; }
}
