const FRAME_TO_RADIO = 0x3c;
const FRAME_FROM_RADIO = 0x3e;
const BAUD_RATE = 115200;

const CMD = {
  APP_START: 0x01,
  SEND_CHANNEL_TXT_MSG: 0x03,
  GET_CONTACTS: 0x04,
  SET_DEVICE_TIME: 0x06,
  SEND_SELF_ADVERT: 0x07,
  SYNC_NEXT_MESSAGE: 0x0a,
  GET_BATT_AND_STORAGE: 0x14,
  DEVICE_QUERY: 0x16,
  GET_CHANNEL: 0x1f,
  SET_CHANNEL: 0x20,
  SEND_TRACE_PATH: 0x24,
};

const RESP = {
  OK: 0x00,
  ERROR: 0x01,
  CONTACTS_START: 0x02,
  CONTACT: 0x03,
  CONTACTS_END: 0x04,
  SELF_INFO: 0x05,
  SENT: 0x06,
  CONTACT_MSG: 0x07,
  CHANNEL_MSG: 0x08,
  NO_MORE_MESSAGES: 0x0a,
  BATTERY: 0x0c,
  DEVICE_INFO: 0x0d,
  CONTACT_MSG_V3: 0x10,
  CHANNEL_MSG_V3: 0x11,
  CHANNEL_INFO: 0x12,
  CHANNEL_DATA: 0x1b,
  ADVERTISEMENT: 0x80,
  PATH_UPDATED: 0x81,
  ACK: 0x82,
  MESSAGES_WAITING: 0x83,
  LOG_DATA: 0x88,
  NEW_ADVERT: 0x8a,
  TELEMETRY: 0x8b,
  TRACE_DATA: 0x89,
};

const TYPE_NAMES = {
  0: "Unbekannt",
  1: "Client",
  2: "Repeater",
  3: "Room Server",
  4: "Sensor",
};

const PING_TARGET_CHANNEL = "test";
const TRACE_TIMEOUT_FALLBACK_MS = 15000;

const state = {
  port: null,
  reader: null,
  writer: null,
  connected: false,
  maxChannels: 8,
  frameBuffer: [],
  contacts: new Map(),
  channels: new Map(),
  messages: [],
  latestContactsSince: 0,
  waiters: [],
  pendingAcks: new Map(),
  ackResults: new Map(),
  pendingTraces: new Map(),
  lastRf: null,
};

const el = {
  supportHint: document.querySelector("#supportHint"),
  connectBtn: document.querySelector("#connectBtn"),
  syncBtn: document.querySelector("#syncBtn"),
  advertBtn: document.querySelector("#advertBtn"),
  disconnectBtn: document.querySelector("#disconnectBtn"),
  connectionState: document.querySelector("#connectionState"),
  nodeName: document.querySelector("#nodeName"),
  radioSummary: document.querySelector("#radioSummary"),
  batterySummary: document.querySelector("#batterySummary"),
  deviceVersion: document.querySelector("#deviceVersion"),
  deviceModel: document.querySelector("#deviceModel"),
  firmwareBuild: document.querySelector("#firmwareBuild"),
  publicKey: document.querySelector("#publicKey"),
  selfLocation: document.querySelector("#selfLocation"),
  channels: document.querySelector("#channels"),
  channelCount: document.querySelector("#channelCount"),
  contacts: document.querySelector("#contacts"),
  contactCount: document.querySelector("#contactCount"),
  messages: document.querySelector("#messages"),
  channelSelect: document.querySelector("#channelSelect"),
  channelForm: document.querySelector("#channelForm"),
  channelNameInput: document.querySelector("#channelNameInput"),
  channelTypeSelect: document.querySelector("#channelTypeSelect"),
  createChannelBtn: document.querySelector("#createChannelBtn"),
  messageInput: document.querySelector("#messageInput"),
  sendBtn: document.querySelector("#sendBtn"),
  sendForm: document.querySelector("#sendForm"),
  log: document.querySelector("#log"),
  clearLogBtn: document.querySelector("#clearLogBtn"),
};

if (!("serial" in navigator)) {
  el.supportHint.textContent = "Dieser Browser unterstuetzt Web Serial nicht. Nutze Chrome oder Edge.";
  el.connectBtn.disabled = true;
}

el.connectBtn.addEventListener("click", connect);
el.disconnectBtn.addEventListener("click", disconnect);
el.syncBtn.addEventListener("click", fullSync);
el.advertBtn.addEventListener("click", () => sendCommand([CMD.SEND_SELF_ADVERT, 1]));
el.clearLogBtn.addEventListener("click", () => {
  el.log.textContent = "";
});
el.sendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = el.messageInput.value.trim();
  const channel = Number(el.channelSelect.value || 0);
  if (!text) return;
  try {
    await sendChannelMessage(channel, text);
    el.messageInput.value = "";
  } catch (error) {
    log(`Nachricht konnte nicht gesendet werden: ${error.message}`, "error");
  }
});
el.channelForm.addEventListener("submit", createChannel);
el.contacts.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-ping]");
  if (btn) pingContact(btn.dataset.ping);
});

async function connect() {
  try {
    state.port = await navigator.serial.requestPort();
    await state.port.open({ baudRate: BAUD_RATE, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
    state.writer = state.port.writable.getWriter();
    state.connected = true;
    updateConnectionUi();
    const portInfo = state.port.getInfo();
    const vendor = portInfo.usbVendorId == null ? "?" : `0x${portInfo.usbVendorId.toString(16).padStart(4, "0")}`;
    const product = portInfo.usbProductId == null ? "?" : `0x${portInfo.usbProductId.toString(16).padStart(4, "0")}`;
    log(`USB verbunden (VID ${vendor}, PID ${product}), starte Reader.`);
    readLoop();
    await pause(500);
    await fullSync();
  } catch (error) {
    log(`Verbindung fehlgeschlagen: ${error.message}`, "error");
    await disconnect();
  }
}

async function disconnect() {
  state.connected = false;
  try {
    if (state.reader) {
      await state.reader.cancel();
      state.reader.releaseLock();
    }
  } catch {}
  try {
    if (state.writer) {
      state.writer.releaseLock();
    }
  } catch {}
  try {
    if (state.port) {
      await state.port.close();
    }
  } catch {}
  state.port = null;
  state.reader = null;
  state.writer = null;
  updateConnectionUi();
  log("USB getrennt.");
}

async function readLoop() {
  while (state.port?.readable && state.connected) {
    state.reader = state.port.readable.getReader();
    try {
      while (state.connected) {
        const { value, done } = await state.reader.read();
        if (done) break;
        if (value) ingestBytes(value);
      }
    } catch (error) {
      if (state.connected) log(`Reader-Fehler: ${error.message}`, "error");
    } finally {
      try {
        state.reader.releaseLock();
      } catch {}
    }
  }
}

async function fullSync() {
  if (!state.connected) return;
  log("Synchronisiere Device, Kontakte, Kanaele und Nachrichten.");
  try {
    await sendAndWait([CMD.DEVICE_QUERY, 0x03], [RESP.DEVICE_INFO]);
    await sendAndWait(buildAppStart(), [RESP.SELF_INFO]);
    await sendAndWait(buildDeviceTime(), [RESP.OK]);
    await sendAndWait([CMD.GET_BATT_AND_STORAGE], [RESP.BATTERY]);
    await sendAndWait([CMD.GET_CONTACTS], [RESP.CONTACTS_END], 5000);
    for (let index = 0; index < state.maxChannels; index += 1) {
      try {
        await sendAndWait([CMD.GET_CHANNEL, index], [RESP.CHANNEL_INFO]);
      } catch (error) {
        // leere Kanalslots melden einen Fehlercode, das darf den Sync anderer Kanaele nicht abbrechen
        log(`Kanal ${index} konnte nicht gelesen werden: ${error.message}`, "warn");
      }
    }
    await drainMessages();
    log("Synchronisierung abgeschlossen.");
  } catch (error) {
    log(`${error.message} Pruefe, ob der ausgewaehlte Port die MeshCore Companion-USB-Firmware nutzt.`, "error");
  }
}

function buildAppStart() {
  const name = encodeText("MeshCore Dashboard");
  const payload = new Uint8Array(8 + name.length);
  payload[0] = CMD.APP_START;
  payload[1] = 0x01;
  payload.set(name, 8);
  return payload;
}

function buildDeviceTime() {
  const payload = new Uint8Array(5);
  payload[0] = CMD.SET_DEVICE_TIME;
  writeU32(payload, 1, Math.floor(Date.now() / 1000));
  return payload;
}

async function sendChannelMessage(channelIndex, text) {
  const body = encodeText(text);
  const payload = new Uint8Array(7 + body.length);
  payload[0] = CMD.SEND_CHANNEL_TXT_MSG;
  payload[1] = 0;
  payload[2] = channelIndex;
  writeU32(payload, 3, Math.floor(Date.now() / 1000));
  payload.set(body, 7);
  const response = await sendAndWait(payload, [RESP.SENT, RESP.OK], 5000);
  const detailedResponse = response[0] === RESP.SENT;
  const ackCode = detailedResponse ? readU32(response, 2) : null;
  const message = {
    kind: "out",
    channel: channelIndex,
    timestamp: Math.floor(Date.now() / 1000),
    text,
    sendResult: detailedResponse ? signedByte(response[1] ?? 0) : 0,
    ackCode,
    estimatedTimeout: detailedResponse ? readU32(response, 6) : null,
    delivery: ackCode ? "Bestätigung ausstehend" : "An Funk übergeben",
  };
  addMessage(message);
  if (ackCode) {
    const earlyRoundTrip = state.ackResults.get(ackCode);
    if (earlyRoundTrip == null) {
      state.pendingAcks.set(ackCode, message);
    } else {
      applyAck(message, earlyRoundTrip);
      state.ackResults.delete(ackCode);
      renderMessages();
    }
  }
}

async function createChannel(event) {
  event.preventDefault();
  if (!state.connected) return;

  const freeIndex = Array.from({ length: Math.max(0, state.maxChannels - 1) }, (_, index) => index + 1)
    .find((index) => !state.channels.get(index)?.enabled);
  if (freeIndex == null) {
    log("Kein freier Kanalplatz vorhanden.", "error");
    return;
  }

  const type = el.channelTypeSelect.value;
  let name = el.channelNameInput.value.trim();
  if (!name) return;
  if (type === "hashtag") name = `#${name.replace(/^#+/, "")}`;

  const nameBytes = encodeText(name);
  if (nameBytes.length > 32) {
    log("Der Kanalname darf maximal 32 UTF-8-Bytes lang sein.", "error");
    return;
  }

  const secret = type === "hashtag"
    ? new Uint8Array(await crypto.subtle.digest("SHA-256", nameBytes)).slice(0, 16)
    : crypto.getRandomValues(new Uint8Array(16));
  const payload = new Uint8Array(50);
  payload[0] = CMD.SET_CHANNEL;
  payload[1] = freeIndex;
  payload.set(nameBytes, 2);
  payload.set(secret, 34);

  el.createChannelBtn.disabled = true;
  try {
    await sendAndWait(payload, [RESP.OK]);
    await sendAndWait([CMD.GET_CHANNEL, freeIndex], [RESP.CHANNEL_INFO]);
    el.channelNameInput.value = "";
    log(`${type === "hashtag" ? "Hashtag" : "Privater Kanal"} ${name} in Slot ${freeIndex} angelegt.`);
  } catch (error) {
    log(`Kanal konnte nicht angelegt werden: ${error.message}`, "error");
  } finally {
    el.createChannelBtn.disabled = !state.connected;
  }
}

async function drainMessages(limit = 20) {
  for (let i = 0; i < limit; i += 1) {
    const response = await sendAndWait(
      [CMD.SYNC_NEXT_MESSAGE],
      [RESP.CONTACT_MSG, RESP.CONTACT_MSG_V3, RESP.CHANNEL_MSG, RESP.CHANNEL_MSG_V3, RESP.CHANNEL_DATA, RESP.NO_MORE_MESSAGES],
    );
    if (response[0] === RESP.NO_MORE_MESSAGES) break;
  }
}

async function sendAndWait(payload, responseCodes, timeoutMs = 2500) {
  const response = new Promise((resolve, reject) => {
    const waiter = { responseCodes, resolve, reject, timer: null };
    waiter.timer = setTimeout(() => {
      state.waiters = state.waiters.filter((item) => item !== waiter);
      reject(new Error(`Keine Antwort auf ${commandName(payload[0])} innerhalb von ${timeoutMs} ms.`));
    }, timeoutMs);
    state.waiters.push(waiter);
  });
  await sendCommand(payload);
  return response;
}

async function sendCommand(payloadLike) {
  if (!state.writer) return;
  const payload = payloadLike instanceof Uint8Array ? payloadLike : Uint8Array.from(payloadLike);
  const frame = new Uint8Array(3 + payload.length);
  frame[0] = FRAME_TO_RADIO;
  frame[1] = payload.length & 0xff;
  frame[2] = (payload.length >> 8) & 0xff;
  frame.set(payload, 3);
  await state.writer.write(frame);
  log(payload[0] === CMD.SET_CHANNEL ? "TX SET_CHANNEL [Schluessel verborgen]" : `TX ${toHex(payload)}`);
}

function ingestBytes(bytes) {
  log(`USB RX RAW ${toHex(bytes)}`);
  for (const byte of bytes) {
    state.frameBuffer.push(byte);
  }

  while (state.frameBuffer.length >= 3) {
    const incomingStart = state.frameBuffer.indexOf(FRAME_FROM_RADIO);
    const outgoingStart = state.frameBuffer.indexOf(FRAME_TO_RADIO);
    const starts = [incomingStart, outgoingStart].filter((index) => index >= 0);
    const start = starts.length ? Math.min(...starts) : -1;
    if (start < 0) {
      state.frameBuffer = [];
      return;
    }
    if (start > 0) state.frameBuffer.splice(0, start);
    if (state.frameBuffer.length < 3) return;

    const len = state.frameBuffer[1] | (state.frameBuffer[2] << 8);
    if (len > 4096) {
      state.frameBuffer.shift();
      continue;
    }
    if (state.frameBuffer.length < 3 + len) return;

    const payload = Uint8Array.from(state.frameBuffer.slice(3, 3 + len));
    state.frameBuffer.splice(0, 3 + len);
    handlePacket(payload);
  }
}

function handlePacket(data) {
  if (!data.length) return;
  const code = data[0];
  log(`RX ${packetName(code)} ${toHex(data)}`);

  const waiterIndex = state.waiters.findIndex((waiter) => waiter.responseCodes.includes(code) || code === RESP.ERROR);
  if (waiterIndex >= 0) {
    const [waiter] = state.waiters.splice(waiterIndex, 1);
    clearTimeout(waiter.timer);
    if (code === RESP.ERROR) {
      waiter.reject(new Error(`MeshCore meldet Fehlercode ${data[1] ?? "unbekannt"}.`));
    } else {
      waiter.resolve(data);
    }
  }

  switch (code) {
    case RESP.SELF_INFO:
      parseSelfInfo(data);
      break;
    case RESP.DEVICE_INFO:
      parseDeviceInfo(data);
      break;
    case RESP.BATTERY:
      parseBattery(data);
      break;
    case RESP.CONTACTS_START:
      log(`Kontaktliste startet: ${readU32(data, 1) ?? 0} Eintraege.`);
      break;
    case RESP.CONTACT:
    case RESP.NEW_ADVERT:
      parseContact(data);
      break;
    case RESP.CONTACTS_END:
      state.latestContactsSince = readU32(data, 1) ?? state.latestContactsSince;
      renderContacts();
      break;
    case RESP.CHANNEL_INFO:
      parseChannel(data);
      break;
    case RESP.CONTACT_MSG:
    case RESP.CONTACT_MSG_V3:
      parseContactMessage(data);
      break;
    case RESP.CHANNEL_MSG:
    case RESP.CHANNEL_MSG_V3:
      parseChannelMessage(data);
      break;
    case RESP.CHANNEL_DATA:
      parseChannelData(data);
      break;
    case RESP.MESSAGES_WAITING:
      drainMessages(8);
      break;
    case RESP.ADVERTISEMENT:
    case RESP.PATH_UPDATED:
      sendCommand([CMD.GET_CONTACTS, ...u32Bytes(state.latestContactsSince)]);
      break;
    case RESP.ACK:
      parseAck(data);
      break;
    case RESP.LOG_DATA:
      parseLogData(data);
      break;
    case RESP.TRACE_DATA:
      parseTraceData(data);
      break;
    case RESP.NO_MORE_MESSAGES:
    case RESP.OK:
    case RESP.SENT:
      break;
    case RESP.ERROR:
      log(`MeshCore Fehlercode: ${data[1] ?? "unbekannt"}`, "error");
      break;
    default:
      log(`Unbekannter Pakettyp 0x${code.toString(16).padStart(2, "0")}`);
  }
}

async function pingContact(key) {
  const contact = state.contacts.get(key);
  if (!contact || !state.connected) return;

  const targetChannel = findChannelByName(PING_TARGET_CHANNEL);
  if (!targetChannel) {
    log(`Kanal #${PING_TARGET_CHANNEL} nicht gefunden - bitte zuerst anlegen.`, "error");
    return;
  }

  if (contact.outPathLenRaw == null || contact.outPathLenRaw === 0xff) {
    log(`Kein bekannter Pfad zu ${contact.name} - Trace nicht moeglich (erst Advert/Route abwarten).`, "error");
    return;
  }
  const hashSize = (contact.outPathLenRaw >> 6) + 1;
  const hashCount = contact.outPathLenRaw & 0x3f;
  const pathSz = hashSize === 1 ? 0 : hashSize === 2 ? 1 : null;
  if (pathSz == null || hashCount === 0) {
    log(`Pfad-Hashgroesse von ${contact.name} wird von Trace nicht unterstuetzt.`, "error");
    return;
  }
  const pathBytes = contact.outPathRaw.slice(0, hashCount * hashSize);

  const tag = randomUint32();
  const auth = randomUint32();
  const payload = new Uint8Array(10 + pathBytes.length);
  payload[0] = CMD.SEND_TRACE_PATH;
  writeU32(payload, 1, tag);
  writeU32(payload, 5, auth);
  payload[9] = pathSz;
  payload.set(pathBytes, 10);

  try {
    const response = await sendAndWait(payload, [RESP.SENT], 8000);
    const estTimeout = readU32(response, 6) || TRACE_TIMEOUT_FALLBACK_MS;
    const pending = { contact, channelIndex: targetChannel.index };
    pending.timer = setTimeout(() => {
      state.pendingTraces.delete(tag);
      log(`Trace zu ${contact.name} hat keine Antwort erhalten (Timeout).`, "error");
    }, estTimeout + 5000);
    state.pendingTraces.set(tag, pending);
    log(`Trace an ${contact.name} gesendet, warte auf Antwort...`);
  } catch (error) {
    log(`Trace an ${contact.name} fehlgeschlagen: ${error.message}`, "error");
  }
}

async function finalizeTrace(pending, data) {
  clearTimeout(pending.timer);
  const contact = state.contacts.get(pending.contact.key) || pending.contact;
  const pathLenBytes = data[2];
  const flags = data[3];
  const pathSz = flags & 0x03;
  const hopCount = pathLenBytes >> pathSz;
  const hashesOffset = 12;
  const hashes = data.slice(hashesOffset, hashesOffset + pathLenBytes);
  const snrsOffset = hashesOffset + pathLenBytes;
  const groups = [];
  for (let i = 0; i < hopCount; i += 1) {
    groups.push(sliceHex(hashes, i * (1 << pathSz), (i + 1) * (1 << pathSz)));
  }
  const hopSnrs = Array.from(data.slice(snrsOffset, snrsOffset + hopCount)).map((b) => (signedByte(b) / 4).toFixed(1));
  const finalSnr = (signedByte(data[snrsOffset + hopCount] ?? 0) / 4).toFixed(1);
  const text = `trace @${contact.name}: ${groups.join(",") || "-"} (${hopCount} hops) | Hop-SNR: ${hopSnrs.join(", ") || "-"} dB | Ziel-SNR: ${finalSnr} dB | Received at: ${new Date().toLocaleString()}`;
  log(`Trace-Antwort von ${contact.name} erhalten (${hopCount} Hops).`);
  try {
    await sendChannelMessage(pending.channelIndex, text);
  } catch (error) {
    log(`Trace-Ergebnis konnte nicht in Kanal gepostet werden: ${error.message}`, "error");
  }
}

function parseTraceData(data) {
  if (data.length < 12) return;
  const tag = readU32(data, 4);
  const pending = state.pendingTraces.get(tag);
  if (!pending) {
    log(`Trace-Antwort fuer unbekannten Tag erhalten.`);
    return;
  }
  state.pendingTraces.delete(tag);
  finalizeTrace(pending, data);
}

function findChannelByName(name) {
  const normalized = name.replace(/^#/, "").toLowerCase();
  return [...state.channels.values()].find(
    (channel) => (channel.name || "").replace(/^#/, "").toLowerCase() === normalized,
  );
}

function randomUint32() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function parseSelfInfo(data) {
  const pub = sliceHex(data, 4, 36);
  const lat = readI32(data, 36);
  const lon = readI32(data, 40);
  const freq = readU32(data, 48);
  const bw = readU32(data, 52);
  const sf = data[56];
  const cr = data[57];
  const name = decodeCString(data, 58, data.length - 58) || "(ohne Namen)";

  el.nodeName.textContent = name;
  el.publicKey.textContent = pub || "-";
  el.selfLocation.innerHTML = renderLocationLink(lat, lon);
  el.radioSummary.textContent = freq
    ? `${(freq / 1000000).toFixed(3)} MHz, BW ${(bw / 1000).toFixed(0)} kHz, SF${sf}, CR${cr}`
    : "-";
}

function parseDeviceInfo(data) {
  const fw = data[1] ?? 0;
  el.deviceVersion.textContent = `Proto ${fw}`;
  if (fw >= 3 && data.length >= 80) {
    state.maxChannels = Math.max(1, data[3] || 8);
    el.firmwareBuild.textContent = decodeCString(data, 8, 12) || "-";
    el.deviceModel.textContent = decodeCString(data, 20, 40) || "-";
    const semver = decodeCString(data, 60, 20);
    if (semver) el.deviceVersion.textContent = semver;
  }
}

function parseBattery(data) {
  const mv = readU16(data, 1);
  const used = readU32(data, 3);
  const total = readU32(data, 7);
  const volts = mv ? `${(mv / 1000).toFixed(2)} V` : "-";
  el.batterySummary.textContent = total ? `${volts}, ${used}/${total} KB` : volts;
}

function parseContact(data) {
  if (data.length < 132) return;
  const key = sliceHex(data, 1, 33);
  const pathLenRaw = data[35];
  const contact = {
    key,
    prefix: key.slice(0, 12),
    type: data[33],
    flags: data[34],
    outPathLen: pathLenRaw > 127 ? pathLenRaw - 256 : pathLenRaw,
    outPathLenRaw: pathLenRaw,
    outPathRaw: data.slice(36, 100),
    name: decodeCString(data, 100, 32) || key.slice(0, 12),
    lastAdvert: readU32(data, 132),
    lat: readI32(data, 136),
    lon: readI32(data, 140),
    lastmod: readU32(data, 144),
  };
  state.contacts.set(key, contact);
  renderContacts();
}

function parseChannel(data) {
  if (data.length < 50) return;
  const index = data[1];
  const name = decodeCString(data, 2, 32);
  const secret = sliceHex(data, 34, 50);
  state.channels.set(index, {
    index,
    name: name || (index === 0 ? "Public" : ""),
    secret,
    enabled: Boolean(name || index === 0),
  });
  renderChannels();
}

function parseContactMessage(data) {
  const v3 = data[0] === RESP.CONTACT_MSG_V3;
  const offset = v3 ? 4 : 1;
  const prefix = sliceHex(data, offset, offset + 6);
  const pathLen = data[offset + 6];
  const textType = data[offset + 7];
  const timestamp = readU32(data, offset + 8);
  const textOffset = offset + 12 + (textType === 2 ? 4 : 0);
  const snr = v3 ? signedByte(data[1]) / 4 : null;
  const contact = [...state.contacts.values()].find((item) => item.prefix === prefix);
  if (contact && snr != null) {
    contact.lastSnr = snr;
    contact.lastSeen = timestamp;
    renderContacts();
  }
  addMessage({ kind: "contact", prefix, pathLen, textType, timestamp, text: decodeUtf8(data.slice(textOffset)), snr });
}

function parseChannelMessage(data) {
  const v3 = data[0] === RESP.CHANNEL_MSG_V3;
  const offset = v3 ? 4 : 1;
  addMessage({
    kind: "channel",
    channel: data[offset],
    pathLen: data[offset + 1],
    textType: data[offset + 2],
    timestamp: readU32(data, offset + 3),
    text: decodeUtf8(data.slice(offset + 7)),
    snr: v3 ? signedByte(data[1]) / 4 : null,
  });
}

function parseAck(data) {
  const ackCode = readU32(data, 1);
  const roundTrip = readU32(data, 5);
  const message = state.pendingAcks.get(ackCode);
  if (!message) {
    state.ackResults.set(ackCode, roundTrip);
    return;
  }
  applyAck(message, roundTrip);
  state.pendingAcks.delete(ackCode);
  renderMessages();
}

function parseLogData(data) {
  if (data.length < 3) return;
  const snr = signedByte(data[1]) / 4;
  const rssi = signedByte(data[2]);
  state.lastRf = { snr, rssi, receivedAt: Date.now() };
  log(`RF-Paket empfangen: SNR ${snr.toFixed(1)} dB, RSSI ${rssi} dBm.`);
}

function applyAck(message, roundTrip) {
  message.delivery = "Bestätigt";
  message.roundTrip = roundTrip;
}

function parseChannelData(data) {
  if (data.length < 9) return;
  const len = data[8];
  addMessage({
    kind: "data",
    channel: data[4],
    pathLen: data[5],
    dataType: readU16(data, 6),
    text: `Data ${toHex(data.slice(9, 9 + len))}`,
    snr: signedByte(data[1]) / 4,
    timestamp: Math.floor(Date.now() / 1000),
  });
}

function addMessage(message) {
  state.messages.unshift(message);
  state.messages = state.messages.slice(0, 80);
  renderMessages();
}

function renderContacts() {
  const allContacts = [...state.contacts.values()].sort((a, b) => (b.lastAdvert || 0) - (a.lastAdvert || 0));
  const contacts = allContacts.slice(0, 10);
  el.contactCount.textContent = String(allContacts.length);
  if (!contacts.length) {
    el.contacts.className = "table empty";
    el.contacts.textContent = "Noch keine Kontakte synchronisiert.";
    return;
  }
  el.contacts.className = "table";
  el.contacts.innerHTML = `
    <table class="contact-table">
      <thead><tr><th>Name</th><th>Typ</th><th>Routing</th><th>Signal</th><th>Position</th><th>Letztes Advert</th><th>Public Key</th><th>Aktion</th></tr></thead>
      <tbody>
        ${contacts.map((contact) => `
          <tr>
            <td>${escapeHtml(contact.name)}</td>
            <td>${escapeHtml(TYPE_NAMES[contact.type] || `Typ ${contact.type}`)}</td>
            <td>${escapeHtml(formatContactRoute(contact.outPathLen))}</td>
            <td>${contact.lastSnr == null ? "-" : `${contact.lastSnr.toFixed(1)} dB SNR`}</td>
            <td>${renderLocationLink(contact.lat, contact.lon)}</td>
            <td>${formatTime(contact.lastAdvert)}</td>
            <td class="mono">${escapeHtml(contact.key)}</td>
            <td><button type="button" class="secondary" data-ping="${escapeHtml(contact.key)}">Ping</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;
}

function renderChannels() {
  if (!state.channels.has(0)) {
    state.channels.set(0, {
      index: 0,
      name: "Public",
      secret: "8b3387e9c5cdea6ac9e5edbaa115cd72",
      enabled: true,
    });
  }
  const channels = [...state.channels.values()].sort((a, b) => a.index - b.index);
  const visible = channels.filter((channel) => channel.enabled || channel.name);
  el.channelCount.textContent = String(visible.length);
  if (!visible.length) {
    el.channels.className = "list empty";
    el.channels.textContent = "Noch keine Kanaele synchronisiert.";
  } else {
    el.channels.className = "list";
    el.channels.innerHTML = visible.map((channel) => `
      <div class="channel">
        <strong>#${channel.index} ${escapeHtml(channel.name || "(leer)")}</strong>
        <span class="meta mono">${escapeHtml(channel.secret)}</span>
      </div>
    `).join("");
  }

  const selected = el.channelSelect.value;
  el.channelSelect.innerHTML = visible.map((channel) => (
    `<option value="${channel.index}">#${channel.index} ${escapeHtml(channel.name || "Kanal")}</option>`
  )).join("");
  if (selected) el.channelSelect.value = selected;
  const canSend = state.connected && visible.length > 0;
  el.channelSelect.disabled = !canSend;
  el.messageInput.disabled = !canSend;
  el.sendBtn.disabled = !canSend;
}

function renderMessages() {
  if (!state.messages.length) {
    el.messages.className = "messages empty";
    el.messages.textContent = "Noch keine Nachrichten.";
    return;
  }
  el.messages.className = "messages";
  el.messages.innerHTML = state.messages.slice(0, 10).map((message) => {
    const channelName = message.channel == null ? "" : state.channels.get(message.channel)?.name;
    const channelLabel = `Kanal #${message.channel ?? "?"}${channelName ? ` ${channelName}` : ""}`;
    const title = message.kind === "contact"
      ? `Empfangen | DM ${message.prefix || ""}`
      : `${message.kind === "out" ? "Gesendet" : "Empfangen"} | ${channelLabel}`;
    const meta = [
      formatTime(message.timestamp),
      message.snr == null ? null : `SNR ${message.snr.toFixed(1)} dB`,
      message.pathLen == null ? null : formatMessageRoute(message.pathLen),
      message.textType == null ? null : `Texttyp ${message.textType}`,
      message.dataType == null ? null : `Typ 0x${message.dataType.toString(16)}`,
      message.sendResult == null ? null : `Sendeergebnis ${message.sendResult}`,
      message.delivery || null,
      message.roundTrip == null ? null : `Roundtrip ${message.roundTrip} ms`,
      message.delivery === "Bestätigung ausstehend" && message.estimatedTimeout
        ? `Timeout ${message.estimatedTimeout} ms`
        : null,
    ].filter(Boolean).join(" | ");
    return `
      <div class="message">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(message.text || "")}</span>
        <span class="meta">${escapeHtml(meta)}</span>
      </div>
    `;
  }).join("");
}

function updateConnectionUi() {
  el.connectionState.textContent = state.connected ? "Verbunden" : "Nicht verbunden";
  el.connectBtn.disabled = state.connected || !("serial" in navigator);
  el.syncBtn.disabled = !state.connected;
  el.advertBtn.disabled = !state.connected;
  el.disconnectBtn.disabled = !state.connected;
  el.channelNameInput.disabled = !state.connected;
  el.channelTypeSelect.disabled = !state.connected;
  el.createChannelBtn.disabled = !state.connected;
  renderChannels();
}

function log(message, level = "info") {
  const prefix = level === "error" ? "!" : ">";
  el.log.textContent = `${new Date().toLocaleTimeString()} ${prefix} ${message}\n${el.log.textContent}`.slice(0, 12000);
}

function encodeText(text) {
  return new TextEncoder().encode(text);
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\0+$/g, "");
}

function decodeCString(data, start, length) {
  if (start >= data.length) return "";
  const end = Math.min(data.length, start + length);
  const slice = data.slice(start, end);
  const zero = slice.indexOf(0);
  return decodeUtf8(zero >= 0 ? slice.slice(0, zero) : slice).trim();
}

function readU16(data, offset) {
  if (offset + 1 >= data.length) return null;
  return data[offset] | (data[offset + 1] << 8);
}

function readU32(data, offset) {
  if (offset + 3 >= data.length) return null;
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}

function readI32(data, offset) {
  const value = readU32(data, offset);
  return value == null ? null : value | 0;
}

function writeU32(data, offset, value) {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
  data[offset + 2] = (value >> 16) & 0xff;
  data[offset + 3] = (value >> 24) & 0xff;
}

function u32Bytes(value) {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

function signedByte(value) {
  return value > 127 ? value - 256 : value;
}

function sliceHex(data, start, end) {
  return [...data.slice(start, Math.min(end, data.length))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toHex(data) {
  return [...data].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function packetName(code) {
  const found = Object.entries(RESP).find(([, value]) => value === code);
  return found ? found[0] : `0x${code.toString(16).padStart(2, "0")}`;
}

function commandName(code) {
  const found = Object.entries(CMD).find(([, value]) => value === code);
  return found ? found[0] : `Befehl 0x${code.toString(16).padStart(2, "0")}`;
}

function formatLatLon(lat, lon) {
  if (!lat && !lon) return "-";
  return `${(lat / 1e6).toFixed(6)}, ${(lon / 1e6).toFixed(6)}`;
}

function renderLocationLink(lat, lon) {
  if (!lat && !lon) return "-";
  const latitude = lat / 1e6;
  const longitude = lon / 1e6;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return "-";
  const label = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
  return `<a class="map-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function formatMessageRoute(pathLen) {
  if (pathLen === 0xff) return "Direkt empfangen (0 Hops)";
  const hops = pathLen & 0x3f;
  return `${hops} ${hops === 1 ? "Hop" : "Hops"} (Flood, Pfadwert 0x${pathLen.toString(16).padStart(2, "0")})`;
}

function formatContactRoute(pathLen) {
  if (pathLen == null || pathLen < 0) return "Flood";
  const hops = pathLen & 0x3f;
  return hops === 0 ? "Direkt (0 Hops)" : `Direkter Pfad, ${hops} ${hops === 1 ? "Hop" : "Hops"}`;
}

function formatTime(epoch) {
  if (!epoch) return "-";
  return new Date(epoch * 1000).toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
