# FX-test TODO

## 未着手

- [ ] **#5 精度改善: ダウ理論の判定ロジック調整**
  - lookback パラメータの最適化（現在デフォルト3）
  - recentHighs/recentLows の取得本数見直し（現在3本）
  - 3軸一致の厳しさ調整（D1+H4+H1 全一致 or 一部緩和の選択肢）
  - RANGE 判定が多すぎる場合の対処
  - 対象: `dowTheory.ts`, `swingPoints.ts`, `entrySignal.ts`

- [ ] **#6 バックテスト: 過去データでシグナル精度を検証**
  - AlphaVantage の `outputsize=full` で D1/H4/H1/M15 の過去データ取得
  - 各時点でトレンド判定・エントリーシグナルをシミュレート
  - 結果集計: シグナル数・勝率・平均 R/R・最大ドローダウン
  - 結果を CSV/JSON で出力
  - 新規: `src/backtest/fetchHistorical.ts`, `runBacktest.ts`, `report.ts`

- [x] **#1 M15（15分足）をAPIとトレンド分析に追加**
  - `alphaVantage.ts` に `M15` TimeFrame 追加（interval: `15min`）
  - `main.ts` で M15 データ取得・分析を組み込む
  - エントリータイミング専用（スウィングポイントあれば M15 優先、なければ H1 にフォールバック）

- [x] **#2 未達でも通知する仕様を決めて実装**
  - 毎回30分ごとに3段階で通知を出し分け
    - ⏸ 様子見（トレンド未一致）: 各足の方向をサマリー、priority: low
    - 📊 待機（一致・10pips超）: エントリー価格・SLを通知、priority: default
    - 📈📉 接近（一致・10pips以内）: エントリー・SL・TP・R/Rをフル通知、priority: high

- [x] **#3 H1 をトレンド一致チェックに含める**
  - `isTrendAligned` を D1+H4+H1 の3軸一致に修正（#1 と同時対応）

- [x] **#4 GitHub リポジトリ作成して初回プッシュ**
  - `app-saikou` アカウントで FX-test リポジトリを新規作成
  - 初回 `git init` → `git remote add` → `git push`
  - Settings → Secrets に `TWELVE_DATA_KEY` と `NTFY_TOPIC` を登録
  - GitHub Actions が動作することを確認

## 完了

- [x] GitHub Actions のスケジュールを 30 分ごとに変更（毎時 :01/:31）
- [x] `docs/analysis-logic.md` にダウ理論・分析ロジックをまとめた
- [x] M15 追加 + H1 をトレンド一致チェックに組み込み（#1 #3）
- [x] 30分ごとに様子見・待機・接近の3段階通知を実装（#2）
