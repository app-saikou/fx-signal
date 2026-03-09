import "dotenv/config";
import { fetchCandles } from "./src/api/alphaVantage.js";
import { analyzeTrendByMA } from "./src/analysis/dowTheory.js";
import { calcEntrySignal } from "./src/analysis/entrySignal.js";
import { notifyEntrySignal, notifyStay, notifyError } from "./src/notify/ntfy.js";
import { shouldSendEntryNotification } from "./src/notify/signalState.js";

const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY;
const NTFY_TOPIC = process.env.NTFY_TOPIC;

// テストモード: FORCE_NOTIFY=true で条件に関わらず通知
const FORCE_NOTIFY = process.env.FORCE_NOTIFY === "true";
// 通知無効化: DISABLE_NOTIFY=true で全通知をスキップ
const DISABLE_NOTIFY = process.env.DISABLE_NOTIFY === "true";

async function main() {
  console.log("=== FX ダウ理論シグナル分析 開始 ===");
  console.log(`実行時刻: ${new Date().toISOString()}`);

  if (!TWELVE_DATA_KEY) {
    throw new Error(
      "環境変数 TWELVE_DATA_KEY が設定されていません。.env ファイルを確認してください。"
    );
  }
  if (!NTFY_TOPIC) {
    throw new Error(
      "環境変数 NTFY_TOPIC が設定されていません。.env ファイルを確認してください。"
    );
  }

  try {
    // 各時間軸のデータを順番に取得（API制限: 8req/分）
    console.log("\n📊 M15データ取得中...");
    const m15Candles = await fetchCandles("M15", TWELVE_DATA_KEY);
    console.log(`  → ${m15Candles.length}本取得`);

    await sleep(10_000);

    console.log("📊 H1データ取得中...");
    const h1Candles = await fetchCandles("H1", TWELVE_DATA_KEY);
    console.log(`  → ${h1Candles.length}本取得`);

    await sleep(10_000);

    console.log("📊 H4データ取得中...");
    const h4Candles = await fetchCandles("H4", TWELVE_DATA_KEY);
    console.log(`  → ${h4Candles.length}本取得`);

    await sleep(10_000);

    console.log("📊 D1データ取得中...");
    const d1Candles = await fetchCandles("D1", TWELVE_DATA_KEY);
    console.log(`  → ${d1Candles.length}本取得`);

    // トレンド分析（MA20傾きベース）
    console.log("\n🔍 トレンド分析中...");
    const d1Analysis = analyzeTrendByMA(d1Candles);
    const h4Analysis = analyzeTrendByMA(h4Candles);
    const h1Analysis = analyzeTrendByMA(h1Candles);
    const m15Analysis = analyzeTrendByMA(m15Candles);

    console.log(`  日足(D1)   : ${d1Analysis.direction} - ${d1Analysis.reason}`);
    console.log(`  4時間足(H4): ${h4Analysis.direction} - ${h4Analysis.reason}`);
    console.log(`  1時間足(H1): ${h1Analysis.direction} - ${h1Analysis.reason}`);
    console.log(`  15分足(M15): ${m15Analysis.direction} - ${m15Analysis.reason}`);

    // H4+H1 2軸一致確認
    const aligned =
      (h4Analysis.direction === "UP" && h1Analysis.direction === "UP") ||
      (h4Analysis.direction === "DOWN" && h1Analysis.direction === "DOWN");
    const direction =
      h4Analysis.direction === "UP" && h1Analysis.direction === "UP" ? "UP" :
      h4Analysis.direction === "DOWN" && h1Analysis.direction === "DOWN" ? "DOWN" : "RANGE";

    if (!aligned) {
      console.log("\n⏳ トレンドが一致していません。");
      if (!DISABLE_NOTIFY) {
        await notifyStay(d1Analysis.direction, h4Analysis.direction, h1Analysis.direction, NTFY_TOPIC);
      } else {
        console.log("通知無効（DISABLE_NOTIFY=true）");
      }
      return;
    }

    console.log(`\n✅ トレンド一致: ${direction === "UP" ? "買い" : "売り"}方向`);

    // 現在価格取得（最新ローソク足のclose）
    const currentPrice = h1Candles[0]?.close;
    if (currentPrice === undefined) {
      throw new Error("H1の現在価格が取得できませんでした");
    }
    console.log(`  現在価格: ${currentPrice.toFixed(3)}`);

    // エントリーシグナル算出
    const signal = calcEntrySignal(
      currentPrice,
      direction,
      d1Analysis,
      h4Analysis,
      h1Analysis,
      m15Analysis
    );

    if (!signal) {
      console.log("\n⏳ エントリーシグナルが算出できませんでした（スウィングポイント不足）。");
      if (!DISABLE_NOTIFY) {
        await notifyStay(d1Analysis.direction, h4Analysis.direction, h1Analysis.direction, NTFY_TOPIC);
      } else {
        console.log("通知無効（DISABLE_NOTIFY=true）");
      }
      return;
    }

    console.log(`\n📍 エントリー分析:`);
    console.log(`  エントリー価格: ${signal.entryPrice.toFixed(3)}`);
    console.log(`  SL: ${signal.stopLoss.toFixed(3)} (-${signal.slPips}pips)`);
    console.log(`  TP: ${signal.takeProfit.toFixed(3)} (+${signal.tpPips}pips)`);
    console.log(`  距離: ${signal.proximityPips}pips`);
    console.log(`  通知フラグ: ${signal.shouldNotify ? "✅ YES" : "❌ NO"}`);

    // 通知判定（エッジ検出: 初回接近時またはエントリーポイント変化時のみ通知）
    if (!DISABLE_NOTIFY && (FORCE_NOTIFY || shouldSendEntryNotification(signal.shouldNotify, signal.entryPrice))) {
      if (FORCE_NOTIFY && !signal.shouldNotify) {
        console.log("\n⚠️ FORCE_NOTIFY=true のため強制通知します");
      }
      console.log("\n📱 エントリー接近通知を送信中...");
      await notifyEntrySignal(signal, NTFY_TOPIC);
    } else if (DISABLE_NOTIFY) {
      console.log("通知無効（DISABLE_NOTIFY=true）");
    } else {
      console.log(`通知スキップ（接近中だが既に通知済み or 未接近、距離: ${signal.proximityPips}pips）`);
    }

    console.log("\n=== 分析完了 ===");
  } catch (error) {
    console.error("\n❌ エラー発生:", error);
    try {
      await notifyError(error, NTFY_TOPIC);
    } catch (notifyErr) {
      console.error("通知送信も失敗:", notifyErr);
    }
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
