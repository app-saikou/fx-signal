import "dotenv/config";
import { runBacktest } from "./src/backtest/runBacktest.js";
import { printSummary, exportCsv } from "./src/backtest/report.js";

const apiKey = process.env.TWELVE_DATA_KEY;
if (!apiKey) {
  console.error("エラー: TWELVE_DATA_KEY が設定されていません");
  process.exit(1);
}

const records = await runBacktest(apiKey);
printSummary(records);

const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
exportCsv(records, `backtest_result_${today}.csv`);
