# Contributing

## 変更の進め方

1. 関連する計画またはユーザーストーリーを確認する。
2. 一つの目的に絞った小さな変更を行う。
3. 天文計算を変更した場合は、共有テストベクトルと両クライアントのテストを更新する。
4. UIを変更した場合は、キーボード操作、文字拡大、狭い画面、ダーク表示を確認する。
5. Webの可視コピーまたは星表の表示名を変更した場合は、READMEの固定環境でフォントを再生成し、`.venv-fonts/bin/python script/subset_fonts.py --check`と`npm run web:budget`を実行する。
6. 実行した検証と残る制約を変更内容に記録する。

## コードの境界

- `shared/`: 星表、星座線、共有テストベクトルなどの言語非依存データ
- `apps/web/`: Web版とCloudflare設定
- `apps/macos/`: macOS版Swift Package
- `docs/`: 計画、設計判断、ユーザーストーリー、改善履歴

一般のビルド生成物、秘密情報、個人の位置履歴はコミットしません。例外として、オフライン配布に必要な`apps/web/src/assets/fonts/PlanetariumSansJP-*.woff2`は入力ソースと同様に版管理します。サブセットはIBM PlexのModified Versionなので、Reserved Font Nameを含む主名称へ戻さず、OFL全文と`THIRD_PARTY_NOTICES.md`を一緒に維持してください。

依存packageがinstall scriptを追加した場合は、通信とファイル変更を確認します。
必要なscriptだけを完全なpackage名・versionで`allowScripts`へ追加し、
telemetryや未審査scriptを許可しません。
