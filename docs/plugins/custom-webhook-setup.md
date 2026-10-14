# Direkta notis-webhooks till Home Assistant

Denna lokala anpassning utgår från [Nightscout PR #8580](https://github.com/nightscout/cgm-remote-monitor/pull/8580).
Avsändaren, inställningarna, inkopplingen i pushnotify och grundtesterna återanvänds.
Källmappen saknar Git-historik, så ändringarna är applicerade i filerna utan merge-commit.
PR:ns README-avsnitt ersätts av denna guide eftersom den lokala README-filen är tom.

## Filer att kopiera

Följande fyra filer behövs på Nightscout-servern, på samma relativa sökvägar:

- `lib/server/customwebhook.js` (ny)
- `lib/server/bootevent.js`
- `lib/server/pushnotify.js`
- `lib/settings.js`

Kopiera även dessa för att behålla dokumentation och tester i ditt repo:

- `docs/plugins/custom-webhook-setup.md` (denna fil)
- `docs/example-template.env`
- `tests/customwebhook.test.js` (ny, från PR:n)
- `tests/customwebhook-compat.test.js` (ny, lokal kompatibilitet och HTTP-transport)
- `tests/settings.test.js`

Inga nya produktionsberoenden behövs. Bygg om och starta om Nightscout på vanligt sätt.
`lib/plugins/maker.js` och `lib/plugins/treatmentnotify.js` är oförändrade.

Denna ändring innehåller också automatisk versionsmärkning av JavaScript.
Kopiera även filerna i [guiden för versionsmärkning](../asset-versioning.md).

## Inställningar

Lägg till följande miljövariabler i serverns befintliga konfiguration:

```dotenv
CUSTOM_WEBHOOK_URL_1="http://192.168.1.50:8123/api/webhook/DITT_HEMLIGA_WEBHOOK_ID"
CUSTOM_WEBHOOK_EVENT_1="ns-information-treatmentnotify"
```

Byt adress och webhook-ID till din Home Assistant-installation. Adressen måste gå att nå
från Nightscout-servern eller dess container. Använd HTTPS om Home Assistant kräver det.
Behåll `LANGUAGE=sv` för ditt nuvarande svenska eventnamn. Med engelska blir det
`ns-info-treatmentnotify`: nivån översätts på samma sätt som i din lokala Maker-väg.

Lägg till `treatmentnotify` i din befintliga `ENABLE`-lista om det inte redan är aktiverat;
ersätt inte listans andra plugins. Säkerställ att det inte finns i `DISABLE`.
Ingen `customwebhook`-post i `ENABLE` behövs. Avsändaren aktiveras av URL/event-paret.

Maker kan köras parallellt under övergången. När du vill sluta skicka till IFTTT kan du
ta bort `MAKER_KEY` och eventuell `MAKER_ANNOUNCEMENT_KEY`. Den nya vägen kräver inga Maker-nycklar.

Upp till fyra par stöds (`_1` till `_4`), även med luckor. Varje par tar ett exakt eventnamn.
Samma URL får ett anrop per notifikation även om flera par matchar.
Utan inställda par skickas inga custom webhooks. Ofullständiga par och ogiltiga URL:er hoppas över.
Med enbart eventet ovan skickas inga andra event till denna mottagare.

## Payload och Maker-kompatibilitet

Anropet är en HTTP POST med `Content-Type: application/json`. Exempel med fiktiva värden:

```json
{
  "source": "nightscout",
  "event": "ns-information-treatmentnotify",
  "name": "treatmentnotify",
  "level": "information",
  "title": "Måltid (Kh & Bolus)",
  "message": "\nKolhydrater: 15g\nInsulin: 1.25E\nInlagt av: Trio",
  "value1": "Måltid (Kh & Bolus)",
  "value2": "\n\nKolhydrater: 15g\nInsulin: 1.25E\nInlagt av: Trio",
  "isAnnouncement": false,
  "mills": 1791979200000,
  "iso": "2026-10-14T12:00:00.000Z"
}
```

`value1` är samma titel som Maker skickar. `value2` beräknas med exakt samma uttryck:
`notify.message && '\n' + notify.message`. Ingen trimning, översättning eller städning
läggs till. Befintliga radbrytningar, decimalformat, svenska tecken och enheter bevaras.
JSON-strängarna motsvarar Makers URL-avkodade värden; de ska inte URL-avkodas igen i Home Assistant.
Behandlingar saknar `value3`, precis som den lokala Maker-vägen.
För ett separat konfigurerat `ns-allclear` innehåller `value3` Makers avrundade minuttidsstämpel
med inledande radbrytning. PR:ns allclear-väg har inte Makers 30-minutersbegränsning.

`title` och `message` från PR:n finns också kvar. `mills` och `iso` är sändningstid,
inte behandlingens tidsstämpel eller en exakt motsvarighet till IFTTT:s mottagningstid `OccurredAt`.

## Home Assistant och ditt IFTTT-filter

Skapa senare en automation med webhook-trigger, samma hemliga ID som i URL:en,
POST tillåtet och `local_only: true`. Fälten läses som `trigger.json.value1` och
`trigger.json.value2`. Se [Home Assistants webhook-dokumentation](https://www.home-assistant.io/docs/automation/trigger/#webhook-trigger).

Den bifogade filterkodens aktiva regler ska flyttas till automationen:

- Normalisera CRLF, trimma och ta bort avslutande blanksteg på rader.
- Använd `Trio: ` följt av den städade titeln och den städade meddelandetexten.
- Hoppa över mobilnotisen vid `Fett/Protein` i meddelandet eller `Temporär basal` i titeln.
- Byt rubriker för Site Change, Insulin Change, Sensor Change/Start och Announcement.

Reglerna hårdkodas inte i Nightscout. Utkommenterade äldre filterregler ska inte återaktiveras.
Skärmbildens Google Sheets-åtgärd är separat; att hoppa över en mobilnotis behöver inte
innebära att motsvarande loggrad ska hoppas över. Ingen Home Assistant-automation eller
Sheets-ersättning är installerad i detta steg.

## Leverans och verifiering

Alla 2xx-svar räknas som lyckad leverans. Socket-timeout är fem sekunder.
Nätverksfel, avbrutna svar och andra HTTP-statusar rapporteras via callback.
Det finns ingen beständig kö eller automatisk retry. Ett lyckat HTTP-svar bekräftar mottagandet,
inte att en mobil har visat notisen. URL:er filtreras bort ur publicerade inställningar;
webhook-loggarna innehåller inte sökvägen, token eller payloaden.

En lokal komplettering behåller Makers två minuters dubblettskydd efter lyckad custom-leverans,
utan att förkorta längre skydd från annan avsändare. PR:n ensam hade lämnat detta på 30 sekunder
när Maker saknas, vilket hade kunnat ge upprepade behandlingsnotiser.

Kör testerna i en utvecklingsmiljö med projektets testberoenden installerade:

```sh
./node_modules/.bin/mocha --timeout 10000 --require ./tests/hooks.js --exit \
  tests/customwebhook.test.js tests/customwebhook-compat.test.js \
  tests/maker.test.js tests/settings.test.js
```

Lokalt resultat: 51 godkända tester och ett befintligt fel i `settings / have defaults ready`:
testet förväntar sig 12-timmarsformat medan den lokala koden redan använder 24.
De nya testerna verifierar bland annat riktig svensk treatmentnotify-output mot Makers
avkodade query-sträng, drift utan Maker, dubblettskydd samt verkliga HTTP-anrop med 204,
500 och avbruten anslutning. ESLint godkänner alla ändrade JavaScript-filer.
Testberoendena installerades separat i en temporär mapp; projektets paketfiler ändrades inte.
Full serverstart och leverans till din riktiga Home Assistant/mobil återstår efter installation.
