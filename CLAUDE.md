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
| 距離 | 自前の Haversine（`src/geo.ts` の `distanceM`） | Google の geometry と同等の球面距離。純関数にして正規化をテストするため。徒歩分数は 80m/分で概算 |
| 永続化（現状） | `localStorage`（`gourmet.favs` / `gourmet.deleted` / `gourmet.settings` / `gourmet.center` / `gourmet.radius`） | 試作段階。サーバー同期は未実装 |
| API キー | Google キーは設定画面でユーザーが入力し localStorage に保存。ホットペッパーと Claude のキーはサーバー側のみ（環境変数または `.env` の `HOTPEPPER_KEY` / `ANTHROPIC_API_KEY`） | 本番ではキー発行・制限をサーバー側へ |
| サーバーの公開先 | **Render**（無料枠、`render.yaml` の Blueprint、サービス名 `gourmet-app-server`）。アプリは GitHub Pages 上では既定で `PUBLIC_SERVER` を向き、起動時に `probeServer()` で `/api/status` を叩いて使える機能を判定。`server.js` は `ALLOWED_ORIGINS` で Origin を制限し、名物抽出に IP／日次の回数上限を持つ | Pages は静的配信で server.js が動かない。無料枠のスリープ（初回 1 分）は起動時の probe で吸収 |
| 名物の一皿 | `server.js` の `POST /api/dish` が Google の口コミ（最大 5 件）を **Claude Opus 5**（`claude-opus-5`、`fallbacks: "default"`、構造化出力、effort low）に渡して `{dish, reason, vibe}` を抽出。SDK ではなく `fetch` で Messages API を直接呼ぶ（依存ゼロ方針・この PC に npm が無いため） | カードの「おすすめ」が口コミ冒頭では弱かった。サーバー（`.cache/dish.json`）と端末（`gourmet.dish`）の両方でキャッシュし、1 店 1 回しか課金しない |

## 3. 現在のファイル（Vite + TypeScript、フレームワークなし）

```
gourmet-app/
├── index.html          # Vite のエントリ（マークアップのみ。スクリプトは src/main.ts）
├── src/
│   ├── main.ts         # 起動: 各 UI の init → サーバー確認 → Maps 読み込み → 初回検索。DEV では window.__app に内部を公開
│   ├── state.ts        # S（アプリ状態）、LS/save（localStorage、キー名は旧来と互換）、SERVER、DISH、GENRES、定数、$ / el / toast
│   ├── types.ts        # Shop / SavedShop / Settings / Filters など
│   ├── geo.ts          # distanceM（Haversine）、fmtDist、walk。Google の geometry ライブラリは使わない（純関数でテストするため）
│   ├── taste.ts        # 好みの学習: computeTaste / scoreWith / rankWith（純関数）と S に結び付けた buildTaste / tasteScore / isLiked / rankOmakase、REASONS、restoreExpired
│   ├── search.ts       # setCenter → search → rebuildQueue / passFilters / refresh
│   ├── maps.ts         # loadMaps / initMap / ピン（showShopMarkers）/ moveCenter / reverseGeocode / geocodeAddress
│   ├── api/
│   │   ├── google.ts   # buildGoogleRequests / normalizeGooglePlace（純関数）/ searchGoogle、PRICE、OMAKASE_TYPES
│   │   ├── hotpepper.ts# normalizeHotPepperShop / smokingOf / rangeOf / sameShop（純関数）/ fetchHotPepper / enrichFromHotPepper
│   │   ├── server.ts   # probeServer（/api/status）/ fetchDishes（/api/dish）/ applyCachedDish
│   │   └── weather.ts  # fetchWeather（Open-Meteo）
│   ├── ui/
│   │   ├── deck.ts     # renderDeck / cardEl / attachSwipe / fly / act
│   │   ├── sheet.ts    # 店舗詳細シート openSheet / closeSheet / initSheet / routeURL
│   │   ├── lists.ts    # お気に入り・削除管理の一覧 renderLists / initLists
│   │   ├── filters.ts  # 絞り込みチップと雨バナー renderFilters / renderRainbar / initFilters
│   │   ├── reasons.ts  # 削除理由バー askReason / setReason
│   │   ├── location.ts # 場所ダイアログ・履歴・現在地 geocodeQuery / locateMe / pushHistory / initLocation
│   │   ├── nav.ts      # showView / initNav（タブとジャンルチップ）
│   │   ├── settings.ts # initSettings
│   │   └── icons.ts    # SVG アイコン文字列
│   ├── styles.css
│   └── *.test.ts       # vitest（正規化・学習・距離の純関数）
├── server.js           # ホットペッパー用プロキシ + 名物抽出（Claude）+ dist/ の静的配信（CommonJS、依存なし）
├── vite.config.mts     # base は BASE_PATH 環境変数（Pages では /gourmet-app/）。dev では /api を 8797 へプロキシ
├── tsconfig.json / package.json / package-lock.json
├── render.yaml         # Render の Blueprint（buildCommand: npm ci && npm run build）
├── .github/workflows/pages.yml  # main への push で test → build → GitHub Pages へデプロイ
├── .env.example        # サーバー側キーの雛形（.env は gitignore）
├── README.md / CLAUDE.md
```

コマンド: `npm run dev`（Vite、http://localhost:5173、/api は server.js へ転送）／`node server.js`（API と dist/ の配信、8797）／`npm test`／`npm run build`（tsc --noEmit → vite build）。
サーバー側キーは `.env`（`.env.example` をコピー）か環境変数。`/api/status` でキーの設定状況を確認できる。

### 設計上の約束

- **モジュール間は関数呼び出し時の循環だけ許容**し、import 時に相手の値を使わない。各 UI モジュールは `initX()` を export して main.ts が順に呼ぶ
- 正規化（`normalizeGooglePlace` / `normalizeHotPepperShop`）と学習（`computeTaste` 等）は**純関数**に保ち、テストは node 環境で回す。`state.ts` はブラウザ API が無くても import できる
- `S` は単一のミュータブルなオブジェクト。永続化は `save(key, value)` を明示的に呼ぶ（自動保存はしない）
- 主要な処理の流れ: `setCenter` → `search`（`searchGoogle` / `searchHotPepper` → `enrichFromHotPepper` → `applyCachedDish`）→ `rebuildQueue`（favs/deleted 除外 + `passFilters`）→ `renderDeck`（先頭 `S.shown` 件、ピン表示、`fetchDishes`）
- 各機能の詳細（学習の重み、絞り込み、雨、名物、詳細シート、履歴）は以前の記述どおりで、実装場所が上記のファイルに分かれただけ

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
| 詳細画面 | formattedAddress / nationalPhoneNumber / websiteURI / isReservable / hasDineIn / hasTakeout / hasOutdoorSeating / photos（最大 6 枚）/ regularOpeningHours.weekdayDescriptions（全曜日） | address / access / open / close / private_room / card / parking / wifi / lunch / midnight / free_drink |
| 営業中 | Place.isOpen()（regularOpeningHours + utcOffsetMinutes、businessStatus が OPERATIONAL 以外は false） | （項目なし → 不明） |
| 喫煙 | （項目なし → ホットペッパー突き合わせで補完） | non_smoking（全面禁煙=不可／一部禁煙・禁煙席なし=可） |

## 4. デザイン

- モックアップは claude.ai の Design キャンバス「グルメレコメンドアプリ モックアップ」（5 画面：探す／ジャンル選択／お気に入り／削除管理／位置情報の変更）
- トークン：背景 `#FBF7F0`、文字 `#1F1A17`、補助文字 `#6B625B`、罫線 `#E8DFD2`、アクセント `#E4572E`（削除・現在地）、お気に入り `#2F7A58`
- フォント：Zen Kaku Gothic New（Google Fonts）
- 画面幅は 480px 上限のモバイル前提。ボタンのタップ領域は 44px 以上

## 5. 未検証・既知の制約

- 実 API キーでの動作確認は 2026-09-20 に実施済み。Places のフィールド名・`priceLevel` の enum・`photos[0].getURI()` は想定どおりで、正規化の修正は不要だった
- Places API (New) の周辺検索は 1 回 20 件上限。半径を広げても件数は増えないため、`buildGoogleRequests()` で条件違いのリクエストを最大 `MAX_GOOGLE_REQUESTS`=4 本並列に投げて place ID で重複除去している（ジャンル指定＝人気順＋距離順の 2 本、おまかせ＝さらに `OMAKASE_TYPES` からランダム 2 タイプ）。おまかせの並びは `rankOmakase()`（近さ＋好み＋乱数）
- 課金: `reviews` を fields に含めるため Nearby Search は Enterprise + Atmosphere SKU（月 1,000 回無料）。1 検索で最大 4 回消費するので、無料枠内は月 250 検索が目安
- ホットペッパーの `range` は 1=300m / 2=500m / 3=1km / 4=2km / 5=3km。5km 指定時は 3km 検索になり、`dist <= radius` でフィルタ
- `mapId: 'DEMO_MAP_ID'` は開発用。本番は Cloud Console で Map ID を発行
- 位置情報 API（`navigator.geolocation`）は `http://localhost` か HTTPS でのみ動作
- 「寿司」「カレー」は Places の名前フィルタ／ホットペッパーの keyword で寄せているだけで精度は粗い

## 6. 次にやること（優先順）

1. ~~実キーで動作確認~~（完了：正規化の修正は不要だった）
2. ~~候補数の拡充~~（完了：並列検索＋重複除去＋おまかせの帯内シャッフル）
3. ~~店舗詳細画面~~（完了：ボトムシート。メニューは Places に無いので名物抽出で代替）
4. ~~プロジェクト分割~~（完了：Vite + TypeScript、Vanilla。GitHub Pages は Actions でビルド配信）
5. サーバー同期：favs / deleted をユーザー単位で保存（認証込み）。Google キーもサーバー側で発行・リファラ制限
6. PWA 化（オフラインのお気に入り閲覧、ホーム画面追加）
7. ~~テスト~~（完了：vitest 22 件。正規化・学習・距離。UI の回帰は Claude Code のブラウザペインで確認）

## 7. 作業ルール（Claude Code 向け）

- 変更前に `npm run build`（tsc の型チェック込み）と `npm test` を通す。server.js は `node --check server.js`
- API キーをコードやコミットに含めない（`.env` は `.gitignore` に追加）
- スワイプの方向（右＝削除、左＝お気に入り）と「削除は復旧可能」の仕様は変えない
- UI の色・フォントは上記トークンに従う。絵文字アイコンは使わず SVG
