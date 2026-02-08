# データ変換スクリプト

このディレクトリには、外部データソースをアプリケーション用のJSON形式に変換するスクリプトが含まれています。

## 1. 郵便番号データの準備

### 手順

#### 1.1 KEN_ALL.csvのダウンロード
日本郵便の公式サイトから郵便番号データをダウンロードします：
https://www.post.japanpost.jp/zipcode/dl/kogaki-zip.html

「読み仮名データの促音・拗音を小書きで表記しないもの」の「全国一括」をダウンロードしてください。

#### 1.2 ファイルの配置
ダウンロードしたZIPファイルを解凍し、`KEN_ALL.CSV`を`data/`フォルダに配置します：
```
trip-planner-mvp/
└── data/
    └── KEN_ALL.csv  ← ここに配置
```

#### 1.3 変換スクリプトの実行
```bash
npm run postcode:convert
```

または

```bash
node scripts/kenall_to_postcodes.mjs
```

#### 1.4 出力確認
`data/postcodes.json`が生成されます。このファイルには約12万件の郵便番号データが含まれます。

### 出力形式

```json
[
  {
    "zip": "1000001",
    "pref": "東京都",
    "city": "千代田区",
    "towns": ["千代田"]
  }
]
```

## 2. 駅データの準備

### 手順

#### 2.1 駅データ（GeoJSON）のダウンロード
国土数値情報から駅データをダウンロードします：
https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-v3_1.html

「鉄道」のGeoJSON形式をダウンロードしてください。

#### 2.2 ファイルの配置
ダウンロードしたZIPファイルを解凍し、`N02-23_Station.geojson`を`data/`フォルダに配置します：
```
trip-planner-mvp/
└── data/
    └── N02-23_Station.geojson  ← ここに配置
```

#### 2.3 変換スクリプトの実行
```bash
npm run station:convert
```

または

```bash
node scripts/geojson_to_stations.mjs
```

#### 2.4 出力確認
`data/stations.json`が生成されます。このファイルには全国の駅データが含まれます。

### 出力形式

```json
[
  {
    "name": "東京",
    "line": "JR東海道本線",
    "operator": "JR東日本",
    "lon": 139.7671,
    "lat": 35.6812
  }
]
```

## 注意事項

- すべてのCSV/GeoJSONファイルは`.gitignore`に含まれているため、Gitにコミットされません
- 変換後のJSONファイルも`.gitignore`に含まれています
- データファイルは各自でダウンロード・変換してください
