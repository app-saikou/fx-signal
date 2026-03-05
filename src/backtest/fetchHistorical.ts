import { type TimeFrame, type Candle } from "../api/alphaVantage.js";

const SYMBOL = "USD/JPY";
const BASE_URL = "https://api.twelvedata.com";

function toInterval(tf: TimeFrame): string {
  switch (tf) {
    case "M15":
      return "15min";
    case "H1":
      return "1h";
    case "H4":
      return "4h";
    case "D1":
      return "1day";
  }
}

interface TwelveDataValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
}

interface TwelveDataResponse {
  status?: string;
  message?: string;
  code?: number;
  meta?: Record<string, string>;
  values?: TwelveDataValue[];
}

/**
 * Twelve Data API から過去データを取得し、
 * 古い順（インデックス0が最古）に並び替えて返す
 * @param endDate 取得終了日（"YYYY-MM-DD HH:MM:SS" 形式、省略時は最新）
 */
export async function fetchHistoricalCandles(
  tf: TimeFrame,
  apiKey: string,
  outputsize = 500,
  endDate?: string
): Promise<Candle[]> {
  const interval = toInterval(tf);
  let url =
    `${BASE_URL}/time_series` +
    `?symbol=${encodeURIComponent(SYMBOL)}` +
    `&interval=${interval}` +
    `&outputsize=${outputsize}` +
    `&apikey=${apiKey}`;
  if (endDate) {
    url += `&end_date=${encodeURIComponent(endDate)}`;
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Twelve Data fetch failed (${tf}): ${res.status}`);
  }

  const json = (await res.json()) as TwelveDataResponse;

  if (json.status === "error" || json.code !== undefined) {
    throw new Error(
      `Twelve Data エラー (${tf}): ${json.message ?? JSON.stringify(json)}`
    );
  }

  if (!json.values || json.values.length === 0) {
    throw new Error(`Twelve Data データなし (${tf}): ${JSON.stringify(json)}`);
  }

  // Twelve Data は新しい順で返ってくる → 古い順に並び替える
  const candles: Candle[] = json.values.map((v) => ({
    time: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
  }));

  return candles.reverse();
}
