import { writeFileSync } from "fs";
import type { BacktestRecord } from "./runBacktest.js";

export function printSummary(records: BacktestRecord[]): void {
  const total = records.length;
  const wins = records.filter((r) => r.outcome === "WIN");
  const losses = records.filter((r) => r.outcome === "LOSS");
  const timeouts = records.filter((r) => r.outcome === "TIMEOUT");

  const winCount = wins.length;
  const lossCount = losses.length;
  const timeoutCount = timeouts.length;

  const winRate = total > 0 ? (winCount / total) * 100 : 0;
  const lossRate = total > 0 ? (lossCount / total) * 100 : 0;
  const timeoutRate = total > 0 ? (timeoutCount / total) * 100 : 0;

  const avgWinPips =
    winCount > 0
      ? wins.reduce((sum, r) => sum + r.actualPips, 0) / winCount
      : 0;
  const avgLossPips =
    lossCount > 0
      ? losses.reduce((sum, r) => sum + r.actualPips, 0) / lossCount
      : 0;

  const expectation =
    total > 0 ? records.reduce((sum, r) => sum + r.actualPips, 0) / total : 0;

  const fmt = (n: number) => (n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1));
  const pct = (n: number) => n.toFixed(1).padStart(5);

  console.log("\n=== バックテスト結果 ===");
  console.log(`シグナル数: ${total}`);
  console.log(`  WIN    : ${String(winCount).padStart(3)} (${pct(winRate)}%)`);
  console.log(
    `  LOSS   : ${String(lossCount).padStart(3)} (${pct(lossRate)}%)`,
  );
  console.log(
    `  TIMEOUT: ${String(timeoutCount).padStart(3)} (${pct(timeoutRate)}%)`,
  );
  console.log(`平均利益(WIN)  : ${fmt(avgWinPips)} pips`);
  console.log(`平均損失(LOSS) : ${fmt(avgLossPips)} pips`);
  console.log(`期待値         : ${fmt(expectation)} pips/シグナル`);
  console.log("========================\n");
}

export function exportCsv(records: BacktestRecord[], filePath: string): void {
  const headers = [
    "timestamp",
    "direction",
    "entryPrice",
    "stopLoss",
    "takeProfit",
    "slPips",
    "tpPips",
    "proximityPips",
    "outcome",
    "actualPips",
    "barsHeld",
  ];

  const rows = records.map((r) =>
    [
      r.timestamp,
      r.direction,
      r.entryPrice,
      r.stopLoss,
      r.takeProfit,
      r.slPips,
      r.tpPips,
      r.proximityPips,
      r.outcome,
      r.actualPips,
      r.barsHeld,
    ].join(","),
  );

  const csv = [headers.join(","), ...rows].join("\n");
  writeFileSync(filePath, csv, "utf-8");
  console.log(`CSVを出力しました: ${filePath}`);
}
