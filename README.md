# Night Expressway — 夜間走行

深夜の都市高速を走り続ける、眺めるためのドライブシミュレーター。
都市高架・トンネル・湾岸橋を自動生成し、走行音と雨、街の灯りでリラックスできる時間を作る。

公開ページ: https://nu424.github.io/night-expressway/

## 操作

| キー | 動作 |
|---|---|
| F | 全画面 |
| R | 天気（自動 → 晴れ → 雨） |
| V | 視点（車内 / ダッシュカム） |
| M | ミュート |
| B | 俯瞰デバッグ |
| P | 計測表示（フレーム時間・チャンク生成時間） |

## 開発

```
npm install
npm run dev        # 開発サーバー
npm run typecheck  # 型チェック
npm test           # 純ロジックのテスト
npm run build      # dist/ へ出力
npm run shots      # 定点撮影（ビルド後）。shots/current/ に出力
node scripts/shots.mjs --legacy   # 旧単一HTML版を同条件で撮影
node scripts/perf.mjs --sec 40    # 実走行のフレーム時間を計測
```

`main` に push すると GitHub Actions がビルドし、GitHub Pages に公開する。

### 検証用のURLパラメータ

| パラメータ | 意味 |
|---|---|
| `seed=7` | 乱数の種。同じ値なら同じ道と街になる |
| `frames=200` | 実時間ループを使わず、指定フレームだけ進めて止める（撮影用。保存済みの設定は読まない） |
| `skip=3300` | 指定距離(m)から開始 |
| `rain` / `clean` / `debug` / `perf` | 雨・ダッシュカム視点・俯瞰・計測表示で開始 |
| `p=...` | 共有された設定値 |

## 構成

```
src/
  main.ts        起動とメインループ
  core/          乱数・定数・状態・設定レジストリ
  world/         道路線形、区間、チャンク生成、ベイク照明、建物、空と地面
  traffic/       交通流（IDM）と車両描画
  car/           車内、ミラー、カメラ
  weather/       天気遷移、雨、フロントガラスの水滴とワイパー
  render/        レンダラー、ポストプロセス、平面反射
  audio/         走行音
  ui/            スタート画面と操作パネル
  debug/         俯瞰ビュー、計測
legacy/          分割前の単一HTML版（比較用）
docs/PLAN.md     改善計画書
```

設定値は `src/core/settings.ts` のレジストリに登録する。登録した値は保存・プリセット・リセット・URL共有の対象になる。
