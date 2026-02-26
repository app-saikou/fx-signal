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

/**
 * ダウ理論に基づいてトレンド方向を判断する
 * - UP: 高値切り上げ + 安値切り上げ
 * - DOWN: 高値切り下げ + 安値切り下げ
 * - RANGE: それ以外
 *
 * @param candles 新しい順のローソク足配列
 * @param lookback スウィングポイント検出の左右比較本数
 */
export function analyzeTrend(
  candles: Candle[],
  lookback = 3
): TrendAnalysis {
  const swings = detectSwingPoints(candles, lookback);
  const recentHighs = getRecentSwingHighs(swings, 3);
  const recentLows = getRecentSwingLows(swings, 3);

  const latestSwingHigh = recentHighs[0] ?? null;
  const latestSwingLow = recentLows[0] ?? null;

  const direction = determineTrend(recentHighs, recentLows);
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
  lows: SwingPoint[]
): TrendDirection {
  // 直近2つ以上のスウィングポイントが必要
  if (highs.length < 2 || lows.length < 2) {
    return "RANGE";
  }

  // 新しい順なので [0] が最新、[1] がその前
  const highsRising =
    highs[0].price > highs[1].price &&
    (highs.length < 3 || highs[1].price > highs[2].price);
  const highsFalling =
    highs[0].price < highs[1].price &&
    (highs.length < 3 || highs[1].price < highs[2].price);

  const lowsRising =
    lows[0].price > lows[1].price &&
    (lows.length < 3 || lows[1].price > lows[2].price);
  const lowsFalling =
    lows[0].price < lows[1].price &&
    (lows.length < 3 || lows[1].price < lows[2].price);

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
