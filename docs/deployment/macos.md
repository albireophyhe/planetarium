# macOS版のビルドと配布準備

現在のmacOS版はSwiftPMを正本とし、最適化したローカル検証用の`.app`を
シェルから組み立てます。配布候補に近い応答速度を確認できるよう、
Swiftの`release`構成を使用します。

## 開発用アプリ

```sh
./script/build_and_run.sh
./script/build_and_run.sh --verify
```

`--verify`は実行ファイル、Info.plist、Bundle ID、最低OS、Web版と意匠を
揃えたアプリアイコン、ad hoc署名、同梱resourceの完全な期待集合と
schemaVersion、起動プロセスを検査します。さらに全regular fileのlogical
bytesを署名後に合算し、`config/macos-budgets.json`の20 MiB上限を超える
配布候補を停止します。release成果物は署名前にローカルシンボルを除去し、
現在の実測は16,685,415 bytes（15.912 MiB）です。`--debug`ではLLDBでの
調査に必要なシンボルを保持します。
生成先は`dist/Planetarium.app`です。

旧星表と検証fixtureはテスト時にリポジトリ原本から読み、本番`.app`には
同梱しません。SwiftPMの増分buildに残った既知の旧資産もstaging時に除き、
閉じたresource一覧で未知の残留物を拒否します。

アプリアイコンの固定hashと10表現だけを確認する場合は
`./script/build_app_icon.sh --check`、Web原画からlibrsvg 2.62.3で
byte単位に再現する場合は`./script/build_app_icon.sh --reproduce`を使います。

補助モード:

```sh
./script/build_and_run.sh --debug
./script/build_and_run.sh --logs
./script/build_and_run.sh --telemetry
```

## 公開配布との境界

現在のad hoc署名はローカル検証用で、`release`構成であっても第三者配布用では
ありません。公開前には次を別工程として実施します。

1. 一意のVersion/Build番号を設定する。
2. Developer ID Application証明書を用い、Hardened Runtime
   （`--options runtime`）とsecure timestamp（`--timestamp`）を有効にして、
   最終的なbundleを署名する。
3. 位置情報以外の不要なentitlementと、
   `com.apple.security.get-task-allow=true`がないことを確認する。
4. `codesign --verify --deep --strict`に加え、`codesign -dvv`で
   Developer ID、runtime flag、`Timestamp`を確認する。
5. `notarytool`でApple Notary Serviceへ送信して完了ログを確認し、
   ticketをstapleしてから`stapler validate`と`spctl --assess`を通す。
6. 別ユーザー環境でGatekeeper、初回起動、位置拒否、オフライン起動を確認する。

この要件はAppleの
[公証準備](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)と
[公証エラーの解決](https://developer.apple.com/documentation/security/resolving-common-notarization-issues)
に従う。Hardened Runtimeとsecure timestampは任意の強化ではなく、
現在の公証工程の必須条件である。

署名ID、Apple資格情報、公証用キーはリポジトリへ保存しません。公開配布を自動化する際は、CIの秘密管理と承認付きリリース工程を別途設計します。
