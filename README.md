# MeshCore Dashboard

Kleines lokales Dashboard fuer einen MeshCore Companion. Es verbindet sich im Browser ueber Web Serial oder Web Bluetooth.

USB spricht das MeshCore Companion Framing:

- App -> Radio: `<` + 16-bit Laenge little endian + Payload
- Radio -> App: `>` + 16-bit Laenge little endian + Payload

## Start

1. MeshCore USB-Companion anschliessen.
2. In diesem Ordner einen lokalen Webserver starten:

   ```powershell
   python -m http.server 8000
   ```

3. `http://localhost:8000` in Chrome oder Edge oeffnen.
4. `USB verbinden` oder `Bluetooth` anklicken und das MeshCore-Geraet auswaehlen.

Web Bluetooth funktioniert nur in Chrome oder Edge in einem sicheren Seitenkontext, also ueber `localhost`, `127.0.0.1` oder HTTPS. Bei einer Einbettung muss der uebergeordnete iframe Bluetooth mit `allow="bluetooth"` freigeben.

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
- Auto-Pong mit einstellbarer PLZ senden (`@[Name] Pong - x Hops in PLZ`)
- Wetteransage optional aktivieren: Im Kanal `#wetter` stehen `wetter <Ort>`, `wetter <Ort> heute`, `wetter <Ort> morgen`, `wetter <Ort> 3`, `regen <Ort>` und `wetter hilfe` zur Verfuegung
- Dashboard-Konfiguration als JSON exportieren und importieren (ohne private Kanalschluessel)
- Kontakte favorisieren sowie Nachrichten nach Text, Richtung und Typ filtern
- Interaktive OpenStreetMap-Netzkarte mit Zoom, Clustering, Vollbild, Verbindungs- und Dichteebenen sowie Filtern nach Node-Typ
- Umschaltbare Graphansicht, aufgeloeste Routenketten, Hop-Statistik je Node und Hervorhebung oft genutzter Repeater
- Dauerhafte Reichweitenrekorde und erweiterte Paketdiagnose mit Rate, Volumen, ACK-Quote, Roundtrip, Duplikaten, Typverteilung und Ereignisliste
- Informationsdienste `zeit <Ort>` und `sonne <Ort>` im Kanal `#wetter`
- Als Progressive Web App installierbar und nach dem ersten Laden offline startbar
- eigenes Advertisement per Button senden
- Verschluesselten privaten Kanaelen per 16-Byte-Secret (Hex oder Base64) beitreten oder neue private Kanaele erzeugen
- Kanaele aus nicht reservierten Slots wieder vom Companion entfernen
- Bekannten Room-Servern mit optionalem Passwort beitreten und die Room-Unterhaltung als Direktchat oeffnen

Hinweis: Web Serial und Web Bluetooth sind in Firefox/Safari nicht verfuegbar. Nutze fuer USB die `companion_radio_usb`- und fuer Bluetooth die Companion-BLE-Firmware, jeweils nicht im KISS-Modus.
