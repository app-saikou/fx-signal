import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { type Candle } from "../api/alphaVantage.js";

const DATA_DIR = "./data";

function csvPath(tf: string): string {
  return `${DATA_DIR}/USDJPY_${tf}.csv`;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** ローカルCSVからキャンドルを読み込む（古い順） */
export function loadCandles(tf: string): Candle[] {
  const path = csvPath(tf);
  if (!existsSync(path)) return [];

  const lines = readFileSync(path, "utf-8").trim().split("\n");
  // 1行目はヘッダー
  return lines
    .slice(1)
    .filter((l) => l.trim() !== "")
    .map((line) => {
      const [time, open, high, low, close] = line.split(",");
      return {
        time,
        open: parseFloat(open),
        high: parseFloat(high),
        low: parseFloat(low),
        close: parseFloat(close),
      };
    });
}

/** キャンドルをローカルCSVに保存（既存データとマージして重複除去、古い順） */
export function saveCandles(tf: string, newCandles: Candle[]): void {
  ensureDataDir();
  const existing = loadCandles(tf);

  // タイムスタンプをキーにしてマージ・重複除去
  const map = new Map<string, Candle>();
  for (const c of existing) map.set(c.time, c);
  for (const c of newCandles) map.set(c.time, c);

  // 古い順にソート
  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  const header = "time,open,high,low,close";
  const rows = merged.map(
    (c) => `${c.time},${c.open},${c.high},${c.low},${c.close}`
  );
  writeFileSync(csvPath(tf), [header, ...rows].join("\n") + "\n", "utf-8");
}

/** ローカルCSVの最古・最新タイムスタンプを返す */
export function getCandleRange(
  tf: string
): { oldest: string; newest: string } | null {
  const candles = loadCandles(tf);
  if (candles.length === 0) return null;
  return { oldest: candles[0].time, newest: candles[candles.length - 1].time };
}
