const FRAME_TO_RADIO = 0x3c;
const FRAME_FROM_RADIO = 0x3e;
const BAUD_RATE = 115200;
const BLE_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const BLE_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const BLE_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

const CMD = {
  APP_START: 0x01,
  SEND_TXT_MSG: 0x02,
  SEND_CHANNEL_TXT_MSG: 0x03,
  GET_CONTACTS: 0x04,
  SET_DEVICE_TIME: 0x06,
  SEND_SELF_ADVERT: 0x07,
  SYNC_NEXT_MESSAGE: 0x0a,
  GET_BATT_AND_STORAGE: 0x14,
  DEVICE_QUERY: 0x16,
  GET_CHANNEL: 0x1f,
  SET_CHANNEL: 0x20,
  ADD_UPDATE_CONTACT: 0x09,
  SEND_LOGIN: 0x1a,
  LOGOUT: 0x1d,
  IMPORT_CONTACT: 0x12,
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
  LOGIN_SUCCESS: 0x85,
  LOGIN_FAIL: 0x86,
};

const TYPE_NAMES = {
  0: "\u{1F608} Unbekannt",
  1: "\u{1F436} Client",
  2: "\u{26CF}\uFE0F Repeater",
  3: "\u{1F4BB} Room Server",
  4: "\u{1F528} Sensor",
};

const TXT_TYPE_PLAIN = 0;
const PING_TARGET_CHANNEL = "ping";
const DEFAULT_QUICK_REPLY_TEMPLATE = "@[{name}] {hops} Hops in {plz} | SNR {snr} | RSSI {rssi}";
const QUICK_REPLY_DEFAULT_CHANNELS = new Set(["public", "test"]);
const WEATHER_TARGET_CHANNEL = "wetter";
const WEATHER_COMMAND = "wetter";
const WEATHER_REPLY_DELAY_MS = 1000;
const WEATHER_COOLDOWN_MS = 30000;
const WEATHER_FETCH_TIMEOUT_MS = 8000;
const PING_ACK_TIMEOUT_DEFAULT_MS = 60000;
const PING_ACK_TIMEOUT_MIN_MS = 30000;
const PING_ACK_TIMEOUT_MAX_MS = 120000;
const PING_ACK_TIMEOUT_BUFFER_MS = 10000;
const AUTO_PONG_COOLDOWN_MS = 15000;
const RECONNECT_MAX_ATTEMPTS = 8;
const BLE_OPEN_ATTEMPTS = 4;
const STORAGE_SCHEMA_VERSION = 2;
const CONTACT_ARCHIVE_STORAGE_KEY = "meshcore-dashboard-node-archive";
const DEVICE_PROFILE_DB_NAME = "meshcore-dashboard-profiles";
const DEVICE_PROFILE_DB_VERSION = 2;

migrateStorage();

const state = {
  port: null,
  reader: null,
  writer: null,
  transport: null,
  bluetoothDevice: null,
  bluetoothServer: null,
  bluetoothRx: null,
  bluetoothTx: null,
  connected: false,
  maxChannels: 8,
  frameBuffer: [],
  contacts: new Map(),
  contactArchive: loadContactArchive(),
  contactOrder: new Map(),
  contactSequence: 0,
  channels: new Map(),
  revealedChannelSecrets: new Set(),
  messages: loadStoredMessages(),
  legacyMessages: null,
  deviceId: "",
  deviceProfileLoaded: false,
  deviceProfileLoad: null,
  channelOrder: [],
  latestContactsSince: 0,
  waiters: [],
  pendingAcks: new Map(),
  ackTimers: new Map(),
  activeChannel: "all",
  contactSearch: "",
  messageSearch: "",
  messageDirectionFilter: "all",
  messageKindFilter: "all",
  favoriteContacts: loadFavoriteContacts(),
  packetStats: createPacketStats(),
  rangeRecords: loadRangeRecords(),
  mapOptions: { colorMode: "type", lines: false, heat: false, clients: true, repeaters: true, other: true },
  networkView: "map",
  selfLat: null,
  selfLon: null,
  installPrompt: null,
  networkMap: null,
  networkMarkerLayer: null,
  networkLineLayer: null,
  networkHeatLayer: null,
  networkMapBounds: null,
  networkMapSignature: "",
  graphPositions: new Map(),
  graphSelectedKey: null,
  graphDrag: null,
  graphSuppressClick: false,
  roomSessions: new Map(),
  roomFavorites: loadRoomFavorites(),
  roomCredentials: loadRoomCredentials(),
  pendingRoomLogin: null,
  roomLoginTimer: null,
  roomStatus: null,
  dmTarget: null,
  unreadChannels: new Map(),
  ackResults: new Map(),
  pendingPings: new Map(),
  expiredPingAcks: new Set(),
  lastRf: null,
  selfName: "",
  quickReplyRules: loadQuickReplyRules(),
  quickReplyHandled: loadHandledQuickReplies(),
  quickReplyCooldowns: new Map(),
  weatherEnabled: loadWeatherSetting(),
  weatherHandled: loadHandledWeatherRequests(),
  weatherCooldowns: new Map(),
  autoPongEnabled: loadAutoPongSetting() && isValidPostalCode(loadAutoPongPostalCode()),
  autoPongPostalCode: loadAutoPongPostalCode(),
  postalLocation: loadPostalLocation(),
  postalLocationRequest: null,
  autoPongHandled: loadHandledPings(),
  autoPongCooldowns: new Map(),
  autoPongQueue: [],
  autoPongTimer: null,
  autoReconnect: loadBooleanSetting("meshcore-dashboard-auto-reconnect", false),
  intentionalDisconnect: false,
  reconnectTimer: null,
  reconnectStableTimer: null,
  reconnectAttempts: 0,
  lastTransport: null,
  lastPacketAt: null,
  sendQueue: loadSendQueue(),
  flushingQueue: false,
  protocolVersion: null,
};

state.legacyMessages = state.messages.slice();

const el = {
  supportHint: document.querySelector("#supportHint"),
  connectBtn: document.querySelector("#connectBtn"),
  bleConnectBtn: document.querySelector("#bleConnectBtn"),
  syncBtn: document.querySelector("#syncBtn"),
  advertBtn: document.querySelector("#advertBtn"),
  disconnectBtn: document.querySelector("#disconnectBtn"),
  connectionState: document.querySelector("#connectionState"),
  autoReconnectToggle: document.querySelector("#autoReconnectToggle"),
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
  channelSecretInput: document.querySelector("#channelSecretInput"),
  createChannelBtn: document.querySelector("#createChannelBtn"),
  messageInput: document.querySelector("#messageInput"),
  messageCharCount: document.querySelector("#messageCharCount"),
  emojiPickerBtn: document.querySelector("#emojiPickerBtn"),
  emojiPickerMenu: document.querySelector("#emojiPickerMenu"),
  sendBtn: document.querySelector("#sendBtn"),
  sendForm: document.querySelector("#sendForm"),
  contactSearch: document.querySelector("#contactSearch"),
  channelTabs: document.querySelector("#channelTabs"),
  log: document.querySelector("#log"),
  clearLogBtn: document.querySelector("#clearLogBtn"),
  actionNotice: document.querySelector("#actionNotice"),
  themeToggle: document.querySelector("#themeToggle"),
  autoPongToggle: document.querySelector("#autoPongToggle"),
  weatherToggle: document.querySelector("#weatherToggle"),
  weatherHelpBtn: document.querySelector("#weatherHelpBtn"),
  weatherHelpDialog: document.querySelector("#weatherHelpDialog"),
  closeWeatherHelpBtn: document.querySelector("#closeWeatherHelpBtn"),
  autoPongSettingsBtn: document.querySelector("#autoPongSettingsBtn"),
  autoPongSettingsDialog: document.querySelector("#autoPongSettingsDialog"),
  autoPongSettingsForm: document.querySelector("#autoPongSettingsForm"),
  autoPongPostalCodeInput: document.querySelector("#autoPongPostalCodeInput"),
  quickReplyRules: document.querySelector("#quickReplyRules"),
  closeAutoPongSettingsBtn: document.querySelector("#closeAutoPongSettingsBtn"),
  compactChatToggle: document.querySelector("#compactChatToggle"),
  messageSearch: document.querySelector("#messageSearch"),
  messageDirectionFilter: document.querySelector("#messageDirectionFilter"),
  messageKindFilter: document.querySelector("#messageKindFilter"),
  clearChannelHistoryBtn: document.querySelector("#clearChannelHistoryBtn"),
  networkMap: document.querySelector("#networkMap"),
  fitNetworkMapBtn: document.querySelector("#fitNetworkMapBtn"),
  mappedContactCount: document.querySelector("#mappedContactCount"),
  nodeArchiveCount: document.querySelector("#nodeArchiveCount"),
  toggleNodeArchiveBtn: document.querySelector("#toggleNodeArchiveBtn"),
  exportNodeArchiveBtn: document.querySelector("#exportNodeArchiveBtn"),
  exportNodeGeoJsonBtn: document.querySelector("#exportNodeGeoJsonBtn"),
  exportNodeCsvBtn: document.querySelector("#exportNodeCsvBtn"),
  importNodeArchiveBtn: document.querySelector("#importNodeArchiveBtn"),
  importNodeArchiveInput: document.querySelector("#importNodeArchiveInput"),
  nodeArchive: document.querySelector("#nodeArchive"),
  routeOverview: document.querySelector("#routeOverview"),
  rangeStats: document.querySelector("#rangeStats"),
  packetDiagnostics: document.querySelector("#packetDiagnostics"),
  exportConfigBtn: document.querySelector("#exportConfigBtn"),
  importConfigBtn: document.querySelector("#importConfigBtn"),
  importConfigInput: document.querySelector("#importConfigInput"),
  installAppBtn: document.querySelector("#installAppBtn"),
  mapColorMode: document.querySelector("#mapColorMode"),
  mapLinesToggle: document.querySelector("#mapLinesToggle"),
  mapHeatToggle: document.querySelector("#mapHeatToggle"),
  mapClientsToggle: document.querySelector("#mapClientsToggle"),
  mapRepeatersToggle: document.querySelector("#mapRepeatersToggle"),
  mapOtherToggle: document.querySelector("#mapOtherToggle"),
  networkGraph: document.querySelector("#networkGraph"),
  graphDetails: document.querySelector("#graphDetails"),
  fullscreenMapBtn: document.querySelector("#fullscreenMapBtn"),
  resetPacketStatsBtn: document.querySelector("#resetPacketStatsBtn"),
  roomLoginDialog: document.querySelector("#roomLoginDialog"),
  roomLoginForm: document.querySelector("#roomLoginForm"),
  roomLoginTarget: document.querySelector("#roomLoginTarget"),
  roomPasswordInput: document.querySelector("#roomPasswordInput"),
  roomLoginSubmitBtn: document.querySelector("#roomLoginSubmitBtn"),
  closeRoomLoginBtn: document.querySelector("#closeRoomLoginBtn"),
  rememberRoomPassword: document.querySelector("#rememberRoomPassword"),
  roomSessionStatus: document.querySelector("#roomSessionStatus"),
  importChannelInviteBtn: document.querySelector("#importChannelInviteBtn"),
  exportChannelsBtn: document.querySelector("#exportChannelsBtn"),
  importChannelsBtn: document.querySelector("#importChannelsBtn"),
  importChannelsInput: document.querySelector("#importChannelsInput"),
  channelInviteDialog: document.querySelector("#channelInviteDialog"),
  closeChannelInviteBtn: document.querySelector("#closeChannelInviteBtn"),
  channelInviteText: document.querySelector("#channelInviteText"),
  channelQrCode: document.querySelector("#channelQrCode"),
  copyChannelInviteBtn: document.querySelector("#copyChannelInviteBtn"),
  importContactCardBtn: document.querySelector("#importContactCardBtn"),
};

applyTheme(loadTheme());
el.autoPongToggle.checked = state.autoPongEnabled;
el.weatherToggle.checked = state.weatherEnabled;
el.autoReconnectToggle.checked = state.autoReconnect;
applyChatDensity(loadChatDensity());
initializeCollapsiblePanels();
restoreContactArchive();
renderNetworkOverview();
resolvePostalLocation();
registerServiceWorker();
setInterval(() => {
  renderContacts();
  renderMessages();
  updateConnectionUi();
}, 60000);

if (!("serial" in navigator) && !("bluetooth" in navigator)) {
  el.supportHint.textContent = "\u{1F528} USB/Bluetooth ben\u00f6tigen Chrome oder Edge auf localhost beziehungsweise HTTPS. \u{1F4BB}";
  el.connectBtn.disabled = true;
} else if (!("serial" in navigator)) {
  el.supportHint.textContent = "\u{1F608} USB wird nicht unterst\u00fctzt; Bluetooth ist verf\u00fcgbar. \u{1F4F6}";
  el.connectBtn.disabled = true;
} else if (!("bluetooth" in navigator)) {
  el.supportHint.textContent = "\u{1F436} Bluetooth ist in diesem Seitenkontext nicht verf\u00fcgbar; USB ist verf\u00fcgbar. \u{1F50C}";
}

updateConnectionUi();
if ("serial" in navigator) navigator.serial.addEventListener("disconnect", handleUsbDisconnected);
el.connectBtn.addEventListener("click", connectUsb);
el.bleConnectBtn.addEventListener("click", connectBluetooth);
el.autoReconnectToggle.addEventListener("change", () => {
  state.autoReconnect = el.autoReconnectToggle.checked;
  localStorage.setItem("meshcore-dashboard-auto-reconnect", String(state.autoReconnect));
  if (!state.autoReconnect) clearTimeout(state.reconnectTimer);
  showActionNotice(`Auto-Reconnect ${state.autoReconnect ? "aktiviert" : "deaktiviert"}.`);
});
el.importContactCardBtn.addEventListener("click", importContactCard);
el.themeToggle.addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "mono" ? "default" : "mono";
  applyTheme(theme);
  try {
    localStorage.setItem("meshcore-dashboard-theme", theme);
  } catch {
    // The selected theme still applies for this session.
  }
});
el.autoPongToggle.addEventListener("change", () => {
  if (el.autoPongToggle.checked && !isValidPostalCode(state.autoPongPostalCode)) {
    el.autoPongToggle.checked = false;
    openAutoPongSettings();
    showActionNotice("Bitte zuerst eine fünfstellige PLZ festlegen.", "warn");
    return;
  }
  state.autoPongEnabled = el.autoPongToggle.checked;
  try {
    localStorage.setItem("meshcore-dashboard-auto-pong", String(state.autoPongEnabled));
  } catch {
    // The setting still applies for this session.
  }
  showActionNotice(`Auto-Pong ${state.autoPongEnabled ? "aktiviert" : "deaktiviert"}.`);
});
el.weatherToggle.addEventListener("change", () => {
  state.weatherEnabled = el.weatherToggle.checked;
  try {
    localStorage.setItem("meshcore-dashboard-weather-replies", String(state.weatherEnabled));
  } catch {
    // The setting still applies for this session.
  }
  showActionNotice(`Wetteransage ${state.weatherEnabled ? "aktiviert" : "deaktiviert"}.`);
});
el.weatherHelpBtn.addEventListener("click", () => el.weatherHelpDialog.showModal());
el.closeWeatherHelpBtn.addEventListener("click", () => el.weatherHelpDialog.close());
el.autoPongSettingsBtn.addEventListener("click", openAutoPongSettings);
el.closeAutoPongSettingsBtn.addEventListener("click", () => el.autoPongSettingsDialog.close());
el.autoPongSettingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const postalCode = el.autoPongPostalCodeInput.value.trim();
  if (!isValidPostalCode(postalCode)) {
    el.autoPongPostalCodeInput.setCustomValidity("Bitte eine fünfstellige PLZ eingeben.");
    el.autoPongPostalCodeInput.reportValidity();
    return;
  }
  el.autoPongPostalCodeInput.setCustomValidity("");
  state.autoPongPostalCode = postalCode;
  if (state.postalLocation?.postalCode !== postalCode) state.postalLocation = null;
  state.quickReplyRules = readQuickReplyRules();
  try {
    localStorage.setItem("meshcore-dashboard-auto-pong-postal-code", postalCode);
    localStorage.setItem("meshcore-dashboard-quick-reply-rules", JSON.stringify(state.quickReplyRules));
  } catch {
    // The postal code still applies for this session.
  }
  el.autoPongSettingsDialog.close();
  showActionNotice("Antwortregeln gespeichert.");
  resolvePostalLocation();
  renderMessages();
});
el.autoPongPostalCodeInput.addEventListener("input", () => {
  el.autoPongPostalCodeInput.setCustomValidity("");
});
el.compactChatToggle.addEventListener("change", () => {
  const density = el.compactChatToggle.checked ? "compact" : "comfortable";
  applyChatDensity(density);
  try {
    localStorage.setItem("meshcore-dashboard-chat-density", density);
  } catch {
    // The selected density still applies for this session.
  }
});
el.emojiPickerBtn.addEventListener("click", () => {
  const open = el.emojiPickerMenu.hidden;
  el.emojiPickerMenu.hidden = !open;
  el.emojiPickerBtn.setAttribute("aria-expanded", String(open));
});
el.emojiPickerMenu.addEventListener("click", (event) => {
  const emojiButton = event.target.closest("button[data-emoji]");
  if (!emojiButton) return;
  insertEmoji(emojiButton.dataset.emoji);
  closeEmojiPicker();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".emoji-picker")) closeEmojiPicker();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeEmojiPicker();
});
el.disconnectBtn.addEventListener("click", disconnect);
el.syncBtn.addEventListener("click", () => {
  showActionNotice("Sync gestartet…");
  fullSync();
});
el.advertBtn.addEventListener("click", () => {
  showActionNotice("Advert wird gesendet…");
  sendCommand([CMD.SEND_SELF_ADVERT, 1]);
});
el.contactSearch.addEventListener("input", (event) => {
  state.contactSearch = event.target.value.trim().toLowerCase();
  renderContacts();
});
el.messageSearch.addEventListener("input", (event) => {
  state.messageSearch = event.target.value.trim().toLowerCase();
  renderMessages();
});
el.messageDirectionFilter.addEventListener("change", (event) => {
  state.messageDirectionFilter = event.target.value;
  renderMessages();
});
el.messageKindFilter.addEventListener("change", (event) => {
  state.messageKindFilter = event.target.value;
  renderMessages();
});
el.exportConfigBtn.addEventListener("click", exportConfiguration);
el.importConfigBtn.addEventListener("click", () => el.importConfigInput.click());
el.importConfigInput.addEventListener("change", importConfiguration);
el.installAppBtn.addEventListener("click", installDashboard);
el.fitNetworkMapBtn.addEventListener("click", fitNetworkMap);
el.toggleNodeArchiveBtn.addEventListener("click", () => {
  const expanded = el.nodeArchive.hidden;
  el.nodeArchive.hidden = !expanded;
  el.toggleNodeArchiveBtn.setAttribute("aria-expanded", String(expanded));
  el.toggleNodeArchiveBtn.textContent = expanded ? "Node-Archiv ausblenden" : "Node-Archiv anzeigen";
});
el.exportNodeArchiveBtn.addEventListener("click", exportNodeArchive);
el.exportNodeGeoJsonBtn.addEventListener("click", exportNodeGeoJson);
el.exportNodeCsvBtn.addEventListener("click", exportNodeCsv);
el.importNodeArchiveBtn.addEventListener("click", () => el.importNodeArchiveInput.click());
el.importNodeArchiveInput.addEventListener("change", importNodeArchive);
document.querySelectorAll("[data-network-view]").forEach((button) => button.addEventListener("click", () => setNetworkView(button.dataset.networkView)));
el.mapColorMode.addEventListener("change", () => updateMapOption("colorMode", el.mapColorMode.value));
el.mapLinesToggle.addEventListener("change", () => updateMapOption("lines", el.mapLinesToggle.checked));
el.mapHeatToggle.addEventListener("change", () => updateMapOption("heat", el.mapHeatToggle.checked));
el.mapClientsToggle.addEventListener("change", () => updateMapOption("clients", el.mapClientsToggle.checked));
el.mapRepeatersToggle.addEventListener("change", () => updateMapOption("repeaters", el.mapRepeatersToggle.checked));
el.mapOtherToggle.addEventListener("change", () => updateMapOption("other", el.mapOtherToggle.checked));
el.fullscreenMapBtn.addEventListener("click", toggleNetworkFullscreen);
el.networkGraph.addEventListener("pointerdown", handleGraphPointerDown);
el.networkGraph.addEventListener("pointermove", handleGraphPointerMove);
el.networkGraph.addEventListener("pointerup", handleGraphPointerUp);
el.networkGraph.addEventListener("pointercancel", handleGraphPointerUp);
el.networkGraph.addEventListener("click", handleGraphClick);
el.resetPacketStatsBtn.addEventListener("click", () => {
  state.packetStats = createPacketStats();
  renderPacketDiagnostics();
});
document.addEventListener("fullscreenchange", () => {
  const section = el.networkMap.closest(".map-section");
  const active = document.fullscreenElement === section;
  section.classList.toggle("network-panel-fullscreen", active);
  el.fullscreenMapBtn.textContent = active ? "Vollbild beenden" : "Vollbild";
  setTimeout(() => state.networkMap?.invalidateSize(), 100);
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
  el.installAppBtn.hidden = false;
});
el.channelTabs.addEventListener("click", (event) => {
  const tab = event.target.closest("button[data-channel-index]");
  if (!tab) return;
  state.activeChannel = tab.dataset.channelIndex;
  if (state.activeChannel.startsWith("room:")) {
    state.unreadChannels.delete(state.activeChannel);
    state.dmTarget = state.roomSessions.get(state.activeChannel.slice(5))?.key || null;
    renderChannels();
  } else if (state.activeChannel !== "all" && state.activeChannel !== "dm") {
    el.channelSelect.value = String(state.activeChannel);
    state.unreadChannels.delete(String(state.activeChannel));
    state.dmTarget = null;
  } else if (state.activeChannel === "dm") {
    state.unreadChannels.delete("dm");
    if (!state.dmTarget) {
      const latestDm = [...state.messages].find((message) => message.kind === "contact");
      if (latestDm && latestDm.prefix) {
        const contact = [...state.contacts.values()].find((item) => item.prefix === latestDm.prefix);
        if (contact) state.dmTarget = contact.key;
      }
    }
    renderChannels();
  } else {
    state.dmTarget = null;
  }
  updateMessageInputPlaceholder();
  persistDeviceProfile();
  renderMessages();
  renderChannelTabs();
});
el.channelTabs.addEventListener("dragstart", (event) => {
  const tab = event.target.closest("button[data-channel-index]");
  if (!tab || !/^\d+$/.test(tab.dataset.channelIndex)) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", tab.dataset.channelIndex);
});
el.channelTabs.addEventListener("dragover", (event) => {
  if (event.target.closest("button[data-channel-index]")) event.preventDefault();
});
el.channelTabs.addEventListener("drop", (event) => {
  event.preventDefault();
  const target = event.target.closest("button[data-channel-index]");
  const sourceIndex = Number(event.dataTransfer.getData("text/plain"));
  const targetIndex = Number(target?.dataset.channelIndex);
  if (!target || !Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex) || sourceIndex === targetIndex) return;
  const order = ensureChannelOrder();
  const sourcePosition = order.indexOf(sourceIndex);
  const targetPosition = order.indexOf(targetIndex);
  if (sourcePosition < 0 || targetPosition < 0) return;
  order.splice(sourcePosition, 1);
  order.splice(targetPosition, 0, sourceIndex);
  state.channelOrder = order;
  persistDeviceProfile();
  renderChannelTabs();
});
el.channelSelect.addEventListener("change", () => {
  const next = el.channelSelect.value;
  if (next) {
    if (next.startsWith("room:")) {
      state.activeChannel = next;
      state.dmTarget = state.roomSessions.get(next.slice(5))?.key || null;
      state.unreadChannels.delete(next);
      updateMessageInputPlaceholder();
      persistDeviceProfile();
      renderMessages();
      renderChannelTabs();
      return;
    }
    if (next === "dm") {
      state.activeChannel = "dm";
      updateMessageInputPlaceholder();
      persistDeviceProfile();
      renderMessages();
      renderChannelTabs();
      return;
    }
    state.activeChannel = String(next);
    state.unreadChannels.delete(String(next));
    state.dmTarget = null;
    updateMessageInputPlaceholder();
    persistDeviceProfile();
    renderMessages();
    renderChannelTabs();
  }
});
el.clearLogBtn.addEventListener("click", () => {
  el.log.textContent = "";
});
el.clearChannelHistoryBtn.addEventListener("click", clearSelectedHistory);
el.messageInput.addEventListener("input", updateMessageCharCount);
el.sendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = el.messageInput.value.trim();
  if (!text) return;
  try {
    if (state.activeChannel.startsWith("room:")) {
      const session = state.roomSessions.get(state.activeChannel.slice(5));
      if (!session) throw new Error("Room ist nicht verbunden.");
      await sendDirectMessage(session.key, text);
    } else if (state.activeChannel === "dm" && state.dmTarget) {
      await sendDirectMessage(state.dmTarget, text);
    } else {
      const channel = Number(el.channelSelect.value || 0);
      await sendChannelMessage(channel, text);
    }
    el.messageInput.value = "";
    updateMessageCharCount();
  } catch (error) {
    log(`Nachricht konnte nicht gesendet werden: ${error.message}`, "error");
  }
});
el.channelForm.addEventListener("submit", createChannel);
el.channels.addEventListener("click", (event) => {
  const revealButton = event.target.closest("button[data-reveal-channel]");
  if (revealButton) {
    const index = Number(revealButton.dataset.revealChannel);
    if (state.revealedChannelSecrets.has(index)) state.revealedChannelSecrets.delete(index);
    else state.revealedChannelSecrets.add(index);
    renderChannels();
    return;
  }
  const inviteButton = event.target.closest("button[data-channel-invite]");
  if (inviteButton) {
    showChannelInvite(Number(inviteButton.dataset.channelInvite));
    return;
  }
  const editButton = event.target.closest("button[data-edit-channel]");
  if (editButton) {
    editChannel(Number(editButton.dataset.editChannel));
    return;
  }
  const removeButton = event.target.closest("button[data-remove-channel]");
  if (removeButton) removeChannel(Number(removeButton.dataset.removeChannel));
});
el.importChannelInviteBtn.addEventListener("click", importChannelInvite);
el.exportChannelsBtn.addEventListener("click", exportChannelsBackup);
el.importChannelsBtn.addEventListener("click", () => el.importChannelsInput.click());
el.importChannelsInput.addEventListener("change", importChannelsBackup);
el.closeChannelInviteBtn.addEventListener("click", () => el.channelInviteDialog.close());
el.copyChannelInviteBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(el.channelInviteText.value);
  showActionNotice("Kanal-Invite kopiert.");
});
el.channelTypeSelect.addEventListener("change", updateChannelSecretField);
el.roomLoginForm.addEventListener("submit", loginToRoomServer);
el.closeRoomLoginBtn.addEventListener("click", () => el.roomLoginDialog.close());
el.contacts.addEventListener("click", (event) => {
  const roomFavoriteBtn = event.target.closest("button[data-room-favorite]");
  if (roomFavoriteBtn) {
    toggleRoomFavorite(roomFavoriteBtn.dataset.roomFavorite);
    return;
  }
  const roomOpenBtn = event.target.closest("button[data-room-open]");
  if (roomOpenBtn) {
    const contact = state.contacts.get(roomOpenBtn.dataset.roomOpen);
    if (contact) openRoomConversation(contact);
    return;
  }
  const roomLogoutBtn = event.target.closest("button[data-room-logout]");
  if (roomLogoutBtn) {
    leaveRoomServer(roomLogoutBtn.dataset.roomLogout);
    return;
  }
  const roomBtn = event.target.closest("button[data-room-login]");
  if (roomBtn) {
    openRoomLogin(roomBtn.dataset.roomLogin);
    return;
  }
  const favoriteBtn = event.target.closest("button[data-favorite]");
  if (favoriteBtn) {
    toggleFavoriteContact(favoriteBtn.dataset.favorite);
    return;
  }
  const pingBtn = event.target.closest("button[data-ping]");
  if (pingBtn) {
    pingContact(pingBtn.dataset.ping);
    return;
  }
  const dmBtn = event.target.closest("button[data-dm]");
  if (dmBtn) {
    state.activeChannel = "dm";
    state.dmTarget = dmBtn.dataset.dm;
    updateMessageInputPlaceholder();
    renderChannels();
    renderMessages();
    renderChannelTabs();
  }
});
el.messages.addEventListener("click", (event) => {
  const channelReplyBtn = event.target.closest("button[data-channel-reply-index]");
  if (channelReplyBtn) {
    const message = state.messages[Number(channelReplyBtn.dataset.channelReplyIndex)];
    const reply = message ? getChannelReply(message) : null;
    if (!reply) return;
    state.activeChannel = String(getLocalChannelIndex(message));
    state.dmTarget = null;
    state.unreadChannels.delete(state.activeChannel);
    el.channelSelect.value = state.activeChannel;
    updateMessageInputPlaceholder();
    renderMessages();
    renderChannelTabs();
    el.messageInput.value = `@[${reply.sender}] `;
    updateMessageCharCount();
    el.messageInput.focus();
    el.messageInput.setSelectionRange(el.messageInput.value.length, el.messageInput.value.length);
    return;
  }
  const pongBtn = event.target.closest("button[data-pong-index]");
  if (pongBtn) {
    const message = state.messages[Number(pongBtn.dataset.pongIndex)];
    const reply = message ? getPingReply(message) : null;
    if (!reply || !state.connected) return;
    pongBtn.disabled = true;
    sendChannelMessage(getLocalChannelIndex(message), reply.text).catch((error) => {
      pongBtn.disabled = false;
      log(`Pong konnte nicht gesendet werden: ${error.message}`, "error");
    });
    return;
  }
  const quickReplyBtn = event.target.closest("button[data-quick-reply-index]");
  if (quickReplyBtn) {
    const message = state.messages[Number(quickReplyBtn.dataset.quickReplyIndex)];
    const reply = message ? getQuickChannelReply(message) : null;
    if (!reply) return;
    if (!isValidPostalCode(state.autoPongPostalCode)) {
      openAutoPongSettings();
      showActionNotice("Bitte zuerst eine fünfstellige PLZ festlegen.", "warn");
      return;
    }
    if (!state.connected) return;
    quickReplyBtn.disabled = true;
    sendChannelMessage(getLocalChannelIndex(message), reply.text).catch((error) => {
      quickReplyBtn.disabled = false;
      log(`Schnellantwort konnte nicht gesendet werden: ${error.message}`, "error");
    });
    return;
  }
  const retryBtn = event.target.closest("button[data-retry-index]");
  if (retryBtn) {
    const message = state.messages[Number(retryBtn.dataset.retryIndex)];
    if (!message || !state.connected) return;
    retryBtn.disabled = true;
    retryMessage(message).catch((error) => log(`Wiederholen fehlgeschlagen: ${error.message}`, "error"));
    return;
  }
  const replyBtn = event.target.closest("button[data-reply]");
  if (!replyBtn) return;
  const contact = [...state.contacts.values()].find((item) => item.prefix === replyBtn.dataset.reply);
  if (!contact) return;
  state.activeChannel = "dm";
  state.dmTarget = contact.key;
  updateMessageInputPlaceholder();
  renderChannels();
  renderMessages();
  renderChannelTabs();
});

async function connectUsb() {
  try {
    state.intentionalDisconnect = false;
    showActionNotice("USB-Gerät auswählen...");
    const port = await navigator.serial.requestPort();
    await openUsbPort(port);
  } catch (error) {
    if (error.name === "NotFoundError") {
      showActionNotice("Keine USB-Verbindung ausgewählt.", "warn");
      return;
    }
    showActionNotice(`USB-Verbindung fehlgeschlagen: ${error.message}`, "error");
    log(`Verbindung fehlgeschlagen: ${error.message}`, "error");
    await disconnect();
  }
}

async function openUsbPort(port, reconnecting = false) {
    state.port = port;
    await state.port.open({ baudRate: BAUD_RATE, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
    state.writer = state.port.writable.getWriter();
    state.transport = "usb";
    state.lastTransport = "usb";
    state.connected = true;
    updateConnectionUi();
    const portInfo = state.port.getInfo();
    const vendor = portInfo.usbVendorId == null ? "?" : `0x${portInfo.usbVendorId.toString(16).padStart(4, "0")}`;
    const product = portInfo.usbProductId == null ? "?" : `0x${portInfo.usbProductId.toString(16).padStart(4, "0")}`;
    log(`USB verbunden (VID ${vendor}, PID ${product}), starte Reader.`);
    readLoop();
    await pause(500);
    await fullSync();
    markConnectionStableLater();
    await flushSendQueue();
}

async function connectGattWithRetry(device, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
      if (!server.connected) throw new Error("Bluetooth GATT wurde direkt nach dem Verbinden getrennt.");
      return server;
    } catch (error) {
      lastError = error;
      try {
        if (device.gatt.connected) device.gatt.disconnect();
      } catch {}
      if (i < attempts - 1) await pause(1200 * (i + 1));
    }
  }
  throw lastError;
}

function isRetryableBluetoothOpenError(error) {
  const message = error?.message || "";
  return error?.name === "NetworkError"
    || error?.name === "InvalidStateError"
    || /GATT Server is disconnected|Cannot retrieve services|GATT.*disconnected|Bluetooth GATT wurde direkt/i.test(message);
}

function getBluetoothOpenErrorMessage(error) {
  if (isRetryableBluetoothOpenError(error)) {
    return "Bluetooth-Verbindung fehlgeschlagen: Das Geraet hat die GATT-Verbindung sofort getrennt. Bitte MeshCore eingeschaltet und in Reichweite lassen, Windows-Bluetooth-Pairing pruefen und erneut verbinden.";
  }
  return `Bluetooth-Verbindung fehlgeschlagen: ${error.message}`;
}

async function cleanupBluetoothOpenAttempt(device, tx) {
  try {
    tx?.removeEventListener("characteristicvaluechanged", handleBluetoothNotification);
    await tx?.stopNotifications();
  } catch {}
  try {
    if (device?.gatt?.connected) device.gatt.disconnect();
  } catch {}
  state.bluetoothServer = null;
  state.bluetoothRx = null;
  state.bluetoothTx = null;
  await pause(500);
}

async function connectBluetooth() {
  if (!("bluetooth" in navigator)) {
    const reason = !window.isSecureContext
      ? "Web Bluetooth benötigt localhost, 127.0.0.1 oder HTTPS."
      : window.top !== window.self
        ? "Web Bluetooth ist in dieser Einbettung nicht freigegeben. Öffne das Modul direkt oder erlaube Bluetooth im iframe."
        : "Dieser Browser stellt Web Bluetooth nicht bereit. Nutze Chrome oder Edge.";
    showActionNotice(reason, "error");
    log(reason, "error");
    return;
  }
  try {
    state.intentionalDisconnect = false;
    showActionNotice("Bluetooth-Gerät auswählen...");
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [BLE_SERVICE_UUID] }],
      optionalServices: [BLE_SERVICE_UUID],
    });
    await openBluetoothDevice(device);
  } catch (error) {
    if (error.name === "NotFoundError") {
      showActionNotice("Keine Bluetooth-Verbindung ausgewählt.", "warn");
    } else {
      const message = /connection attempt failed/i.test(error.message)
        ? "Bluetooth-GATT-Verbindung fehlgeschlagen: Windows-Pairing ist vorhanden, aber das MeshCore-Geraet antwortet nicht. Andere MeshCore-Apps schliessen, Geraet aus- und wieder einschalten und erneut verbinden. Falls noetig, den Windows-Bluetooth-Eintrag entfernen und neu koppeln."
        : getBluetoothOpenErrorMessage(error);
      showActionNotice(message, "error");
      log(message, "error");
    }
    await disconnect();
  }
}

async function openBluetoothDevice(device) {
    state.bluetoothDevice = device;
    device.removeEventListener("gattserverdisconnected", handleBluetoothDisconnected);
    device.addEventListener("gattserverdisconnected", handleBluetoothDisconnected);
    let lastError;
    for (let attempt = 0; attempt < BLE_OPEN_ATTEMPTS; attempt++) {
      let tx = null;
      try {
        const server = await connectGattWithRetry(device, 1);
        state.bluetoothServer = server;
        const service = await server.getPrimaryService(BLE_SERVICE_UUID);
        const rx = await service.getCharacteristic(BLE_RX_UUID);
        tx = await service.getCharacteristic(BLE_TX_UUID);
        tx.addEventListener("characteristicvaluechanged", handleBluetoothNotification);
        await tx.startNotifications();
        if (!server.connected) throw new Error("Bluetooth GATT wurde direkt nach dem Service-Setup getrennt.");

        state.bluetoothRx = rx;
        state.bluetoothTx = tx;
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        await cleanupBluetoothOpenAttempt(device, tx);
        if (!isRetryableBluetoothOpenError(error) || attempt === BLE_OPEN_ATTEMPTS - 1) break;
        await pause(700 * (attempt + 1));
      }
    }
    if (lastError) throw lastError;

    state.transport = "bluetooth";
    state.lastTransport = "bluetooth";
    state.connected = true;
    updateConnectionUi();
    log(`Bluetooth verbunden: ${device.name || "MeshCore-Gerät"}.`);
    await pause(500);
    await fullSync();
    markConnectionStableLater();
    await flushSendQueue();
}

function handleBluetoothNotification(event) {
  const value = event.target.value;
  if (!value) return;
  const packet = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  log(`Bluetooth RX ${toHex(packet)}`);
  handlePacket(packet);
}

function handleBluetoothDisconnected() {
  if (state.transport !== "bluetooth") return;
  const device = state.bluetoothDevice;
  state.connected = false;
  clearTimeout(state.reconnectStableTimer);
  state.transport = null;
  rejectPendingWaiters(new Error("Bluetooth-Verbindung getrennt."));
  clearPendingPings();
  if (state.roomSessions.size || state.pendingRoomLogin) setRoomStatus("error", "Room-Verbindung durch Bluetooth-Trennung beendet.");
  state.roomSessions.clear();
  state.pendingRoomLogin = null;
  clearTimeout(state.roomLoginTimer);
  state.roomLoginTimer = null;
  failPendingMessages("Bluetooth-Verbindung getrennt.");
  state.bluetoothTx?.removeEventListener("characteristicvaluechanged", handleBluetoothNotification);
  state.bluetoothServer = null;
  state.bluetoothRx = null;
  state.bluetoothTx = null;
  updateConnectionUi();
  log("Bluetooth-Verbindung wurde getrennt.", "error");
  if (!state.intentionalDisconnect) scheduleReconnect("bluetooth", device);
}

async function disconnect() {
  state.intentionalDisconnect = true;
  clearTimeout(state.reconnectTimer);
  clearTimeout(state.reconnectStableTimer);
  const transport = state.transport;
  state.connected = false;
  state.transport = null;
  rejectPendingWaiters(new Error("Verbindung getrennt."));
  clearPendingPings();
  if (state.roomSessions.size || state.pendingRoomLogin) setRoomStatus("error", "Room-Verbindung getrennt.");
  state.roomSessions.clear();
  state.pendingRoomLogin = null;
  clearTimeout(state.roomLoginTimer);
  state.roomLoginTimer = null;
  failPendingMessages("Verbindung getrennt.");
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
  try {
    if (state.bluetoothTx) {
      state.bluetoothTx.removeEventListener("characteristicvaluechanged", handleBluetoothNotification);
      await state.bluetoothTx.stopNotifications();
    }
  } catch {}
  try {
    if (state.bluetoothDevice) {
      state.bluetoothDevice.removeEventListener("gattserverdisconnected", handleBluetoothDisconnected);
      if (state.bluetoothDevice.gatt?.connected) state.bluetoothDevice.gatt.disconnect();
    }
  } catch {}
  state.port = null;
  state.reader = null;
  state.writer = null;
  state.bluetoothDevice = null;
  state.bluetoothServer = null;
  state.bluetoothRx = null;
  state.bluetoothTx = null;
  updateConnectionUi();
  if (transport) log(`${transport === "bluetooth" ? "Bluetooth" : "USB"} getrennt.`);
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
    try {
      await sendAndWait(buildDeviceTime(), [RESP.OK]);
    } catch (error) {
      // Geraeteuhr laeuft bereits vor unserer PC-Zeit - darf den restlichen Sync nicht blockieren
      log(`Geraetezeit konnte nicht gesetzt werden: ${error.message}`, "warn");
    }
    await sendAndWait([CMD.GET_BATT_AND_STORAGE], [RESP.BATTERY]);
    await syncChannels();
    try {
      await sendAndWait([CMD.GET_CONTACTS], [RESP.CONTACTS_END], 5000);
    } catch (error) {
      log(`Kontaktliste konnte nicht vollständig synchronisiert werden: ${error.message}`, "warn");
    }
    await drainMessages();
    reconnectFavoriteRooms().catch((error) => log(`Room-Wiederanmeldung fehlgeschlagen: ${error.message}`, "error"));
    log("Synchronisierung abgeschlossen.");
  } catch (error) {
    log(`${error.message} Prüfe, ob das ausgewählte Gerät eine MeshCore Companion-Firmware nutzt.`, "error");
  }
}

async function syncChannels() {
  log(`Lade ${state.maxChannels} Kanaele.`);
    for (const index of state.channels.keys()) {
      if (index >= state.maxChannels) state.channels.delete(index);
    }
    for (let index = 0; index < state.maxChannels; index += 1) {
      try {
        await sendAndWait([CMD.GET_CHANNEL, index], [RESP.CHANNEL_INFO]);
      } catch (error) {
        // leere Kanalslots melden einen Fehlercode, das darf den Sync anderer Kanaele nicht abbrechen
        if (!error.message.includes("Keine Antwort auf GET_CHANNEL")) state.channels.delete(index);
        log(`Kanal ${index} konnte nicht gelesen werden: ${error.message}`, "warn");
      }
    }
    renderChannels();
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

async function sendChannelMessage(channelIndex, text, existingMessage = null) {
  const channel = state.channels.get(channelIndex);
  const message = existingMessage || {
    id: createMessageId(),
    kind: "out",
    channel: channelIndex,
    channelName: channel?.name || (channelIndex === 0 ? "Public" : ""),
    channelSecret: channel?.secret || null,
    timestamp: Math.floor(Date.now() / 1000),
    text,
  };
  message.id ||= createMessageId();
  if (!state.connected) {
    queueMessage({ id: message.id, type: "channel", channelIndex, text });
    message.deliveryStatus = "queued";
    message.delivery = "Warteschlange";
    message.failureReason = null;
    if (!existingMessage) addMessage(message);
    else updateStoredMessage(message);
    showActionNotice("Nachricht wird nach der Wiederverbindung gesendet.", "warn");
    return message;
  }
  prepareMessageForSend(message);
  if (!existingMessage) addMessage(message);
  else updateStoredMessage(message);

  const body = encodeText(text);
  const payload = new Uint8Array(7 + body.length);
  payload[0] = CMD.SEND_CHANNEL_TXT_MSG;
  payload[1] = 0;
  payload[2] = channelIndex;
  writeU32(payload, 3, Math.floor(Date.now() / 1000));
  payload.set(body, 7);
  let response;
  try {
    response = await sendAndWait(payload, [RESP.SENT, RESP.OK], 5000);
  } catch (error) {
    markMessageFailed(message, error.message);
    throw error;
  }
  const detailedResponse = response[0] === RESP.SENT;
  const ackCode = detailedResponse ? readU32(response, 2) : null;
  message.sendResult = detailedResponse ? signedByte(response[1] ?? 0) : 0;
  message.ackCode = ackCode;
  message.estimatedTimeout = detailedResponse ? readU32(response, 6) : null;
  message.deliveryStatus = ackCode ? "sent" : "confirmed";
  message.delivery = ackCode ? "Gesendet" : "Bestätigt";
  dequeueMessage(message.id);
  updateStoredMessage(message);
  if (ackCode) {
    const earlyRoundTrip = state.ackResults.get(ackCode);
    if (earlyRoundTrip == null) {
      state.pendingAcks.set(ackCode, message);
      scheduleAckTimeout(ackCode, message);
    } else {
      applyAck(message, earlyRoundTrip);
      state.ackResults.delete(ackCode);
      updateStoredMessage(message);
    }
  }
  return message;
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

  let secret;
  try {
    secret = type === "hashtag"
      ? new Uint8Array(await crypto.subtle.digest("SHA-256", nameBytes)).slice(0, 16)
      : type === "private-join"
        ? parseChannelSecret(el.channelSecretInput.value)
        : crypto.getRandomValues(new Uint8Array(16));
  } catch (error) {
    showActionNotice(error.message, "error");
    return;
  }
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
    el.channelSecretInput.value = "";
    log(`${type === "hashtag" ? "Hashtag" : "Privater Kanal"} ${name} in Slot ${freeIndex} ${type === "private-join" ? "beigetreten" : "angelegt"}.`);
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
  const payload = payloadLike instanceof Uint8Array ? payloadLike : Uint8Array.from(payloadLike);
  if (state.transport === "bluetooth" && state.bluetoothRx) {
    if (typeof state.bluetoothRx.writeValueWithResponse === "function") {
      await state.bluetoothRx.writeValueWithResponse(payload);
    } else {
      await state.bluetoothRx.writeValue(payload);
    }
  } else if (state.transport === "usb" && state.writer) {
    const frame = new Uint8Array(3 + payload.length);
    frame[0] = FRAME_TO_RADIO;
    frame[1] = payload.length & 0xff;
    frame[2] = (payload.length >> 8) & 0xff;
    frame.set(payload, 3);
    await state.writer.write(frame);
  } else {
    throw new Error("Keine aktive Verbindung.");
  }
  if (payload[0] === CMD.SET_CHANNEL) log("TX SET_CHANNEL [Schluessel verborgen]");
  else if (payload[0] === CMD.SEND_LOGIN) log("TX SEND_LOGIN [Passwort verborgen]");
  else log(`TX ${toHex(payload)}`);
}

async function removeChannel(index) {
  const channel = state.channels.get(index);
  if (!state.connected || index === 0 || !channel?.enabled) return;
  if (!confirm(`Kanal #${index} ${channel.name || ""} wirklich vom Companion entfernen?`)) return;
  if (confirm("Kanal-Invite vor dem Entfernen als JSON sichern?")) exportSingleChannel(channel);

  const payload = new Uint8Array(50);
  payload[0] = CMD.SET_CHANNEL;
  payload[1] = index;
  try {
    await sendAndWait(payload, [RESP.OK]);
    await sendAndWait([CMD.GET_CHANNEL, index], [RESP.CHANNEL_INFO]);
    if (String(state.activeChannel) === String(index)) state.activeChannel = "all";
    state.unreadChannels.delete(String(index));
    renderChannels();
    renderMessages();
    showActionNotice(`Kanal #${index} entfernt.`);
  } catch (error) {
    showActionNotice(`Kanal konnte nicht entfernt werden: ${error.message}`, "error");
  }
}

function channelInviteValue(channel) {
  return `meshcore://channel/add?name=${encodeURIComponent(channel.name)}&secret=${encodeURIComponent(channel.secret)}`;
}

function showChannelInvite(index) {
  const channel = state.channels.get(index);
  if (!channel?.enabled) return;
  const invite = channelInviteValue(channel);
  el.channelInviteText.value = invite;
  el.channelQrCode.innerHTML = "";
  if (window.QRCode) new QRCode(el.channelQrCode, { text: invite, width: 180, height: 180 });
  el.channelInviteDialog.showModal();
}

async function importChannelInvite() {
  if (!state.connected) return;
  const invite = prompt("MeshCore-Kanal-Invite einfuegen:");
  if (!invite) return;
  try {
    const url = new URL(invite.trim());
    if (url.protocol !== "meshcore:" || url.hostname !== "channel" || url.pathname !== "/add") throw new Error("Unbekanntes Invite-Format.");
    const name = url.searchParams.get("name")?.trim();
    const secret = parseChannelSecret(url.searchParams.get("secret") || "");
    if (!name) throw new Error("Kanalname fehlt.");
    const freeIndex = findFreeChannelIndex();
    if (freeIndex == null) throw new Error("Kein freier Kanalplatz vorhanden.");
    await writeChannel(freeIndex, name, secret);
    showActionNotice(`Kanal ${name} beigetreten.`);
  } catch (error) {
    showActionNotice(`Invite ungueltig: ${error.message}`, "error");
  }
}

function findFreeChannelIndex() {
  return Array.from({ length: Math.max(0, state.maxChannels - 1) }, (_, index) => index + 1).find((index) => !state.channels.get(index)?.enabled);
}

async function writeChannel(index, name, secret) {
  const nameBytes = encodeText(name);
  if (nameBytes.length > 32) throw new Error("Kanalname ist laenger als 32 UTF-8-Bytes.");
  const payload = new Uint8Array(50);
  payload[0] = CMD.SET_CHANNEL;
  payload[1] = index;
  payload.set(nameBytes, 2);
  payload.set(secret, 34);
  await sendAndWait(payload, [RESP.OK]);
  await sendAndWait([CMD.GET_CHANNEL, index], [RESP.CHANNEL_INFO]);
}

async function editChannel(index) {
  const channel = state.channels.get(index);
  if (!channel || index === 0) return;
  const name = prompt("Neuer Kanalname:", channel.name);
  if (!name) return;
  const slotText = prompt(`Ziel-Slot (1-${state.maxChannels - 1}):`, String(index));
  if (!slotText) return;
  const targetIndex = Number(slotText);
  if (!Number.isInteger(targetIndex) || targetIndex < 1 || targetIndex >= state.maxChannels) {
    showActionNotice("Ungueltiger Kanal-Slot.", "error");
    return;
  }
  if (targetIndex !== index && state.channels.get(targetIndex)?.enabled && !confirm(`Slot ${targetIndex} ist belegt und wird ueberschrieben. Fortfahren?`)) return;
  try {
    await writeChannel(targetIndex, name, hexToBytes(channel.secret));
    if (targetIndex !== index) {
      const clearPayload = new Uint8Array(50);
      clearPayload[0] = CMD.SET_CHANNEL;
      clearPayload[1] = index;
      await sendAndWait(clearPayload, [RESP.OK]);
      state.channels.set(index, { index, name: "", secret: "0".repeat(32), enabled: false });
    }
    renderChannels();
    showActionNotice(`Kanal nach Slot ${targetIndex} gespeichert.`);
  } catch (error) {
    showActionNotice(`Kanal konnte nicht bearbeitet werden: ${error.message}`, "error");
  }
}

function exportSingleChannel(channel) {
  downloadJson(`meshcore-channel-${channel.index}.json`, { format: "meshcore-channel", version: 1, channel: { name: channel.name, secret: channel.secret } });
}

function exportChannelsBackup() {
  const channels = [...state.channels.values()].filter((channel) => channel.enabled && channel.index !== 0).map(({ index, name, secret }) => ({ index, name, secret }));
  downloadJson(`meshcore-channels-${new Date().toISOString().slice(0, 10)}.json`, { format: "meshcore-channel-backup", version: 1, sensitive: true, channels });
  showActionNotice("Sensibles Kanal-Backup exportiert.");
}

async function importChannelsBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || !state.connected) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup?.format !== "meshcore-channel-backup" || !Array.isArray(backup.channels)) throw new Error("Unbekanntes Backup-Format.");
    for (const channel of backup.channels) {
      if (!Number.isInteger(channel.index) || channel.index < 1 || channel.index >= state.maxChannels) continue;
      await writeChannel(channel.index, String(channel.name || ""), parseChannelSecret(String(channel.secret || "")));
    }
    showActionNotice("Kanal-Backup wiederhergestellt.");
  } catch (error) {
    showActionNotice(`Restore fehlgeschlagen: ${error.message}`, "error");
  }
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function rejectPendingWaiters(error) {
  const waiters = state.waiters.splice(0);
  for (const waiter of waiters) {
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }
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
  state.lastPacketAt = Date.now();
  const code = data[0];
  recordPacket(code, data);
  log(`RX ${packetName(code)} ${toHex(data)}`);

  const waiterIndex = state.waiters.findIndex((waiter) => waiter.responseCodes.includes(code) || code === RESP.ERROR);
  if (waiterIndex >= 0) {
    const [waiter] = state.waiters.splice(waiterIndex, 1);
    clearTimeout(waiter.timer);
    if (code === RESP.ERROR) {
      waiter.reject(new Error(meshErrorLabel(data[1])));
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
    case RESP.LOGIN_SUCCESS:
      parseRoomLoginResult(data, true);
      break;
    case RESP.LOGIN_FAIL:
      parseRoomLoginResult(data, false);
      break;
    case RESP.NO_MORE_MESSAGES:
    case RESP.OK:
    case RESP.SENT:
      break;
    case RESP.ERROR:
      state.packetStats.errors += 1;
      log(meshErrorLabel(data[1]), "error");
      break;
    default:
      state.packetStats.unknown += 1;
      log(`Unbekannter Pakettyp 0x${code.toString(16).padStart(2, "0")}`);
  }
  renderPacketDiagnostics();
}

async function sendDirectMessage(key, text, existingMessage = null) {
  const contact = state.contacts.get(key);
  if (!contact) throw new Error("Kontakt nicht verfügbar.");

  const message = existingMessage || {
    id: createMessageId(),
    kind: "contact",
    outgoing: true,
    prefix: contact.prefix,
    pathLen: contact.outPathLenRaw ?? 0xff,
    textType: TXT_TYPE_PLAIN,
    timestamp: Math.floor(Date.now() / 1000),
    text,
  };
  message.id ||= createMessageId();
  if (!state.connected) {
    queueMessage({ id: message.id, type: "direct", key, text });
    message.deliveryStatus = "queued";
    message.delivery = "Warteschlange";
    message.failureReason = null;
    if (!existingMessage) addMessage(message);
    else updateStoredMessage(message);
    showActionNotice("Nachricht wird nach der Wiederverbindung gesendet.", "warn");
    return message;
  }
  prepareMessageForSend(message);
  if (!existingMessage) addMessage(message);
  else updateStoredMessage(message);

  const payload = new Uint8Array(13 + encodeText(text).length);
  payload[0] = CMD.SEND_TXT_MSG;
  payload[1] = TXT_TYPE_PLAIN;
  payload[2] = 0;
  writeU32(payload, 3, Math.floor(Date.now() / 1000));
  payload.set(hexToBytes(contact.key.slice(0, 12)), 7);
  payload.set(encodeText(text), 13);

  let response;
  try {
    response = await sendAndWait(payload, [RESP.SENT, RESP.OK], 8000);
  } catch (error) {
    markMessageFailed(message, error.message);
    throw error;
  }
  const ackCode = response[0] === RESP.SENT ? readU32(response, 2) : null;
  message.ackCode = ackCode;
  message.estimatedTimeout = response[0] === RESP.SENT ? readU32(response, 6) : null;
  message.deliveryStatus = ackCode ? "sent" : "confirmed";
  message.delivery = ackCode ? "Gesendet" : "Bestätigt";
  message.sendResult = response[0] === RESP.SENT ? signedByte(response[1] ?? 0) : 0;
  dequeueMessage(message.id);
  updateStoredMessage(message);
  if (ackCode) {
    const earlyRoundTrip = state.ackResults.get(ackCode);
    if (earlyRoundTrip == null) {
      state.pendingAcks.set(ackCode, message);
      scheduleAckTimeout(ackCode, message);
    } else {
      applyAck(message, earlyRoundTrip);
      state.ackResults.delete(ackCode);
      updateStoredMessage(message);
    }
  }
  return response;
}

function updateChannelSecretField() {
  const joining = el.channelTypeSelect.value === "private-join";
  el.channelSecretInput.hidden = !joining;
  el.channelSecretInput.disabled = !state.connected || !joining;
  el.channelSecretInput.required = joining;
  el.createChannelBtn.textContent = joining ? "Beitreten" : "Anlegen";
}

function parseChannelSecret(value) {
  const secret = value.trim();
  if (/^[0-9a-f]{32}$/i.test(secret)) return hexToBytes(secret);
  try {
    const decoded = Uint8Array.from(atob(secret), (character) => character.charCodeAt(0));
    if (decoded.length === 16) return decoded;
  } catch {}
  throw new Error("Das Kanal-Secret muss 32 Hex-Zeichen oder 16 Byte Base64 enthalten.");
}

async function importContactCard() {
  if (!state.connected) return;
  const value = prompt("MeshCore-Kontaktkarte (meshcore://...) einfügen:");
  if (!value) return;
  try {
    const trimmed = value.trim();
    const url = new URL(trimmed);
    if (url.hostname === "contact" && url.pathname === "/add") {
      const name = url.searchParams.get("name")?.trim();
      const key = url.searchParams.get("public_key") || "";
      const type = Number(url.searchParams.get("type"));
      if (!name || !/^[0-9a-f]{64}$/i.test(key) || ![1, 2, 3, 4].includes(type)) throw new Error("Name, Public Key oder Kontakttyp sind ungültig.");
      const payload = new Uint8Array(136);
      payload[0] = CMD.ADD_UPDATE_CONTACT;
      payload.set(hexToBytes(key), 1);
      payload[33] = type;
      payload.set(encodeText(name).slice(0, 31), 100);
      await sendAndWait(payload, [RESP.OK]);
    } else {
      const hex = decodeURIComponent(trimmed.replace(/^meshcore:\/\//i, "")).replace(/\s+/g, "");
      if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 || hex.length < 64) throw new Error("Die Kontaktkarte enthält keine gültigen Kartendaten.");
      await sendAndWait(Uint8Array.from([CMD.IMPORT_CONTACT, ...hexToBytes(hex)]), [RESP.OK]);
    }
    await sendAndWait([CMD.GET_CONTACTS], [RESP.CONTACTS_END], 5000);
    showActionNotice("Room-Kontakt importiert.");
  } catch (error) {
    showActionNotice(`Import fehlgeschlagen: ${error.message}`, "error");
  }
}

function meshErrorLabel(code) {
  const descriptions = {
    1: "Befehl nicht unterstützt",
    2: "Eintrag nicht gefunden",
    3: "Kontakt- oder Kanalspeicher voll",
    4: "Gerät ist nicht im passenden Zustand",
    5: "Dateisystemfehler",
    6: "Ungültige Parameter",
  };
  const suffix = code == null ? "unbekannt" : code;
  return `MeshCore-Fehler ${suffix}: ${descriptions[code] || "Das Gerät hat die Anfrage abgelehnt"}.`;
}

function openRoomLogin(key) {
  const contact = state.contacts.get(key);
  if (!contact || contact.type !== 3) return;
  if (state.roomSessions.has(contact.prefix)) {
    openRoomConversation(contact);
    return;
  }
  state.pendingRoomLogin = { contact, awaitingResult: false };
  el.roomLoginTarget.textContent = `${contact.name} (${contact.prefix})`;
  el.roomPasswordInput.value = state.roomCredentials[contact.key] || "";
  el.rememberRoomPassword.checked = Object.hasOwn(state.roomCredentials, contact.key);
  el.roomLoginDialog.showModal();
  el.roomPasswordInput.focus();
}

async function loginToRoomServer(event) {
  event.preventDefault();
  const pending = state.pendingRoomLogin;
  if (!pending?.contact || !state.connected) return;
  const password = encodeText(el.roomPasswordInput.value);
  if (password.length > 15) {
    el.roomPasswordInput.setCustomValidity("Das Passwort darf maximal 15 UTF-8-Bytes lang sein.");
    el.roomPasswordInput.reportValidity();
    return;
  }
  el.roomPasswordInput.setCustomValidity("");
  if (el.rememberRoomPassword.checked) state.roomCredentials[pending.contact.key] = el.roomPasswordInput.value;
  else delete state.roomCredentials[pending.contact.key];
  persistRoomCredentials();
  const payload = new Uint8Array(33 + password.length);
  payload[0] = CMD.SEND_LOGIN;
  payload.set(hexToBytes(pending.contact.key), 1);
  payload.set(password, 33);
  pending.awaitingResult = true;
  setRoomStatus("pending", `Anmeldung bei ${pending.contact.name} laeuft...`);
  el.roomLoginSubmitBtn.disabled = true;
  try {
    const response = await sendAndWait(payload, [RESP.SENT], 8000);
    el.roomLoginDialog.close();
    showActionNotice(`Login an ${pending.contact.name} gesendet.`);
    if (state.pendingRoomLogin === pending) {
      const suggestedTimeout = readU32(response, 6) || 30000;
      clearTimeout(state.roomLoginTimer);
      state.roomLoginTimer = setTimeout(() => parseRoomLoginResult(new Uint8Array(), false), Math.min(120000, Math.max(10000, suggestedTimeout + 5000)));
    }
  } catch (error) {
    pending.awaitingResult = false;
    setRoomStatus("error", `Room-Login bei ${pending.contact.name} fehlgeschlagen: ${error.message}`);
    showActionNotice(`Room-Login fehlgeschlagen: ${error.message}`, "error");
  } finally {
    el.roomLoginSubmitBtn.disabled = false;
  }
}

function parseRoomLoginResult(data, success) {
  clearTimeout(state.roomLoginTimer);
  state.roomLoginTimer = null;
  const pending = state.pendingRoomLogin;
  const prefix = success && data.length >= 8 ? sliceHex(data, 2, 8) : pending?.contact?.prefix;
  const contact = [...state.contacts.values()].find((item) => item.prefix === prefix) || pending?.contact;
  if (!contact) return;
  if (success) {
    const automatic = Boolean(pending?.automatic);
    const permissions = data[1] || 0;
    state.roomSessions.set(contact.prefix, { key: contact.key, name: contact.name, admin: Boolean(permissions & 1) });
    state.pendingRoomLogin = null;
    setRoomStatus("success", `Verbunden mit Room ${contact.name}. Nachrichten erscheinen in diesem Room-Tab.`);
    showActionNotice(`Room ${contact.name} verbunden.`);
    if (automatic) {
      renderContacts();
      renderChannels();
      renderChannelTabs();
    } else {
      openRoomConversation(contact);
    }
  } else {
    state.pendingRoomLogin = null;
    setRoomStatus("error", `Login bei ${contact.name} fehlgeschlagen oder Zeitlimit erreicht.`);
    showActionNotice(`Login bei ${contact.name} abgelehnt oder Zeitlimit erreicht.`, "error");
    renderContacts();
  }
}

function setRoomStatus(status, text) {
  state.roomStatus = { status, text };
  el.roomSessionStatus.hidden = false;
  el.roomSessionStatus.dataset.state = status;
  el.roomSessionStatus.textContent = text;
}

async function leaveRoomServer(key) {
  const contact = state.contacts.get(key);
  if (!contact || !state.roomSessions.has(contact.prefix)) return;
  const payload = new Uint8Array(33);
  payload[0] = CMD.LOGOUT;
  payload.set(hexToBytes(contact.key), 1);
  try {
    await sendAndWait(payload, [RESP.OK], 5000);
    state.roomSessions.delete(contact.prefix);
    state.unreadChannels.delete(`room:${contact.prefix}`);
    if (state.activeChannel === `room:${contact.prefix}`) state.activeChannel = "all";
    setRoomStatus("success", `Room ${contact.name} verlassen.`);
    renderContacts();
    renderChannels();
    renderMessages();
  } catch (error) {
    setRoomStatus("error", `Room ${contact.name} konnte nicht verlassen werden: ${error.message}`);
  }
}

function loadRoomFavorites() {
  try {
    const values = JSON.parse(localStorage.getItem("meshcore-dashboard-room-favorites") || "[]");
    return new Set(Array.isArray(values) ? values : []);
  } catch {
    return new Set();
  }
}

function loadRoomCredentials() {
  try {
    const values = JSON.parse(localStorage.getItem("meshcore-dashboard-room-credentials") || "{}");
    return values && typeof values === "object" && !Array.isArray(values) ? values : {};
  } catch {
    return {};
  }
}

function persistRoomCredentials() {
  try {
    localStorage.setItem("meshcore-dashboard-room-credentials", JSON.stringify(state.roomCredentials));
  } catch {}
}

async function reconnectFavoriteRooms() {
  for (const key of state.roomFavorites) {
    if (!state.connected) return;
    const contact = state.contacts.get(key);
    if (!contact || contact.type !== 3 || state.roomSessions.has(contact.prefix)) continue;
    const passwordText = state.roomCredentials[key] || "";
    const password = encodeText(passwordText);
    if (password.length > 15) continue;
    const pending = { contact, awaitingResult: true, automatic: true };
    state.pendingRoomLogin = pending;
    setRoomStatus("pending", `Wiederanmeldung bei ${contact.name} laeuft...`);
    const payload = new Uint8Array(33 + password.length);
    payload[0] = CMD.SEND_LOGIN;
    payload.set(hexToBytes(contact.key), 1);
    payload.set(password, 33);
    try {
      const response = await sendAndWait(payload, [RESP.SENT], 8000);
      const waitMs = Math.min(120000, Math.max(10000, (readU32(response, 6) || 30000) + 5000));
      clearTimeout(state.roomLoginTimer);
      state.roomLoginTimer = setTimeout(() => parseRoomLoginResult(new Uint8Array(), false), waitMs);
      const deadline = Date.now() + waitMs + 1000;
      while (state.pendingRoomLogin === pending && Date.now() < deadline) await pause(250);
    } catch (error) {
      if (state.pendingRoomLogin === pending) state.pendingRoomLogin = null;
      setRoomStatus("error", `Wiederanmeldung bei ${contact.name} fehlgeschlagen: ${error.message}`);
    }
  }
}

async function handleUsbDisconnected() {
  if (!state.connected || state.transport !== "usb") return;
  const port = state.port;
  state.connected = false;
  state.transport = null;
  clearTimeout(state.reconnectStableTimer);
  rejectPendingWaiters(new Error("USB-Verbindung getrennt."));
  clearPendingPings();
  if (state.roomSessions.size || state.pendingRoomLogin) setRoomStatus("error", "Room-Verbindung durch USB-Trennung beendet.");
  state.roomSessions.clear();
  state.pendingRoomLogin = null;
  clearTimeout(state.roomLoginTimer);
  state.roomLoginTimer = null;
  failPendingMessages("USB-Verbindung getrennt.");
  try { state.reader?.releaseLock(); } catch {}
  try { state.writer?.releaseLock(); } catch {}
  state.reader = null;
  state.writer = null;
  updateConnectionUi();
  log("USB-Verbindung physisch getrennt.", "error");
  if (!state.intentionalDisconnect) scheduleReconnect("usb", port);
}

function scheduleReconnect(transport, target) {
  if (!state.autoReconnect || state.intentionalDisconnect || state.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) return;
  clearTimeout(state.reconnectTimer);
  state.reconnectAttempts += 1;
  const delay = Math.min(30000, 1500 * (2 ** (state.reconnectAttempts - 1)));
  el.connectionState.textContent = `Wiederverbindung ${state.reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS}`;
  state.reconnectTimer = setTimeout(async () => {
    try {
      if (transport === "bluetooth" && target) await openBluetoothDevice(target);
      else if (transport === "usb") {
        const ports = "serial" in navigator ? await navigator.serial.getPorts() : [];
        const port = ports.includes(target) ? target : ports[0];
        if (!port) throw new Error("Kein freigegebenes USB-Gerät gefunden.");
        await openUsbPort(port, true);
      }
    } catch (error) {
      log(`Wiederverbindung fehlgeschlagen: ${error.message}`, "error");
      scheduleReconnect(transport, target);
    }
  }, delay);
}

function markConnectionStableLater() {
  clearTimeout(state.reconnectStableTimer);
  state.reconnectStableTimer = setTimeout(() => {
    if (state.connected) state.reconnectAttempts = 0;
  }, 30000);
}

function toggleRoomFavorite(key) {
  if (state.roomFavorites.has(key)) state.roomFavorites.delete(key);
  else state.roomFavorites.add(key);
  try {
    localStorage.setItem("meshcore-dashboard-room-favorites", JSON.stringify([...state.roomFavorites]));
  } catch {}
  renderContacts();
}

function openRoomConversation(contact) {
  state.activeChannel = `room:${contact.prefix}`;
  state.dmTarget = contact.key;
  updateMessageInputPlaceholder();
  renderChannels();
  renderContacts();
  renderMessages();
  renderChannelTabs();
}

async function pingContact(key) {
  const contact = state.contacts.get(key);
  if (!contact || !state.connected) return;
  if (contact.type !== 1) {
    log(`Ping ist nur fuer Clients moeglich, ${contact.name} ist ${TYPE_NAMES[contact.type] || "unbekannt"}.`, "error");
    return;
  }

  const targetChannel = findChannelByName(PING_TARGET_CHANNEL);
  if (!targetChannel) {
    log(`Kanal #${PING_TARGET_CHANNEL} nicht gefunden - bitte zuerst anlegen.`, "error");
    return;
  }

  const payload = new Uint8Array(13 + 4);
  payload[0] = CMD.SEND_TXT_MSG;
  payload[1] = TXT_TYPE_PLAIN;
  payload[2] = 0; // attempt
  writeU32(payload, 3, Math.floor(Date.now() / 1000));
  payload.set(hexToBytes(contact.key.slice(0, 12)), 7);
  payload.set(encodeText("ping"), 13);

  try {
    const response = await sendAndWait(payload, [RESP.SENT, RESP.OK], 8000);
    const ackCode = response[0] === RESP.SENT ? readU32(response, 2) : null;
    if (!ackCode) {
      log(`Ping an ${contact.name} gesendet, aber kein ACK erwartet.`);
      return;
    }
    const timeoutMs = getPingAckTimeout(response);
    const pending = { contact, channelIndex: targetChannel.index, sentAt: Date.now(), timer: null };
    const earlyRoundTrip = state.ackResults.get(ackCode);
    if (earlyRoundTrip != null) {
      state.ackResults.delete(ackCode);
      finalizePing(pending, earlyRoundTrip);
    } else {
      registerPendingPing(ackCode, pending, timeoutMs);
      log(`Ping an ${contact.name} gesendet, warte bis zu ${Math.ceil(timeoutMs / 1000)} Sekunden auf Antwort...`);
    }
  } catch (error) {
    log(`Ping an ${contact.name} fehlgeschlagen: ${error.message}`, "error");
  }
}

function getPingAckTimeout(response) {
  const estimatedTimeout = response[0] === RESP.SENT ? readU32(response, 6) : null;
  if (!estimatedTimeout) return PING_ACK_TIMEOUT_DEFAULT_MS;
  return Math.min(PING_ACK_TIMEOUT_MAX_MS, Math.max(PING_ACK_TIMEOUT_MIN_MS, estimatedTimeout + PING_ACK_TIMEOUT_BUFFER_MS));
}

function registerPendingPing(ackCode, pending, timeoutMs) {
  state.expiredPingAcks.delete(ackCode);
  pending.timer = setTimeout(() => {
    if (state.pendingPings.get(ackCode) !== pending) return;
    state.pendingPings.delete(ackCode);
    rememberExpiredPingAck(ackCode);
    log(`Keine Ping-Antwort von ${pending.contact.name} innerhalb von ${Math.ceil(timeoutMs / 1000)} Sekunden.`, "warn");
  }, timeoutMs);
  state.pendingPings.set(ackCode, pending);
}

function rememberExpiredPingAck(ackCode) {
  state.expiredPingAcks.add(ackCode);
  while (state.expiredPingAcks.size > 200) {
    state.expiredPingAcks.delete(state.expiredPingAcks.values().next().value);
  }
}

function clearPendingPings() {
  for (const [ackCode, pending] of state.pendingPings) {
    clearTimeout(pending.timer);
    rememberExpiredPingAck(ackCode);
  }
  state.pendingPings.clear();
}

async function finalizePing(pending, roundTrip) {
  const contact = state.contacts.get(pending.contact.key) || pending.contact;
  const path = formatPathHashes(contact.outPathLenRaw, contact.outPathRaw);
  const pathText = path.hashes?.length
    ? path.hashes.map(formatRepeaterHash).join(" -> ")
    : "-";
  const rf = state.lastRf && Date.now() - state.lastRf.receivedAt < 5000 ? state.lastRf : null;
  const snrText = rf ? `${rf.snr.toFixed(2)} dB` : "-";
  const rssiText = rf ? `${rf.rssi} dBm` : "-";
  const text = `ack @${contact.name}: ${pathText} (${path.hops} hops) | SNR: ${snrText} | RSSI: ${rssiText} | Received at: ${new Date().toLocaleString()} | Roundtrip: ${roundTrip} ms`;
  log(`Ping-Antwort von ${contact.name} erhalten (${roundTrip} ms).`);
  try {
    await sendChannelMessage(pending.channelIndex, text);
  } catch (error) {
    log(`Ping-Ergebnis konnte nicht in Kanal gepostet werden: ${error.message}`, "error");
  }
}

function formatPathHashes(pathLenRaw, rawBytes) {
  if (pathLenRaw == null || pathLenRaw === 0xff || !rawBytes) return { list: null, hashes: [], hops: 0 };
  const hashSize = (pathLenRaw >> 6) + 1;
  const hashCount = pathLenRaw & 0x3f;
  const groups = [];
  for (let i = 0; i < hashCount; i += 1) {
    groups.push(sliceHex(rawBytes, i * hashSize, i * hashSize + hashSize));
  }
  return { list: groups.join(","), hashes: groups, hops: hashCount };
}

function formatRepeaterHash(hash) {
  const matches = resolveRepeaterHash(hash);
  if (matches.length === 1) return `${matches[0].name} (${hash})`;
  if (matches.length > 1) return `${hash} [${matches.map((contact) => contact.name).join(" / ")}]`;
  return hash;
}

function resolveRepeaterHash(hash) {
  const normalized = hash.toLowerCase();
  return [...state.contacts.values()].filter(
    (contact) => contact.type === 2 && contact.key?.toLowerCase().startsWith(normalized),
  );
}

function findChannelByName(name) {
  const normalized = name.replace(/^#/, "").toLowerCase();
  return [...state.channels.values()].find(
    (channel) => (channel.name || "").replace(/^#/, "").toLowerCase() === normalized,
  );
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
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

  if (pub && state.deviceId !== pub) state.deviceProfileLoad = loadDeviceProfile(pub);

  el.nodeName.textContent = name;
  state.selfName = name === "(ohne Namen)" ? "" : name;
  state.selfLat = lat;
  state.selfLon = lon;
  renderMessages();
  el.publicKey.textContent = pub || "-";
  el.selfLocation.innerHTML = renderLocationLink(lat, lon);
  el.radioSummary.textContent = freq
    ? `${(freq / 1000000).toFixed(3)} MHz, BW ${(bw / 1000).toFixed(0)} kHz, SF${sf}, CR${cr}`
    : "-";
  renderNetworkOverview();
}

function parseDeviceInfo(data) {
  const fw = data[1] ?? 0;
  state.protocolVersion = fw;
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
  const lastAdvertRaw = readU32(data, 132);
  const contact = {
    key,
    prefix: key.slice(0, 12),
    type: data[33],
    flags: data[34],
    outPathLen: pathLenRaw > 127 ? pathLenRaw - 256 : pathLenRaw,
    outPathLenRaw: pathLenRaw,
    outPathRaw: data.slice(36, 100),
    name: decodeCString(data, 100, 32) || key.slice(0, 12),
    lastAdvert: normalizeFutureTimestamp(lastAdvertRaw),
    lat: readI32(data, 136),
    lon: readI32(data, 140),
    lastmod: normalizeFutureTimestamp(readU32(data, 144)),
  };
  state.contacts.set(key, contact);
  state.contactOrder.set(key, ++state.contactSequence);
  saveContactArchive();
  renderContacts();
  renderNodeArchive();
  renderNetworkOverview();
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
    saveContactArchive();
    renderContacts();
  }
  addMessage({ kind: "contact", prefix, pathLen, textType, timestamp, text: decodeUtf8(data.slice(textOffset)), snr, rssi: getRecentRssi() });
}

function parseChannelMessage(data) {
  const v3 = data[0] === RESP.CHANNEL_MSG_V3;
  const offset = v3 ? 4 : 1;
  const channelIndex = data[offset];
  const channel = state.channels.get(channelIndex);
  const message = {
    kind: "channel",
    channel: channelIndex,
    channelName: channel?.name || (channelIndex === 0 ? "Public" : ""),
    channelSecret: channel?.secret || null,
    pathLen: data[offset + 1],
    textType: data[offset + 2],
    timestamp: readU32(data, offset + 3),
    text: decodeUtf8(data.slice(offset + 7)),
    snr: v3 ? signedByte(data[1]) / 4 : null,
    rssi: getRecentRssi(),
  };
  addMessage(message);
  queueAutoPong(message);
  queueAutoQuickReply(message);
  queueWeatherReply(message);
}

function parseAck(data) {
  const ackCode = readU32(data, 1);
  const roundTrip = readU32(data, 5);
  const pendingPing = state.pendingPings.get(ackCode);
  if (pendingPing) {
    clearTimeout(pendingPing.timer);
    state.pendingPings.delete(ackCode);
    finalizePing(pendingPing, roundTrip);
    return;
  }
  const message = state.pendingAcks.get(ackCode);
  if (message) {
    applyAck(message, roundTrip);
    state.pendingAcks.delete(ackCode);
    clearTimeout(state.ackTimers.get(ackCode));
    state.ackTimers.delete(ackCode);
    updateStoredMessage(message);
    return;
  }
  if (state.expiredPingAcks.delete(ackCode)) return;
  state.ackResults.set(ackCode, roundTrip);
}

function parseLogData(data) {
  if (data.length < 3) return;
  const snr = signedByte(data[1]) / 4;
  const rssi = signedByte(data[2]);
  state.lastRf = { snr, rssi, receivedAt: Date.now() };
  log(`RF-Paket empfangen: SNR ${snr.toFixed(1)} dB, RSSI ${rssi} dBm.`);
}

function applyAck(message, roundTrip) {
  message.deliveryStatus = "confirmed";
  message.delivery = "Bestätigt";
  message.roundTrip = roundTrip;
}

function getRecentRssi() {
  if (!state.lastRf || Date.now() - state.lastRf.receivedAt > 2000) return null;
  return state.lastRf.rssi;
}

function parseChannelData(data) {
  if (data.length < 9) return;
  const len = data[8];
  const channelIndex = data[4];
  const channel = state.channels.get(channelIndex);
  addMessage({
    kind: "data",
    channel: channelIndex,
    channelName: channel?.name || (channelIndex === 0 ? "Public" : ""),
    channelSecret: channel?.secret || null,
    pathLen: data[5],
    dataType: readU16(data, 6),
    text: `Data ${toHex(data.slice(9, 9 + len))}`,
    snr: signedByte(data[1]) / 4,
    rssi: getRecentRssi(),
    timestamp: Math.floor(Date.now() / 1000),
  });
}

function addMessage(message) {
  message.id ||= createMessageId();
  state.messages.unshift(message);
  state.messages = state.messages.slice(0, 200);

  if (message.kind === "contact") {
    const roomKey = message.prefix && state.roomSessions.has(message.prefix) ? `room:${message.prefix}` : "dm";
    if (state.activeChannel !== roomKey) {
      state.unreadChannels.set(roomKey, (state.unreadChannels.get(roomKey) || 0) + 1);
    }
  }
  if ((message.kind === "channel" || message.kind === "data") && message.channel != null) {
    const channelKey = String(message.channel);
    if (state.activeChannel !== channelKey) {
      state.unreadChannels.set(channelKey, (state.unreadChannels.get(channelKey) || 0) + 1);
    }
  }

  persistMessages();
  renderMessages();
  renderChannelTabs();
  renderNetworkOverview();
}

function loadStoredMessages() {
  try {
    const raw = localStorage.getItem("meshcore-dashboard-messages");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 200) : [];
  } catch (error) {
    return [];
  }
}

function persistMessages() {
  if (state.deviceProfileLoaded) {
    persistDeviceProfile();
    return;
  }
  try {
    localStorage.setItem("meshcore-dashboard-messages", JSON.stringify(state.messages.slice(0, 200)));
  } catch (error) {
    // Browser-Speicher kann in privaten Modus oder bei quota limits fehlen.
  }
}

function openDeviceProfileDb() {
  if (!window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DEVICE_PROFILE_DB_NAME, DEVICE_PROFILE_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("profiles")) {
        request.result.createObjectStore("profiles", { keyPath: "deviceId" });
      }
      if (!request.result.objectStoreNames.contains("hashtagMessages")) {
        request.result.createObjectStore("hashtagMessages", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadDeviceProfile(deviceId) {
  if (!deviceId || state.deviceId === deviceId && state.deviceProfileLoaded) return;
  state.deviceId = deviceId;
  state.deviceProfileLoaded = false;
  state.messages = [];
  state.channelOrder = [];
  renderMessages();
  try {
    const db = await openDeviceProfileDb();
    const profile = db ? await new Promise((resolve, reject) => {
      const request = db.transaction("profiles", "readonly").objectStore("profiles").get(deviceId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    }) : null;
    const sharedHashtagMessages = db ? await new Promise((resolve, reject) => {
      const request = db.transaction("hashtagMessages", "readonly").objectStore("hashtagMessages").getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    }) : [];
    const migrated = localStorage.getItem("meshcore-dashboard-profile-migrated") === "true";
    if (profile) {
      state.messages = Array.isArray(profile.messages) ? profile.messages.slice(0, 200) : [];
      state.channelOrder = Array.isArray(profile.channelOrder) ? profile.channelOrder.map(Number).filter(Number.isInteger) : [];
      state.activeChannel = profile.activeChannel || "all";
    } else if (!migrated && state.legacyMessages?.length) {
      state.messages = state.legacyMessages.slice(0, 200);
      localStorage.setItem("meshcore-dashboard-profile-migrated", "true");
    }
    state.messages = mergeMessages(state.messages, sharedHashtagMessages);
  } catch (error) {
    log(`Browserdatenbank konnte nicht geladen werden: ${error.message}`, "warn");
  }
  state.deviceProfileLoaded = true;
  persistDeviceProfile();
  renderChannels();
  renderMessages();
  renderChannelTabs();
}

async function persistDeviceProfile() {
  if (!state.deviceProfileLoaded || !state.deviceId) return;
  try {
    const db = await openDeviceProfileDb();
    if (!db) return;
    const profile = {
      deviceId: state.deviceId,
      messages: state.messages.slice(0, 200),
      channelOrder: state.channelOrder.slice(),
      activeChannel: state.activeChannel,
      updatedAt: Date.now(),
    };
    await new Promise((resolve, reject) => {
      const request = db.transaction("profiles", "readwrite").objectStore("profiles").put(profile);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    const hashtagMessages = state.messages.filter((message) => isHashtagMessage(message));
    if (hashtagMessages.length) {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("hashtagMessages", "readwrite");
        for (const message of hashtagMessages) transaction.objectStore("hashtagMessages").put(message);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    }
  } catch (error) {
    log(`Browserdatenbank konnte nicht gespeichert werden: ${error.message}`, "warn");
  }
}

async function deleteSharedHashtagMessages(ids) {
  if (!ids.length || !window.indexedDB) return;
  const db = await openDeviceProfileDb();
  if (!db) return;
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("hashtagMessages", "readwrite");
    for (const id of ids) transaction.objectStore("hashtagMessages").delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function clearSelectedHistory() {
  const tab = state.activeChannel;
  const label = tab === "all" ? "den gesamten Nachrichtenverlauf" : "den Verlauf dieses Tabs";
  if (!confirm(`${label} wirklich löschen?`)) return;

  const removed = state.messages.filter((message) => {
    if (tab === "all") return true;
    if (tab === "dm") return message.kind === "contact" || message.outgoing === true;
    if (tab.startsWith("room:")) return message.kind === "contact" && message.prefix === tab.slice(5);
    return ["channel", "data", "out"].includes(message.kind) && Number(getLocalChannelIndex(message)) === Number(tab);
  });
  state.messages = state.messages.filter((message) => !removed.includes(message));
  const sharedIds = removed.filter(isHashtagMessage).map((message) => message.id).filter(Boolean);
  try {
    await deleteSharedHashtagMessages(sharedIds);
  } catch (error) {
    log(`Globale Hashtag-Nachrichten konnten nicht gelöscht werden: ${error.message}`, "warn");
  }
  if (tab === "all") state.unreadChannels.clear();
  else state.unreadChannels.delete(tab);
  persistMessages();
  renderMessages();
  renderChannelTabs();
  showActionNotice("Nachrichtenverlauf gelöscht.");
}

function mergeMessages(...messageLists) {
  const messages = new Map();
  for (const list of messageLists) {
    for (const message of list || []) {
      if (message?.id) messages.set(message.id, message);
    }
  }
  return [...messages.values()].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).slice(0, 200);
}

function isHashtagMessage(message) {
  return message?.channelSecret && String(message.channelName || "").startsWith("#");
}

function getLocalChannelIndex(message) {
  if (message?.channelSecret) {
    const local = [...state.channels.values()].find((channel) => channel.secret === message.channelSecret);
    if (local) return local.index;
  }
  return message?.channel;
}

function renderContacts() {
  const contacts = [...state.contacts.values()].sort((a, b) => {
    const favoriteDifference = Number(state.favoriteContacts.has(b.key)) - Number(state.favoriteContacts.has(a.key));
    if (favoriteDifference) return favoriteDifference;
    const orderA = state.contactOrder.get(a.key) || 0;
    const orderB = state.contactOrder.get(b.key) || 0;
    return orderB - orderA;
  });
  const query = state.contactSearch;
  const visible = query
    ? contacts.filter((contact) => {
        const haystack = [contact.name, contact.key, contact.prefix, TYPE_NAMES[contact.type] || "", formatContactRoute(contact.outPathLen)]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : contacts;
  el.contactCount.textContent = String(visible.length);
  if (!visible.length) {
    el.contacts.className = "table empty";
    el.contacts.textContent = query ? "Keine Kontakte passen zur Suche." : "Noch keine Kontakte synchronisiert.";
    return;
  }
  el.contacts.className = "table";
  el.contacts.innerHTML = `
    <table class="contact-table">
      <thead><tr><th>Favorit</th><th>Name</th><th>Typ</th><th>Routing</th><th>Signal</th><th>Position</th><th>Letztes Advert</th><th>Public Key</th><th>Aktion</th></tr></thead>
      <tbody>
        ${visible.map((contact) => `
          <tr>
            <td><button type="button" class="secondary favorite-button" data-favorite="${escapeHtml(contact.key)}" aria-pressed="${state.favoriteContacts.has(contact.key)}" aria-label="${state.favoriteContacts.has(contact.key) ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufuegen"}" title="Favorit">${state.favoriteContacts.has(contact.key) ? "&#9733;" : "&#9734;"}</button></td>
            <td>${escapeHtml(contact.name)}</td>
            <td>${escapeHtml(TYPE_NAMES[contact.type] || `Typ ${contact.type}`)}</td>
            <td>${escapeHtml(formatContactRoute(contact.outPathLen))}</td>
            <td>${contact.lastSnr == null ? "-" : `${contact.lastSnr.toFixed(1)} dB SNR`}</td>
            <td>${renderLocationLink(contact.lat, contact.lon)}</td>
            <td>${renderTime(contact.lastAdvert)}</td>
            <td class="mono">${escapeHtml(contact.key)}</td>
            <td>
              ${contact.type === 1 ? `<button type="button" class="secondary" data-ping="${escapeHtml(contact.key)}">&#128251; Ping</button> <button type="button" class="secondary" data-dm="${escapeHtml(contact.key)}">&#128054; DM</button>` : contact.type === 3 ? `<button type="button" class="secondary favorite-button" data-room-favorite="${escapeHtml(contact.key)}" aria-pressed="${state.roomFavorites.has(contact.key)}" title="Room-Favorit">${state.roomFavorites.has(contact.key) ? "&#9733;" : "&#9734;"}</button> ${state.roomSessions.has(contact.prefix) ? `<button type="button" class="secondary" data-room-open="${escapeHtml(contact.key)}">&#128187; Oeffnen</button> <button type="button" class="secondary" data-room-logout="${escapeHtml(contact.key)}">&#128520; Verlassen</button>` : `<button type="button" class="secondary" data-room-login="${escapeHtml(contact.key)}"${state.connected ? "" : " disabled"}>&#9935;&#65039; Beitreten</button>`}` : "-"}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;
}

function renderChannelTabs() {
  const visible = [...state.channels.values()].filter((channel) => channel.enabled || channel.name);
  const order = ensureChannelOrder();
  const rank = new Map(order.map((index, position) => [index, position]));
  visible.sort((a, b) => (rank.get(a.index) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.index) ?? Number.MAX_SAFE_INTEGER) || a.index - b.index);
  const dmContact = state.dmTarget ? state.contacts.get(state.dmTarget) : null;
  const dmLabel = dmContact?.type === 3 && state.roomSessions.has(dmContact.prefix) ? `\u{1F4BB} Room: ${dmContact.name}` : "\u{1F436} DM";
  const roomTabs = [...state.roomSessions.entries()].map(([prefix, session]) => ({ key: `room:${prefix}`, label: `\u{1F4BB} Room: ${session.name}${session.admin ? " \u00b7 \u{1F608} Admin" : ""}` }));
  const tabs = [{ key: "all", label: "\u{26CF}\uFE0F Alle" }, { key: "dm", label: dmLabel }, ...roomTabs, ...visible.map((channel) => ({ key: String(channel.index), label: `\u{1F528} ${channel.name || `Kanal ${channel.index}`}` }))];
  const totalUnread = [...state.unreadChannels.values()].reduce((total, count) => total + Number(count || 0), 0);
  el.channelTabs.innerHTML = tabs.map((tab) => {
    const unreadCount = tab.key === "all" ? totalUnread : Number(state.unreadChannels.get(tab.key) || 0);
    const unread = unreadCount > 0;
    return `
      <button
        type="button"
        class="channel-tab${state.activeChannel === tab.key ? " active" : ""}${unread ? " unread" : ""}"
        data-channel-index="${escapeHtml(tab.key)}"
        draggable="${/^\d+$/.test(tab.key)}"
        aria-label="${escapeHtml(tab.label)}${unread ? ", neue Nachrichten" : ""}"
      >
        <span class="tab-label">${escapeHtml(tab.label)}</span>
        ${unread ? `<span class="tab-badge" aria-label="${unreadCount} neue Nachrichten">${unreadCount > 99 ? "99+" : unreadCount}</span>` : ""}
      </button>
    `;
  }).join("");
}

function ensureChannelOrder() {
  const indexes = [...state.channels.values()]
    .filter((channel) => channel.enabled || channel.name)
    .map((channel) => channel.index);
  const known = new Set(indexes);
  return [
    ...state.channelOrder.filter((index) => known.has(index)),
    ...indexes.filter((index) => !state.channelOrder.includes(index)),
  ];
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
  el.channelCount.textContent = `${visible.length}/${state.maxChannels}`;
  if (!visible.length) {
    el.channels.className = "list empty";
    el.channels.textContent = "Noch keine Kanaele synchronisiert.";
  } else {
    el.channels.className = "list";
    el.channels.innerHTML = visible.map((channel) => `
      <div class="channel">
        <div class="channel-title-row">
          <strong>#${channel.index} ${escapeHtml(channel.name || "(leer)")} <span class="meta">${channel.index === 0 ? "Public" : channel.name.startsWith("#") ? "Hashtag" : "Privat"}</span></strong>
          <span class="channel-actions">
            <button type="button" class="secondary channel-small-button" data-reveal-channel="${channel.index}" title="Secret ${state.revealedChannelSecrets.has(channel.index) ? "verbergen" : "anzeigen"}">${state.revealedChannelSecrets.has(channel.index) ? "Verbergen" : "Secret"}</button>
            <button type="button" class="secondary channel-small-button" data-channel-invite="${channel.index}" title="Invite anzeigen">Invite</button>
            ${channel.index === 0 ? "" : `<button type="button" class="secondary channel-small-button" data-edit-channel="${channel.index}" title="Umbenennen oder verschieben"${state.connected ? "" : " disabled"}>Bearbeiten</button><button type="button" class="secondary channel-remove-button" data-remove-channel="${channel.index}" aria-label="Kanal ${escapeHtml(channel.name || String(channel.index))} entfernen" title="Kanal entfernen"${state.connected ? "" : " disabled"}>&times;</button>`}
          </span>
        </div>
        <span class="meta mono">${state.revealedChannelSecrets.has(channel.index) ? escapeHtml(channel.secret) : "••••••••••••••••••••••••••••••••"}</span>
      </div>
    `).join("");
  }

  const selected = state.activeChannel === "dm" || state.activeChannel.startsWith("room:") ? state.activeChannel : el.channelSelect.value || state.activeChannel;
  const dmContact = state.dmTarget ? state.contacts.get(state.dmTarget) : null;
  const dmOption = dmContact && (dmContact.type === 1 || dmContact.type === 3)
    ? `<option value="dm">${dmContact.type === 3 ? "\u{1F4BB} Room" : "\u{1F436} DM"}: ${escapeHtml(dmContact.name)}</option>`
    : "";
  const roomOptions = [...state.roomSessions.entries()].map(([prefix, session]) => `<option value="room:${escapeHtml(prefix)}">\u{1F4BB} Room: ${escapeHtml(session.name)}</option>`).join("");
  el.channelSelect.innerHTML = dmOption + roomOptions + visible.map((channel) => (
    `<option value="${channel.index}">\u{1F528} #${channel.index} ${escapeHtml(channel.name || "Kanal")}</option>`
  )).join("");
  if (selected.startsWith("room:") && state.roomSessions.has(selected.slice(5))) {
    el.channelSelect.value = selected;
  } else if (selected === "dm" && dmOption) {
    el.channelSelect.value = "dm";
  } else if (selected && (selected === "all" || visible.some((channel) => String(channel.index) === String(selected)))) {
    el.channelSelect.value = selected;
  } else if (visible.length) {
    el.channelSelect.value = String(visible[0].index);
  }
  renderChannelTabs();
  const canSend = visible.length > 0 || Boolean(dmOption) || state.roomSessions.size > 0;
  el.channelSelect.disabled = !canSend;
  el.messageInput.disabled = !canSend;
  el.emojiPickerBtn.disabled = !canSend;
  el.sendBtn.disabled = !canSend;
}

function renderMessages() {
  if (state.activeChannel.startsWith("room:")) {
    state.unreadChannels.delete(state.activeChannel);
  } else if (state.activeChannel === "dm") {
    state.unreadChannels.delete("dm");
  } else if (state.activeChannel !== "all") {
    state.unreadChannels.delete(String(state.activeChannel));
  }

  const filtered = state.messages.filter((message) => {
    const roomPrefix = state.activeChannel.startsWith("room:") ? state.activeChannel.slice(5) : null;
    const activeChannel = state.channels.get(Number(state.activeChannel));
    const localChannelIndex = getLocalChannelIndex(message);
    const sameChannelIdentity = message.channelSecret && activeChannel?.secret
      ? message.channelSecret === activeChannel.secret
      : Number(localChannelIndex) === Number(state.activeChannel);
    const inActiveChannel = state.activeChannel === "all"
      || (roomPrefix && message.kind === "contact" && message.prefix === roomPrefix)
      || (state.activeChannel === "dm" && (message.kind === "contact" || message.outgoing === true) && !state.roomSessions.has(message.prefix))
      || (["channel", "data", "out"].includes(message.kind) && sameChannelIdentity);
    if (!inActiveChannel) return false;
    const outgoing = message.kind === "out" || message.outgoing === true;
    if (state.messageDirectionFilter !== "all" && state.messageDirectionFilter !== (outgoing ? "outgoing" : "incoming")) return false;
    const kind = message.kind === "out" ? "channel" : message.kind;
    if (state.messageKindFilter !== "all" && state.messageKindFilter !== kind) return false;
    if (state.messageSearch && !String(message.text || "").toLowerCase().includes(state.messageSearch)) return false;
    return true;
  });

  if (!filtered.length) {
    el.messages.className = "messages empty";
    el.messages.textContent = state.activeChannel === "all"
      ? "Noch keine Nachrichten."
      : state.activeChannel === "dm"
        ? "Noch keine Direktnachrichten in diesem Tab."
        : state.activeChannel.startsWith("room:")
          ? "Noch keine Nachrichten in diesem Room."
        : "Noch keine Nachrichten in diesem Kanal.";
    return;
  }
  el.messages.className = "messages";
  el.messages.innerHTML = filtered.slice(0, 30).map((message) => {
    const isDm = message.kind === "contact" || message.outgoing === true;
    const channelName = message.channel == null ? "" : message.channelName || "";
    const localChannelIndex = getLocalChannelIndex(message);
    const channelLabel = `#${localChannelIndex ?? "?"}${channelName ? ` ${channelName}` : ""}`;
    const contactName = message.prefix
      ? [...state.contacts.values()].find((c) => c.prefix === message.prefix)?.name
      : null;
    const isOutgoing = message.kind === "out" || message.outgoing === true;
    const direction = isOutgoing ? "Ausgehend" : "Empfangen";
    const badge = isDm ? "DM" : channelLabel;
    const peer = isDm ? (contactName || message.prefix || "unbekannt") : null;
    const deliveryStatus = getDeliveryStatus(message);
    const meta = [
      badge,
      formatRelativeTime(message.timestamp),
      message.snr == null ? null : `SNR ${message.snr.toFixed(1)} dB`,
      message.rssi == null ? null : `RSSI ${message.rssi} dBm`,
      message.pathLen == null ? null : formatMessageRouteForDirection(message),
      message.textType == null ? null : `Texttyp ${message.textType}`,
      message.dataType == null ? null : `Typ 0x${message.dataType.toString(16)}`,
      message.roundTrip == null ? null : `Roundtrip ${message.roundTrip} ms`,
    ].filter(Boolean).join(" · ");
      const replyContact = message.prefix
        ? [...state.contacts.values()].find((contact) => contact.prefix === message.prefix)
        : null;
      const replyButton = isDm && (replyContact?.type === 1 || (replyContact?.type === 3 && state.roomSessions.has(replyContact.prefix)))
        ? `<button type="button" class="secondary" data-reply="${escapeHtml(message.prefix)}">Antworten</button>`
      : "";
    const pingReply = getPingReply(message);
    const pongButton = pingReply
      ? `<button type="button" class="secondary" data-pong-index="${state.messages.indexOf(message)}"${state.connected ? "" : " disabled"}>Pong</button>`
      : "";
    const quickReply = getQuickChannelReply(message);
    const quickReplyButton = quickReply
      ? `<button type="button" class="secondary quick-reply-button" data-quick-reply-index="${state.messages.indexOf(message)}"${state.connected || !isValidPostalCode(state.autoPongPostalCode) ? "" : " disabled"} title="${escapeHtml(quickReply.sender)} mit Funkdaten antworten" aria-label="${escapeHtml(quickReply.sender)} mit Funkdaten antworten"><span aria-hidden="true">&#8617;</span><span>${quickReply.hops}</span></button>`
      : "";
    const channelReply = getChannelReply(message);
    const channelReplyButton = channelReply
      ? `<button type="button" class="secondary channel-reply-button" data-channel-reply-index="${state.messages.indexOf(message)}" title="${escapeHtml(channelReply.sender)} antworten" aria-label="${escapeHtml(channelReply.sender)} antworten">Antworten</button>`
      : "";
    const retryButton = deliveryStatus === "failed"
      ? `<button type="button" class="secondary retry-button" data-retry-index="${state.messages.indexOf(message)}"${state.connected ? "" : " disabled"} title="Nachricht erneut senden" aria-label="Nachricht erneut senden">&#8635;</button>`
      : "";
    const status = isOutgoing
      ? `<span class="delivery-status ${deliveryStatus}"${message.failureReason ? ` title="${escapeHtml(message.failureReason)}"` : ""}>${escapeHtml(deliveryStatusLabel(deliveryStatus))}</span>`
      : "";
    const mentionsSelf = !isOutgoing && messageMentionsSelf(message);
    return `
      <div class="message${isDm ? " dm" : ""}${isOutgoing ? " outgoing" : " incoming"}${mentionsSelf ? " mentions-self" : ""}">
        <div class="message-head">
          <span class="direction">${escapeHtml(direction)}${peer ? ` von ${escapeHtml(peer)}` : ""}</span>
          ${status}
          <span class="message-actions">
          ${pongButton}
          ${quickReplyButton}
          ${channelReplyButton}
          ${replyButton}
          ${retryButton}
          </span>
        </div>
        <span class="message-text">${renderMessageText(message)}</span>
        <span class="meta message-meta" title="${escapeHtml(formatExactTime(message.timestamp))}">${escapeHtml(meta)}</span>
      </div>
    `;
  }).join("");
}

function renderMessageText(message) {
  const text = String(message.text || "");
  if (message.kind !== "channel") return renderMentions(text);
  const separator = text.indexOf(":");
  if (separator < 1) return renderMentions(text);
  const sender = text.slice(0, separator).trim();
  const body = text.slice(separator + 1).trimStart();
  if (!sender) return renderMentions(text);
  return `<span class="message-author">${escapeHtml(sender)}</span><span class="message-body">${renderMentions(body)}</span>`;
}

function renderMentions(text) {
  const mentionPattern = /@\[([^\]\r\n]+)\]/g;
  let html = "";
  let offset = 0;
  for (const match of text.matchAll(mentionPattern)) {
    html += escapeHtml(text.slice(offset, match.index));
    html += `<span class="message-mention">${escapeHtml(match[0])}</span>`;
    offset = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(offset));
}

function loadTheme() {
  try {
    return localStorage.getItem("meshcore-dashboard-theme") === "mono" ? "mono" : "default";
  } catch {
    return "default";
  }
}

function applyTheme(theme) {
  const monochrome = theme === "mono";
  document.documentElement.dataset.theme = monochrome ? "mono" : "default";
  el.themeToggle.setAttribute("aria-pressed", String(monochrome));
  el.themeToggle.setAttribute("aria-label", monochrome
    ? "Monochromen Dark Mode ausschalten"
    : "Monochromen Dark Mode einschalten");
}

function loadChatDensity() {
  try {
    return localStorage.getItem("meshcore-dashboard-chat-density") === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

function applyChatDensity(density) {
  const compact = density === "compact";
  document.documentElement.dataset.chatDensity = compact ? "compact" : "comfortable";
  el.compactChatToggle.checked = compact;
}

function initializeCollapsiblePanels() {
  const collapsedPanels = loadCollapsedPanels();
  document.querySelectorAll(".panel[data-panel-id]").forEach((panel) => {
    const heading = panel.querySelector(".panel-head h2");
    const panelId = panel.dataset.panelId;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-toggle secondary";
    button.innerHTML = '<span aria-hidden="true"></span>';
    button.addEventListener("click", () => {
      setPanelCollapsed(panel, !panel.classList.contains("collapsed"));
      persistCollapsedPanels();
    });
    panel.querySelector(".panel-head").append(button);
    setPanelCollapsed(panel, collapsedPanels.has(panelId), heading?.textContent || "Bereich");
  });
}

function setPanelCollapsed(panel, collapsed, panelName = panel.querySelector(".panel-head h2")?.textContent || "Bereich") {
  panel.classList.toggle("collapsed", collapsed);
  const button = panel.querySelector(".panel-toggle");
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", `${panelName} ${collapsed ? "ausklappen" : "einklappen"}`);
  button.title = `${panelName} ${collapsed ? "ausklappen" : "einklappen"}`;
  if (!collapsed && panel.dataset.panelId === "network") {
    setTimeout(() => state.networkMap?.invalidateSize(), 0);
  }
}

function loadBooleanSetting(key, fallback) {
  const value = localStorage.getItem(key);
  return value == null ? fallback : value === "true";
}

function loadSendQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem("meshcore-dashboard-send-queue") || "[]");
    return Array.isArray(queue) ? queue.slice(0, 50) : [];
  } catch {
    return [];
  }
}

function persistSendQueue() {
  try {
    localStorage.setItem("meshcore-dashboard-send-queue", JSON.stringify(state.sendQueue.slice(0, 50)));
  } catch {}
}

function migrateStorage() {
  try {
    const current = Number(localStorage.getItem("meshcore-dashboard-schema") || 0);
    if (current < 2) {
      const messages = JSON.parse(localStorage.getItem("meshcore-dashboard-messages") || "[]");
      if (Array.isArray(messages)) {
        for (const message of messages) message.id ||= createMessageId();
        localStorage.setItem("meshcore-dashboard-messages", JSON.stringify(messages.slice(0, 200)));
      }
    }
    localStorage.setItem("meshcore-dashboard-schema", String(STORAGE_SCHEMA_VERSION));
  } catch {}
}

function loadCollapsedPanels() {
  try {
    const panelIds = JSON.parse(localStorage.getItem("meshcore-dashboard-collapsed-panels") || "[]");
    return new Set(Array.isArray(panelIds) ? panelIds : []);
  } catch {
    return new Set();
  }
}

function persistCollapsedPanels() {
  const panelIds = [...document.querySelectorAll(".panel[data-panel-id].collapsed")]
    .map((panel) => panel.dataset.panelId);
  try {
    localStorage.setItem("meshcore-dashboard-collapsed-panels", JSON.stringify(panelIds));
  } catch {
    // The collapsed state still applies for this session.
  }
}

function getPingReply(message) {
  if (message.kind !== "channel" || message.channel == null) return null;
  const channelName = message.channelName || state.channels.get(getLocalChannelIndex(message))?.name || "";
  if (normalizeChannelName(channelName) !== PING_TARGET_CHANNEL) return null;

  const text = String(message.text || "");
  const separator = text.indexOf(":");
  if (separator < 1) return null;
  const sender = text.slice(0, separator).trim();
  const body = text.slice(separator + 1).trimStart();
  if (!sender || !body.toLowerCase().startsWith("ping") || !isValidPostalCode(state.autoPongPostalCode)) return null;

  const hops = message.pathLen === 0xff ? 0 : (message.pathLen ?? 0) & 0x3f;
  return { text: `@[${sender}] Pong - ${hops} Hops in ${state.autoPongPostalCode}`, sender, hops };
}

function getDeliveryStatus(message) {
  if (message.deliveryStatus) return message.deliveryStatus;
  if (message.delivery === "Bestätigt") return "confirmed";
  if (message.delivery === "Fehlgeschlagen") return "failed";
  if (message.delivery === "Bestätigung ausstehend" || message.delivery === "An Funk übergeben") return "sent";
  return message.kind === "out" || message.outgoing ? "sent" : "";
}

function deliveryStatusLabel(status) {
  return ({ queued: "Warteschlange", waiting: "Wartet", sent: "Gesendet", confirmed: "Bestätigt", failed: "Fehlgeschlagen" })[status] || "";
}

function formatHopCount(pathLen) {
  const hops = pathLen === 0xff ? 0 : pathLen & 0x3f;
  return `${hops} ${hops === 1 ? "Hop" : "Hops"}`;
}

function formatMessageRouteForDirection(message) {
  if (message.outgoing && message.pathLen === 0xff) return "Flood";
  return formatHopCount(message.pathLen);
}

function messageMentionsSelf(message) {
  const ownName = state.selfName.trim().toLowerCase();
  if (!ownName) return false;
  const text = String(message.text || "").toLowerCase();
  return text.includes(`@[${ownName}]`) || text.includes(`@${ownName}`);
}

function prepareMessageForSend(message) {
  if (message.ackCode) {
    state.pendingAcks.delete(message.ackCode);
    clearTimeout(state.ackTimers.get(message.ackCode));
    state.ackTimers.delete(message.ackCode);
  }
  message.deliveryStatus = "waiting";
  message.delivery = "Wartet";
  message.failureReason = null;
  message.ackCode = null;
  message.roundTrip = null;
  message.timestamp = Math.floor(Date.now() / 1000);
}

function createMessageId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function queueMessage(entry) {
  const index = state.sendQueue.findIndex((item) => item.id === entry.id);
  if (index >= 0) state.sendQueue[index] = entry;
  else state.sendQueue.push(entry);
  persistSendQueue();
}

function dequeueMessage(id) {
  if (!id) return;
  state.sendQueue = state.sendQueue.filter((item) => item.id !== id);
  persistSendQueue();
}

async function flushSendQueue() {
  if (!state.connected || state.flushingQueue || !state.sendQueue.length) return;
  state.flushingQueue = true;
  try {
    for (const queued of [...state.sendQueue]) {
      if (!state.connected) break;
      const message = state.messages.find((item) => item.id === queued.id);
      if (queued.type === "channel") await sendChannelMessage(queued.channelIndex, queued.text, message || null);
      else await sendDirectMessage(queued.key, queued.text, message || null);
    }
  } catch (error) {
    log(`Sendewarteschlange pausiert: ${error.message}`, "error");
  } finally {
    state.flushingQueue = false;
    updateConnectionUi();
  }
}

function updateStoredMessage(message) {
  persistMessages();
  renderMessages();
}

function markMessageFailed(message, reason) {
  message.deliveryStatus = "failed";
  message.delivery = "Fehlgeschlagen";
  message.failureReason = reason || "Keine Bestätigung erhalten.";
  updateStoredMessage(message);
}

function scheduleAckTimeout(ackCode, message) {
  const timeout = Math.max(5000, Number(message.estimatedTimeout) || 30000) + PING_ACK_TIMEOUT_BUFFER_MS;
  clearTimeout(state.ackTimers.get(ackCode));
  state.ackTimers.set(ackCode, setTimeout(() => {
    if (state.pendingAcks.get(ackCode) !== message) return;
    state.pendingAcks.delete(ackCode);
    state.ackTimers.delete(ackCode);
    markMessageFailed(message, "Keine Bestätigung empfangen.");
  }, timeout));
}

function failPendingMessages(reason) {
  for (const [ackCode, message] of state.pendingAcks) {
    clearTimeout(state.ackTimers.get(ackCode));
    message.deliveryStatus = "failed";
    message.delivery = "Fehlgeschlagen";
    message.failureReason = reason;
  }
  state.pendingAcks.clear();
  state.ackTimers.clear();
  persistMessages();
  renderMessages();
}

async function retryMessage(message) {
  if (message.kind === "out") {
    await sendChannelMessage(getLocalChannelIndex(message), message.text, message);
    return;
  }
  if (message.kind === "contact" && message.outgoing) {
    const contact = [...state.contacts.values()].find((item) => item.prefix === message.prefix);
    if (!contact) throw new Error("Kontakt ist nicht mehr verfügbar.");
    await sendDirectMessage(contact.key, message.text, message);
  }
}

function getQuickChannelReply(message) {
  if (message.kind !== "channel" || message.channel == null || message.outgoing === true) return null;
  const rule = getQuickReplyRule(getLocalChannelIndex(message));
  if (!rule?.enabled) return null;

  const text = String(message.text || "");
  const separator = text.indexOf(":");
  if (separator < 1) return null;
  const sender = text.slice(0, separator).trim();
  if (!sender) return null;

  const hops = message.pathLen === 0xff ? 0 : (message.pathLen ?? 0) & 0x3f;
  const values = {
    name: sender,
    hops: String(hops),
    plz: state.autoPongPostalCode,
    snr: message.snr == null ? "-" : `${message.snr.toFixed(1)} dB`,
    rssi: message.rssi == null ? "-" : `${message.rssi} dBm`,
  };
  const replyText = String(rule.template || DEFAULT_QUICK_REPLY_TEMPLATE)
    .replace(/\{(name|hops|plz|snr|rssi)\}/g, (_, key) => values[key]);
  return { text: replyText, sender, hops, rule, body: text.slice(separator + 1).trim() };
}

function getQuickReplyRule(channelIndex) {
  const channelName = state.channels.get(channelIndex)?.name || (channelIndex === 0 ? "Public" : "");
  const key = normalizeChannelName(channelName);
  return state.quickReplyRules[key] || (QUICK_REPLY_DEFAULT_CHANNELS.has(key)
    ? { enabled: true, template: DEFAULT_QUICK_REPLY_TEMPLATE, keywords: "", auto: false }
    : null);
}

function normalizeChannelName(channelName) {
  return String(channelName || "").replace(/^#/, "").trim().toLowerCase();
}

function loadQuickReplyRules() {
  try {
    const saved = JSON.parse(localStorage.getItem("meshcore-dashboard-quick-reply-rules") || "null");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) return saved;
  } catch {}
  return Object.fromEntries([...QUICK_REPLY_DEFAULT_CHANNELS].map((channel) => [channel, {
    enabled: true,
    template: DEFAULT_QUICK_REPLY_TEMPLATE,
    keywords: "",
    auto: false,
  }]));
}

function renderQuickReplyRules() {
  const known = [...state.channels.values()]
    .filter((channel) => channel.enabled || channel.name)
    .map((channel) => normalizeChannelName(channel.name || (channel.index === 0 ? "Public" : `Kanal ${channel.index}`)));
  const names = [...new Set([...Object.keys(state.quickReplyRules), ...known])].filter(Boolean).sort();
  el.quickReplyRules.innerHTML = names.map((name) => {
    const rule = state.quickReplyRules[name] || {
      enabled: QUICK_REPLY_DEFAULT_CHANNELS.has(name),
      template: DEFAULT_QUICK_REPLY_TEMPLATE,
      keywords: "",
      auto: false,
    };
    return `<div class="quick-reply-rule" data-rule-channel="${escapeHtml(name)}">
      <div class="quick-reply-rule-head">
        <label class="switch-control">
          <input type="checkbox" data-rule-field="enabled"${rule.enabled ? " checked" : ""}>
          <span class="switch-track" aria-hidden="true"></span>
          <strong>#${escapeHtml(name)}</strong>
        </label>
        <label class="switch-control" title="Nur bei passenden Schlüsselwörtern automatisch antworten">
          <input type="checkbox" data-rule-field="auto"${rule.auto ? " checked" : ""}>
          <span class="switch-track" aria-hidden="true"></span>
          <span>Auto</span>
        </label>
      </div>
      <label class="field-label">Vorlage
        <input type="text" data-rule-field="template" maxlength="150" value="${escapeHtml(rule.template || DEFAULT_QUICK_REPLY_TEMPLATE)}">
      </label>
      <label class="field-label">Schlüsselwörter
        <input type="text" data-rule-field="keywords" maxlength="120" placeholder="ping, standort, signal" value="${escapeHtml(rule.keywords || "")}">
      </label>
    </div>`;
  }).join("");
}

function readQuickReplyRules() {
  const rules = { ...state.quickReplyRules };
  el.quickReplyRules.querySelectorAll("[data-rule-channel]").forEach((row) => {
    const field = (name) => row.querySelector(`[data-rule-field="${name}"]`);
    rules[row.dataset.ruleChannel] = {
      enabled: field("enabled").checked,
      auto: field("auto").checked,
      template: field("template").value.trim() || DEFAULT_QUICK_REPLY_TEMPLATE,
      keywords: field("keywords").value.trim(),
    };
  });
  return rules;
}

function queueAutoQuickReply(message) {
  const reply = getQuickChannelReply(message);
  if (!reply?.rule.auto || !state.connected || !isValidPostalCode(state.autoPongPostalCode)) return;
  const keywords = String(reply.rule.keywords || "").split(",").map((word) => word.trim().toLowerCase()).filter(Boolean);
  if (!keywords.length || !keywords.some((word) => reply.body.toLowerCase().includes(word))) return;
  setTimeout(() => maybeSendAutoQuickReply(message), 1000);
}

async function maybeSendAutoQuickReply(message) {
  const reply = getQuickChannelReply(message);
  if (!reply?.rule.auto || !state.connected || !isValidPostalCode(state.autoPongPostalCode)) return;
  const fingerprint = `${message.channel}\u001f${message.timestamp}\u001f${message.text}`;
  if (state.quickReplyHandled.has(fingerprint)) return;
  state.quickReplyHandled.add(fingerprint);
  persistHandledQuickReplies();
  const senderKey = `${message.channel}:${reply.sender.toLowerCase()}`;
  const now = Date.now();
  if (now - (state.quickReplyCooldowns.get(senderKey) || 0) < AUTO_PONG_COOLDOWN_MS) return;
  state.quickReplyCooldowns.set(senderKey, now);
  try {
    await sendChannelMessage(getLocalChannelIndex(message), reply.text);
    log(`Auto-Schnellantwort an ${reply.sender} gesendet.`);
  } catch (error) {
    log(`Auto-Schnellantwort an ${reply.sender} fehlgeschlagen: ${error.message}`, "error");
  }
}

function loadHandledQuickReplies() {
  try {
    const values = JSON.parse(localStorage.getItem("meshcore-dashboard-quick-reply-handled") || "[]");
    return new Set(Array.isArray(values) ? values : []);
  } catch {
    return new Set();
  }
}

function persistHandledQuickReplies() {
  while (state.quickReplyHandled.size > 200) state.quickReplyHandled.delete(state.quickReplyHandled.values().next().value);
  try {
    localStorage.setItem("meshcore-dashboard-quick-reply-handled", JSON.stringify([...state.quickReplyHandled]));
  } catch {}
}

function getWeatherRequest(message) {
  if (message.kind !== "channel" || message.channel == null || message.outgoing === true) return null;
  const localChannelIndex = getLocalChannelIndex(message);
  const channelName = message.channelName || state.channels.get(localChannelIndex)?.name || (localChannelIndex === 0 ? "Public" : "");
  if (normalizeChannelName(channelName) !== WEATHER_TARGET_CHANNEL) return null;

  const text = String(message.text || "");
  const separator = text.indexOf(":");
  if (separator < 1) return null;
  const sender = text.slice(0, separator).trim();
  const body = text.slice(separator + 1).trim();
  if (!sender || body.startsWith("@[")) return null;

  if (new RegExp(`^${WEATHER_COMMAND}\\s+hilfe$`, "i").test(body)) {
    return { sender, mode: "help", place: "" };
  }

  const infoMatch = body.match(/^(zeit|sonne)\s+(.{2,80})$/i);
  if (infoMatch) {
    return { sender, mode: infoMatch[1].toLowerCase(), place: infoMatch[2].trim().replace(/\s+/g, " ") };
  }

  const rainMatch = body.match(/^regen\s+(.{2,80})$/i);
  if (rainMatch) {
    return { sender, mode: "rain", place: rainMatch[1].trim().replace(/\s+/g, " ") };
  }

  const match = body.match(new RegExp(`^${WEATHER_COMMAND}\\s+(.{2,80})$`, "i"));
  if (!match) return null;
  let place = match[1].trim().replace(/\s+/g, " ");
  let mode = "current";
  const modeMatch = place.match(/\s+(heute|morgen|3)$/i);
  if (modeMatch) {
    mode = modeMatch[1].toLowerCase() === "3" ? "three-days" : modeMatch[1].toLowerCase();
    place = place.slice(0, modeMatch.index).trim();
  }
  if (place.length < 2) return null;
  return { sender, place, mode };
}

function queueWeatherReply(message) {
  if (!state.weatherEnabled || !state.connected || !getWeatherRequest(message)) return;
  setTimeout(() => maybeSendWeatherReply(message), WEATHER_REPLY_DELAY_MS);
}

async function maybeSendWeatherReply(message) {
  if (!state.weatherEnabled || !state.connected) return;
  const request = getWeatherRequest(message);
  if (!request) return;

  const fingerprint = `${message.channel}\u001f${message.timestamp}\u001f${message.text}`;
  if (state.weatherHandled.has(fingerprint)) return;
  rememberHandledWeatherRequest(fingerprint);

  const senderKey = `${message.channel}:${request.sender.toLowerCase()}`;
  const now = Date.now();
  if (now - (state.weatherCooldowns.get(senderKey) || 0) < WEATHER_COOLDOWN_MS) {
    log(`Wetteransage an ${request.sender} wegen Cooldown übersprungen.`);
    return;
  }
  state.weatherCooldowns.set(senderKey, now);

  try {
    if (request.mode === "help") {
      await sendChannelMessage(getLocalChannelIndex(message), formatWeatherHelp(request.sender));
      log(`Wetterhilfe an ${request.sender} gesendet.`);
      return;
    }
    const weather = await fetchWeatherSummary(request.place);
    await sendChannelMessage(getLocalChannelIndex(message), formatWeatherReply(request.sender, weather, request.mode));
    log(`Wetteransage fuer ${request.place} an ${request.sender} gesendet.`);
  } catch (error) {
    log(`Wetteransage fuer ${request.place} fehlgeschlagen: ${error.message}`, "error");
    try {
      await sendChannelMessage(getLocalChannelIndex(message), trimMessage(`Wetter fuer ${request.place} gerade nicht verfuegbar.`));
    } catch (sendError) {
      log(`Wetter-Fehlerantwort konnte nicht gesendet werden: ${sendError.message}`, "error");
    }
  }
}

async function fetchWeatherSummary(place) {
  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geoUrl.searchParams.set("name", place);
  geoUrl.searchParams.set("count", "1");
  geoUrl.searchParams.set("language", "de");
  geoUrl.searchParams.set("format", "json");

  const geo = await fetchJsonWithTimeout(geoUrl);
  const location = Array.isArray(geo.results) ? geo.results[0] : null;
  if (!location) throw new Error("Ort nicht gefunden.");

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(location.latitude));
  forecastUrl.searchParams.set("longitude", String(location.longitude));
  forecastUrl.searchParams.set("current", "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m");
  forecastUrl.searchParams.set("hourly", "precipitation_probability,precipitation");
  forecastUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset");
  forecastUrl.searchParams.set("timezone", "auto");
  forecastUrl.searchParams.set("forecast_days", "3");

  const forecast = await fetchJsonWithTimeout(forecastUrl);
  if (!forecast.current) throw new Error("Keine Wetterdaten erhalten.");

  return {
    place: location.name || place,
    admin: location.admin1 || location.country || "",
    temperature: forecast.current.temperature_2m,
    apparent: forecast.current.apparent_temperature,
    precipitation: forecast.current.precipitation,
    weatherCode: forecast.current.weather_code,
    wind: forecast.current.wind_speed_10m,
    currentTime: forecast.current.time,
    hourly: forecast.hourly,
    daily: forecast.daily,
    timezone: forecast.timezone,
  };
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function formatWeatherReply(sender, weather, mode) {
  if (mode === "heute") return formatDailyWeatherReply(sender, weather, 0, "Heute");
  if (mode === "morgen") return formatDailyWeatherReply(sender, weather, 1, "Morgen");
  if (mode === "three-days") return formatThreeDayWeatherReply(sender, weather);
  if (mode === "rain") return formatRainReply(sender, weather);
  if (mode === "zeit") return formatLocalTimeReply(sender, weather);
  if (mode === "sonne") return formatSunReply(sender, weather);

  const place = [weather.place, weather.admin].filter(Boolean).join(", ");
  const parts = [
    `${formatNumber(weather.temperature, 0)}C`,
    weatherCodeLabel(weather.weatherCode),
    `gef. ${formatNumber(weather.apparent, 0)}C`,
    `Wind ${formatNumber(weather.wind, 0)} km/h`,
    `Regen ${formatNumber(weather.precipitation, 1)} mm`,
  ].filter(Boolean);
  return trimMessage(`Wetter ${place}: ${parts.join(", ")}`);
}

function formatDailyWeatherReply(sender, weather, dayIndex, label) {
  const daily = weather.daily || {};
  if (daily.time?.[dayIndex] == null) throw new Error("Keine Tagesprognose erhalten.");
  const place = [weather.place, weather.admin].filter(Boolean).join(", ");
  return trimMessage(`${label} ${place}: ${weatherCodeLabel(daily.weather_code?.[dayIndex])}, ${formatNumber(daily.temperature_2m_min?.[dayIndex], 0)}-${formatNumber(daily.temperature_2m_max?.[dayIndex], 0)}C, Regen ${formatNumber(daily.precipitation_probability_max?.[dayIndex], 0)}% / ${formatNumber(daily.precipitation_sum?.[dayIndex], 1)} mm`);
}

function formatThreeDayWeatherReply(sender, weather) {
  const daily = weather.daily || {};
  if (!Array.isArray(daily.time) || daily.time.length < 3) throw new Error("Keine 3-Tage-Prognose erhalten.");
  const days = daily.time.slice(0, 3).map((date, index) => {
    const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
    return `${weekday} ${formatNumber(daily.temperature_2m_min?.[index], 0)}/${formatNumber(daily.temperature_2m_max?.[index], 0)}C ${weatherCodeLabel(daily.weather_code?.[index])} ${formatNumber(daily.precipitation_probability_max?.[index], 0)}%`;
  });
  return trimMessage(`${weather.place} 3 Tage: ${days.join(" | ")}`);
}

function formatRainReply(sender, weather) {
  const hourly = weather.hourly || {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const startIndex = Math.max(0, times.findIndex((time) => time >= weather.currentTime));
  const probabilities = (hourly.precipitation_probability || []).slice(startIndex, startIndex + 6).map(Number).filter(Number.isFinite);
  const precipitation = (hourly.precipitation || []).slice(startIndex, startIndex + 6).map(Number).filter(Number.isFinite);
  if (!probabilities.length && !precipitation.length) throw new Error("Keine Regenprognose erhalten.");
  const maxProbability = probabilities.length ? Math.max(...probabilities) : 0;
  const total = precipitation.reduce((sum, value) => sum + value, 0);
  return trimMessage(`Regen ${weather.place}, naechste 6h: max. ${formatNumber(maxProbability, 0)}%, gesamt ${formatNumber(total, 1)} mm`);
}

function formatWeatherHelp(sender) {
  return trimMessage("wetter <Ort> [heute|morgen|3] | regen <Ort> | zeit <Ort> | sonne <Ort>");
}

function formatLocalTimeReply(sender, weather) {
  const time = new Intl.DateTimeFormat("de-DE", { timeZone: weather.timezone, weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date());
  return trimMessage(`Zeit ${weather.place}: ${time} (${weather.timezone})`);
}

function formatSunReply(sender, weather) {
  const sunrise = weather.daily?.sunrise?.[0]?.slice(11, 16);
  const sunset = weather.daily?.sunset?.[0]?.slice(11, 16);
  if (!sunrise || !sunset) throw new Error("Keine Sonnendaten erhalten.");
  return trimMessage(`Sonne ${weather.place}: Aufgang ${sunrise}, Untergang ${sunset}`);
}

function weatherCodeLabel(code) {
  if (code == null) return "";
  if (code === 0) return "klar";
  if ([1, 2, 3].includes(code)) return "bewoelkt";
  if ([45, 48].includes(code)) return "Nebel";
  if ([51, 53, 55, 56, 57].includes(code)) return "Niesel";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Regen";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Schnee";
  if ([95, 96, 99].includes(code)) return "Gewitter";
  return `Code ${code}`;
}

function formatNumber(value, digits) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function trimMessage(text) {
  return text.length <= 150 ? text : `${text.slice(0, 147).trimEnd()}...`;
}

function loadWeatherSetting() {
  try {
    return localStorage.getItem("meshcore-dashboard-weather-replies") === "true";
  } catch {
    return false;
  }
}

function loadHandledWeatherRequests() {
  try {
    const values = JSON.parse(localStorage.getItem("meshcore-dashboard-weather-handled") || "[]");
    return new Set(Array.isArray(values) ? values.slice(-200) : []);
  } catch {
    return new Set();
  }
}

function rememberHandledWeatherRequest(fingerprint) {
  state.weatherHandled.add(fingerprint);
  while (state.weatherHandled.size > 200) {
    state.weatherHandled.delete(state.weatherHandled.values().next().value);
  }
  try {
    localStorage.setItem("meshcore-dashboard-weather-handled", JSON.stringify([...state.weatherHandled]));
  } catch {
    // In-memory deduplication still prevents repeated replies for this session.
  }
}

function getChannelReply(message) {
  if (message.kind !== "channel" || message.channel == null) return null;
  const text = String(message.text || "");
  const separator = text.indexOf(":");
  if (separator < 1) return null;
  const sender = text.slice(0, separator).trim();
  const body = text.slice(separator + 1).trimStart();
  if (!sender || body.startsWith("@[")) return null;
  return { sender };
}

function queueAutoPong(message) {
  if (!state.autoPongEnabled || !getPingReply(message)) return;
  state.autoPongQueue.push(message);
  clearTimeout(state.autoPongTimer);
  state.autoPongTimer = setTimeout(flushAutoPongQueue, 1000);
}

async function flushAutoPongQueue() {
  state.autoPongTimer = null;
  const queued = state.autoPongQueue.splice(0);
  for (const message of queued) {
    await maybeSendAutoPong(message);
  }
}

async function maybeSendAutoPong(message) {
  if (!state.autoPongEnabled || !state.connected) return;
  const reply = getPingReply(message);
  if (!reply) return;

  const fingerprint = `${message.channel}\u001f${message.timestamp}\u001f${message.text}`;
  if (state.autoPongHandled.has(fingerprint)) return;
  rememberHandledPing(fingerprint);

  const senderKey = reply.sender.toLowerCase();
  const now = Date.now();
  const lastReply = state.autoPongCooldowns.get(senderKey) || 0;
  if (now - lastReply < AUTO_PONG_COOLDOWN_MS) {
    log(`Auto-Pong an ${reply.sender} wegen Cooldown übersprungen.`);
    return;
  }
  state.autoPongCooldowns.set(senderKey, now);

  try {
    await sendChannelMessage(getLocalChannelIndex(message), reply.text);
    log(`Auto-Pong an ${reply.sender} gesendet.`);
  } catch (error) {
    log(`Auto-Pong an ${reply.sender} fehlgeschlagen: ${error.message}`, "error");
  }
}

function loadAutoPongSetting() {
  try {
    return localStorage.getItem("meshcore-dashboard-auto-pong") === "true";
  } catch {
    return false;
  }
}

function loadAutoPongPostalCode() {
  try {
    const postalCode = localStorage.getItem("meshcore-dashboard-auto-pong-postal-code") || "";
    return isValidPostalCode(postalCode) ? postalCode : "";
  } catch {
    return "";
  }
}

function loadPostalLocation() {
  try {
    const location = JSON.parse(localStorage.getItem("meshcore-dashboard-postal-location") || "null");
    return location && isValidPostalCode(location.postalCode) && Number.isFinite(location.lat) && Number.isFinite(location.lon)
      ? location
      : null;
  } catch {
    return null;
  }
}

async function resolvePostalLocation() {
  const postalCode = state.autoPongPostalCode;
  if (!isValidPostalCode(postalCode) || hasValidPosition({ lat: state.selfLat, lon: state.selfLon })) return;
  if (state.postalLocation?.postalCode === postalCode || state.postalLocationRequest) {
    renderNetworkOverview();
    return;
  }

  state.postalLocationRequest = (async () => {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", postalCode);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "de");
    url.searchParams.set("format", "json");
    url.searchParams.set("countryCode", "DE");
    const result = await fetchJsonWithTimeout(url);
    const match = Array.isArray(result.results) ? result.results[0] : null;
    if (!match || !Number.isFinite(match.latitude) || !Number.isFinite(match.longitude)) throw new Error("PLZ nicht gefunden");
    state.postalLocation = {
      postalCode,
      name: [match.name, match.admin1].filter(Boolean).join(", "),
      lat: Math.round(match.latitude * 1e6),
      lon: Math.round(match.longitude * 1e6),
    };
    try {
      localStorage.setItem("meshcore-dashboard-postal-location", JSON.stringify(state.postalLocation));
    } catch {}
    renderNetworkOverview();
  })().catch((error) => log(`PLZ ${postalCode} konnte nicht aufgeloest werden: ${error.message}`, "error")).finally(() => {
    state.postalLocationRequest = null;
  });
  await state.postalLocationRequest;
}

function isValidPostalCode(postalCode) {
  return /^\d{5}$/.test(postalCode);
}

function openAutoPongSettings() {
  el.autoPongPostalCodeInput.value = state.autoPongPostalCode;
  el.autoPongPostalCodeInput.setCustomValidity("");
  renderQuickReplyRules();
  el.autoPongSettingsDialog.showModal();
  el.autoPongPostalCodeInput.focus();
}

function loadHandledPings() {
  try {
    const values = JSON.parse(localStorage.getItem("meshcore-dashboard-auto-pong-handled") || "[]");
    return new Set(Array.isArray(values) ? values.slice(-200) : []);
  } catch {
    return new Set();
  }
}

function rememberHandledPing(fingerprint) {
  state.autoPongHandled.add(fingerprint);
  while (state.autoPongHandled.size > 200) {
    state.autoPongHandled.delete(state.autoPongHandled.values().next().value);
  }
  try {
    localStorage.setItem("meshcore-dashboard-auto-pong-handled", JSON.stringify([...state.autoPongHandled]));
  } catch {
    // In-memory deduplication still prevents repeated replies for this session.
  }
}

function updateMessageInputPlaceholder() {
  if (state.activeChannel === "dm" && state.dmTarget) {
    const contact = state.contacts.get(state.dmTarget);
    el.messageInput.placeholder = contact ? `Nachricht an ${contact.name}` : "Nachricht an Direktkontakt";
    return;
  }
  if (state.activeChannel !== "all") {
    const channel = state.channels.get(Number(state.activeChannel));
    el.messageInput.placeholder = channel ? `Nachricht an ${channel.name || `Kanal ${state.activeChannel}`}` : "Nachricht an Kanal";
    return;
  }
  el.messageInput.placeholder = "Nachricht an Kanal";
}

function updateMessageCharCount() {
  const maximum = el.messageInput.maxLength;
  const current = el.messageInput.value.length;
  el.messageCharCount.textContent = `${current} / ${maximum}`;
  el.messageCharCount.classList.toggle("limit-reached", current >= maximum);
}

function insertEmoji(emoji) {
  const start = el.messageInput.selectionStart ?? el.messageInput.value.length;
  const end = el.messageInput.selectionEnd ?? start;
  const nextValue = el.messageInput.value.slice(0, start) + emoji + el.messageInput.value.slice(end);
  if (nextValue.length > el.messageInput.maxLength) {
    showActionNotice("Die maximale Nachrichtenlänge ist erreicht.", "warn");
    return;
  }
  el.messageInput.value = nextValue;
  updateMessageCharCount();
  const cursor = start + emoji.length;
  el.messageInput.focus();
  el.messageInput.setSelectionRange(cursor, cursor);
}

function closeEmojiPicker() {
  el.emojiPickerMenu.hidden = true;
  el.emojiPickerBtn.setAttribute("aria-expanded", "false");
}

function updateConnectionUi() {
  const transportLabel = state.transport === "bluetooth" ? "Bluetooth" : state.transport === "usb" ? "USB" : null;
  const idleSeconds = state.connected && state.lastPacketAt ? Math.floor((Date.now() - state.lastPacketAt) / 1000) : 0;
  const queueLabel = state.sendQueue.length ? `, ${state.sendQueue.length} wartend` : "";
  const connectedLabel = idleSeconds > 90 ? "\u{1F608} Keine Daten" : "\u{1F528} Verbunden";
  el.connectionState.textContent = state.connected
    ? `${connectedLabel} (${transportLabel}${queueLabel})`
    : `\u{1F436} Nicht verbunden${queueLabel}`;
  el.connectBtn.disabled = state.connected || !("serial" in navigator);
  el.bleConnectBtn.disabled = state.connected || !("bluetooth" in navigator);
  el.syncBtn.disabled = !state.connected;
  el.advertBtn.disabled = !state.connected;
  el.disconnectBtn.disabled = !state.connected;
  el.channelNameInput.disabled = !state.connected;
  el.channelTypeSelect.disabled = !state.connected;
  el.createChannelBtn.disabled = !state.connected;
  el.importContactCardBtn.disabled = !state.connected;
  el.importChannelInviteBtn.disabled = !state.connected;
  el.exportChannelsBtn.disabled = !state.channels.size;
  el.importChannelsBtn.disabled = !state.connected;
  updateChannelSecretField();
  updateMessageInputPlaceholder();
  renderChannels();
  renderMessages();
}

let actionNoticeTimer = null;

function showActionNotice(message, variant = "info") {
  if (!el.actionNotice) return;
  const noticeIcon = variant === "error" ? "\u{1F608}" : variant === "success" ? "\u{1F528}" : "\u{1F4BB}";
  el.actionNotice.hidden = false;
  el.actionNotice.textContent = `${noticeIcon} ${message}`;
  el.actionNotice.dataset.variant = variant;
  el.actionNotice.classList.remove("visible");
  void el.actionNotice.offsetWidth;
  el.actionNotice.classList.add("visible");
  clearTimeout(actionNoticeTimer);
  actionNoticeTimer = setTimeout(() => {
    el.actionNotice.classList.remove("visible");
    el.actionNotice.hidden = true;
  }, 1800);
}

function log(message, level = "info") {
  const prefix = level === "error" ? "\u{1F608}" : level === "warn" ? "\u{26CF}\uFE0F" : "\u{1F4BB}";
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

function normalizeFutureTimestamp(epoch) {
  if (epoch == null) return null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return epoch > nowSeconds ? nowSeconds : epoch;
}

function formatTime(epoch) {
  if (!epoch) return "-";
  return new Date(epoch * 1000).toLocaleString();
}

function formatExactTime(epoch) {
  return epoch ? new Date(epoch * 1000).toLocaleString("de-DE") : "Kein Zeitstempel";
}

function formatRelativeTime(epoch) {
  if (!epoch) return "-";
  const seconds = Math.round(epoch - Date.now() / 1000);
  const formatter = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return formatter.format(days, "day");
  return formatTime(epoch);
}

function renderTime(epoch) {
  return `<time datetime="${epoch ? new Date(epoch * 1000).toISOString() : ""}" title="${escapeHtml(formatExactTime(epoch))}">${escapeHtml(formatRelativeTime(epoch))}</time>`;
}

function loadFavoriteContacts() {
  try {
    const values = JSON.parse(localStorage.getItem("meshcore-dashboard-favorite-contacts") || "[]");
    return new Set(Array.isArray(values) ? values : []);
  } catch {
    return new Set();
  }
}

function loadContactArchive() {
  try {
    const values = JSON.parse(localStorage.getItem(CONTACT_ARCHIVE_STORAGE_KEY) || "[]");
    return Array.isArray(values) ? values.filter((contact) => contact?.key && hasValidPosition(contact)) : [];
  } catch {
    return [];
  }
}

function saveContactArchive() {
  const contacts = [...state.contacts.values()].filter(hasValidPosition);
  state.contactArchive = contacts;
  try {
    localStorage.setItem(CONTACT_ARCHIVE_STORAGE_KEY, JSON.stringify(contacts));
  } catch (error) {
    log(`Node-Archiv konnte nicht gespeichert werden: ${error.message}`, "warn");
  }
}

function restoreContactArchive() {
  for (const contact of state.contactArchive) {
    state.contacts.set(contact.key, contact);
    state.contactOrder.set(contact.key, ++state.contactSequence);
  }
  renderContacts();
  renderNodeArchive();
}

function renderNodeArchive() {
  const contacts = state.contactArchive.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
  el.nodeArchiveCount.textContent = `${contacts.length} Nodes gesichert`;
  if (!contacts.length) {
    el.nodeArchive.className = "node-archive empty";
    el.nodeArchive.textContent = "Noch keine Nodes im Archiv.";
    return;
  }
  el.nodeArchive.className = "node-archive";
  el.nodeArchive.innerHTML = contacts.map((contact) => {
    const position = `${(contact.lat / 1e6).toFixed(5)}, ${(contact.lon / 1e6).toFixed(5)}`;
    return `<div class="node-archive-row"><strong>${escapeHtml(contact.name)}</strong><span>${escapeHtml(TYPE_NAMES[contact.type] || `Typ ${contact.type}`)}</span><span>${escapeHtml(position)}</span><span class="mono">${escapeHtml(contact.key.slice(0, 12))}</span></div>`;
  }).join("");
}

function exportNodeArchive() {
  saveContactArchive();
  const backup = {
    format: "meshcore-dashboard-node-archive",
    version: 1,
    exportedAt: new Date().toISOString(),
    nodes: state.contactArchive,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `meshcore-dashboard-node-archiv-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showActionNotice(`${state.contactArchive.length} Nodes exportiert.`);
}

function exportNodeGeoJson() {
  saveContactArchive();
  const geoJson = {
    type: "FeatureCollection",
    features: state.contactArchive.map((contact) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [contact.lon / 1e6, contact.lat / 1e6] },
      properties: {
        key: contact.key,
        name: contact.name,
        type: TYPE_NAMES[contact.type] || `Typ ${contact.type}`,
        nodeType: contact.type,
        hops: contact.outPathLenRaw == null ? null : contact.outPathLenRaw & 0x3f,
        lastAdvert: contact.lastAdvert || null,
      },
    })),
  };
  downloadTextFile(`meshcore-dashboard-nodes-${new Date().toISOString().slice(0, 10)}.geojson`, JSON.stringify(geoJson, null, 2), "application/geo+json");
  showActionNotice(`${state.contactArchive.length} Nodes als GeoJSON exportiert.`);
}

function exportNodeCsv() {
  saveContactArchive();
  const columns = ["key", "name", "type", "nodeType", "latitude", "longitude", "hops", "lastAdvert"];
  const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = state.contactArchive.map((contact) => [
    contact.key,
    contact.name,
    TYPE_NAMES[contact.type] || `Typ ${contact.type}`,
    contact.type,
    (contact.lat / 1e6).toFixed(6),
    (contact.lon / 1e6).toFixed(6),
    contact.outPathLenRaw == null ? "" : contact.outPathLenRaw & 0x3f,
    contact.lastAdvert || "",
  ]);
  const csv = [columns, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  downloadTextFile(`meshcore-dashboard-nodes-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
  showActionNotice(`${state.contactArchive.length} Nodes als CSV exportiert.`);
}

function downloadTextFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function importNodeArchive(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (parsed?.format !== "meshcore-dashboard-node-archive" || !Array.isArray(parsed.nodes)) throw new Error("Unbekanntes Node-Archiv");
    const importedNodes = parsed.nodes.filter((contact) => contact?.key && hasValidPosition(contact));
    state.contacts = new Map([...state.contacts, ...importedNodes.map((contact) => [contact.key, contact])]);
    saveContactArchive();
    renderContacts();
    renderNetworkOverview();
    showActionNotice(`${importedNodes.length} Nodes mit GPS importiert.`);
  } catch (error) {
    showActionNotice(`Node-Import fehlgeschlagen: ${error.message}`, "error");
  }
}

function toggleFavoriteContact(key) {
  if (state.favoriteContacts.has(key)) state.favoriteContacts.delete(key);
  else state.favoriteContacts.add(key);
  try {
    localStorage.setItem("meshcore-dashboard-favorite-contacts", JSON.stringify([...state.favoriteContacts]));
  } catch {}
  renderContacts();
}

function hasValidPosition(item) {
  if (!item || (!item.lat && !item.lon)) return false;
  const lat = item.lat / 1e6;
  const lon = item.lon / 1e6;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function getReferenceLocation() {
  if (hasValidPosition({ lat: state.selfLat, lon: state.selfLon })) {
    return { name: state.selfName || "Eigener Node", lat: state.selfLat, lon: state.selfLon, self: true, approximate: false };
  }
  if (state.postalLocation?.postalCode === state.autoPongPostalCode && hasValidPosition(state.postalLocation)) {
    return {
      name: `PLZ ${state.postalLocation.postalCode}${state.postalLocation.name ? ` (${state.postalLocation.name})` : ""}`,
      lat: state.postalLocation.lat,
      lon: state.postalLocation.lon,
      self: true,
      approximate: true,
    };
  }
  return null;
}

function renderNetworkOverview() {
  renderNetworkMap();
  renderNetworkGraph();
  renderRouteOverview();
  renderRangeStats();
  renderPacketDiagnostics();
}

function renderNetworkMap() {
  const contacts = [...state.contacts.values()].filter((contact) => hasValidPosition(contact) && isContactTypeVisible(contact));
  const self = getReferenceLocation();
  const nodes = self ? [self, ...contacts] : contacts;
  el.mappedContactCount.textContent = `${contacts.length} Position${contacts.length === 1 ? "" : "en"}`;
  if (!nodes.length) {
    el.fitNetworkMapBtn.disabled = true;
    if (!state.networkMap) {
      el.networkMap.className = "network-map empty";
      el.networkMap.textContent = "Noch keine Kontakte mit Position.";
    } else if (state.networkMarkerLayer) {
      state.networkMarkerLayer.clearLayers();
    }
    return;
  }
  if (!window.L) {
    el.networkMap.className = "network-map empty";
    el.networkMap.textContent = "Kartenbibliothek konnte nicht geladen werden.";
    return;
  }

  el.networkMap.className = "network-map";
  if (!state.networkMap) {
    el.networkMap.textContent = "";
    state.networkMap = L.map(el.networkMap, { zoomControl: true, scrollWheelZoom: true }).setView([51.0504, 13.7373], 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(state.networkMap);
    state.networkMarkerLayer = typeof L.markerClusterGroup === "function"
      ? L.markerClusterGroup({ showCoverageOnHover: false, spiderfyOnMaxZoom: true, maxClusterRadius: 42 })
      : L.layerGroup();
    state.networkMarkerLayer.addTo(state.networkMap);
    state.networkLineLayer = L.layerGroup().addTo(state.networkMap);
    state.networkHeatLayer = L.layerGroup().addTo(state.networkMap);
  }

  state.networkMarkerLayer.clearLayers();
  state.networkLineLayer.clearLayers();
  state.networkHeatLayer.clearLayers();
  const bounds = [];
  for (const node of nodes) {
    const lat = node.lat / 1e6;
    const lon = node.lon / 1e6;
    const typeClass = getMapMarkerClass(node);
    const marker = L.marker([lat, lon], {
      title: node.name,
      icon: L.divIcon({ className: `mesh-map-marker ${typeClass}`, iconSize: [18, 18], iconAnchor: [9, 9] }),
    });
    const signal = node.lastSnr == null ? "Kein Signalwert" : `SNR ${node.lastSnr.toFixed(1)} dB`;
    const route = node.self ? (node.approximate ? "Aus PLZ angenaehert" : "Eigener Node") : formatContactRoute(node.outPathLen);
    marker.bindPopup(`<strong>${escapeHtml(node.name)}</strong><span>${escapeHtml(TYPE_NAMES[node.type] || route)}</span><span>${escapeHtml(route)} | ${escapeHtml(signal)}</span><span>${lat.toFixed(5)}, ${lon.toFixed(5)}</span>`);
    marker.bindTooltip(node.name, { direction: "top", offset: [0, -10] });
    state.networkMarkerLayer.addLayer(marker);
    if (!node.self && self && state.mapOptions.lines) {
      L.polyline([[self.lat / 1e6, self.lon / 1e6], [lat, lon]], { color: "#57d7a0", weight: 1.5, opacity: 0.45 }).addTo(state.networkLineLayer);
    }
    if (!node.self && state.mapOptions.heat) {
      const activity = Math.max(1, getContactMessageCount(node));
      L.circle([lat, lon], { radius: Math.min(60000, 5000 + activity * 2500), stroke: false, fillColor: "#ff6b6b", fillOpacity: Math.min(0.38, 0.1 + activity / 50) }).addTo(state.networkHeatLayer);
    }
    bounds.push([lat, lon]);
  }

  state.networkMapBounds = L.latLngBounds(bounds);
  el.fitNetworkMapBtn.disabled = false;
  const signature = nodes.map((node) => `${node.key || "self"}:${node.lat}:${node.lon}`).sort().join("|");
  if (signature !== state.networkMapSignature) {
    state.networkMapSignature = signature;
    fitNetworkMap();
  }
  setTimeout(() => state.networkMap?.invalidateSize(), 0);
}

function isContactTypeVisible(contact) {
  if (contact.type === 1) return state.mapOptions.clients;
  if (contact.type === 2) return state.mapOptions.repeaters;
  return state.mapOptions.other;
}

function getMapMarkerClass(node) {
  if (node.self) return "self";
  const typeClass = node.type === 2 ? "repeater" : "client";
  if (state.mapOptions.colorMode === "signal") {
    return `${typeClass} ${node.lastSnr == null ? "inactive" : node.lastSnr >= 5 ? "signal-good" : node.lastSnr >= -5 ? "signal-medium" : "signal-poor"}`;
  }
  if (state.mapOptions.colorMode === "hops") {
    const hops = node.outPathLenRaw == null ? null : node.outPathLenRaw & 0x3f;
    return `${typeClass} ${hops == null ? "inactive" : hops <= 1 ? "signal-good" : hops <= 3 ? "signal-medium" : "signal-poor"}`;
  }
  if (state.mapOptions.colorMode === "activity") {
    const seen = Math.max(node.lastSeen || 0, node.lastAdvert || 0);
    const age = Date.now() / 1000 - seen;
    return `${typeClass} ${!seen || age > 86400 ? "inactive" : age < 3600 ? "signal-good" : "signal-medium"}`;
  }
  return typeClass;
}

function getContactMessageCount(contact) {
  return state.messages.filter((message) => message.prefix === contact.prefix || String(message.text || "").toLowerCase().startsWith(`${contact.name.toLowerCase()}:`)).length;
}

function updateMapOption(name, value) {
  state.mapOptions[name] = value;
  renderNetworkMap();
}

function setNetworkView(view) {
  state.networkView = view === "graph" ? "graph" : "map";
  el.networkMap.hidden = state.networkView !== "map";
  el.networkGraph.hidden = state.networkView !== "graph";
  el.fitNetworkMapBtn.hidden = state.networkView !== "map";
  document.querySelectorAll("[data-network-view]").forEach((button) => button.classList.toggle("active", button.dataset.networkView === state.networkView));
  if (state.networkView === "map") setTimeout(() => state.networkMap?.invalidateSize(), 0);
}

async function toggleNetworkFullscreen() {
  const section = el.networkMap.closest(".map-section");
  if (!document.fullscreenElement) await section.requestFullscreen();
  else await document.exitFullscreen();
  section.classList.toggle("network-panel-fullscreen", Boolean(document.fullscreenElement));
  setTimeout(() => state.networkMap?.invalidateSize(), 100);
}

function renderNetworkGraph() {
  const contacts = [...state.contacts.values()];
  if (!contacts.length) {
    el.networkGraph.innerHTML = '<span class="empty">Noch keine Kontakte.</span>';
    el.graphDetails.hidden = true;
    return;
  }
  const ringCount = Math.max(1, Math.ceil(contacts.length / 24));
  const outerRadius = 125 + (ringCount - 1) * 72;
  const width = Math.max(900, outerRadius * 2 + 180);
  const height = Math.max(520, outerRadius * 2 + 180);
  const center = { x: width / 2, y: height / 2 };
  const usage = getRepeaterUsage();
  const maxUsage = Math.max(0, ...usage.values());
  const points = contacts.map((contact, index) => {
    const ring = Math.floor(index / 24);
    const indexInRing = index % 24;
    const ringCount = Math.min(24, contacts.length - ring * 24);
    const radius = 125 + ring * 72;
    const savedPosition = state.graphPositions.get(contact.key);
    return {
      contact,
      x: savedPosition?.x ?? center.x + Math.cos((indexInRing / ringCount) * Math.PI * 2 - Math.PI / 2) * radius,
      y: savedPosition?.y ?? center.y + Math.sin((indexInRing / ringCount) * Math.PI * 2 - Math.PI / 2) * radius,
    };
  });
  for (const point of points) {
    if (!state.graphPositions.has(point.contact.key)) state.graphPositions.set(point.contact.key, { x: point.x, y: point.y });
  }
  const pointByKey = new Map(points.map((point) => [point.contact.key, point]));
  const edgeKeys = new Set();
  const edgeParts = [];
  for (const target of points) {
    const hashes = formatPathHashes(target.contact.outPathLenRaw, target.contact.outPathRaw).hashes;
    const knownRepeaters = hashes.map((hash) => ({ hash, matches: resolveRepeaterHash(hash) })).filter((entry) => entry.matches.length === 1).map((entry) => ({ hash: entry.hash, point: pointByKey.get(entry.matches[0].key) })).filter((entry) => entry.point);
    const chain = [{ point: { x: center.x, y: center.y }, hash: null }, ...knownRepeaters, { point: target, hash: null }];
    for (let index = 1; index < chain.length; index += 1) {
      const from = chain[index - 1];
      const to = chain[index];
      const edgeKey = `${from.point.contact?.key || "origin"}:${to.point.contact?.key || target.contact.key}`;
      if (edgeKeys.has(edgeKey)) continue;
      edgeKeys.add(edgeKey);
      const frequent = to.hash && (usage.get(to.hash) || 0) === maxUsage && maxUsage > 1;
      edgeParts.push(`<line class="graph-edge${frequent ? " frequent" : ""}" data-from="${from.point.contact?.key || "origin"}" data-to="${to.point.contact?.key || target.contact.key}" x1="${from.point.x.toFixed(1)}" y1="${from.point.y.toFixed(1)}" x2="${to.point.x.toFixed(1)}" y2="${to.point.y.toFixed(1)}"><title>${escapeHtml(target.contact.name)}: ${hashes.map(formatRepeaterHash).join(" -> ") || "direkt"}</title></line>`);
    }
  }
  const edges = edgeParts.join("");
  const nodes = points.map((point) => `<g class="graph-node${point.contact.type === 2 ? " repeater" : ""}${state.graphSelectedKey === point.contact.key ? " selected" : ""}" data-key="${escapeHtml(point.contact.key)}" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})"><circle r="12"><title>${escapeHtml(point.contact.name)}</title></circle><text y="27">${escapeHtml(point.contact.name.slice(0, 18))}</text></g>`).join("");
  el.networkGraph.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Netzwerkgraph"><g class="graph-node origin" transform="translate(${center.x} ${center.y})"><circle r="18"></circle><text y="34">Eigener Node</text></g>${edges}${nodes}</svg>`;
}

function handleGraphPointerDown(event) {
  const node = event.target.closest(".graph-node[data-key]");
  if (!node) return;
  const position = state.graphPositions.get(node.dataset.key);
  const svg = el.networkGraph.querySelector("svg");
  if (!position || !svg) return;
  state.graphDrag = {
    key: node.dataset.key,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: position.x,
    originY: position.y,
    x: position.x,
    y: position.y,
    svg,
    moved: false,
  };
  el.networkGraph.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function handleGraphPointerMove(event) {
  const drag = state.graphDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const viewBox = drag.svg.viewBox.baseVal;
  const rect = drag.svg.getBoundingClientRect();
  const scaleX = viewBox.width / rect.width;
  const scaleY = viewBox.height / rect.height;
  drag.x = Math.max(24, Math.min(viewBox.width - 24, drag.originX + (event.clientX - drag.startX) * scaleX));
  drag.y = Math.max(24, Math.min(viewBox.height - 24, drag.originY + (event.clientY - drag.startY) * scaleY));
  drag.moved = drag.moved || Math.abs(drag.x - drag.originX) > 2 || Math.abs(drag.y - drag.originY) > 2;
  const positions = new Map(state.graphPositions);
  positions.set(drag.key, { x: drag.x, y: drag.y });
  const node = [...el.networkGraph.querySelectorAll(".graph-node[data-key]")].find((item) => item.dataset.key === drag.key);
  if (node) node.setAttribute("transform", `translate(${drag.x.toFixed(1)} ${drag.y.toFixed(1)})`);
  updateGraphEdges(positions, viewBox.width / 2, viewBox.height / 2);
}

function handleGraphPointerUp(event) {
  const drag = state.graphDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (drag.moved) {
    state.graphPositions.set(drag.key, { x: drag.x, y: drag.y });
    state.graphSuppressClick = true;
    setTimeout(() => { state.graphSuppressClick = false; }, 0);
  }
  state.graphDrag = null;
  if (el.networkGraph.hasPointerCapture(event.pointerId)) el.networkGraph.releasePointerCapture(event.pointerId);
}

function updateGraphEdges(positions, originX, originY) {
  for (const edge of el.networkGraph.querySelectorAll(".graph-edge")) {
    const from = edge.dataset.from === "origin" ? { x: originX, y: originY } : positions.get(edge.dataset.from);
    const to = edge.dataset.to === "origin" ? { x: originX, y: originY } : positions.get(edge.dataset.to);
    if (!from || !to) continue;
    edge.setAttribute("x1", from.x.toFixed(1));
    edge.setAttribute("y1", from.y.toFixed(1));
    edge.setAttribute("x2", to.x.toFixed(1));
    edge.setAttribute("y2", to.y.toFixed(1));
  }
}

function handleGraphClick(event) {
  if (state.graphSuppressClick) return;
  const node = event.target.closest(".graph-node[data-key]");
  if (!node) return;
  state.graphSelectedKey = node.dataset.key;
  showGraphDetails(state.contacts.get(state.graphSelectedKey));
  el.networkGraph.querySelectorAll(".graph-node[data-key]").forEach((item) => item.classList.toggle("selected", item === node));
}

function showGraphDetails(contact) {
  if (!contact) return;
  el.graphDetails.hidden = false;
  el.graphDetails.className = "graph-details";
  const path = formatPathHashes(contact.outPathLenRaw, contact.outPathRaw);
  el.graphDetails.innerHTML = `<strong>${escapeHtml(contact.name)}</strong><div class="graph-details-grid"><div class="graph-detail-item"><span>Typ</span><strong>${escapeHtml(TYPE_NAMES[contact.type] || `Typ ${contact.type}`)}</strong></div><div class="graph-detail-item"><span>Public Key</span><strong class="mono">${escapeHtml(contact.key)}</strong></div><div class="graph-detail-item"><span>Route</span><strong>${escapeHtml(formatContactRoute(contact.outPathLen))}</strong></div><div class="graph-detail-item"><span>Signal</span><strong>${contact.lastSnr == null ? "-" : `${contact.lastSnr.toFixed(1)} dB SNR`}</strong></div><div class="graph-detail-item"><span>Letztes Advert</span><strong>${escapeHtml(formatExactTime(contact.lastAdvert))}</strong></div><div class="graph-detail-item"><span>Bekannte Pfad-Hops</span><strong>${escapeHtml(path.hashes.join(" -> ") || "Direkt")}</strong></div></div>`;
}

function fitNetworkMap() {
  if (!state.networkMap || !state.networkMapBounds?.isValid()) return;
  if (state.networkMapBounds.getNorthEast().equals(state.networkMapBounds.getSouthWest())) {
    state.networkMap.setView(state.networkMapBounds.getCenter(), 12);
    return;
  }
  state.networkMap.fitBounds(state.networkMapBounds, { padding: [32, 32], maxZoom: 13 });
}

function renderRouteOverview() {
  const contacts = [...state.contacts.values()].sort((a, b) => ((a.outPathLenRaw ?? 255) & 0x3f) - ((b.outPathLenRaw ?? 255) & 0x3f));
  if (!contacts.length) {
    el.routeOverview.className = "network-list empty";
    el.routeOverview.textContent = "Noch keine Routendaten.";
    return;
  }
  const usage = getRepeaterUsage();
  const maxUsage = Math.max(0, ...usage.values());
  el.routeOverview.className = "network-list";
  el.routeOverview.innerHTML = contacts.map((contact) => {
    const path = formatPathHashes(contact.outPathLenRaw, contact.outPathRaw);
    const hopStats = getContactHopStats(contact);
    const chain = ["Eigener Node", ...path.hashes, contact.name];
    const chainHtml = chain.map((part, index) => {
      if (index === 0 || index === chain.length - 1) return `<span class="route-node">${escapeHtml(part)}</span>`;
      const matches = resolveRepeaterHash(part);
      const label = matches.length === 1 ? matches[0].name : part;
      const frequent = (usage.get(part) || 0) === maxUsage && maxUsage > 1;
      return `<span class="route-node${frequent ? " frequent" : ""}" title="${usage.get(part) || 0} bekannte Routen">${escapeHtml(label)}</span>`;
    }).join('<span aria-hidden="true">&#8594;</span>');
    const detail = hopStats.count ? `Hops Ø ${formatNumber(hopStats.average, 1)}, max. ${hopStats.max}` : `${path.hops} bekannte Pfad-Hops`;
    return `<div class="route-row"><strong>${escapeHtml(contact.name)}</strong><span class="meta">${escapeHtml(detail)}</span><div class="route-chain">${chainHtml}</div></div>`;
  }).join("");
}

function getContactHopStats(contact) {
  const values = state.messages.filter((message) => {
    if (message.pathLen == null || message.outgoing) return false;
    if (message.prefix) return message.prefix === contact.prefix;
    const sender = String(message.text || "").split(":", 1)[0].trim().toLowerCase();
    return sender && sender === contact.name.toLowerCase();
  }).map((message) => message.pathLen === 0xff ? 0 : message.pathLen & 0x3f);
  return {
    count: values.length,
    average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
    max: values.length ? Math.max(...values) : 0,
  };
}

function getRepeaterUsage() {
  const usage = new Map();
  for (const contact of state.contacts.values()) {
    for (const hash of formatPathHashes(contact.outPathLenRaw, contact.outPathRaw).hashes) {
      usage.set(hash, (usage.get(hash) || 0) + 1);
    }
  }
  return usage;
}

function renderRangeStats() {
  const messages = state.messages.filter((message) => !message.outgoing && (message.snr != null || message.rssi != null));
  const snrValues = messages.map((message) => Number(message.snr)).filter(Number.isFinite);
  const rssiValues = messages.map((message) => Number(message.rssi)).filter(Number.isFinite);
  const hopValues = state.messages.map((message) => message.pathLen == null ? null : (message.pathLen === 0xff ? 0 : message.pathLen & 0x3f)).filter(Number.isFinite);
  const rangeDistance = getRangeDistance();
  updateRangeRecord(rangeDistance);
  if (!snrValues.length && !rssiValues.length && !hopValues.length && !rangeDistance) {
    el.rangeStats.className = "stat-grid empty";
    el.rangeStats.textContent = "Noch keine Funkdaten.";
    return;
  }
  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const stats = [
    [rangeDistance?.fromSelf ? `Weitester Node${rangeDistance.approximate ? " (ab PLZ)" : ""}` : "Groesste bekannte Distanz", rangeDistance ? `${rangeDistance.label} (${rangeDistance.approximate ? "ca. " : ""}${formatNumber(rangeDistance.distance, 1)} km)` : "-"],
    ["Mittlere SNR", snrValues.length ? `${formatNumber(average(snrValues), 1)} dB` : "-"],
    ["Mittlere RSSI", rssiValues.length ? `${formatNumber(average(rssiValues), 0)} dBm` : "-"],
    ["Maximale Hops", hopValues.length ? String(Math.max(...hopValues)) : "-"],
    ["Reichweitenrekord", state.rangeRecords[0] ? `${state.rangeRecords[0].label} (${formatNumber(state.rangeRecords[0].distance, 1)} km)` : "-"],
  ];
  el.rangeStats.className = "stat-grid";
  const history = state.rangeRecords.slice(0, 5).map((record) => `<div><span>${escapeHtml(new Date(record.recordedAt).toLocaleDateString("de-DE"))}</span><strong>${escapeHtml(record.label)} - ${record.approximate ? "ca. " : ""}${formatNumber(record.distance, 1)} km</strong></div>`).join("");
  el.rangeStats.innerHTML = `${stats.map(([label, value]) => `<div class="stat-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}${history ? `<div class="range-record-list"><span>Rekordverlauf</span>${history}</div>` : ""}`;
}

function loadRangeRecords() {
  try {
    const records = JSON.parse(localStorage.getItem("meshcore-dashboard-range-records") || "[]");
    return Array.isArray(records) ? records.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function updateRangeRecord(result) {
  if (!result || !Number.isFinite(result.distance)) return;
  const current = state.rangeRecords[0];
  if (current && current.distance >= result.distance) return;
  state.rangeRecords.unshift({ label: result.label, distance: result.distance, approximate: Boolean(result.approximate), recordedAt: new Date().toISOString() });
  state.rangeRecords = state.rangeRecords.sort((a, b) => b.distance - a.distance).slice(0, 20);
  try {
    localStorage.setItem("meshcore-dashboard-range-records", JSON.stringify(state.rangeRecords));
  } catch {}
}

function getRangeDistance() {
  const contacts = [...state.contacts.values()].filter(hasValidPosition);
  const reference = getReferenceLocation();
  if (reference) {
    return contacts
      .map((contact) => ({
        label: contact.name,
        distance: distanceKm(reference.lat, reference.lon, contact.lat, contact.lon),
        fromSelf: true,
        approximate: reference.approximate,
      }))
      .sort((a, b) => b.distance - a.distance)[0] || null;
  }

  let farthest = null;
  for (let first = 0; first < contacts.length; first += 1) {
    for (let second = first + 1; second < contacts.length; second += 1) {
      const distance = distanceKm(contacts[first].lat, contacts[first].lon, contacts[second].lat, contacts[second].lon);
      if (!farthest || distance > farthest.distance) {
        farthest = { label: `${contacts[first].name} - ${contacts[second].name}`, distance, fromSelf: false };
      }
    }
  }
  return farthest;
}

function distanceKm(latA, lonA, latB, lonB) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const a1 = radians(latA / 1e6);
  const a2 = radians(latB / 1e6);
  const deltaLat = radians((latB - latA) / 1e6);
  const deltaLon = radians((lonB - lonA) / 1e6);
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function createPacketStats() {
  return { total: 0, bytes: 0, errors: 0, unknown: 0, duplicates: 0, startedAt: Date.now(), byType: new Map(), events: [], fingerprints: new Map() };
}

function recordPacket(code, data) {
  const stats = state.packetStats;
  const now = Date.now();
  const fingerprint = toHex(data);
  const previous = stats.fingerprints.get(fingerprint);
  if (previous && now - previous < 10000) stats.duplicates += 1;
  stats.fingerprints.set(fingerprint, now);
  for (const [key, timestamp] of stats.fingerprints) {
    if (now - timestamp > 10000) stats.fingerprints.delete(key);
  }
  stats.total += 1;
  stats.bytes += data.length;
  stats.byType.set(code, (stats.byType.get(code) || 0) + 1);
  stats.events.unshift({ time: now, code, bytes: data.length });
  stats.events = stats.events.slice(0, 60);
}

function renderPacketDiagnostics() {
  const packetStats = state.packetStats;
  const elapsedMinutes = Math.max((Date.now() - packetStats.startedAt) / 60000, 1 / 60);
  const outgoing = state.messages.filter((message) => message.kind === "out" || message.outgoing);
  const confirmed = outgoing.filter((message) => getDeliveryStatus(message) === "confirmed");
  const failed = outgoing.filter((message) => getDeliveryStatus(message) === "failed");
  const roundTrips = outgoing.map((message) => Number(message.roundTrip)).filter(Number.isFinite);
  const ackTotal = confirmed.length + failed.length;
  const averageRoundTrip = roundTrips.length ? roundTrips.reduce((sum, value) => sum + value, 0) / roundTrips.length : null;
  const stats = [
    ["RX gesamt", String(packetStats.total)],
    ["Pakete/min", formatNumber(packetStats.total / elapsedMinutes, 1)],
    ["Datenmenge", `${formatNumber(packetStats.bytes / 1024, 1)} KB`],
    ["Fehlerquote", packetStats.total ? `${formatNumber((packetStats.errors / packetStats.total) * 100, 1)}%` : "0%"],
    ["ACK-Erfolg", ackTotal ? `${formatNumber((confirmed.length / ackTotal) * 100, 0)}%` : "-"],
    ["Ø Roundtrip", averageRoundTrip == null ? "-" : `${formatNumber(averageRoundTrip, 0)} ms`],
    ["Duplikate", String(packetStats.duplicates)],
    ["Unbekannte Typen", String(packetStats.unknown)],
  ];
  const types = [...packetStats.byType.entries()].sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(1, ...types.map(([, count]) => count));
  const typeHtml = types.length ? types.map(([code, count]) => `<div class="packet-type-row"><span>${escapeHtml(packetName(code))}</span><span class="packet-bar"><span style="width:${(count / maxCount) * 100}%"></span></span><strong>${count}</strong></div>`).join("") : '<span class="empty">Noch keine Pakete.</span>';
  const eventHtml = packetStats.events.length ? packetStats.events.map((event) => `<div class="packet-event"><span>${new Date(event.time).toLocaleTimeString()}</span><span>${escapeHtml(packetName(event.code))}</span><span>${event.bytes} B</span></div>`).join("") : '<span class="empty">Noch keine Paketereignisse.</span>';
  el.packetDiagnostics.innerHTML = `<div class="packet-summary">${stats.map(([label, value]) => `<div class="stat-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div><div><h4>Pakettypen</h4><div class="packet-type-list">${typeHtml}</div></div><div><h4>Letzte Pakete</h4><div class="packet-events">${eventHtml}</div></div>`;
}

function exportConfiguration() {
  const configuration = {
    format: "meshcore-dashboard-config",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      theme: loadTheme(),
      chatDensity: loadChatDensity(),
      weatherEnabled: state.weatherEnabled,
      autoPongEnabled: state.autoPongEnabled,
      autoPongPostalCode: state.autoPongPostalCode,
      quickReplyRules: state.quickReplyRules,
      favoriteContacts: [...state.favoriteContacts],
      roomFavorites: [...state.roomFavorites],
      autoReconnect: state.autoReconnect,
    },
  };
  const blob = new Blob([JSON.stringify(configuration, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `meshcore-dashboard-config-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showActionNotice("Konfiguration exportiert.");
}

async function importConfiguration(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (parsed?.format !== "meshcore-dashboard-config" || !parsed.settings) throw new Error("Unbekanntes Format");
    const settings = parsed.settings;
    if (settings.theme === "default" || settings.theme === "mono") localStorage.setItem("meshcore-dashboard-theme", settings.theme);
    if (["compact", "comfortable"].includes(settings.chatDensity)) localStorage.setItem("meshcore-dashboard-chat-density", settings.chatDensity);
    localStorage.setItem("meshcore-dashboard-weather-replies", String(Boolean(settings.weatherEnabled)));
    localStorage.setItem("meshcore-dashboard-auto-pong", String(Boolean(settings.autoPongEnabled)));
    if (typeof settings.autoPongPostalCode === "string") localStorage.setItem("meshcore-dashboard-auto-pong-postal-code", settings.autoPongPostalCode);
    if (Array.isArray(settings.quickReplyRules)) localStorage.setItem("meshcore-dashboard-quick-reply-rules", JSON.stringify(settings.quickReplyRules));
    if (Array.isArray(settings.favoriteContacts)) localStorage.setItem("meshcore-dashboard-favorite-contacts", JSON.stringify(settings.favoriteContacts));
    if (Array.isArray(settings.roomFavorites)) localStorage.setItem("meshcore-dashboard-room-favorites", JSON.stringify(settings.roomFavorites));
    if (typeof settings.autoReconnect === "boolean") localStorage.setItem("meshcore-dashboard-auto-reconnect", String(settings.autoReconnect));
    showActionNotice("Konfiguration importiert. Seite wird neu geladen.");
    setTimeout(() => location.reload(), 700);
  } catch (error) {
    showActionNotice(`Import fehlgeschlagen: ${error.message}`, "error");
  }
}

async function installDashboard() {
  if (!state.installPrompt) return;
  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  el.installAppBtn.hidden = true;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("service-worker.js").catch((error) => log(`Offline-Modus nicht verfuegbar: ${error.message}`, "error"));
  }
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
