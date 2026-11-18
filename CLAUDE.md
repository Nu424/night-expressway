# Night Expressway での作業ルール

深夜の都市高速を眺めるドライブシミュレーター。Vite + TypeScript + three.js、UIフレームワークなし。
公開先: https://nu424.github.io/night-expressway/ （`main` への push で自動公開）

- 報告・返答、コメント、コミット以外の文書は日本語で書く。
- 目的は「リラックスできること」。新要素を足す前に、チラつき・カクつき・急な変化を出さないことを優先する。
- 全体像は `README.md`、経緯と計測値は `docs/PLAN.md` の「10. 進捗記録」にある。作業後は進捗記録を更新する。

## 確認の進め方

開発側は動画と音を体験できない。静止画と数値で確認し、動きと音の印象は利用者に試走で確かめてもらう。確認していないことは、確認していないと報告する。

```
npm run typecheck && npm test && npm run build     # 以下のスクリプトはビルド後に実行する
npm run shots                                      # 定点撮影6枚 → shots/current/
node scripts/shots.mjs --only traffic,sweep0,dawn,side   # 追加シーン（scripts/shots.mjs の SCENES を参照）
node scripts/perf.mjs --sec 20                     # フレーム時間・GPU時間・内部解像度
node scripts/perf-matrix.mjs --scale 0.7           # 要素を1つずつ切って負荷を切り分ける
node scripts/audio-check.mjs                       # 各局と環境音の音量・ピーク・帯域
node scripts/ui-shot.mjs RADIO,VIEW                # 設定画面の撮影と全プリセットの適用
```

- 見た目を変えたら、該当シーンを撮影して画像を自分で見る。新しい見せ場には `SCENES` に確認用シーンを足す。
- `?frames=N` 実行は決定的（同じシードなら同じ画）。保存済みの設定を読まず、解像度も固定される。
- 計測値は同じ実行の中でだけ比べる。同じコードが約52fpsの時と約32fpsの時があった。悪化を見たら、まず過去のコミットを同条件で測り直す。
- 音を変えたら `audio-check.mjs` を回す。目安は、各局 RMS −18〜−21dB、ピーク −6dB 以下、150Hz 未満の割合が 50% 以下。

## 守ること

- **乱数の消費順を変えない。** 道と街は共有の乱数 `R()`（`core/util.ts`）の呼び出し順で決まる。既定設定のときに `R()` の呼び出し回数や順序が変わると、同じシードで別の街になる。設定で分岐させるときは、呼び出し回数を保ったまま確率や結果だけを変える（例: `world/path.ts` の `addSection`）。
- **調整できる値は設定レジストリに登録する。** `src/ui/params.ts` に1行足せば、設定画面・保存・プリセット・リセット・URL共有に載る。`apply` は起動時に全項目が一度呼ばれる（`prev === undefined`）ので、そこで乱数を消費したり重い再生成をしない。
- **描画は1回の `renderer.render` にまとめる。** 同じ描画先へ2回目の `render()` を呼ぶと、内蔵GPUでは内容に関係なく約6ms余計にかかった。車内がカメラの子（レイヤー1）になっているのはこのため。
- **全画面パスを増やさない。** 対象PCは Intel UHD の内蔵GPUで、半精度の全画面パス1つが数ms かかる。画面全体の効果は `shaders/final.frag` に足す。4x MSAA は約28ms かかるので既定にしない。
- **車内の照度は頂点で計算する**（`shaders/interior.vert`）。面を足すときは、影の境界が出る面を細かい格子にする。
- 車内の座標は「運転者の目が原点、−z が前、単位 m」。頭の向きと座席の移動は `car/interior.ts` の `setHeadPose` が逆変換で吸収する。車体に固定したい物は `iscene` か `carRig` の子にする。

## 区間の種類と、種類を足すときの手順

区間は `city` / `tunnel` / `bay` / `jct` / `industrial` の5種類。都市区間の合間に、ほかの4つが「長く出ていない順」に挟まる（`world/path.ts` の `recent`）。seed=7 では 11.5km に JCT、16.1km に工場夜景が出る。位置は `node scripts/sections.mjs --seed 7` で調べる。

次の候補は、空港脇、並走する終電、掘割。PA 休憩、ナビのルート表示、スタート画面の演出、スマートフォン対応、ガラスの映り込みは保留。

種類を足すときに手を入れる場所:

| ファイル | 内容 |
|---|---|
| `world/path.ts` | `addSection`（`recent` に名前を足す、長さ、街灯の色と配列 `fam`）、`genSample`（曲率の上限と路面の高さ）、`lampSkip`（街灯を立てない範囲） |
| `world/chunks.ts` | `buildChunk`（路面・高欄・橋脚・標識・建物の分岐）。区間固有の構造物は `world/bay.ts` `world/jct.ts` `world/industrial.ts` のように別ファイルへ |
| `world/lighting.ts` | `lightAt`（頂点に焼き込む照明） |
| `world/lamps.ts` | `lampsNear`（車内を流れる光とボンネットの映り込みに使う照明の列挙） |
| `world/environment.ts` | `waterPoints`（水面の範囲。半径を負にすると地面の柄を工業地帯に切り替える範囲になる）と地面シェーダ |
| `traffic/traffic.ts` | 区間ごとの巡航速度と交通量 |
| `main.ts` | ヘッドユニットに出す道路名（`setRoadName`） |
| `debug/birdseye.ts` | 俯瞰表示の色と名前（`SEC_COL` / `SEC_JP`） |
| `ui/params.ts` | ルートの好み（`trip.route`）の選択肢とプリセット |
| `scripts/shots.mjs` | 確認用シーン。`skip=` で新区間の位置から始める |

区間を作るときに分かったこと:

- **抽選で `R()` の呼び出し回数を変えない。** `addSection` は種類の抽選に1回、長さに1回、`baseY`・`phase`・街灯の色に各1回。区間固有の乱数が要るときは `sec.phase` や `sec.id` から導く（JCT の交差角と名前がこの方式）。
- **区間固有の構造物の配置は `chunkRng(ci, k)` を使う。** 共有の `R()` を消費しないので、設定や生成順に左右されない。
- **路面より低い物は近くでは見えない。** 運転者の目は路面から約1.2m、高欄は1.1m。見せたい区間は `bay` と同じ低い高欄（0.9m + 手すり）にする。右側は中央分離帯と反対車線の高欄に隠れるので、見せ場は左側に置く。
- **JCT の形は「本線座標」で書く**（`world/jct.ts` 冒頭）。t = 区間中央からの距離、u = 横、y = 本線路面からの高さ。本線は中央 ±1000m で直線にしてある。デッキは点列で持ち、チャンクごとに自分の範囲だけ形状にする。上を渡るデッキを足したら、下の街灯との干渉（`lampSkip`）と橋脚の位置を俯瞰（`jctTop` シーン）で確かめる。
- **水面の鏡像は追加の描画1回ぶん重い**（計測で約3.5ms）。`waterPoints` が返す「水面が近い」の範囲を必要なぶんに絞る。

## コミットと公開

- `main` に直接コミットし、push で公開する運用（利用者の了承済み）。push の前に typecheck・test・build を通す。
- コミットメッセージは英語。何を変えたかと、その理由を書く。
- リポジトリは公開（Nu424/night-expressway）。個人情報や秘密を入れない。
