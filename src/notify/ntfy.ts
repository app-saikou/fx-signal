import fetch from "node-fetch";
import { EntrySignal } from "../analysis/entrySignal.js";
import { TrendDirection } from "../analysis/dowTheory.js";

const NTFY_BASE_URL = "https://ntfy.sh";

export interface NotifyOptions {
  topic: string;
  title: string;
  body: string;
  priority?: "min" | "low" | "default" | "high" | "urgent";
  tags?: string[];
}

/**
 * ntfy.sh にプッシュ通知を送信する
 */
export async function sendNotification(opts: NotifyOptions): Promise<void> {
  const { topic, title, body, priority = "high", tags = [] } = opts;
  const url = `${NTFY_BASE_URL}/${encodeURIComponent(topic)}`;

  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    Title: encodeURIComponent(title),
    Priority: priority,
  };

  if (tags.length > 0) {
    headers["Tags"] = tags.join(",");
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ntfy.sh 通知失敗 (${res.status}): ${text}`);
  }

  console.log(`✅ ntfy.sh 通知送信完了: topic=${topic}, title=${title}`);
}

/**
 * エントリーシグナルを通知メッセージに整形して送信する
 */
export async function notifyEntrySignal(
  signal: EntrySignal,
  topic: string
): Promise<void> {
  const directionLabel = signal.direction === "UP" ? "買い" : "売り";
  const directionEmoji = signal.direction === "UP" ? "📈" : "📉";

  const title = `【USDJPY ${directionLabel}エントリー接近】${directionEmoji}`;

  const body = [
    `現在値: ${signal.currentPrice.toFixed(3)}`,
    `エントリー: ${signal.entryPrice.toFixed(3)}`,
    `損切り(SL): ${signal.stopLoss.toFixed(3)}（-${signal.slPips}pips）`,
    `利確(TP): ${signal.takeProfit.toFixed(3)}（+${signal.tpPips}pips）`,
    `R/R: ${signal.rrRatio}`,
    `距離: ${signal.proximityPips}pips`,
    `根拠: ${signal.rationale}`,
  ].join("\n");

  await sendNotification({
    topic,
    title,
    body,
    priority: "high",
    tags: ["chart_increasing", "yen_sign"],
  });
}

/**
 * トレンド未一致時の様子見通知を送信する
 */
export async function notifyStay(
  d1: TrendDirection,
  h4: TrendDirection,
  h1: TrendDirection,
  topic: string
): Promise<void> {
  const body = [
    `D1 : ${d1}`,
    `H4 : ${h4}`,
    `H1 : ${h1}`,
    `→ トレンド未一致、エントリーなし`,
  ].join("\n");

  await sendNotification({
    topic,
    title: "【USDJPY 様子見】⏸",
    body,
    priority: "low",
    tags: ["hourglass_flowing_sand"],
  });
}

/**
 * トレンド一致・エントリー待機中の通知を送信する
 */
export async function notifyWaiting(
  signal: EntrySignal,
  topic: string
): Promise<void> {
  const directionLabel = signal.direction === "UP" ? "買い" : "売り";
  const directionEmoji = signal.direction === "UP" ? "📊" : "📊";

  const body = [
    `方向: ${directionLabel}`,
    `エントリー: ${signal.entryPrice.toFixed(3)}`,
    `SL: ${signal.stopLoss.toFixed(3)}（-${signal.slPips}pips）`,
    `現在値: ${signal.currentPrice.toFixed(3)}`,
    `距離: ${signal.proximityPips}pips`,
    `根拠: ${signal.rationale}`,
  ].join("\n");

  await sendNotification({
    topic,
    title: `【USDJPY ${directionLabel}待機】${directionEmoji}`,
    body,
    priority: "default",
    tags: ["eyes"],
  });
}

/**
 * エラー通知を送信する
 */
export async function notifyError(
  error: unknown,
  topic: string
): Promise<void> {
  const message =
    error instanceof Error ? error.message : String(error);

  await sendNotification({
    topic,
    title: "⚠️ FX分析エラー",
    body: `エラーが発生しました:\n${message}`,
    priority: "default",
    tags: ["warning"],
  });
}
