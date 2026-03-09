import { readFileSync, writeFileSync } from "fs";

const STATE_FILE = "./signal-state.json";
const ENTRY_CHANGE_THRESHOLD_PIPS = 10;
const PIPS_PER_UNIT = 0.01; // USDJPY: 1 pip = 0.01

interface SignalState {
  wasNear: boolean;
  lastEntryPrice: number | null;
}

function loadState(): SignalState {
  try {
    const raw = readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw) as SignalState;
  } catch {
    return { wasNear: false, lastEntryPrice: null };
  }
}

function saveState(state: SignalState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * エントリー接近のエッジ検出を行い、通知すべきかどうかを返す。
 *
 * - isNear=false → 状態リセット、通知しない
 * - isNear=true && wasNear=false → 初めて接近、通知する
 * - isNear=true && wasNear=true && エントリー価格が10pip以上変化 → 別ポイントへ変化、通知する
 * - isNear=true && wasNear=true && 変化なし → 既に通知済み、スキップ
 */
export function shouldSendEntryNotification(
  isNear: boolean,
  entryPrice: number
): boolean {
  const state = loadState();

  if (!isNear) {
    // 接近していない場合は状態をリセット（次回接近時に再通知できるよう）
    saveState({ wasNear: false, lastEntryPrice: null });
    return false;
  }

  if (!state.wasNear) {
    // 初めて接近
    saveState({ wasNear: true, lastEntryPrice: entryPrice });
    return true;
  }

  // 前回も接近していた場合、エントリー価格の変化を確認
  const priceDiff = Math.abs(entryPrice - (state.lastEntryPrice ?? entryPrice));
  const pipsDiff = priceDiff / PIPS_PER_UNIT;

  if (pipsDiff >= ENTRY_CHANGE_THRESHOLD_PIPS) {
    // 別のエントリーポイントに変わった
    saveState({ wasNear: true, lastEntryPrice: entryPrice });
    return true;
  }

  // 変化なし、通知スキップ
  return false;
}
