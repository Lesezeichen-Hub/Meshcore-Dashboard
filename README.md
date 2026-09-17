# MeshCore Dashboard

Kleines lokales Dashboard fuer einen MeshCore USB-Companion. Es laeuft direkt im Browser ueber die Web-Serial-API und spricht das MeshCore Companion USB framing:

- App -> Radio: `<` + 16-bit Laenge little endian + Payload
- Radio -> App: `>` + 16-bit Laenge little endian + Payload

## Start

1. MeshCore USB-Companion anschliessen.
2. In diesem Ordner einen lokalen Webserver starten:

   ```powershell
   python -m http.server 8000
   ```

3. `http://localhost:8000` in Chrome oder Edge oeffnen.
4. `Verbinden` anklicken und den seriellen MeshCore-Port auswaehlen.

## Lesezeichen-Hub

Der Ordner kann direkt als lokales Modul eingebunden werden: Im Lesezeichen-Hub unter
`Module` ein lokales Modul anlegen und diesen Projektordner auswaehlen. Der Hub liefert
die statische Anwendung dann unter seiner eigenen `/modules/...`-Adresse aus. Web Serial
funktioniert dort, weil der Hub lokal ueber `127.0.0.1` beziehungsweise `localhost` laeuft.

Die Modulversion steht nach dem Schema der Lesezeichen-Hub-Module in `version.json`.
Bei einer neuen Version werden `version` nach Semantic Versioning und `updated_at`
gemeinsam aktualisiert.

## Funktionen

- Device-Info, Firmware/Modell und eigene Node-Daten lesen
- Batterie/Speicher anzeigen
- Kontakte synchronisieren, inklusive Repeater/Clients aus den Advertisements
- Kanaele 0..N auslesen
- eingehende Kanal- und Direktnachrichten anzeigen
- Kanalnachrichten senden
- eigenes Advertisement per Button senden

Hinweis: Web Serial ist in Firefox/Safari nicht verfuegbar. Falls keine Daten kommen, pruefe, ob dein Device mit der `companion_radio_usb` Firmware laeuft und nicht im BLE- oder KISS-Modus ist.
