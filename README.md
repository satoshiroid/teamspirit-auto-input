# TeamSpirit 勤怠・工数 自動入力アプリ

別の勤怠システムの画面スクショから日付・出退勤を OCR で読み取り、TeamSpirit EX「勤務表」に
出退勤・工数明細・勤務場所・業務内容を自動入力するデスクトップアプリ（Electron / Windows・Mac対応）。

OCR は **tesseract.js**（純JS/WASM・**Python不要**・オフライン動作）。OCR言語データを同梱しており、
ネットワークなしで動作します。

## 構成
- `app/` … Electron（UI・メインプロセス・preload）
- `automation.js` … Playwright による TeamSpirit 自動入力ロジック
- `ocr-node.js` … tesseract.js によるローカルOCR（日付・出退勤の抽出）
- `ocr/tessdata/` … OCR言語データ（jpn / eng・オフライン用に同梱）
- `default-config.json` … 既定値テンプレート（取引先名・コードはプレースホルダー。利用者が自分の値に変更）
- 設定の保存先 … OSのユーザーデータ領域（`config.json`／リポジトリには含めない）

## 動作要件
- 端末に **Microsoft Edge** または **Google Chrome** がインストールされていること（Playwright が端末のブラウザを操作。Edge優先→無ければChromeに自動フォールバック。Windowsは Edge 標準搭載のため追加インストール不要）。
- パスワード等の認証情報はアプリは一切保持しません。**TeamSpirit へのログインは手動**で行います（ブラウザごとに専用プロファイルを使うため、初回に一度だけログイン）。
- ブラウザを固定したい場合は設定ファイル `config.json` に `"browserChannel": "msedge"`（または `"chrome"`）を指定できます。

## 開発（ソースから起動）
```
npm install
npm start
```

## 使い方
1. **ツール起動** … 専用ブラウザが開く。初回だけ TeamSpirit にログイン（次回以降は保持）。
2. **設定** … 工数明細・知識/技能・勤務場所・業務内容を登録。
   「TeamSpiritの入力値から取得」で直近の入力済み日から自動取得も可能。未入力項目があると保存不可。
3. **勤怠自動入力** … 対象年月を選び、別システムのスクショを読み込み → OCR → 確認画面で修正 → 開始。
   （OCRを使わず手入力でも可）

## 配布（ビルド）
`electron-builder` の `zip` ターゲットで配布用ZIPを生成（Mac から Windows 版もビルド可、wine不要）。
```
npm run dist:win   # Windows 向け ZIP
npm run dist:mac   # Mac 向け ZIP
```
ビルド成果物は `dist/` に出力（リポジトリには含めない）。

## 注意
- TeamSpirit 側で対象年月の勤務表を表示しておくこと。
- **申請・月次勤務確定は自動化しない**（不可逆のため必ず手動）。
- 実行中は自動ブラウザを操作しない（再読込で入力が飛ぶ）。
