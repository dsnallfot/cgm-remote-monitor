# Automatisk versionsmärkning av JavaScript

Varje Webpack-bygge skriver ett nytt offentligt bygg-ID till
`node_modules/.cache/_ns_cache/public/build-version.json`.
Nightscout läser ID:t vid serverstart och använder det i URL:erna:

```text
/bundle/<bygg-id>/js/bundle.app.js
/bundle/<bygg-id>/js/bundle.clock.js
/assets/<bygg-id>/js/client.js
```

Även egna skript för admin, rapporter, mat och profiler får versionerade adresser.
Socket.IO:s bibliotek och dynamiska API-skript använder sina befintliga adresser.
De fysiska filnamnen behålls; Express serverar dem under den aktuella versionens sökväg.
Detta fungerar även om Cloudflare ignorerar query-parametrar i sin cachenyckel.
Ingen hemlig nyckel används som versionsnummer.

HTML-sidor och `/sw.js` får `Cache-Control: no-store`. Service workern använder
bygg-ID:t som cachenamn och förladdar de versionerade skripten. Registreringen använder
`updateViaCache: 'none'`. Vanlig serveromstart behåller ID:t; nytt bygge byter det.
Utvecklingsläget behåller `/devbundle` och statiska adresser utan versionsnummer för hot reload.

## Installation tillsammans med webhook-ändringen

Utöver filerna i [webhook-guiden](plugins/custom-webhook-setup.md), kopiera:

- `webpack/build-version-plugin.js` (ny)
- `webpack/webpack.config.js`
- `lib/server/asset-version.js` (ny)
- `lib/server/app.js`
- `lib/server/clocks.js`
- `views/index.html`
- `views/adminindex.html`
- `views/foodindex.html`
- `views/profileindex.html`
- `views/reportindex.html`
- `views/service-worker.js`
- `tests/asset-version.test.js` (ny)
- `docs/asset-versioning.md` (denna fil)

Kör `npm run bundle` och starta sedan om Nightscout. Den befintliga Docker-byggningen
kör redan Webpack genom `postinstall`, så ingen Dockerfile-ändring behövs.
Kopiera inte den temporära testmiljön eller dess beroenden till servern.
Om manifestet saknas används ett slumpat ID per serverstart och en varning uppmanar till ombyggnad.

Vid den första installationen kan gammal HTML eller `/sw.js` redan ligga i Cloudflare.
En sista cacherensning kan då behövas, följt av omladdning av sidan.
Framtida kodändringar ska byggas och följas av omstart och omladdning; redan öppna sidor
byter inte automatiskt den JavaScript-kod som redan körs.

Cloudflare ska respektera origin-serverns cacheheaders för HTML och `/sw.js`.
En regel som tvingar cachning trots `no-store` behöver ändras separat;
inga Cloudflare-inställningar har ändrats här.
Se [Cloudflares dokumentation](https://developers.cloudflare.com/cache/concepts/cache-control/).

Webhook-avsändaren körs på servern och kräver omstart, men påverkas inte av webbläsarens JavaScript-cache.

## Verifiering

`tests/asset-version.test.js` har tre godkända tester: två riktiga minimala Webpack-byggen,
stabilt ID mellan serverstarter, fallback vid saknat/ogiltigt manifest samt kontroll av
sidornas och service workerns renderade skriptadresser. Service workerns syntax kontrolleras också.
Lint ger inga fel; varningar om filåtkomst med beräknade sökvägar finns i serverkod och tester.
Hela Nightscouts produktionsbygge och beteendet genom din Cloudflare-installation har inte körts lokalt.
