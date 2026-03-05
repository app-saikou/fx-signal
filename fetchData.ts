/**
 * 過去データ一括取得スクリプト
 * 日付をずらしながら複数期間のデータを取得してローカルCSVに保存する
 *
 * 使い方: npm run fetchData
 */
import "dotenv/config";
import { fetchHistoricalCandles } from "./src/backtest/fetchHistorical.js";
import { saveCandles, getCandleRange } from "./src/backtest/dataStore.js";
import type { TimeFrame } from "./src/api/alphaVantage.js";

const apiKey = process.env.TWELVE_DATA_KEY;
if (!apiKey) {
  console.error("エラー: TWELVE_DATA_KEY が設定されていません");
  process.exit(1);
}

// 取得設定: 各時間足の1回あたり本数と遡る回数
const FETCH_CONFIG: { tf: TimeFrame; outputsize: number; rounds: number }[] = [
  { tf: "M15", outputsize: 5000, rounds: 10 }, // 5000本×10回 = 約2年分
  { tf: "H1",  outputsize: 5000, rounds: 3  }, // 5000本×3回  = 約2年分
  { tf: "H4",  outputsize: 5000, rounds: 1  }, // 5000本×1回  = 約2.7年分
  { tf: "D1",  outputsize: 5000, rounds: 1  }, // 5000本×1回  = 約13年分
];

// APIレート制限: 無料プランは8リクエスト/分 → 約8秒間隔
const SLEEP_MS = 9_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 指定日時からN本前の終了日時を算出 */
function subtractCandles(endDate: string, tf: TimeFrame, count: number): string {
  const ms = new Date(endDate).getTime();
  const intervalMs: Record<TimeFrame, number> = {
    M15: 15 * 60 * 1000,
    H1:  60 * 60 * 1000,
    H4:  4  * 60 * 60 * 1000,
    D1:  24 * 60 * 60 * 1000,
  };
  const shifted = new Date(ms - intervalMs[tf] * count);
  return shifted.toISOString().replace("T", " ").slice(0, 19);
}

async function fetchAndSave(
  tf: TimeFrame,
  outputsize: number,
  rounds: number
): Promise<void> {
  console.log(`\n[${tf}] ${rounds}回に分けて取得開始...`);

  // 既存データがあれば最古タイムスタンプの前から遡る
  const range = getCandleRange(tf);
  let endDate: string | undefined = range?.oldest;

  for (let r = 0; r < rounds; r++) {
    const label = endDate ? `〜${endDate}` : "最新";
    process.stdout.write(`  round ${r + 1}/${rounds} (${label})... `);

    try {
      const candles = await fetchHistoricalCandles(tf, apiKey!, outputsize, endDate);
      saveCandles(tf, candles);
      console.log(`${candles.length}本 保存`);

      // 次ラウンドは今回取得した最古データの1本前から
      if (candles.length > 0) {
        endDate = subtractCandles(candles[0].time, tf, 1);
      }
    } catch (err) {
      console.error(`\n  エラー: ${err}`);
    }

    if (r < rounds - 1) {
      process.stdout.write(`  (${SLEEP_MS / 1000}秒待機...)\n`);
      await sleep(SLEEP_MS);
    }
  }

  const finalRange = getCandleRange(tf);
  if (finalRange) {
    console.log(`  → 保存済み範囲: ${finalRange.oldest} 〜 ${finalRange.newest}`);
  }
}

// 全時間足を順番に取得
for (const { tf, outputsize, rounds } of FETCH_CONFIG) {
  await fetchAndSave(tf, outputsize, rounds);

  // 時間足間のスリープ
  process.stdout.write(`\n(${SLEEP_MS / 1000}秒待機...)\n`);
  await sleep(SLEEP_MS);
}

console.log("\n✓ データ取得完了");
