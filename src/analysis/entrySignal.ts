import { TrendDirection, TrendAnalysis } from "./dowTheory.js";

// USDJPY の 1 pip = 0.01
const PIP_VALUE = 0.01;
const SL_BUFFER_PIPS = 5;
const RR_RATIO = 2;
const ENTRY_PROXIMITY_PIPS = 10;

export interface EntrySignal {
  shouldNotify: boolean;
  direction: TrendDirection;
  currentPrice: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  slPips: number;
  tpPips: number;
  rrRatio: string;
  proximityPips: number;
  rationale: string;
}

/**
 * 複数時間軸の分析結果から、エントリーシグナルを算出する
 *
 * @param currentPrice 現在の価格（最新ローソク足のclose）
 * @param direction エントリー方向（UP/DOWN）
 * @param d1Analysis 日足分析結果
 * @param h4Analysis 4時間足分析結果
 * @param h1Analysis 1時間足分析結果
 */
export function calcEntrySignal(
  currentPrice: number,
  direction: TrendDirection,
  d1Analysis: TrendAnalysis,
  h4Analysis: TrendAnalysis,
  h1Analysis: TrendAnalysis,
  m15Analysis: TrendAnalysis
): EntrySignal | null {
  if (direction === "RANGE") return null;

  if (direction === "UP") {
    return calcBuySignal(currentPrice, d1Analysis, h4Analysis, h1Analysis, m15Analysis);
  } else {
    return calcSellSignal(currentPrice, d1Analysis, h4Analysis, h1Analysis, m15Analysis);
  }
}

function calcBuySignal(
  currentPrice: number,
  d1: TrendAnalysis,
  h4: TrendAnalysis,
  h1: TrendAnalysis,
  m15: TrendAnalysis
): EntrySignal | null {
  // M15 のスウィングローを優先、なければ H1 にフォールバック
  const entrySwingLow = m15.latestSwingLow ?? h1.latestSwingLow;
  const h4SwingLow = h4.latestSwingLow;
  const entryTf = m15.latestSwingLow ? "M15" : "H1";

  if (!entrySwingLow || !h4SwingLow) return null;

  // エントリーポイント: M15（or H1）スウィングロー付近（押し目）
  const entryPrice = entrySwingLow.price + SL_BUFFER_PIPS * PIP_VALUE;

  // SL: H4スウィングローの5pips下
  const stopLoss = h4SwingLow.price - SL_BUFFER_PIPS * PIP_VALUE;
  const slPips = Math.round((entryPrice - stopLoss) / PIP_VALUE);

  if (slPips <= 0) return null;

  const tpPips = slPips * RR_RATIO;
  const takeProfit = entryPrice + tpPips * PIP_VALUE;

  // 現在価格とエントリーポイントの距離
  const proximityPips = Math.round(
    Math.abs(currentPrice - entryPrice) / PIP_VALUE
  );
  const shouldNotify = proximityPips <= ENTRY_PROXIMITY_PIPS;

  return {
    shouldNotify,
    direction: "UP",
    currentPrice,
    entryPrice: roundPrice(entryPrice),
    stopLoss: roundPrice(stopLoss),
    takeProfit: roundPrice(takeProfit),
    slPips,
    tpPips,
    rrRatio: `1:${RR_RATIO}`,
    proximityPips,
    rationale: `日足↑ 4H↑ 1H↑ ${entryTf}押し目圏内（スウィングロー: ${entrySwingLow.price.toFixed(3)}）`,
  };
}

function calcSellSignal(
  currentPrice: number,
  d1: TrendAnalysis,
  h4: TrendAnalysis,
  h1: TrendAnalysis,
  m15: TrendAnalysis
): EntrySignal | null {
  // M15 のスウィングハイを優先、なければ H1 にフォールバック
  const entrySwingHigh = m15.latestSwingHigh ?? h1.latestSwingHigh;
  const h4SwingHigh = h4.latestSwingHigh;
  const entryTf = m15.latestSwingHigh ? "M15" : "H1";

  if (!entrySwingHigh || !h4SwingHigh) return null;

  // エントリーポイント: M15（or H1）スウィングハイ付近（戻り目）
  const entryPrice = entrySwingHigh.price - SL_BUFFER_PIPS * PIP_VALUE;

  // SL: H4スウィングハイの5pips上
  const stopLoss = h4SwingHigh.price + SL_BUFFER_PIPS * PIP_VALUE;
  const slPips = Math.round((stopLoss - entryPrice) / PIP_VALUE);

  if (slPips <= 0) return null;

  const tpPips = slPips * RR_RATIO;
  const takeProfit = entryPrice - tpPips * PIP_VALUE;

  // 現在価格とエントリーポイントの距離
  const proximityPips = Math.round(
    Math.abs(currentPrice - entryPrice) / PIP_VALUE
  );
  const shouldNotify = proximityPips <= ENTRY_PROXIMITY_PIPS;

  return {
    shouldNotify,
    direction: "DOWN",
    currentPrice,
    entryPrice: roundPrice(entryPrice),
    stopLoss: roundPrice(stopLoss),
    takeProfit: roundPrice(takeProfit),
    slPips,
    tpPips,
    rrRatio: `1:${RR_RATIO}`,
    proximityPips,
    rationale: `日足↓ 4H↓ 1H↓ ${entryTf}戻り目圏内（スウィングハイ: ${entrySwingHigh.price.toFixed(3)}）`,
  };
}

function roundPrice(price: number): number {
  return Math.round(price * 1000) / 1000;
}
