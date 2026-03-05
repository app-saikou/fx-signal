import { fetchHistoricalCandles } from "./fetchHistorical.js";
import { loadCandles, saveCandles } from "./dataStore.js";
import { analyzeTrendByMA } from "../analysis/dowTheory.js";
import { calcEntrySignal } from "../analysis/entrySignal.js";
import type { TrendDirection } from "../analysis/dowTheory.js";
import type { TimeFrame } from "../api/alphaVantage.js";

// ① H4+H1の一致のみ確認（D1は除外）
function isH4H1Aligned(
  h4: TrendDirection,
  h1: TrendDirection
): { aligned: boolean; direction: "UP" | "DOWN" } | null {
  if (h4 === "UP" && h1 === "UP") return { aligned: true, direction: "UP" };
  if (h4 === "DOWN" && h1 === "DOWN") return { aligned: true, direction: "DOWN" };
  return null;
}

const PIP_VALUE = 0.01;
const LOOKBACK_BARS = 100;
// SL/TPに届くまで保有（データが尽きた場合のみTIMEOUT）
const MAX_BARS_HELD = 5000;
const SLEEP_MS = 10_000;
// SLが狭すぎる（ノイズでヒット）・広すぎる（リスク過大）エントリーを除外
const MIN_SL_PIPS = 15;
const MAX_SL_PIPS = 80;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BacktestRecord {
  timestamp: string;
  direction: "UP" | "DOWN";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  slPips: number;
  tpPips: number;
  proximityPips: number;
  outcome: "WIN" | "LOSS" | "TIMEOUT";
  actualPips: number;
  barsHeld: number;
}

/** ローカルCSVがあればそちらを使い、なければAPIから取得してCSVに保存 */
async function loadOrFetch(tf: TimeFrame, apiKey: string): Promise<ReturnType<typeof loadCandles>> {
  const cached = loadCandles(tf);
  if (cached.length > 0) {
    console.log(`${tf}: ${cached.length}本 (ローカルキャッシュ)`);
    return cached;
  }
  const candles = await fetchHistoricalCandles(tf, apiKey);
  saveCandles(tf, candles);
  console.log(`${tf}: ${candles.length}本 取得・保存完了`);
  return candles;
}

export async function runBacktest(apiKey: string): Promise<BacktestRecord[]> {
  console.log("過去データを読み込み中...");

  const d1Candles = await loadOrFetch("D1", apiKey);
  await sleep(SLEEP_MS);

  const h4Candles = await loadOrFetch("H4", apiKey);
  await sleep(SLEEP_MS);

  const h1Candles = await loadOrFetch("H1", apiKey);
  await sleep(SLEEP_MS);

  const m15Candles = await loadOrFetch("M15", apiKey);

  const records: BacktestRecord[] = [];
  // ルックバック確保のため最初のLOOKBACK_BARS本はスキップ
  // SL/TPに届くまで保有するため末尾予備は不要（データ尽きたらTIMEOUT）
  const endIndex = m15Candles.length - 1;

  console.log(`\nシミュレーション開始... (対象バー: ${LOOKBACK_BARS} 〜 ${endIndex - 1})`);

  // ポジション決済後まで次のエントリーをスキップするインデックス
  let nextEntryIndex = LOOKBACK_BARS;
  // 直前にLOSSになったエントリー価格とSL（同一シグナルへの再エントリー防止）
  let lastLossEntryPrice: number | null = null;
  let lastLossStopLoss: number | null = null;

  for (let i = LOOKBACK_BARS; i < endIndex; i++) {
    // 前のポジションがまだ保有中はスキップ
    if (i < nextEntryIndex) continue;
    const currentBar = m15Candles[i];
    const timestamp = currentBar.time;
    const currentPrice = currentBar.close;

    // 各時間軸をtimestampまでフィルタし、新しい順に並び替える（analyzeTrendが新しい順を期待）
    const d1Slice = d1Candles.filter((c) => c.time <= timestamp).reverse();
    const h4Slice = h4Candles.filter((c) => c.time <= timestamp).reverse();
    const h1Slice = h1Candles.filter((c) => c.time <= timestamp).reverse();
    // M15はsliceで取得済みなので reverseのみ
    const m15Slice = m15Candles.slice(0, i + 1).reverse();

    // データ不足はスキップ
    if (
      d1Slice.length < 10 ||
      h4Slice.length < 10 ||
      h1Slice.length < 10 ||
      m15Slice.length < 10
    ) {
      continue;
    }

    // トレンド分析（MA傾きベース: MA20, 比較10本前）
    const d1Analysis = analyzeTrendByMA(d1Slice);
    const h4Analysis = analyzeTrendByMA(h4Slice);
    const h1Analysis = analyzeTrendByMA(h1Slice);
    const m15Analysis = analyzeTrendByMA(m15Slice);

    // ① H4+H1 両方が同方向に揃った場合のみ続行
    const aligned = isH4H1Aligned(h4Analysis.direction, h1Analysis.direction);
    if (!aligned) continue;
    const direction = aligned.direction;

    // エントリーシグナル計算
    const signal = calcEntrySignal(
      currentPrice,
      direction,
      d1Analysis,
      h4Analysis,
      h1Analysis,
      m15Analysis
    );

    if (!signal) continue;

    // ③ proximityPips ≤ 20 のシグナルのみ記録（エントリー精度向上）
    if (signal.proximityPips > 20) continue;

    // ④ M15も同方向である場合のみエントリー（逆行押し目を除外）
    if (m15Analysis.direction !== "RANGE" && m15Analysis.direction !== direction) continue;

    // ⑥ SLが狭すぎる・広すぎるエントリーを除外
    if (signal.slPips < MIN_SL_PIPS || signal.slPips > MAX_SL_PIPS) continue;

    // ⑦ 直前のLOSSと同一エントリー価格・SLのシグナルは再エントリーしない
    if (
      lastLossEntryPrice !== null &&
      lastLossStopLoss !== null &&
      signal.entryPrice === lastLossEntryPrice &&
      signal.stopLoss === lastLossStopLoss
    ) continue;

    const { entryPrice, stopLoss, takeProfit, slPips, tpPips, proximityPips } =
      signal;
    const alignedDirection = direction;

    // 未来バーで結果判定
    let outcome: "WIN" | "LOSS" | "TIMEOUT" = "TIMEOUT";
    let actualPips = 0;
    let barsHeld = MAX_BARS_HELD;

    for (let j = 1; j <= MAX_BARS_HELD; j++) {
      const futureBar = m15Candles[i + j];
      if (!futureBar) {
        barsHeld = j - 1;
        break;
      }

      if (alignedDirection === "UP") {
        if (futureBar.low <= stopLoss) {
          outcome = "LOSS";
          actualPips = -slPips;
          barsHeld = j;
          break;
        }
        if (futureBar.high >= takeProfit) {
          outcome = "WIN";
          actualPips = tpPips;
          barsHeld = j;
          break;
        }
      } else {
        // DOWN
        if (futureBar.high >= stopLoss) {
          outcome = "LOSS";
          actualPips = -slPips;
          barsHeld = j;
          break;
        }
        if (futureBar.low <= takeProfit) {
          outcome = "WIN";
          actualPips = tpPips;
          barsHeld = j;
          break;
        }
      }
    }

    // TIMEOUT の場合は最終バー終値とエントリー価格の差をpipsで算出
    if (outcome === "TIMEOUT") {
      const lastBar = m15Candles[i + barsHeld];
      if (lastBar) {
        const priceDiff =
          alignedDirection === "UP"
            ? lastBar.close - entryPrice
            : entryPrice - lastBar.close;
        actualPips = Math.round((priceDiff / PIP_VALUE) * 10) / 10;
      }
    }

    records.push({
      timestamp,
      direction: alignedDirection,
      entryPrice,
      stopLoss,
      takeProfit,
      slPips,
      tpPips,
      proximityPips,
      outcome,
      actualPips,
      barsHeld,
    });

    // LOSSになったエントリー価格・SLを記録（同一シグナルへの再エントリー防止）
    if (outcome === "LOSS") {
      lastLossEntryPrice = entryPrice;
      lastLossStopLoss = stopLoss;
    } else {
      // WIN/TIMEOUTは制限をリセット
      lastLossEntryPrice = null;
      lastLossStopLoss = null;
    }

    // このポジションの決済バー後から次のエントリーを探す
    nextEntryIndex = i + barsHeld + 1;
  }

  return records;
}
