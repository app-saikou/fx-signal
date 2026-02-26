import fetch from "node-fetch";

export type TimeFrame = "M15" | "H1" | "H4" | "D1";

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

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

export async function fetchCandles(
  tf: TimeFrame,
  apiKey: string
): Promise<Candle[]> {
  const interval = toInterval(tf);
  const url =
    `${BASE_URL}/time_series` +
    `?symbol=${encodeURIComponent(SYMBOL)}` +
    `&interval=${interval}` +
    `&outputsize=100` +
    `&apikey=${apiKey}`;

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

  // Twelve Data は新しい順で返ってくる
  return json.values.map((v) => ({
    time: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
  }));
}
