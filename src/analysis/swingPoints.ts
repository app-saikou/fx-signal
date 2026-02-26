import { Candle } from "../api/alphaVantage.js";

export interface SwingPoint {
  index: number;
  time: string;
  price: number;
  type: "high" | "low";
}

/**
 * ローソク足配列（新しい順）からスウィングハイ・スウィングローを検出する
 * @param candles 新しい順のローソク足配列
 * @param lookback 左右それぞれ比較する本数（デフォルト: 3）
 * @returns スウィングポイントの配列（新しい順）
 */
export function detectSwingPoints(
  candles: Candle[],
  lookback = 3
): SwingPoint[] {
  // 古い順に並び替えて検出し、最後に新しい順に戻す
  const asc = [...candles].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  const swings: SwingPoint[] = [];

  for (let i = lookback; i < asc.length - lookback; i++) {
    const current = asc[i];

    // スウィングハイ判定: 左右lookback本より高値が高い
    const isSwingHigh = checkSwingHigh(asc, i, lookback);
    // スウィングロー判定: 左右lookback本より安値が低い
    const isSwingLow = checkSwingLow(asc, i, lookback);

    if (isSwingHigh) {
      swings.push({
        index: i,
        time: current.time,
        price: current.high,
        type: "high",
      });
    }
    if (isSwingLow) {
      swings.push({
        index: i,
        time: current.time,
        price: current.low,
        type: "low",
      });
    }
  }

  // 新しい順に戻して返す
  return swings.sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );
}

function checkSwingHigh(asc: Candle[], i: number, lookback: number): boolean {
  const current = asc[i];
  for (let j = i - lookback; j <= i + lookback; j++) {
    if (j === i) continue;
    if (asc[j].high >= current.high) return false;
  }
  return true;
}

function checkSwingLow(asc: Candle[], i: number, lookback: number): boolean {
  const current = asc[i];
  for (let j = i - lookback; j <= i + lookback; j++) {
    if (j === i) continue;
    if (asc[j].low <= current.low) return false;
  }
  return true;
}

/**
 * 直近N個のスウィングハイを取得（新しい順）
 */
export function getRecentSwingHighs(
  swings: SwingPoint[],
  count = 3
): SwingPoint[] {
  return swings.filter((s) => s.type === "high").slice(0, count);
}

/**
 * 直近N個のスウィングローを取得（新しい順）
 */
export function getRecentSwingLows(
  swings: SwingPoint[],
  count = 3
): SwingPoint[] {
  return swings.filter((s) => s.type === "low").slice(0, count);
}
