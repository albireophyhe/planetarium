# macOS版のビルドと配布準備

現在のmacOS版はSwiftPMを正本とし、開発用の`.app`をシェルから組み立てます。

## 開発用アプリ

```sh
./script/build_and_run.sh
./script/build_and_run.sh --verify
```

`--verify`は実行ファイル、Info.plist、Bundle ID、最低OS、Web版と意匠を
揃えたアプリアイコン、ad hoc署名、同梱JSONとschemaVersion、起動プロセスを
検査します。生成先は`dist/Planetarium.app`です。

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

現在のad hoc署名はローカル開発用で、第三者配布用ではありません。公開前には次を別工程として実施します。

1. 一意のVersion/Build番号を設定する。
2. Developer ID Application証明書で署名する。
3. 位置情報以外の不要なentitlementがないことを確認する。
4. Apple Notary Serviceへ送信し、stapleする。
5. 別ユーザー環境でGatekeeper、初回起動、位置拒否、オフライン起動を確認する。

署名ID、Apple資格情報、公証用キーはリポジトリへ保存しません。公開配布を自動化する際は、CIの秘密管理と承認付きリリース工程を別途設計します。
