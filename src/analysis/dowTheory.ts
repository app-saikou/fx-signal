import { Candle } from "../api/alphaVantage.js";
import {
  detectSwingPoints,
  getRecentSwingHighs,
  getRecentSwingLows,
  SwingPoint,
} from "./swingPoints.js";

export type TrendDirection = "UP" | "DOWN" | "RANGE";

export interface TrendAnalysis {
  direction: TrendDirection;
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  latestSwingHigh: SwingPoint | null;
  latestSwingLow: SwingPoint | null;
  reason: string;
}

const PIP_VALUE = 0.01;

/**
 * ダウ理論に基づいてトレンド方向を判断する
 * - UP: 高値切り上げ + 安値切り上げ
 * - DOWN: 高値切り下げ + 安値切り下げ
 * - RANGE: それ以外
 *
 * @param candles 新しい順のローソク足配列
 * @param lookback スウィングポイント検出の左右比較本数
 * @param minTrendPips 高値・安値の差分がこのpips未満ならRANGEと判定（デフォルト: 0 = 無効）
 */
export function analyzeTrend(
  candles: Candle[],
  lookback = 3,
  minTrendPips = 0
): TrendAnalysis {
  const swings = detectSwingPoints(candles, lookback);
  const recentHighs = getRecentSwingHighs(swings, 3);
  const recentLows = getRecentSwingLows(swings, 3);

  const latestSwingHigh = recentHighs[0] ?? null;
  const latestSwingLow = recentLows[0] ?? null;

  const direction = determineTrend(recentHighs, recentLows, minTrendPips);
  const reason = buildReason(direction, recentHighs, recentLows);

  return {
    direction,
    swingHighs: recentHighs,
    swingLows: recentLows,
    latestSwingHigh,
    latestSwingLow,
    reason,
  };
}

function determineTrend(
  highs: SwingPoint[],
  lows: SwingPoint[],
  minTrendPips = 0
): TrendDirection {
  // 直近2つ以上のスウィングポイントが必要
  if (highs.length < 2 || lows.length < 2) {
    return "RANGE";
  }

  // 新しい順なので [0] が最新、[1] がその前
  // 直近2つのスウィングポイントで判定（標準的なダウ理論）
  const highDiff = (highs[0].price - highs[1].price) / PIP_VALUE;
  const lowDiff = (lows[0].price - lows[1].price) / PIP_VALUE;

  const highsRising = highDiff > minTrendPips;
  const highsFalling = highDiff < -minTrendPips;
  const lowsRising = lowDiff > minTrendPips;
  const lowsFalling = lowDiff < -minTrendPips;

  if (highsRising && lowsRising) return "UP";
  if (highsFalling && lowsFalling) return "DOWN";
  return "RANGE";
}

function buildReason(
  direction: TrendDirection,
  highs: SwingPoint[],
  lows: SwingPoint[]
): string {
  if (direction === "UP") {
    return `高値切り上げ(${highs
      .slice(0, 2)
      .map((h) => h.price.toFixed(3))
      .join("→")}) + 安値切り上げ(${lows
      .slice(0, 2)
      .map((l) => l.price.toFixed(3))
      .join("→")})`;
  }
  if (direction === "DOWN") {
    return `高値切り下げ(${highs
      .slice(0, 2)
      .map((h) => h.price.toFixed(3))
      .join("→")}) + 安値切り下げ(${lows
      .slice(0, 2)
      .map((l) => l.price.toFixed(3))
      .join("→")})`;
  }
  return "トレンド不明瞭（レンジ）";
}

/**
 * 移動平均線の傾きでトレンドを判定する
 * - 現在のMA と slopePeriod本前のMA を比較
 * - スウィングポイントはエントリー価格計算のため引き続き取得
 *
 * @param candles 新しい順のローソク足配列
 * @param maPeriod MA期間（デフォルト: 20）
 * @param slopePeriod 傾き比較期間（デフォルト: 10）
 * @param minSlopePips この値以上の傾きでのみUP/DOWN判定（デフォルト: 3）
 */
export function analyzeTrendByMA(
  candles: Candle[],
  maPeriod = 20,
  slopePeriod = 10,
  minSlopePips = 3
): TrendAnalysis {
  const swings = detectSwingPoints(candles, 3);
  const recentHighs = getRecentSwingHighs(swings, 3);
  const recentLows = getRecentSwingLows(swings, 3);
  const latestSwingHigh = recentHighs[0] ?? null;
  const latestSwingLow = recentLows[0] ?? null;

  if (candles.length < maPeriod + slopePeriod) {
    return {
      direction: "RANGE",
      swingHighs: recentHighs,
      swingLows: recentLows,
      latestSwingHigh,
      latestSwingLow,
      reason: "データ不足",
    };
  }

  const currentMA = calcSMA(candles, maPeriod, 0);
  const prevMA = calcSMA(candles, maPeriod, slopePeriod);
  const slopePips = (currentMA - prevMA) / PIP_VALUE;

  const direction: TrendDirection =
    slopePips > minSlopePips ? "UP" :
    slopePips < -minSlopePips ? "DOWN" : "RANGE";

  return {
    direction,
    swingHighs: recentHighs,
    swingLows: recentLows,
    latestSwingHigh,
    latestSwingLow,
    reason: `MA${maPeriod}傾き: ${slopePips.toFixed(1)}pips → ${direction}`,
  };
}

function calcSMA(candles: Candle[], period: number, offset: number): number {
  let sum = 0;
  for (let i = offset; i < offset + period; i++) {
    sum += candles[i].close;
  }
  return sum / period;
}

/**
 * 複数時間軸のトレンドが一致しているか確認
 * D1 + H4 + H1 の3軸が同方向のときエントリー条件クリア
 */
export function isTrendAligned(
  d1: TrendDirection,
  h4: TrendDirection,
  h1: TrendDirection
): { aligned: boolean; direction: TrendDirection } {
  if (d1 === "UP" && h4 === "UP" && h1 === "UP") {
    return { aligned: true, direction: "UP" };
  }
  if (d1 === "DOWN" && h4 === "DOWN" && h1 === "DOWN") {
    return { aligned: true, direction: "DOWN" };
  }
  return { aligned: false, direction: "RANGE" };
}
