# グルメレコメンド（API連携版 試作）

位置情報をもとに近くの飲食店をカードで提案し、**左スワイプでお気に入り・右スワイプで削除**（削除管理から復旧可）。地図・店名・ジャンル・おすすめ・価格帯・距離を表示します。

## データソース

| ソース | 用途 | 備考 |
|---|---|---|
| Google Maps Platform | 地図表示・周辺検索（Places API (New)）・住所検索（Geocoding） | 必須。ブラウザから直接呼び出し |
| ホットペッパーグルメ Web サービス | 店舗情報の第2ソース（価格帯＝予算、おすすめ＝キャッチコピー） | 任意。CORS 非対応のため `server.js` 経由 |

> ぐるなび Web サービス（API）は 2021 年に提供終了しているため、同種の無料APIであるホットペッパーグルメを採用しています。

## セットアップ

### 1. Google Maps API キー
1. Google Cloud Console でプロジェクトを作成し、**Maps JavaScript API / Places API (New) / Geocoding API** を有効化。
2. APIキーを作成し、「HTTPリファラー」で `http://localhost:8797/*` などに制限。
3. アプリの「設定」タブにキーを貼り付けて保存。

### 2. 起動
```bash
cd gourmet-app
node server.js            # → http://localhost:8797 を開く
```
`index.html` を直接ファイルで開いても動きますが、位置情報APIは `http://localhost` または HTTPS が必要です。

### 3. サーバー側のキー（任意：ホットペッパー／名物抽出）
`.env.example` を `.env` にコピーして値を入れると、`node server.js` が起動時に読み込みます（`.env` はコミットされません）。

```
HOTPEPPER_KEY=      # https://webservice.recruit.co.jp/ で取得。喫煙情報・予算の補完と第2ソースに使用
ANTHROPIC_API_KEY=  # https://console.anthropic.com/ で取得。口コミから「名物の一皿」を抽出
```

- ホットペッパーを主ソースにするなら、アプリの「設定」→ ソースを「ホットペッパーグルメ」に変更。プロキシURLは既定で同一オリジン。
- 名物抽出は Claude Opus 5 に口コミ最大 5 件を渡して `名物・根拠` をカードに表示します。1 店あたり約 1〜2 円で、サーバーと端末の両方にキャッシュされるので同じ店に二度は課金されません。
- `http://localhost:8797/api/status` でどのキーが有効か確認できます。

## ジャンルの対応

| チップ | Google Places (includedPrimaryTypes) | ホットペッパー genre |
|---|---|---|
| おまかせ | restaurant | （指定なし） |
| 和食 | japanese_restaurant | G004 |
| ラーメン | ramen_restaurant | G013 |
| イタリアン | italian_restaurant | G006 |
| 寿司 | sushi_restaurant | G004 + キーワード「寿司」 |
| カフェ | cafe, coffee_shop | G014 |
| 韓国料理 | korean_restaurant | G017 |
| 中華 | chinese_restaurant | G007 |
| 焼肉 | barbecue_restaurant | G008 |
| カレー | indian_restaurant | キーワード「カレー」 |
| 居酒屋 | bar | G001 |

## 表示項目のマッピング

| 項目 | Google Places | ホットペッパー |
|---|---|---|
| 店名 | displayName | name |
| ジャンル | primaryTypeDisplayName | genre.name |
| おすすめ | editorialSummary（なければ口コミ冒頭） | catch（キャッチコピー） |
| 価格帯 | priceLevel を4段階の目安に変換 | budget.name |
| 距離 | geometry.spherical.computeDistanceBetween | 同左（緯度経度から算出） |
| 営業時間 | regularOpeningHours（本日分） | open |

## 絞り込みと「育つおまかせ」

- ジャンルチップの下に **今開いてる／徒歩5分以内／タバコ可** の絞り込みがあります（再検索せずその場で適用）。
- 検索中心が雨（Open-Meteo、キー不要）なら「徒歩5分以内に絞りますか？」と提案します。
- **喫煙情報は Google Places にありません。** ローカルで `server.js` を動かしていると、ホットペッパーのデータを店名と位置で突き合わせて自動付与します（GitHub Pages 上では付与されません）。
- 「おまかせ」はお気に入り／削除の履歴からジャンル・価格帯・距離の好みを学習して並び順に反映します。削除直後に理由（高い／遠い／今の気分じゃない／興味なし）を選ぶと学習の精度が上がり、「今の気分じゃない」は 7 日後に自動で復旧します。

## データ保存
お気に入り・削除・検索中心・半径・設定はブラウザの `localStorage` に保存（端末内のみ）。サーバー同期が必要になった時点で `S.favs / S.deleted` の読み書きをAPI呼び出しに差し替えてください。

## 制限・注意
- Google Places の周辺検索は最大 20 件／回のため、条件違いのリクエストを最大 4 本並列に投げて重複除去しています（ジャンル指定＝人気順＋距離順、おまかせ＝さらにランダム 2 タイプ）。おまかせは 500m 帯ごとにシャッフルされるので、検索のたびに顔ぶれが変わります。
- Places API (New) の呼び出しは従量課金です。口コミを取得する設定のため Nearby Search は月 1,000 回まで無料（1 検索で最大 4 回消費 → 月 250 検索が目安）。リファラー制限と予算アラートを設定してください。
- ホットペッパーAPIの `range` は 1=300m / 2=500m / 3=1km / 4=2km / 5=3km。5km 指定時は 3km で検索されます。
- 本試作は単一HTML＋Node プロキシ。本番化する際はキー管理（Google キーもサーバー側で発行・制限）とユーザー認証を追加してください。

## GitHub Pages で公開する（スマホ実機確認用）

1. リポジトリを **Public** にする（無料プランの Pages は public が条件）
2. Settings → Pages → Build and deployment → Source: **Deploy from a branch**、Branch: **main** / **/ (root)** → Save
3. 数分後に https://riku1128-tong.github.io/gourmet-app/ で開ける
4. Google Cloud Console のキー制限（ウェブサイト）に `https://riku1128-tong.github.io/*` を追加
5. スマホでページを開き、「設定」タブにキーを入力

> Pages は静的配信のため `server.js` は動きません。ホットペッパー・喫煙情報・名物抽出を Pages 上でも使うには、次の Render デプロイを行います。

## サーバー（server.js）を Render で公開する

`render.yaml`（Blueprint）を同梱しているので、Render 側の操作は最小です。

1. https://dashboard.render.com/ でアカウント作成（GitHub 連携）
2. **New → Blueprint** → リポジトリ `riku1128-tong/gourmet-app` を選ぶ → `render.yaml` が読み込まれる
3. 環境変数の入力欄に `HOTPEPPER_KEY` と `ANTHROPIC_API_KEY` を入れて **Apply**（不要なキーは空でよい）
4. 数分でデプロイされ、`https://gourmet-app-server.onrender.com` のような URL が出る（名前が取られていると末尾に文字が付く）
5. アプリ（Pages 版）の「設定」→「サーバーURL」にその URL を入れて保存。`gourmet-app-server` そのままなら既定値で繋がる

補足:
- 無料プランは 15 分アクセスが無いとスリープし、次の初回応答に 1 分ほどかかります。アプリは起動時に `/api/status` を叩いて起こします。
- `ALLOWED_ORIGINS`（既定 `https://riku1128-tong.github.io`）以外のオリジンからの `/api/*` は 403。localhost は常に許可。`/api/status` だけは Render のヘルスチェック用に無制限（キーの有無しか返さない）。
- 名物抽出には回数上限があります（IP ごと 10 分 40 回、全体で 1 日 400 回。`DISH_LIMIT_PER_IP` / `DISH_LIMIT_PER_DAY` で変更）。
- 無料プランのディスクは再起動で消えるため、サーバー側キャッシュ（`.cache/dish.json`）は永続しません。端末側キャッシュは残ります。
