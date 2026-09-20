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
2. APIキーを作成し、「HTTPリファラー」で `http://localhost:8787/*` などに制限。
3. アプリの「設定」タブにキーを貼り付けて保存。

### 2. 起動
```bash
cd gourmet-app
node server.js            # → http://localhost:8787 を開く
```
`index.html` を直接ファイルで開いても動きますが、位置情報APIは `http://localhost` または HTTPS が必要です。

### 3. ホットペッパーグルメを使う（任意）
1. https://webservice.recruit.co.jp/ でAPIキーを取得。
2. キーを環境変数にして起動：
   ```bash
   HOTPEPPER_KEY=あなたのキー node server.js
   ```
3. アプリの「設定」→ ソースを「ホットペッパーグルメ」に変更。プロキシURLは既定で `http://localhost:8787`。

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

## データ保存
お気に入り・削除・検索中心・半径・設定はブラウザの `localStorage` に保存（端末内のみ）。サーバー同期が必要になった時点で `S.favs / S.deleted` の読み書きをAPI呼び出しに差し替えてください。

## 制限・注意
- Google Places の周辺検索は最大 20 件／回。半径を広げても件数は増えないため、多く出したい場合はページング相当の再検索（ランダム化や複数タイプ）を追加する余地があります。
- Places API (New) の呼び出しは従量課金です。開発中は無料枠内で収まりますが、リファラー制限と予算アラートを設定してください。
- ホットペッパーAPIの `range` は 1=300m / 2=500m / 3=1km / 4=2km / 5=3km。5km 指定時は 3km で検索されます。
- 本試作は単一HTML＋Node プロキシ。本番化する際はキー管理（Google キーもサーバー側で発行・制限）とユーザー認証を追加してください。
