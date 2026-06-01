const KIT_START = 0x1a80;
const KIT_STRIDE = 0xe0;
const KIT_COUNT = 100;
const KIT_NAME_OFFSET = 0x8c;
const KIT_NAME_LENGTH = 28;
const SAMPLE_TABLE_START = 0x45ffc;
const SAMPLE_RECORD_SIZE = 0x38;
const SAMPLE_NAME_OFFSET = 0x28;
const SAMPLE_NAME_LENGTH = 16;
const APP_SNAPSHOT_MARKER = "HSKV1";
const SAMPLE_PAGE_SIZE = 80;

const padLayout = [
  { id: "S1", x: 9, y: 44, w: 17, h: 13, slot: 0, shape: "arc arc-left" },
  { id: "S2", x: 24, y: 37, w: 14, h: 12, slot: 1, shape: "arc arc-top-left" },
  { id: "S3", x: 38, y: 34, w: 12, h: 12, slot: 2, shape: "arc arc-top" },
  { id: "S4", x: 50, y: 34, w: 12, h: 12, slot: 3, shape: "arc arc-top" },
  { id: "S5", x: 62, y: 37, w: 14, h: 12, slot: 4, shape: "arc arc-top-right" },
  { id: "S6", x: 74, y: 44, w: 17, h: 13, slot: 5, shape: "arc arc-right" },
  { id: "S7", x: 8, y: 56, w: 18, h: 13, slot: 6, shape: "arc arc-lower-left" },
  { id: "S8", x: 74, y: 56, w: 18, h: 13, slot: 7, shape: "arc arc-lower-right" },
  { id: "M1", x: 13, y: 60, w: 37, h: 17, slot: 8, shape: "main main-upper-left" },
  { id: "M2", x: 50, y: 60, w: 37, h: 17, slot: 9, shape: "main main-upper-right" },
  { id: "M3", x: 13, y: 75, w: 37, h: 19, slot: 10, shape: "main main-lower-left" },
  { id: "M4", x: 50, y: 75, w: 37, h: 19, slot: 11, shape: "main main-lower-right" },
  { id: "M5", x: 42, y: 63, w: 16, h: 13, slot: 12, shape: "center" },
];

// These offsets are a first-pass HPD-20 map. The values are exposed as raw IDs
// because Roland's backup format is not publicly documented.
const assignmentOffsets = [
  0x0c, 0x0e, 0x10, 0x12, 0x14, 0x16, 0x18,
  0x34, 0x36, 0x38, 0x3a, 0x3c, 0x3e,
];

const state = {
  fileName: "",
  backupBytes: null,
  kits: [],
  samples: [],
  selectedKit: 0,
  selectedPad: "M1",
  selectedSampleId: null,
  samplePage: 0,
  dirty: false,
  audioContext: null,
  activeAudios: [],
  loopPlayers: new Map(),
  loopBuffers: new Map(),
  midiAccess: null,
  midiNotes: new Map(),
};

const els = {
  fileInput: document.querySelector("#file-input"),
  waveInput: document.querySelector("#wave-input"),
  sampleButton: document.querySelector("#sample-button"),
  exportButton: document.querySelector("#export-button"),
  saveBackupButton: document.querySelector("#save-backup-button"),
  clearPadButton: document.querySelector("#clear-pad-button"),
  playPadButton: document.querySelector("#play-pad-button"),
  stopButton: document.querySelector("#stop-button"),
  playSampleButton: document.querySelector("#play-sample-button"),
  deleteSampleButton: document.querySelector("#delete-sample-button"),
  tagSampleButton: document.querySelector("#tag-sample-button"),
  tagSelect: document.querySelector("#tag-select"),
  kitNameInput: document.querySelector("#kit-name-input"),
  kitSubNameInput: document.querySelector("#kit-sub-name-input"),
  kitVolume: document.querySelector("#kit-volume"),
  kitVolumeValue: document.querySelector("#kit-volume-value"),
  kitTempo: document.querySelector("#kit-tempo"),
  kitTempoValue: document.querySelector("#kit-tempo-value"),
  padLinkA: document.querySelector("#pad-link-a"),
  padLinkB: document.querySelector("#pad-link-b"),
  padLevel: document.querySelector("#pad-level"),
  padTune: document.querySelector("#pad-tune"),
  padPan: document.querySelector("#pad-pan"),
  padLayer: document.querySelector("#pad-layer"),
  padMute: document.querySelector("#pad-mute"),
  padTrigger: document.querySelector("#pad-trigger"),
  padLoop: document.querySelector("#pad-loop"),
  padLoopBpm: document.querySelector("#pad-loop-bpm"),
  padMidiNote: document.querySelector("#pad-midi-note"),
  padMidiChannel: document.querySelector("#pad-midi-channel"),
  padMidiGate: document.querySelector("#pad-midi-gate"),
  initKitButton: document.querySelector("#init-kit-button"),
  duplicateKitButton: document.querySelector("#duplicate-kit-button"),
  addKitButton: document.querySelector("#add-kit-button"),
  deleteKitButton: document.querySelector("#delete-kit-button"),
  kitUpButton: document.querySelector("#kit-up-button"),
  kitDownButton: document.querySelector("#kit-down-button"),
  openProjectButton: document.querySelector("#open-project-button"),
  projectInput: document.querySelector("#project-input"),
  saveProjectButton: document.querySelector("#save-project-button"),
  meta: document.querySelector("#backup-meta"),
  kitSearch: document.querySelector("#kit-search"),
  kitList: document.querySelector("#kit-list"),
  kitNumber: document.querySelector("#kit-number"),
  kitName: document.querySelector("#kit-name"),
  decodeStatus: document.querySelector("#decode-status"),
  padLayout: document.querySelector("#pad-layout"),
  padDetail: document.querySelector("#pad-detail"),
  sampleSummary: document.querySelector("#sample-summary"),
  sampleSearch: document.querySelector("#sample-search"),
  samplePrevButton: document.querySelector("#sample-prev-button"),
  sampleNextButton: document.querySelector("#sample-next-button"),
  samplePageStatus: document.querySelector("#sample-page-status"),
  sampleList: document.querySelector("#sample-list"),
};

populateEditorOptions();

els.fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const buffer = await file.arrayBuffer();
  loadBackup(buffer, file.name);
});

els.sampleButton.addEventListener("click", async () => {
  try {
    els.decodeStatus.textContent = "Loading sample backup";
    const response = await fetch("BKUP-001.HS0");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    loadBackup(buffer, "BKUP-001.HS0");
  } catch (error) {
    els.decodeStatus.textContent = "Sample unavailable";
    els.padDetail.textContent = "The sample backup can be loaded from the local server, or you can use Open backup to choose the .HS0 file directly.";
  }
});

els.kitSearch.addEventListener("input", renderKitList);
els.sampleSearch.addEventListener("input", () => {
  state.samplePage = 0;
  renderSampleList();
});
els.samplePrevButton.addEventListener("click", () => {
  state.samplePage = Math.max(0, state.samplePage - 1);
  renderSampleList();
});
els.sampleNextButton.addEventListener("click", () => {
  state.samplePage += 1;
  renderSampleList();
});
els.exportButton.addEventListener("click", exportCurrentKitMap);
els.saveBackupButton.addEventListener("click", saveRolandBackup);
els.clearPadButton.addEventListener("click", clearSelectedPad);
els.playPadButton.addEventListener("click", () => playPad(state.selectedPad));
els.stopButton.addEventListener("click", stopAllAudio);
els.playSampleButton.addEventListener("click", playSelectedSample);
els.deleteSampleButton.addEventListener("click", deleteSelectedSample);
els.tagSampleButton.addEventListener("click", tagSelectedSample);
els.kitNameInput.addEventListener("input", renameSelectedKit);
els.kitSubNameInput.addEventListener("input", updateKitSettings);
els.kitVolume.addEventListener("input", updateKitSettings);
els.kitTempo.addEventListener("input", updateKitSettings);
els.kitTempoValue.addEventListener("input", updateKitSettings);
els.padLinkA.addEventListener("change", updateKitSettings);
els.padLinkB.addEventListener("change", updateKitSettings);
[
  els.padLevel, els.padTune, els.padPan, els.padLayer, els.padMute,
  els.padTrigger, els.padLoop, els.padLoopBpm, els.padMidiNote, els.padMidiChannel, els.padMidiGate,
].forEach((control) => control.addEventListener("input", updateSelectedPadSettings));
els.initKitButton.addEventListener("click", initSelectedKit);
els.duplicateKitButton.addEventListener("click", duplicateSelectedKit);
els.addKitButton.addEventListener("click", addKit);
els.deleteKitButton.addEventListener("click", deleteSelectedKit);
els.kitUpButton.addEventListener("click", () => moveSelectedKit(-1));
els.kitDownButton.addEventListener("click", () => moveSelectedKit(1));
els.openProjectButton.addEventListener("click", () => els.projectInput.click());
els.projectInput.addEventListener("change", openProjectFile);
els.saveProjectButton.addEventListener("click", saveProject);
els.waveInput.addEventListener("change", importWaveFiles);

function loadBackup(buffer, fileName) {
  const loaded = splitEmbeddedSnapshot(new Uint8Array(buffer));
  const bytes = loaded.bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  state.fileName = fileName;
  state.backupBytes = bytes;
  stopAllAudio();
  state.loopBuffers.clear();
  state.kits = parseKits(view, bytes);
  state.samples = parseSamples(view, bytes);
  state.selectedKit = 0;
  state.selectedPad = "M1";
  state.selectedSampleId = null;
  state.samplePage = 0;
  if (loaded.snapshot) applyProjectSnapshot(loaded.snapshot);
  state.dirty = false;
  render();
  if (loaded.snapshot) {
    els.decodeStatus.textContent = "Backup loaded with saved app edits";
  }
}

function parseKits(view, bytes) {
  const kits = [];
  for (let index = 0; index < KIT_COUNT; index += 1) {
    const recordOffset = KIT_START + index * KIT_STRIDE;
    if (recordOffset + KIT_STRIDE > bytes.length) break;

    const name = readAscii(bytes, recordOffset + KIT_NAME_OFFSET, KIT_NAME_LENGTH)
      .replace(/\s+/g, " ")
      .trim() || `User Kit ${index + 1}`;

    const assignments = assignmentOffsets.map((offset, slot) => ({
      slot,
      raw: view.getUint16(recordOffset + offset, false),
      offset: recordOffset + offset,
      customName: "",
      audioUrl: "",
      editor: createPadEditor(slot),
    }));

    kits.push({
      number: index + 1,
      name,
      subName: "",
      volume: 100,
      tempo: 120,
      padLinkA: "",
      padLinkB: "",
      recordOffset,
      assignments,
    });
  }
  return kits;
}

function populateEditorOptions() {
  const padOptions = `<option value="">Off</option>${padLayout.map((pad) => `<option>${pad.id}</option>`).join("")}`;
  els.padLinkA.innerHTML = padOptions;
  els.padLinkB.innerHTML = padOptions;
  els.padMidiChannel.innerHTML = Array.from({ length: 16 }, (_, index) => `<option>${index + 1}</option>`).join("");
}

function createPadEditor(slot = 0) {
  return {
    level: 100,
    tune: 0,
    pan: 0,
    layer: "Main",
    mute: "Off",
    trigger: "Shot",
    loop: false,
    loopBpm: 120,
    midiNote: Math.min(127, 60 + slot),
    midiChannel: "10",
    midiGate: "Shot",
  };
}

function createEmptyAssignment(slot) {
  return {
    slot,
    raw: 0,
    offset: 0,
    customName: "",
    audioUrl: "",
    editor: createPadEditor(slot),
  };
}

function hydrateKit(kit, index) {
  kit.number = index + 1;
  kit.subName ??= "";
  kit.volume ??= 100;
  kit.tempo ??= 120;
  kit.padLinkA ??= "";
  kit.padLinkB ??= "";
  kit.recordOffset ??= 0;
  kit.assignments ??= [];
  kit.assignments = padLayout.map((pad) => {
    const assignment = kit.assignments[pad.slot] || createEmptyAssignment(pad.slot);
    assignment.slot = pad.slot;
    assignment.raw ??= 0;
    assignment.offset ??= 0;
    assignment.customName ??= "";
    assignment.audioUrl ??= "";
    assignment.editor = { ...createPadEditor(pad.slot), ...(assignment.editor || {}) };
    return assignment;
  });
  return kit;
}

function parseSamples(view, bytes) {
  const samples = [];
  const seen = new Set();
  const start = Math.min(SAMPLE_TABLE_START, bytes.length);
  const end = Math.min(bytes.length - SAMPLE_RECORD_SIZE, start + SAMPLE_RECORD_SIZE * 700);
  let blankRun = 0;

  for (let offset = start; offset < end; offset += SAMPLE_RECORD_SIZE) {
    const name = readAscii(bytes, offset + SAMPLE_NAME_OFFSET, SAMPLE_NAME_LENGTH).trim();
    if (!isUsefulName(name)) {
      blankRun += 1;
      if (blankRun > 24 && samples.length) break;
      continue;
    }
    blankRun = 0;

    const segments = readSampleSegments(view, bytes, offset);
    const sampleId = Math.floor((offset - start) / SAMPLE_RECORD_SIZE) + 1;
    const key = `${sampleId}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    samples.push({
      id: sampleId,
      name,
      offset,
      segments,
      hasBackupAudio: segments.some((segment) => segment.usable),
      audioUrl: "",
      tags: [],
    });

  }

  return samples.slice(0, 500);
}

function readSampleSegments(view, bytes, recordOffset) {
  const pairs = [
    [view.getUint32(recordOffset + 0x10, false), view.getUint32(recordOffset + 0x14, false)],
    [view.getUint32(recordOffset + 0x18, false), view.getUint32(recordOffset + 0x1c, false)],
  ];

  return pairs
    .filter(([start, end]) => start !== 0xffffffff && end !== 0xffffffff && end > start)
    .map(([startAddress, endAddress]) => {
      const start = mapBackupAudioAddress(startAddress);
      const end = mapBackupAudioAddress(endAddress);
      const clampedStart = Math.max(0, Math.min(bytes.length, start));
      const clampedEnd = Math.max(clampedStart, Math.min(bytes.length, end));
      return {
        start: clampedStart,
        end: clampedEnd,
        startAddress,
        endAddress,
        ...findUsableAudioBounds(bytes, clampedStart, clampedEnd),
      };
    });
}

function mapBackupAudioAddress(address) {
  return ((address >>> 16) * 0x800) + (address & 0xffff);
}

function findUsableAudioBounds(bytes, start, end) {
  if (end - start < 128) {
    return { dataStart: start, dataEnd: start, usable: false };
  }
  const alignedStart = start + (start % 2);
  const alignedEnd = end - ((end - alignedStart) % 2);
  let dataStart = -1;
  let dataEnd = -1;

  for (let index = alignedStart; index < alignedEnd - 1; index += 2) {
    const value = bytes[index] | (bytes[index + 1] << 8);
    if (value !== 0xffff && value !== 0x0000) {
      dataStart = index;
      break;
    }
  }

  for (let index = alignedEnd - 2; index >= alignedStart; index -= 2) {
    const value = bytes[index] | (bytes[index + 1] << 8);
    if (value !== 0xffff && value !== 0x0000) {
      dataEnd = index + 2;
      break;
    }
  }

  return {
    dataStart: dataStart < 0 ? alignedStart : dataStart,
    dataEnd: dataEnd < 0 ? alignedStart : dataEnd,
    usable: dataStart >= 0 && dataEnd > dataStart + 64,
  };
}

function isUsefulName(name) {
  if (name.length < 2) return false;
  if (!/[A-Za-z0-9]/.test(name)) return false;
  return !/[{}[\]\\^~]/.test(name);
}

function readAscii(bytes, offset, length) {
  let value = "";
  for (let i = offset; i < offset + length && i < bytes.length; i += 1) {
    const byte = bytes[i];
    if (byte === 0) break;
    if (byte >= 32 && byte < 127) value += String.fromCharCode(byte);
  }
  return value;
}

function render() {
  state.kits.forEach(hydrateKit);
  renderMeta();
  renderKitList();
  renderSelectedKit();
  renderPads();
  renderDetails();
  renderSampleList();
}

function renderMeta() {
  const activeCount = state.kits.filter((kit) => !/^User Kit( \d+)?$/i.test(kit.name)).length;
  els.meta.innerHTML = `
    <strong>${state.fileName}</strong>
    <span>${state.kits.length} kits decoded / ${activeCount} named kits / ${state.samples.length} user instruments found</span>
  `;
}

function renderKitList() {
  const query = els.kitSearch.value.trim().toLowerCase();
  const kits = state.kits.filter((kit) => kit.name.toLowerCase().includes(query));

  if (!kits.length) {
    els.kitList.innerHTML = `<div class="empty">No kits match that search.</div>`;
    return;
  }

  els.kitList.innerHTML = kits.map((kit) => `
    <button class="kit-button ${kit.number - 1 === state.selectedKit ? "active" : ""}" data-kit="${kit.number - 1}">
      <span class="kit-num">${String(kit.number).padStart(3, "0")}</span>
      <span class="kit-title">${escapeHtml(kit.name)}</span>
    </button>
  `).join("");

  els.kitList.querySelectorAll(".kit-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedKit = Number(button.dataset.kit);
      state.selectedPad = "M1";
      renderSelectedKit();
      renderPads();
      renderDetails();
      renderKitList();
    });
  });
}

function renderSelectedKit() {
  const kit = state.kits[state.selectedKit];
  if (!kit) {
    els.kitNumber.textContent = "Kit";
    els.kitName.textContent = "Open a HandSonic backup";
    els.kitNameInput.value = "";
    els.kitSubNameInput.value = "";
    els.decodeStatus.textContent = "Waiting for file";
    return;
  }

  els.kitNumber.textContent = `Kit ${String(kit.number).padStart(3, "0")}`;
  els.kitName.textContent = kit.name;
  els.kitNameInput.value = kit.name;
  els.kitSubNameInput.value = kit.subName;
  els.kitVolume.value = kit.volume;
  els.kitVolumeValue.value = kit.volume;
  els.kitVolumeValue.textContent = kit.volume;
  els.kitTempo.value = kit.tempo;
  els.kitTempoValue.value = Math.round(Number(kit.tempo) || 120);
  els.padLinkA.value = kit.padLinkA;
  els.padLinkB.value = kit.padLinkB;
  updateLoopTempoForKit(kit);
  els.decodeStatus.textContent = state.dirty ? "Session edits pending export" : "HPD-20 structure detected";
}

function renderPads() {
  const kit = state.kits[state.selectedKit];
  els.padLayout.innerHTML = `
    <div class="device-top">
      <div class="knob knob-left"></div>
      <div class="knob knob-right"></div>
      <div class="brand">HandSonic</div>
      <div class="display"><strong>001</strong><span>${kit ? escapeHtml(kit.name) : "HandSonic"}</span></div>
      <div class="button-bank bank-left"><i></i><i></i><i></i><i></i></div>
      <div class="button-bank bank-right"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="transport"><i></i><i></i></div>
    </div>
    <div class="rim"></div>
  `;
  if (!kit) return;

  for (const pad of padLayout) {
    const assignment = kit.assignments[pad.slot];
    const label = getAssignmentLabel(assignment);
    const button = document.createElement("button");
    button.className = `pad ${pad.shape} ${state.selectedPad === pad.id ? "active" : ""} ${isPadLooping(kit, pad.id) ? "looping" : ""}`;
    button.style.left = `${pad.x}%`;
    button.style.top = `${pad.y}%`;
    button.style.width = `${pad.w}%`;
    button.style.height = `${pad.h}%`;
    button.dataset.pad = pad.id;
    button.dataset.slot = String(pad.slot);
    button.addEventListener("dragover", (event) => event.preventDefault());
    button.addEventListener("drop", (event) => {
      event.preventDefault();
      const sampleId = Number(event.dataTransfer.getData("text/plain"));
      assignSampleToPad(sampleId, pad.id);
    });
    button.innerHTML = `
      <span class="pad-label">${pad.id}</span>
      <span class="pad-sound">${escapeHtml(label)}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedPad = pad.id;
      renderPads();
      renderDetails();
      playPad(pad.id);
    });
    els.padLayout.appendChild(button);
  }
}

function getAssignmentLabel(assignment) {
  if (!assignment) return "No data";
  if (assignment.customName) return assignment.customName;
  const sample = state.samples.find((item) => item.id === assignment.raw);
  if (sample) return sample.name;
  if (assignment.raw === 0 || assignment.raw === 0x7f) return "Off / empty";
  return `Inst ${assignment.raw}`;
}

function renderDetails() {
  const kit = state.kits[state.selectedKit];
  const pad = padLayout.find((item) => item.id === state.selectedPad);
  const assignment = kit && pad ? kit.assignments[pad.slot] : null;

  if (!kit || !pad || !assignment) {
    els.padDetail.textContent = "Select a kit and pad to see decoded values.";
  } else {
    const label = getAssignmentLabel(assignment);
    const playbackStatus = getPlaybackStatus(assignment);
    const loopStatus = isPadLoopEnabled(assignment)
      ? `Loop: source ${Math.round(Number(assignment.editor.loopBpm) || 120)} BPM / kit ${Math.round(Number(kit.tempo) || 120)} BPM`
      : "Loop: off";
    els.padDetail.innerHTML = `
      <strong>${pad.id}</strong> on <strong>${escapeHtml(kit.name)}</strong><br />
      Sound: ${escapeHtml(label)}<br />
      Playback: ${playbackStatus}<br />
      ${loopStatus}<br />
      Tune: ${getTuneSemitones(assignment)} semitones<br />
      Raw assignment: ${assignment.raw} / file offset 0x${assignment.offset.toString(16)}
    `;
  }
  renderSelectedPadSettings(assignment);

  if (!state.samples.length) {
    els.sampleSummary.textContent = "No embedded user instrument names were found in this pass.";
  } else {
    const extractedCount = state.samples.filter((sample) => sample.hasBackupAudio).length;
    const importedCount = state.samples.filter((sample) => sample.imported).length;
    const preview = getOrderedSamples().slice(0, 8).map((item) => item.name).join(", ");
    const importedText = importedCount ? ` / ${importedCount} imported` : "";
    els.sampleSummary.innerHTML = `${state.samples.length} names found${importedText} / ${extractedCount} playable from backup, including ${escapeHtml(preview)}.`;
  }
}

function getPlaybackStatus(assignment) {
  if (assignment.audioUrl) return "imported audio file";
  const sample = state.samples.find((item) => item.id === assignment.raw);
  if (sample?.hasBackupAudio) return "extracted backup sound";
  return "generated preview tone";
}

function renderSampleList() {
  if (!state.samples.length) {
    els.sampleList.innerHTML = "";
    els.samplePageStatus.textContent = "Page 0 / 0";
    els.samplePrevButton.disabled = true;
    els.sampleNextButton.disabled = true;
    return;
  }

  const query = els.sampleSearch.value.trim().toLowerCase();
  const samples = getOrderedSamples()
    .filter((sample) => !query || sample.name.toLowerCase().includes(query) || String(sample.id).includes(query));
  const pageCount = Math.max(1, Math.ceil(samples.length / SAMPLE_PAGE_SIZE));
  state.samplePage = Math.max(0, Math.min(state.samplePage, pageCount - 1));
  const pageStart = state.samplePage * SAMPLE_PAGE_SIZE;
  const pageSamples = samples.slice(pageStart, pageStart + SAMPLE_PAGE_SIZE);

  els.samplePageStatus.textContent = samples.length
    ? `Page ${state.samplePage + 1} / ${pageCount} (${samples.length} sounds)`
    : "Page 0 / 0";
  els.samplePrevButton.disabled = state.samplePage <= 0;
  els.sampleNextButton.disabled = state.samplePage >= pageCount - 1 || !samples.length;

  if (!samples.length) {
    els.sampleList.innerHTML = `<div class="empty">No sounds match that search.</div>`;
    return;
  }

  els.sampleList.innerHTML = pageSamples.map((sample) => `
    <button class="sample-button ${sample.id === state.selectedSampleId ? "active" : ""}" draggable="true" data-sample-id="${sample.id}">
      <span>${escapeHtml(sample.name)}</span>
      <span class="sample-id">${sample.hasBackupAudio || sample.imported ? "audio" : sample.id}</span>
      ${sample.tags?.length ? `<span class="sample-tags">${escapeHtml(sample.tags.join(", "))}</span>` : ""}
    </button>
  `).join("");

  els.sampleList.querySelectorAll(".sample-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSampleId = Number(button.dataset.sampleId);
      renderSampleList();
    });
    button.addEventListener("dragstart", (event) => {
      state.selectedSampleId = Number(button.dataset.sampleId);
      event.dataTransfer.setData("text/plain", button.dataset.sampleId);
      event.dataTransfer.effectAllowed = "copy";
    });
  });
}

function getOrderedSamples() {
  return [...state.samples].sort((a, b) => {
    if (!!a.imported !== !!b.imported) return a.imported ? -1 : 1;
    return String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: "base" });
  });
}

function renderSelectedPadSettings(assignment) {
  const editor = assignment?.editor || createPadEditor();
  els.padLevel.value = editor.level;
  els.padTune.value = editor.tune;
  els.padPan.value = editor.pan;
  els.padLayer.value = editor.layer;
  els.padMute.value = editor.mute;
  els.padTrigger.value = editor.trigger;
  els.padLoop.checked = !!editor.loop || editor.trigger === "Loop";
  els.padLoopBpm.value = Math.round(Number(editor.loopBpm) || 120);
  els.padMidiNote.value = editor.midiNote;
  els.padMidiChannel.value = editor.midiChannel;
  els.padMidiGate.value = editor.midiGate;
}

function updateKitSettings(event) {
  const kit = state.kits[state.selectedKit];
  if (!kit) return;
  kit.subName = els.kitSubNameInput.value.trim();
  kit.volume = Number(els.kitVolume.value);
  const tempoSource = event.target === els.kitTempoValue ? els.kitTempoValue.value : els.kitTempo.value;
  kit.tempo = Math.max(40, Math.min(260, Math.round(Number(tempoSource) || 120)));
  kit.padLinkA = els.padLinkA.value;
  kit.padLinkB = els.padLinkB.value;
  state.activeAudios.forEach((audio) => {
    audio.volume = getKitVolume();
  });
  updateLoopTempoForKit(kit);
  state.dirty = true;
  renderSelectedKit();
  renderDetails();
}

function updateSelectedPadSettings() {
  const assignment = getSelectedAssignment();
  if (!assignment) return;
  assignment.editor = {
    level: Number(els.padLevel.value),
    tune: Number(els.padTune.value),
    pan: Number(els.padPan.value),
    layer: els.padLayer.value,
    mute: els.padMute.value,
    trigger: els.padTrigger.value,
    loop: els.padLoop.checked || els.padTrigger.value === "Loop",
    loopBpm: Math.max(20, Math.min(320, Math.round(Number(els.padLoopBpm.value) || 120))),
    midiNote: Math.max(0, Math.min(127, Number(els.padMidiNote.value) || 0)),
    midiChannel: els.padMidiChannel.value,
    midiGate: els.padMidiGate.value,
  };
  if (!isPadLoopEnabled(assignment)) {
    const kit = state.kits[state.selectedKit];
    stopLoopPlayer(getLoopKey(kit, state.selectedPad));
  }
  restartLoopForTuneChange(assignment);
  updateLoopTempoForAssignment(assignment);
  state.dirty = true;
  renderSelectedKit();
  renderPads();
  renderDetails();
}

function restartLoopForTuneChange(assignment) {
  state.loopPlayers.forEach((player, key) => {
    if (player.assignment !== assignment || player.lastTune === getTuneSemitones(assignment)) return;
    const kit = player.kit;
    const pad = padLayout.find((item) => item.id === player.padId);
    stopLoopPlayer(key);
    if (kit && pad && isPadLoopEnabled(assignment)) {
      toggleLoopPad(kit, pad, assignment);
    }
  });
}

function getSelectedAssignment() {
  const kit = state.kits[state.selectedKit];
  const pad = padLayout.find((item) => item.id === state.selectedPad);
  return kit && pad ? kit.assignments[pad.slot] : null;
}

function deleteSelectedSample() {
  const sampleIndex = state.samples.findIndex((item) => item.id === state.selectedSampleId);
  if (sampleIndex < 0) return;
  const [sample] = state.samples.splice(sampleIndex, 1);
  state.loopBuffers.delete(sample.audioUrl);
  Array.from(state.loopBuffers.keys())
    .filter((key) => String(key).includes(sample.audioUrl))
    .forEach((key) => state.loopBuffers.delete(key));
  if (sample.audioUrl?.startsWith("blob:")) URL.revokeObjectURL(sample.audioUrl);
  state.selectedSampleId = null;
  state.samplePage = 0;
  state.dirty = true;
  renderSelectedKit();
  renderDetails();
  renderPads();
  renderSampleList();
}

function tagSelectedSample() {
  const sample = state.samples.find((item) => item.id === state.selectedSampleId);
  const tag = els.tagSelect.value;
  if (!sample || !tag) return;
  sample.tags ??= [];
  if (!sample.tags.includes(tag)) sample.tags.push(tag);
  state.dirty = true;
  renderSelectedKit();
  renderSampleList();
}

function assignSampleToPad(sampleId, padId) {
  const kit = state.kits[state.selectedKit];
  const pad = padLayout.find((item) => item.id === padId);
  const sample = state.samples.find((item) => item.id === sampleId);
  if (!kit || !pad || !sample) return;

  stopLoopPlayer(getLoopKey(kit, pad.id));
  kit.assignments[pad.slot].raw = sample.id;
  kit.assignments[pad.slot].customName = sample.name;
  kit.assignments[pad.slot].audioUrl = sample.audioUrl || "";
  state.selectedPad = pad.id;
  state.selectedSampleId = sample.id;
  state.dirty = true;
  renderSelectedKit();
  renderPads();
  renderDetails();
  renderSampleList();
}

function clearSelectedPad() {
  const kit = state.kits[state.selectedKit];
  const pad = padLayout.find((item) => item.id === state.selectedPad);
  if (!kit || !pad) return;

  stopLoopPlayer(getLoopKey(kit, pad.id));
  kit.assignments[pad.slot].raw = 0;
  kit.assignments[pad.slot].customName = "";
  kit.assignments[pad.slot].audioUrl = "";
  state.dirty = true;
  renderSelectedKit();
  renderPads();
  renderDetails();
}

function renameSelectedKit() {
  const kit = state.kits[state.selectedKit];
  if (!kit) return;
  kit.name = els.kitNameInput.value.trim() || `Kit ${kit.number}`;
  state.dirty = true;
  renderSelectedKit();
  renderKitList();
  renderPads();
}

function initSelectedKit() {
  const kit = state.kits[state.selectedKit];
  if (!kit) return;
  stopAllAudio();
  kit.subName = "";
  kit.volume = 100;
  kit.tempo = 120;
  kit.padLinkA = "";
  kit.padLinkB = "";
  kit.assignments = padLayout.map((pad) => createEmptyAssignment(pad.slot));
  state.dirty = true;
  render();
}

function duplicateSelectedKit() {
  const kit = state.kits[state.selectedKit];
  if (!kit) return;
  const duplicate = cloneKit(kit);
  duplicate.name = `${kit.name} Copy`;
  state.kits.splice(state.selectedKit + 1, 0, duplicate);
  state.selectedKit += 1;
  state.dirty = true;
  render();
}

function addKit() {
  const kit = hydrateKit({
    name: `New Kit ${state.kits.length + 1}`,
    assignments: padLayout.map((pad) => createEmptyAssignment(pad.slot)),
  }, state.kits.length);
  state.kits.splice(state.selectedKit + 1, 0, kit);
  state.selectedKit = Math.min(state.selectedKit + 1, state.kits.length - 1);
  state.dirty = true;
  render();
}

function deleteSelectedKit() {
  if (!state.kits.length) return;
  stopAllAudio();
  state.kits.splice(state.selectedKit, 1);
  if (!state.kits.length) addKit();
  state.selectedKit = Math.max(0, Math.min(state.selectedKit, state.kits.length - 1));
  state.dirty = true;
  render();
}

function moveSelectedKit(direction) {
  const target = state.selectedKit + direction;
  if (target < 0 || target >= state.kits.length) return;
  stopAllAudio();
  [state.kits[state.selectedKit], state.kits[target]] = [state.kits[target], state.kits[state.selectedKit]];
  state.selectedKit = target;
  state.dirty = true;
  render();
}

function cloneKit(kit) {
  return hydrateKit({
    ...kit,
    assignments: kit.assignments.map((assignment) => ({
      ...assignment,
      editor: { ...assignment.editor },
    })),
  }, kit.number);
}

async function importWaveFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const startId = Math.max(9000, ...state.samples.map((sample) => sample.id + 1));
  const audioDataUrls = await Promise.all(files.map(fileToDataUrl));
  files.forEach((file, index) => {
    const cleanName = file.name.replace(/\.(wav|aif|aiff)$/i, "");
    state.samples.unshift({
      id: startId + index,
      name: cleanName,
      offset: -1,
      imported: true,
      audioUrl: audioDataUrls[index],
      audioDataUrl: audioDataUrls[index],
      tags: [],
    });
  });
  state.selectedSampleId = startId;
  state.samplePage = 0;
  state.dirty = true;
  els.waveInput.value = "";
  renderSelectedKit();
  renderDetails();
  renderSampleList();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

async function openProjectFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    applyProjectSnapshot(payload);
    state.dirty = false;
    render();
  } catch (error) {
    els.decodeStatus.textContent = "Project file not recognized";
  } finally {
    els.projectInput.value = "";
  }
}

function saveProject() {
  const payload = createProjectSnapshot();
  downloadJson(payload, "handsonic-project.json");
  state.dirty = false;
  renderSelectedKit();
}

function createProjectSnapshot() {
  return {
    format: "handsonic-kit-project",
    version: 2,
    sourceBackup: state.fileName,
    savedAt: new Date().toISOString(),
    selectedKit: state.selectedKit,
    selectedPad: state.selectedPad,
    kits: state.kits.map(serializeKit),
    samples: state.samples.map((sample) => ({
      id: sample.id,
      name: sample.name,
      imported: !!sample.imported,
      hasBackupAudio: !!sample.hasBackupAudio,
      tags: sample.tags || [],
      audioDataUrl: sample.imported ? sample.audioDataUrl || (sample.audioUrl?.startsWith("data:") ? sample.audioUrl : "") : "",
    })),
  };
}

function serializeKit(kit) {
  return {
    number: kit.number,
    name: kit.name,
    subName: kit.subName,
    volume: kit.volume,
    tempo: kit.tempo,
    padLinkA: kit.padLinkA,
    padLinkB: kit.padLinkB,
    assignments: kit.assignments.map((assignment) => ({
      slot: assignment.slot,
      raw: assignment.raw,
      offset: assignment.offset,
      customName: assignment.customName,
      audioUrl: assignment.audioUrl?.startsWith("data:") ? "" : assignment.audioUrl || "",
      editor: assignment.editor,
    })),
  };
}

function applyProjectSnapshot(payload) {
  if (!Array.isArray(payload.kits)) throw new Error("Missing kits");
  state.kits = payload.kits.map((kit, index) => hydrateKit(kit, index));
  state.selectedKit = Math.max(0, Math.min(payload.selectedKit || 0, state.kits.length - 1));
  state.selectedPad = padLayout.some((pad) => pad.id === payload.selectedPad) ? payload.selectedPad : "M1";
  applyProjectSampleMetadata(payload.samples || []);
  restoreAssignmentAudioUrls();
}

function applyProjectSampleMetadata(samples) {
  const byId = new Map(state.samples.map((sample) => [sample.id, sample]));
  samples.forEach((sample) => {
    const current = byId.get(sample.id);
    if (current) {
      current.tags = sample.tags || [];
      if (sample.audioDataUrl) {
        current.audioDataUrl = sample.audioDataUrl;
        current.audioUrl = sample.audioDataUrl;
      }
      return;
    }
    state.samples.push({
      id: sample.id,
      name: sample.name,
      imported: !!sample.imported,
      hasBackupAudio: false,
      segments: [],
      audioUrl: "",
      audioDataUrl: sample.audioDataUrl || "",
      tags: sample.tags || [],
    });
    const added = state.samples[state.samples.length - 1];
    if (added.audioDataUrl) added.audioUrl = added.audioDataUrl;
  });
}

function restoreAssignmentAudioUrls() {
  const samplesById = new Map(state.samples.map((sample) => [sample.id, sample]));
  state.kits.forEach((kit) => {
    kit.assignments.forEach((assignment) => {
      if (assignment.audioUrl) return;
      const sample = samplesById.get(assignment.raw);
      const audioUrl = sample?.audioDataUrl || sample?.audioUrl || "";
      if (audioUrl) assignment.audioUrl = audioUrl;
    });
  });
}

function playPad(padId, options = {}) {
  const kit = state.kits[state.selectedKit];
  const pad = padLayout.find((item) => item.id === padId);
  const assignment = kit && pad ? kit.assignments[pad.slot] : null;
  if (!assignment) return;

  applyMuteGroup(assignment);
  sendPadMidi(assignment);
  pulsePad(padId);
  if (isPadLoopEnabled(assignment)) {
    toggleLoopPad(kit, pad, assignment);
  } else {
    playPadVoice(pad, assignment);
  }

  if (!options.fromLink) {
    const linkedPadId = getLinkedPadId(kit, padId);
    if (linkedPadId && linkedPadId !== padId) playPad(linkedPadId, { fromLink: true });
  }
}

function playPadVoice(pad, assignment) {
  const volume = getPadPlaybackVolume(assignment);
  const audioUrl = getAssignmentAudioUrl(assignment);
  if (audioUrl) {
    playAudioUrl(audioUrl, volume, assignment, pad.id, getTunePitchRatio(assignment))
      .catch(() => playPreviewTone(assignment.raw, pad.slot, volume, getTunePitchRatio(assignment)));
    return;
  }

  playPreviewTone(assignment.raw, pad.slot, volume, getTunePitchRatio(assignment));
}

function getLinkedPadId(kit, padId) {
  if (!kit?.padLinkA || !kit?.padLinkB) return "";
  if (kit.padLinkA === padId) return kit.padLinkB;
  if (kit.padLinkB === padId) return kit.padLinkA;
  return "";
}

function applyMuteGroup(assignment) {
  const group = assignment?.editor?.mute;
  if (!group || group === "Off") return;
  state.activeAudios
    .filter((audio) => audio.padAssignment?.editor?.mute === group)
    .forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  state.activeAudios = state.activeAudios.filter((audio) => audio.padAssignment?.editor?.mute !== group);
  state.loopPlayers.forEach((player, key) => {
    if (player.assignment !== assignment && player.assignment?.editor?.mute === group) stopLoopPlayer(key);
  });
}

async function sendPadMidi(assignment) {
  if (!navigator.requestMIDIAccess) return;
  try {
    state.midiAccess ??= await navigator.requestMIDIAccess();
    const output = Array.from(state.midiAccess.outputs.values())[0];
    if (!output) return;
    const note = Math.max(0, Math.min(127, Number(assignment.editor?.midiNote) || 60));
    const channel = Math.max(1, Math.min(16, Number(assignment.editor?.midiChannel) || 10)) - 1;
    const velocity = Math.max(1, Math.min(127, Number(assignment.editor?.level) || 100));
    const key = `${channel}:${note}`;
    if (assignment.editor?.midiGate === "Alt" && state.midiNotes.has(key)) {
      output.send([0x80 + channel, note, 0]);
      state.midiNotes.delete(key);
      return;
    }
    output.send([0x90 + channel, note, velocity]);
    state.midiNotes.set(key, output);
    if (assignment.editor?.midiGate !== "Alt") {
      window.setTimeout(() => {
        output.send([0x80 + channel, note, 0]);
        state.midiNotes.delete(key);
      }, assignment.editor?.midiGate === "Gate" ? 500 : 120);
    }
  } catch (error) {
    // Audio pad playback still works when MIDI access is unavailable or denied.
  }
}

function isPadLoopEnabled(assignment) {
  return !!assignment?.editor?.loop || assignment?.editor?.trigger === "Loop";
}

function getLoopKey(kit, padId) {
  return `${state.kits.indexOf(kit)}:${padId}`;
}

function isPadLooping(kit, padId) {
  return state.loopPlayers.has(getLoopKey(kit, padId));
}

async function toggleLoopPad(kit, pad, assignment) {
  const key = getLoopKey(kit, pad.id);
  if (state.loopPlayers.has(key)) {
    stopLoopPlayer(key);
    renderPads();
    return;
  }

  const audioUrl = getAssignmentAudioUrl(assignment);
  if (!audioUrl) {
    playPreviewTone(assignment.raw, pad.slot, getPadPlaybackVolume(assignment));
    return;
  }

  try {
    await startElementLoop(key, audioUrl, kit, pad, assignment);
    renderPads();
    renderDetails();
  } catch (error) {
    playPreviewTone(assignment.raw, pad.slot, getPadPlaybackVolume(assignment));
  }
}

async function startElementLoop(key, audioUrl, kit, pad, assignment) {
  const loopUrl = await getTrimmedLoopAudioUrl(audioUrl, getTuneSemitones(assignment));
  const player = {
    type: "element",
    audioUrl: loopUrl || audioUrl,
    assignment,
    kit,
    padId: pad.id,
    tracks: new Set(),
    timer: 0,
    primary: null,
    stopped: false,
    lastTune: getTuneSemitones(assignment),
  };
  state.loopPlayers.set(key, player);
  await launchElementLoopTrack(key, player).catch(() => {
    stopLoopPlayer(key);
    playPreviewTone(assignment.raw, pad.slot, getPadPlaybackVolume(assignment));
    renderPads();
  });
}

async function launchElementLoopTrack(key, player) {
  if (player.stopped || !state.loopPlayers.has(key)) return;
  const audio = new Audio(player.audioUrl);
  audio.preload = "auto";
  enablePitchPreservation(audio);
  audio.volume = getPadPlaybackVolume(player.assignment);
  audio.playbackRate = getElementLoopPlaybackRate(player.kit, player.assignment);
  player.primary = audio;
  player.tracks.add(audio);
  state.activeAudios.push(audio);
  audio.addEventListener("ended", () => retireElementTrack(player, audio));
  await audio.play();
  scheduleNextElementLoop(key, player, audio);
}

function scheduleNextElementLoop(key, player, audio) {
  window.clearTimeout(player.timer);
  const schedule = () => {
    if (player.stopped || player.primary !== audio || !state.loopPlayers.has(key)) return;
    const duration = Number(audio.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      player.timer = window.setTimeout(schedule, 40);
      return;
    }

    const rate = Math.max(0.25, Number(audio.playbackRate) || 1);
    const remainingMediaSeconds = Math.max(0, duration - audio.currentTime);
    const earlyWallSeconds = Math.min(0.035, Math.max(0.012, duration / rate / 24));
    const delay = Math.max(0.008, remainingMediaSeconds / rate - earlyWallSeconds);
    player.timer = window.setTimeout(() => {
      launchElementLoopTrack(key, player).catch(() => {
        if (state.loopPlayers.has(key)) scheduleNextElementLoop(key, player, audio);
      });
    }, delay * 1000);
  };
  schedule();
}

function retireElementTrack(player, audio) {
  player.tracks.delete(audio);
  state.activeAudios = state.activeAudios.filter((item) => item !== audio);
}

function enablePitchPreservation(audio) {
  audio.preservesPitch = true;
  audio.mozPreservesPitch = true;
  audio.webkitPreservesPitch = true;
}

async function startBufferLoop(key, audioUrl, kit, pad, assignment) {
  const context = await getAudioContext();
  if (!context?.decodeAudioData) return null;
  const loopBuffer = await getTrimmedLoopBuffer(audioUrl, context);
  if (!loopBuffer || loopBuffer.duration < 0.04) return null;

  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = loopBuffer;
  source.loop = true;
  source.loopStart = 0;
  source.loopEnd = loopBuffer.duration;
  source.playbackRate.value = getLoopPlaybackRate(kit, assignment);
  gain.gain.value = getPadPlaybackVolume(assignment);
  source.connect(gain);
  gain.connect(context.destination);
  source.start();
  state.loopPlayers.set(key, { type: "buffer", source, gain, assignment, kit, padId: pad.id });
  return source;
}

function getLoopPlaybackRate(kit, assignment) {
  const loopBpm = Math.max(20, Number(assignment?.editor?.loopBpm) || 120);
  const kitBpm = Math.max(20, Number(kit?.tempo) || 120);
  return Math.max(0.25, Math.min(4, (kitBpm / 120) * (loopBpm / 120)));
}

function getElementLoopPlaybackRate(kit, assignment) {
  // Loop tuning resamples the WAV used by the pitch-preserving media player.
  // Compensate for that file length change so Tune does not become a tempo control.
  const tuneCompensation = getTunePitchRatio(assignment);
  return Math.max(0.25, Math.min(4, getLoopPlaybackRate(kit, assignment) / tuneCompensation));
}

function getTuneSemitones(assignment) {
  return Math.max(-24, Math.min(24, Number(assignment?.editor?.tune) || 0));
}

function getTunePitchRatio(assignment) {
  return 2 ** (getTuneSemitones(assignment) / 12);
}

function updateLoopTempoForKit(kit) {
  state.loopPlayers.forEach((player) => {
    if (player.kit !== kit) return;
    setLoopPlayerTempo(player);
  });
}

function updateLoopTempoForAssignment(assignment) {
  state.loopPlayers.forEach((player) => {
    if (player.assignment !== assignment) return;
    setLoopPlayerTempo(player);
  });
}

function setLoopPlayerTempo(player) {
  const rate = getLoopPlaybackRate(player.kit, player.assignment);
  const volume = getPadPlaybackVolume(player.assignment);
  if (player.type === "buffer") {
    player.source.playbackRate.value = rate;
    player.gain.gain.value = volume;
    return;
  }
  player.tracks.forEach((audio) => {
    audio.playbackRate = getElementLoopPlaybackRate(player.kit, player.assignment);
    enablePitchPreservation(audio);
    audio.volume = volume;
  });
  if (player.primary) scheduleNextElementLoop(getLoopKey(player.kit, player.padId), player, player.primary);
}

function stopLoopPlayer(key) {
  const player = state.loopPlayers.get(key);
  if (!player) return;
  if (player.type === "buffer") {
    player.source.stop();
    player.source.disconnect();
    player.gain.disconnect();
  } else {
    player.stopped = true;
    window.clearTimeout(player.timer);
    player.tracks.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
      state.activeAudios = state.activeAudios.filter((item) => item !== audio);
    });
    player.tracks.clear();
  }
  state.loopPlayers.delete(key);
}

function playSelectedSample() {
  const sample = state.samples.find((item) => item.id === state.selectedSampleId);
  if (!sample) return;
  const volume = getKitVolume();
  const audioUrl = getSampleAudioUrl(sample);
  if (audioUrl) {
    playAudioUrl(audioUrl, volume).catch(() => playPreviewTone(sample.id, 0, volume));
  } else {
    playPreviewTone(sample.id, 0, volume);
  }
}

function getSampleAudioUrl(sample) {
  if (sample.audioUrl) return sample.audioUrl;
  if (!sample.hasBackupAudio) return "";
  const blob = makeWavBlobFromBackupSample(sample);
  if (!blob) return "";
  sample.audioUrl = URL.createObjectURL(blob);
  return sample.audioUrl;
}

function playAudioUrl(audioUrl, volume = 1, assignment = null, padId = "", playbackRate = 1) {
  const audio = new Audio(audioUrl);
  audio.volume = clampVolume(volume);
  audio.playbackRate = Math.max(0.25, Math.min(4, playbackRate));
  disablePitchPreservation(audio);
  audio.padAssignment = assignment;
  audio.padId = padId;
  state.activeAudios.push(audio);
  audio.addEventListener("ended", () => {
    state.activeAudios = state.activeAudios.filter((item) => item !== audio);
  });
  audio.currentTime = 0;
  return audio.play();
}

function disablePitchPreservation(audio) {
  audio.preservesPitch = false;
  audio.mozPreservesPitch = false;
  audio.webkitPreservesPitch = false;
}

function getKitVolume() {
  const kit = state.kits[state.selectedKit];
  return clampVolume((kit?.volume ?? 100) / 127);
}

function getPadPlaybackVolume(assignment) {
  const padLevel = (assignment?.editor?.level ?? 100) / 127;
  return clampVolume(getKitVolume() * padLevel);
}

function clampVolume(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function stopAllAudio() {
  Array.from(state.loopPlayers.keys()).forEach(stopLoopPlayer);
  state.activeAudios.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
  state.activeAudios = [];
  renderPads();
}

async function getAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!state.audioContext) state.audioContext = new AudioContext();
  if (state.audioContext.state === "suspended") await state.audioContext.resume();
  return state.audioContext;
}

async function getTrimmedLoopBuffer(audioUrl, context) {
  if (state.loopBuffers.has(audioUrl)) return state.loopBuffers.get(audioUrl);
  const response = await fetch(audioUrl);
  const arrayBuffer = await response.arrayBuffer();
  const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
  const trimmed = trimLoopBuffer(decoded, context);
  state.loopBuffers.set(audioUrl, trimmed);
  return trimmed;
}

async function getTrimmedLoopAudioUrl(audioUrl, tuneSemitones = 0) {
  const cacheKey = `wav:${audioUrl}:tune:${Number(tuneSemitones).toFixed(3)}`;
  if (state.loopBuffers.has(cacheKey)) return state.loopBuffers.get(cacheKey);
  const response = await fetch(audioUrl);
  const arrayBuffer = await response.arrayBuffer();
  const trimmed = trimPcmWavArrayBuffer(arrayBuffer, tuneSemitones);
  if (!trimmed) return audioUrl;
  const url = URL.createObjectURL(new Blob([trimmed], { type: "audio/wav" }));
  state.loopBuffers.set(cacheKey, url);
  return url;
}

function trimPcmWavArrayBuffer(arrayBuffer, tuneSemitones = 0) {
  const input = new DataView(arrayBuffer);
  if (readFourCC(input, 0) !== "RIFF" || readFourCC(input, 8) !== "WAVE") return null;
  let offset = 12;
  let format = null;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= input.byteLength) {
    const id = readFourCC(input, offset);
    const size = input.getUint32(offset + 4, true);
    const bodyOffset = offset + 8;
    if (id === "fmt " && size >= 16) {
      format = {
        audioFormat: input.getUint16(bodyOffset, true),
        channels: input.getUint16(bodyOffset + 2, true),
        sampleRate: input.getUint32(bodyOffset + 4, true),
        blockAlign: input.getUint16(bodyOffset + 12, true),
        bitsPerSample: input.getUint16(bodyOffset + 14, true),
      };
    }
    if (id === "data") {
      dataOffset = bodyOffset;
      dataSize = Math.min(size, input.byteLength - dataOffset);
      break;
    }
    offset = bodyOffset + size + (size % 2);
  }

  if (!format || format.audioFormat !== 1 || format.bitsPerSample !== 16 || dataOffset < 0) return null;
  const frameCount = Math.floor(dataSize / format.blockAlign);
  if (frameCount < 16) return null;
  let peak = 0;
  const stride = Math.max(1, Math.floor(frameCount / 12000));
  for (let frame = 0; frame < frameCount; frame += stride) peak = Math.max(peak, getWavFramePeak(input, dataOffset, frame, format));
  const threshold = Math.max(28, Math.floor(peak * 0.012));
  let start = 0;
  let end = frameCount - 1;
  while (start < end && getWavFramePeak(input, dataOffset, start, format) <= threshold) start += 1;
  while (end > start && getWavFramePeak(input, dataOffset, end, format) <= threshold) end -= 1;
  if (end - start < 16) return null;
  if (start === 0 && end === frameCount - 1) {
    return tuneSemitones ? transposePcmWavArrayBuffer(arrayBuffer, tuneSemitones) : null;
  }

  const guard = Math.floor(format.sampleRate * 0.002);
  start = Math.max(0, start - guard);
  end = Math.min(frameCount - 1, end + guard);
  const trimmedFrames = end - start + 1;
  const trimmedSize = trimmedFrames * format.blockAlign;
  const output = new ArrayBuffer(44 + trimmedSize);
  const out = new DataView(output);
  writeWavHeader(out, format.sampleRate, format.channels, trimmedSize);
  new Uint8Array(output, 44).set(new Uint8Array(arrayBuffer, dataOffset + start * format.blockAlign, trimmedSize));
  fadePcmWavEdges(out, 44, trimmedFrames, format);
  return tuneSemitones ? transposePcmWavArrayBuffer(output, tuneSemitones) : output;
}

function transposePcmWavArrayBuffer(arrayBuffer, semitones) {
  const format = readSimplePcmWav(arrayBuffer);
  if (!format || !semitones) return arrayBuffer;
  const ratio = 2 ** (semitones / 12);
  const sourceFrames = Math.floor(format.dataSize / format.blockAlign);
  const targetFrames = Math.max(1, Math.round(sourceFrames / ratio));
  const targetDataSize = targetFrames * format.blockAlign;
  const output = new ArrayBuffer(44 + targetDataSize);
  const out = new DataView(output);
  const source = new DataView(arrayBuffer);
  writeWavHeader(out, format.sampleRate, format.channels, targetDataSize);

  for (let frame = 0; frame < targetFrames; frame += 1) {
    const sourcePosition = frame * ratio;
    const left = Math.min(sourceFrames - 1, Math.floor(sourcePosition));
    const right = Math.min(sourceFrames - 1, left + 1);
    const mix = sourcePosition - left;
    for (let channel = 0; channel < format.channels; channel += 1) {
      const a = source.getInt16(format.dataOffset + left * format.blockAlign + channel * 2, true);
      const b = source.getInt16(format.dataOffset + right * format.blockAlign + channel * 2, true);
      out.setInt16(44 + frame * format.blockAlign + channel * 2, Math.round(a + (b - a) * mix), true);
    }
  }

  fadePcmWavEdges(out, 44, targetFrames, { ...format, dataOffset: 44 });
  return output;
}

function readSimplePcmWav(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (readFourCC(view, 0) !== "RIFF" || readFourCC(view, 8) !== "WAVE") return null;
  let offset = 12;
  let format = null;
  while (offset + 8 <= view.byteLength) {
    const id = readFourCC(view, offset);
    const size = view.getUint32(offset + 4, true);
    const bodyOffset = offset + 8;
    if (id === "fmt " && size >= 16) {
      format = {
        audioFormat: view.getUint16(bodyOffset, true),
        channels: view.getUint16(bodyOffset + 2, true),
        sampleRate: view.getUint32(bodyOffset + 4, true),
        blockAlign: view.getUint16(bodyOffset + 12, true),
        bitsPerSample: view.getUint16(bodyOffset + 14, true),
      };
    }
    if (id === "data" && format?.audioFormat === 1 && format.bitsPerSample === 16) {
      return {
        ...format,
        dataOffset: bodyOffset,
        dataSize: Math.min(size, view.byteLength - bodyOffset),
      };
    }
    offset = bodyOffset + size + (size % 2);
  }
  return null;
}

function getWavFramePeak(view, dataOffset, frame, format) {
  let peak = 0;
  const frameOffset = dataOffset + frame * format.blockAlign;
  for (let channel = 0; channel < format.channels; channel += 1) {
    peak = Math.max(peak, Math.abs(view.getInt16(frameOffset + channel * 2, true)));
  }
  return peak;
}

function fadePcmWavEdges(view, dataOffset, frameCount, format) {
  const fadeFrames = Math.min(Math.floor(format.sampleRate * 0.003), Math.floor(frameCount / 8));
  for (let frame = 0; frame < fadeFrames; frame += 1) {
    const amount = frame / Math.max(1, fadeFrames);
    scaleWavFrame(view, dataOffset, frame, format, amount);
    scaleWavFrame(view, dataOffset, frameCount - 1 - frame, format, amount);
  }
}

function scaleWavFrame(view, dataOffset, frame, format, amount) {
  const frameOffset = dataOffset + frame * format.blockAlign;
  for (let channel = 0; channel < format.channels; channel += 1) {
    const offset = frameOffset + channel * 2;
    view.setInt16(offset, Math.round(view.getInt16(offset, true) * amount), true);
  }
}

function readFourCC(view, offset) {
  if (offset + 4 > view.byteLength) return "";
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

function trimLoopBuffer(buffer, context) {
  const threshold = getLoopTrimThreshold(buffer);
  let start = 0;
  let end = buffer.length - 1;
  while (start < end && getFramePeak(buffer, start) <= threshold) start += 1;
  while (end > start && getFramePeak(buffer, end) <= threshold) end -= 1;

  const guardFrames = Math.floor(buffer.sampleRate * 0.002);
  start = Math.max(0, start - guardFrames);
  end = Math.min(buffer.length - 1, end + guardFrames);
  const length = Math.max(1, end - start + 1);
  const trimmed = context.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel).subarray(start, end + 1);
    const target = trimmed.getChannelData(channel);
    target.set(source);
    softenLoopEdges(target, buffer.sampleRate);
  }
  return trimmed;
}

function getLoopTrimThreshold(buffer) {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    const stride = Math.max(1, Math.floor(data.length / 12000));
    for (let index = 0; index < data.length; index += stride) {
      peak = Math.max(peak, Math.abs(data[index]));
    }
  }
  return Math.max(0.0008, peak * 0.012);
}

function getFramePeak(buffer, frame) {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    peak = Math.max(peak, Math.abs(buffer.getChannelData(channel)[frame]));
  }
  return peak;
}

function softenLoopEdges(data, sampleRate) {
  const fadeFrames = Math.min(Math.floor(sampleRate * 0.003), Math.floor(data.length / 8));
  for (let index = 0; index < fadeFrames; index += 1) {
    const amount = index / Math.max(1, fadeFrames);
    data[index] *= amount;
    data[data.length - 1 - index] *= amount;
  }
}

function getAssignmentAudioUrl(assignment) {
  if (assignment.audioUrl) return assignment.audioUrl;
  const sample = state.samples.find((item) => item.id === assignment.raw);
  if (!sample) return "";
  return getSampleAudioUrl(sample);
}

function makeWavBlobFromBackupSample(sample) {
  if (!state.backupBytes) return null;
  const segments = sample.segments.filter((segment) => segment.usable);
  if (!segments.length) return null;

  const channels = Math.min(2, segments.length);
  const sampleRate = 44100;
  const channelBytes = segments
    .slice(0, channels)
    .map((segment) => state.backupBytes.subarray(segment.dataStart, segment.dataEnd - ((segment.dataEnd - segment.dataStart) % 2)));
  const sampleCount = Math.min(...channelBytes.map((bytes) => Math.floor(bytes.length / 2)));
  if (sampleCount <= 0) return null;

  const gain = getPcmGain(channelBytes, sampleCount, channels);
  const dataSize = sampleCount * channels * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeWavHeader(view, sampleRate, channels, dataSize);

  let writeOffset = 44;
  for (let index = 0; index < sampleCount; index += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const source = channelBytes[channel];
      const sampleValue = readSigned16Le(source, index * 2);
      const scaled = Math.max(-32768, Math.min(32767, Math.round(sampleValue * gain)));
      view.setInt16(writeOffset, scaled, true);
      writeOffset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function getPcmGain(channelBytes, sampleCount, channels) {
  let peak = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      peak = Math.max(peak, Math.abs(readSigned16Le(channelBytes[channel], index * 2)));
    }
  }
  if (peak <= 0) return 1;
  return Math.min(24, 26000 / peak);
}

function readSigned16Le(bytes, offset) {
  const value = bytes[offset] | (bytes[offset + 1] << 8);
  return value >= 0x8000 ? value - 0x10000 : value;
}

function playPreviewTone(rawValue, slot, volume = getKitVolume(), pitchRatio = 1) {
  if (volume <= 0) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    playGeneratedWave(rawValue, slot, volume, pitchRatio);
    return;
  }
  if (!state.audioContext) state.audioContext = new AudioContext();
  const context = state.audioContext;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const frequency = (120 + ((rawValue || slot * 23) % 32) * 18) * pitchRatio;

  oscillator.type = slot < 8 ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * 0.72), now + 0.16);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1600, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.18 * clampVolume(volume)), now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.2);
}

function playGeneratedWave(rawValue, slot, volume = getKitVolume(), pitchRatio = 1) {
  const audio = new Audio(makeToneDataUrl(rawValue, slot, pitchRatio));
  audio.volume = clampVolume(volume);
  state.activeAudios.push(audio);
  audio.addEventListener("ended", () => {
    state.activeAudios = state.activeAudios.filter((item) => item !== audio);
  });
  audio.play().catch(() => {});
}

function makeToneDataUrl(rawValue, slot, pitchRatio = 1) {
  const sampleRate = 22050;
  const duration = 0.18;
  const sampleCount = Math.floor(sampleRate * duration);
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const frequency = (120 + ((rawValue || slot * 23) % 32) * 18) * pitchRatio;

  writeWavHeader(view, sampleRate, 1, dataSize);

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.max(0, 1 - t / duration);
    const wave = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.26;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, wave)) * 0x7fff, true);
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeWavHeader(view, sampleRate, channels, dataSize) {
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
}

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function pulsePad(padId) {
  const button = els.padLayout.querySelector(`[data-pad="${padId}"]`);
  if (!button) return;
  button.classList.remove("playing");
  requestAnimationFrame(() => {
    button.classList.add("playing");
    window.setTimeout(() => button.classList.remove("playing"), 170);
  });
}

function exportCurrentKitMap() {
  const kit = state.kits[state.selectedKit];
  if (!kit) return;

  const padMap = padLayout.map((pad) => {
    const assignment = kit.assignments[pad.slot];
    return {
      pad: pad.id,
      sound: getAssignmentLabel(assignment),
      rawAssignment: assignment.raw,
      sourceOffset: `0x${assignment.offset.toString(16)}`,
    };
  });

  const payload = {
    file: state.fileName,
    exportedAt: new Date().toISOString(),
    kitNumber: kit.number,
    kitName: kit.name,
    kitSubName: kit.subName,
    volume: kit.volume,
    tempo: kit.tempo,
    padLinks: [kit.padLinkA, kit.padLinkB],
    pads: padMap,
  };

  downloadJson(payload, `handsonic-kit-${String(kit.number).padStart(3, "0")}.json`);
}

function downloadJson(payload, fileName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function splitEmbeddedSnapshot(bytes) {
  const markerBytes = asciiBytes(APP_SNAPSHOT_MARKER);
  const footerSize = markerBytes.length + 4;
  if (bytes.length <= footerSize) return { bytes, snapshot: null };

  const markerStart = bytes.length - markerBytes.length;
  for (let index = 0; index < markerBytes.length; index += 1) {
    if (bytes[markerStart + index] !== markerBytes[index]) return { bytes, snapshot: null };
  }

  const lengthOffset = markerStart - 4;
  const payloadLength = (
    (bytes[lengthOffset] << 24)
    | (bytes[lengthOffset + 1] << 16)
    | (bytes[lengthOffset + 2] << 8)
    | bytes[lengthOffset + 3]
  ) >>> 0;
  const payloadStart = lengthOffset - payloadLength;
  if (payloadStart < 0 || payloadLength > bytes.length - footerSize) return { bytes, snapshot: null };

  try {
    const snapshotText = new TextDecoder().decode(bytes.subarray(payloadStart, lengthOffset));
    return {
      bytes: bytes.slice(0, payloadStart),
      snapshot: JSON.parse(snapshotText),
    };
  } catch (error) {
    return { bytes, snapshot: null };
  }
}

function appendEmbeddedSnapshot(bytes, snapshot) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const markerBytes = asciiBytes(APP_SNAPSHOT_MARKER);
  const output = new Uint8Array(bytes.length + payloadBytes.length + 4 + markerBytes.length);
  output.set(bytes, 0);
  output.set(payloadBytes, bytes.length);
  const lengthOffset = bytes.length + payloadBytes.length;
  output[lengthOffset] = (payloadBytes.length >>> 24) & 0xff;
  output[lengthOffset + 1] = (payloadBytes.length >>> 16) & 0xff;
  output[lengthOffset + 2] = (payloadBytes.length >>> 8) & 0xff;
  output[lengthOffset + 3] = payloadBytes.length & 0xff;
  output.set(markerBytes, lengthOffset + 4);
  return output;
}

function asciiBytes(value) {
  return Uint8Array.from(String(value), (char) => char.charCodeAt(0) & 0xff);
}

function saveRolandBackup() {
  if (!state.backupBytes?.length || readAscii(state.backupBytes, 0, 6) !== "HPD-20") {
    els.decodeStatus.textContent = "Open an HPD-20 backup before saving a Roland backup";
    return;
  }

  const output = new Uint8Array(state.backupBytes);
  let skippedImportedAssignments = 0;
  let renamedKits = 0;

  for (let index = 0; index < KIT_COUNT; index += 1) {
    const destination = KIT_START + index * KIT_STRIDE;
    if (destination + KIT_STRIDE > output.length) break;
    const kit = state.kits[index];
    if (kit?.recordOffset >= KIT_START && kit.recordOffset + KIT_STRIDE <= state.backupBytes.length) {
      output.set(state.backupBytes.subarray(kit.recordOffset, kit.recordOffset + KIT_STRIDE), destination);
    }

    writeKitName(output, destination, kit?.name || "User Kit");
    if (kit) renamedKits += 1;

    assignmentOffsets.forEach((recordOffset, slot) => {
      const assignment = kit?.assignments?.[slot];
      if (!assignment) {
        writeUInt16Be(output, destination + recordOffset, 0);
        return;
      }
      const sample = state.samples.find((item) => item.id === assignment.raw);
      if (sample?.imported) {
        skippedImportedAssignments += 1;
        return;
      }
      writeUInt16Be(output, destination + recordOffset, assignment.raw);
    });
  }

  const extension = /\.hso$/i.test(state.fileName) ? ".HSO" : ".HS0";
  const stem = (state.fileName || "HANDSONIC-BACKUP").replace(/\.(hs0|hso)$/i, "");
  const savedBytes = appendEmbeddedSnapshot(output, createProjectSnapshot());
  downloadBlob(new Blob([savedBytes], { type: "application/octet-stream" }), `${stem}-edited${extension}`);
  els.decodeStatus.textContent = skippedImportedAssignments
    ? `Backup saved / ${skippedImportedAssignments} imported wave assignments restored when reopened in this app`
    : `Backup saved / ${renamedKits} kit slots written`;
}

function writeKitName(bytes, recordOffset, name) {
  const offset = recordOffset + KIT_NAME_OFFSET;
  const safe = String(name || "User Kit").replace(/[^\x20-\x7e]/g, " ").slice(0, KIT_NAME_LENGTH);
  for (let index = 0; index < KIT_NAME_LENGTH; index += 1) {
    bytes[offset + index] = index < safe.length ? safe.charCodeAt(index) : 0x20;
  }
}

function writeUInt16Be(bytes, offset, value) {
  const safe = Math.max(0, Math.min(0xffff, Number(value) || 0));
  bytes[offset] = safe >> 8;
  bytes[offset + 1] = safe & 0xff;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

renderPads();
