# グルメレコメンドアプリ — 引き継ぎ（Claude Code 用）

このファイルは claude.ai 上で作ったモックアップと試作を Claude Code に引き継ぐためのメモです。
リポジトリ直下に置き、そのままプロジェクトの `CLAUDE.md` として使ってください。

## 1. プロダクト要件（確定）

- 位置情報を元に近くの飲食店をカード形式でレコメンドする
- **右スワイプ = 削除**、**左スワイプ = お気に入り登録**
- 削除した店は表示対象から外す。ただし「削除管理」画面から復旧できる（個別／一括）
- 位置情報は任意で移動できる（住所検索・ピンのドラッグ・現在地に戻す・検索半径の切替）
- レコメンドは「おまかせ」のほか、ジャンル別にも選べる
- カードに表示する項目：地図・レストラン名・ジャンル・おすすめの料理・大体の値段帯・現在地からの距離

## 2. 決定事項

| 論点 | 決定 | 理由 |
|---|---|---|
| 店舗データの主ソース | **Google Places API (New)** `Place.searchNearby` | 地図と同じキーで完結。ブラウザから直接呼べる |
| 第2ソース | **ホットペッパーグルメ Web サービス** | ぐるなび API は 2021 年に提供終了。ホットペッパーは予算（価格帯）とキャッチコピー（おすすめ）が公式データで揃う |
| ホットペッパーの呼び出し方 | Node プロキシ `server.js` 経由 | CORS 非対応のため |
| 地図 | Google Maps JavaScript API + AdvancedMarker（`mapId: 'DEMO_MAP_ID'`） | 本番では自前の Map ID に差し替える |
| 距離 | `google.maps.geometry.spherical.computeDistanceBetween` | 徒歩分数は 80m/分で概算 |
| 永続化（現状） | `localStorage`（`gourmet.favs` / `gourmet.deleted` / `gourmet.settings` / `gourmet.center` / `gourmet.radius`） | 試作段階。サーバー同期は未実装 |
| API キー | Google キーは設定画面でユーザーが入力し localStorage に保存。ホットペッパーのキーはサーバー環境変数 `HOTPEPPER_KEY` のみ | 本番ではキー発行・制限をサーバー側へ |

## 3. 現在のファイル

```
gourmet-app/
├── index.html   # アプリ本体（単一ファイル：HTML + CSS + JS、フレームワークなし）
├── server.js    # ホットペッパー用プロキシ + 静的配信（Node 18+、依存なし）
├── README.md    # セットアップ手順・API マッピング表
└── CLAUDE.md    # このファイル
```

起動：`node server.js` → http://localhost:8797（ホットペッパーも使うなら `HOTPEPPER_KEY=xxx node server.js`）

### index.html の構造（主要関数）

- `S` … アプリ状態（settings / favs / deleted / center / radius / genre / results / queue / view）
- `GENRES` … チップ定義。`g` = Places の includedPrimaryTypes、`hp` = ホットペッパー genre コード、`kw` = 名前フィルタ用キーワード
- `loadMaps()` / `initMap()` … Maps JS 読み込みと地図・中心ピン（ドラッグ可）・半径円の初期化
- `setCenter(c, name, reverse)` … 検索中心の変更（逆ジオコーディングで地名表示）→ `search()`
- `search()` → `searchGoogle()` / `searchHotPepper()` … 両ソースを共通スキーマに正規化
  `{ id, name, genre, lat, lng, dish, dishLabel, price, hours, photo, url, rating, dist, source }`
  `id` は `g:<placeId>` / `hp:<shopId>` で名前空間を分けている
- `rebuildQueue()` … favs/deleted を除外した提示キュー
- `renderDeck()` / `cardEl()` / `attachSwipe()` / `fly()` / `act(kind, id)` … キュー先頭 `S.shown` 件（既定 `PAGE`=3）を縦一覧で描画、「さらに表示」で 3 件ずつ追加、各カードにポインタースワイプ（しきい値 100px）と登録／削除ボタン。表示中のカード全部に地図ピンを立てる
- `renderLists()` … お気に入り一覧・削除管理一覧（復旧ボタン、削除理由と自動復旧予定を表示）
- `buildTaste()` / `tasteScore()` / `rankOmakase()` … 好みの学習。お気に入り／削除の履歴からジャンル・価格帯・距離帯のスコアを都度計算（別データは持たない）。おまかせの並びは 近さ 0.5 ＋ 好み 0.5 ＋ 乱数 0.3。`isLiked()` で「あなた好み」タグ
- `askReason()` / `setReason()` / `restoreExpired()` … 削除直後の理由 4 択（高い／遠い／今の気分じゃない／興味なし、`REASONS`）。理由で学習の重み `DEL_W` が変わる。「今の気分じゃない」は 7 日で自動復旧（`expires`）
- `geocodeQuery()` … 「場所を変更」の地名入力をジオコーディングして `setCenter()`。検索ボタン・Enter・「この場所で探す」（入力があるとき）の3経路から呼ばれる
- `showView()` … タブ切替（探す／お気に入り／削除管理／設定）。「探す」は `#findScroll`（地図＋カード一覧＋ヒント）を1つのスクロール領域として持ち、ヘッダーとチップは固定。地図は `gestureHandling: 'cooperative'`（1本指=ページスクロール、2本指=地図操作）

### ジャンル → API マッピング

| チップ | Google Places | ホットペッパー |
|---|---|---|
| おまかせ | restaurant（人気順＋距離順）＋ `OMAKASE_TYPES` からランダム 2 タイプ | 指定なし |
| 和食 | japanese_restaurant | G004 |
| ラーメン | ramen_restaurant | G013 |
| イタリアン | italian_restaurant | G006 |
| 寿司 | sushi_restaurant | G004 + keyword 寿司 |
| カフェ | cafe, coffee_shop | G014 |
| 韓国料理 | korean_restaurant | G017 |
| 中華 | chinese_restaurant | G007 |
| 焼肉 | barbecue_restaurant | G008 |
| カレー | indian_restaurant | keyword カレー |
| 居酒屋 | bar | G001 |

### 表示項目 → API フィールド

| 項目 | Google Places | ホットペッパー |
|---|---|---|
| 店名 | displayName | name |
| ジャンル | primaryTypeDisplayName | genre.name |
| おすすめ | editorialSummary（無ければ口コミ冒頭 42 文字） | catch |
| 価格帯 | priceLevel → `〜¥1,000 / ¥1,000〜3,000 / ¥3,000〜8,000 / ¥8,000〜` | budget.name |
| 営業時間 | regularOpeningHours.weekdayDescriptions[今日] | open |
| 写真 | photos[0].getURI({maxWidth:800}) | photo.mobile.l |
| 外部リンク | googleMapsURI | urls.pc |

## 4. デザイン

- モックアップは claude.ai の Design キャンバス「グルメレコメンドアプリ モックアップ」（5 画面：探す／ジャンル選択／お気に入り／削除管理／位置情報の変更）
- トークン：背景 `#FBF7F0`、文字 `#1F1A17`、補助文字 `#6B625B`、罫線 `#E8DFD2`、アクセント `#E4572E`（削除・現在地）、お気に入り `#2F7A58`
- フォント：Zen Kaku Gothic New（Google Fonts）
- 画面幅は 480px 上限のモバイル前提。ボタンのタップ領域は 44px 以上

## 5. 未検証・既知の制約

- 実 API キーでの動作確認は 2026-09-20 に実施済み。Places のフィールド名・`priceLevel` の enum・`photos[0].getURI()` は想定どおりで、正規化の修正は不要だった
- Places API (New) の周辺検索は 1 回 20 件上限。半径を広げても件数は増えないため、`buildGoogleRequests()` で条件違いのリクエストを最大 `MAX_GOOGLE_REQUESTS`=4 本並列に投げて place ID で重複除去している（ジャンル指定＝人気順＋距離順の 2 本、おまかせ＝さらに `OMAKASE_TYPES` からランダム 2 タイプ）。おまかせの並びは `bucketShuffle()` で 500m 帯ごとにシャッフル
- 課金: `reviews` を fields に含めるため Nearby Search は Enterprise + Atmosphere SKU（月 1,000 回無料）。1 検索で最大 4 回消費するので、無料枠内は月 250 検索が目安
- ホットペッパーの `range` は 1=300m / 2=500m / 3=1km / 4=2km / 5=3km。5km 指定時は 3km 検索になり、`dist <= radius` でフィルタ
- `mapId: 'DEMO_MAP_ID'` は開発用。本番は Cloud Console で Map ID を発行
- 位置情報 API（`navigator.geolocation`）は `http://localhost` か HTTPS でのみ動作
- 「寿司」「カレー」は Places の名前フィルタ／ホットペッパーの keyword で寄せているだけで精度は粗い

## 6. 次にやること（優先順）

1. ~~実キーで動作確認~~（完了：正規化の修正は不要だった）
2. ~~候補数の拡充~~（完了：並列検索＋重複除去＋おまかせの帯内シャッフル）
3. 店舗詳細画面（写真ギャラリー・メニュー・営業時間全文・経路リンク）
4. プロジェクト分割：単一 HTML から Vite + TypeScript（または React）へ。`S` を store に、API 呼び出しを `src/api/google.ts` / `src/api/hotpepper.ts` に分離
5. サーバー同期：favs / deleted をユーザー単位で保存（認証込み）。Google キーもサーバー側で発行・リファラ制限
6. PWA 化（オフラインのお気に入り閲覧、ホーム画面追加）
7. テスト：正規化関数（`searchGoogle` / `searchHotPepper` の map 部分）を純関数に切り出してユニットテスト

## 7. 作業ルール（Claude Code 向け）

- 変更前に `node --check server.js` と index.html 内スクリプトの構文チェックを通す
- API キーをコードやコミットに含めない（`.env` は `.gitignore` に追加）
- スワイプの方向（右＝削除、左＝お気に入り）と「削除は復旧可能」の仕様は変えない
- UI の色・フォントは上記トークンに従う。絵文字アイコンは使わず SVG
