const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");
const mapViewport = document.getElementById("mapViewport");

const NUM_COLUMNS = 31;
const NUM_ROWS = 23;
const MAP_OFFSET = 10000;
const MAP_NAMES = ["Korstian Division", "Durham Division"];
const ZOOM_LEVELS = [1, 1.35, 1.7];

let activeMap = 0;
let zoomIndex = 0;
let isSaving = false;
let availabilityLoaded = false;
let resizeFrame = null;
let loadRequest = 0;
let hunterProfiles = null;
let researchSpots = new Set();
let hunterSpots = new Set();
const selectedSpots = new Set();

const mapImages = [new Image(), new Image()];
mapImages[0].src = "../Images/KorstianMap(1).jpg";
mapImages[1].src = "../Images/KorstianMap(2).jpg";

const reserveButton = document.getElementById("reserveCell");
const clearButton = document.getElementById("clearReserve");
const refreshButton = document.getElementById("refreshMap");
const zoomInButton = document.getElementById("zoomIn");
const zoomOutButton = document.getElementById("zoomOut");
const mapTitle = document.getElementById("mapTitle");
const mapStatus = document.getElementById("mapStatus");
const selectionCard = document.querySelector(".selection-card");
const selectionTitle = document.getElementById("selectionTitle");
const selectionDetail = document.getElementById("selectionDetail");
const reserveStatus = document.getElementById("reserveStatus");
const lastUpdated = document.getElementById("lastUpdated");
const divisionTabs = [...document.querySelectorAll(".division-tab")];
const hunterMessage = document.getElementById("hunterMessage");
const noticeState = document.getElementById("noticeState");
const messageStatus = document.getElementById("messageStatus");

function spotForCell(column, row, mapIndex = activeMap) {
    return column + row * NUM_COLUMNS + mapIndex * MAP_OFFSET;
}

function cellForSpot(spot) {
    const mapIndex = spot >= MAP_OFFSET ? 1 : 0;
    const localSpot = spot - mapIndex * MAP_OFFSET;
    return {
        mapIndex,
        column: localSpot % NUM_COLUMNS,
        row: Math.floor(localSpot / NUM_COLUMNS)
    };
}

function cellLabel(spot, includeDivision = false) {
    const cell = cellForSpot(spot);
    const rowName = String.fromCharCode(65 + cell.row);
    const location = `Row ${rowName}, Column ${cell.column + 1}`;
    return includeDivision ? `${MAP_NAMES[cell.mapIndex]} - ${location}` : location;
}

function selectedDate() {
    return window.researchDate.get();
}

function dateDocument(owner, date = selectedDate()) {
    return db
        .collection("reserved")
        .doc(owner)
        .collection("dates")
        .doc(date);
}

function hunterMessageDocument() {
    return db
        .collection("reserved")
        .doc("researchers")
        .collection("messages")
        .doc("hunters");
}

function cellsFromSnapshot(snapshot) {
    const cells = snapshot.data()?.cells;
    return Array.isArray(cells)
        ? cells.filter((cell) => Number.isInteger(cell) && cell >= 0)
        : [];
}

function numberFrom(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateLabel(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Intl.DateTimeFormat([], {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric"
    }).format(new Date(year, month - 1, day, 12));
}

function setMapStatus(message, tone = "") {
    mapStatus.textContent = message;
    mapStatus.classList.toggle("is-warning", tone === "warning");
    mapStatus.classList.toggle("is-success", tone === "success");
}

function setReserveStatus(message = "", tone = "") {
    reserveStatus.textContent = message;
    reserveStatus.classList.toggle("is-success", tone === "success");
}

function cellStatus(spot) {
    if (researchSpots.has(spot)) return "research";
    if (hunterSpots.has(spot)) return "hunter";
    if (selectedSpots.has(spot)) return "selected";
    return "available";
}

function resizeCanvas() {
    const oldCenterX = mapViewport.scrollWidth
        ? (mapViewport.scrollLeft + mapViewport.clientWidth / 2) / mapViewport.scrollWidth
        : 0.5;
    const oldCenterY = mapViewport.scrollHeight
        ? (mapViewport.scrollTop + mapViewport.clientHeight / 2) / mapViewport.scrollHeight
        : 0.5;

    const viewportWidth = Math.max(1, mapViewport.clientWidth);
    const viewportHeight = Math.max(1, mapViewport.clientHeight);
    const mapRatio = NUM_COLUMNS / NUM_ROWS;
    const baseWidth = Math.min(viewportWidth, viewportHeight * mapRatio);
    const baseHeight = baseWidth / mapRatio;
    const zoom = ZOOM_LEVELS[zoomIndex];
    const cssWidth = baseWidth * zoom;
    const cssHeight = baseHeight * zoom;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.style.margin = zoomIndex === 0 ? "auto" : "0";
    canvas.width = Math.round(cssWidth * pixelRatio);
    canvas.height = Math.round(cssHeight * pixelRatio);
    drawMap();

    requestAnimationFrame(() => {
        mapViewport.scrollLeft = oldCenterX * mapViewport.scrollWidth - mapViewport.clientWidth / 2;
        mapViewport.scrollTop = oldCenterY * mapViewport.scrollHeight - mapViewport.clientHeight / 2;
    });
}

function scheduleCanvasResize() {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        resizeCanvas();
    });
}

function fillCell(column, row, color) {
    const cellWidth = canvas.width / NUM_COLUMNS;
    const cellHeight = canvas.height / NUM_ROWS;
    ctx.fillStyle = color;
    ctx.fillRect(column * cellWidth, row * cellHeight, cellWidth, cellHeight);
}

function hatchCell(column, row) {
    const cellWidth = canvas.width / NUM_COLUMNS;
    const cellHeight = canvas.height / NUM_ROWS;
    const left = column * cellWidth;
    const top = row * cellHeight;
    const spacing = Math.max(8, canvas.width / 150);

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, cellWidth, cellHeight);
    ctx.clip();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = Math.max(2, canvas.width / 600);
    for (let offset = -cellHeight; offset < cellWidth + cellHeight; offset += spacing) {
        ctx.beginPath();
        ctx.moveTo(left + offset, top + cellHeight);
        ctx.lineTo(left + offset + cellHeight, top);
        ctx.stroke();
    }
    ctx.restore();
}

function drawMap() {
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#dfe6e1";
    ctx.fillRect(0, 0, width, height);

    const image = mapImages[activeMap];
    if (image.complete && image.naturalWidth > 0) {
        ctx.drawImage(image, 0, 0, width, height);
    }

    for (let row = 0; row < NUM_ROWS; row += 1) {
        for (let column = 0; column < NUM_COLUMNS; column += 1) {
            const spot = spotForCell(column, row);
            const status = cellStatus(spot);
            if (status === "research") {
                fillCell(column, row, "rgba(181, 46, 59, 0.76)");
                hatchCell(column, row);
            } else if (status === "hunter") {
                fillCell(column, row, "rgba(57, 70, 79, 0.78)");
            } else if (status === "selected") {
                fillCell(column, row, "rgba(240, 163, 35, 0.38)");
            }
        }
    }

    const cellWidth = width / NUM_COLUMNS;
    const cellHeight = height / NUM_ROWS;
    ctx.beginPath();
    for (let column = 0; column <= NUM_COLUMNS; column += 1) {
        const x = Math.round(column * cellWidth) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    for (let row = 0; row <= NUM_ROWS; row += 1) {
        const y = Math.round(row * cellHeight) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.strokeStyle = "rgba(17, 31, 26, 0.62)";
    ctx.lineWidth = Math.max(1, width / 1500);
    ctx.stroke();

    ctx.strokeStyle = "#f0a323";
    ctx.lineWidth = Math.max(4, width / 280);
    const inset = Math.max(2, width / 900);
    selectedSpots.forEach((spot) => {
        if (cellForSpot(spot).mapIndex !== activeMap) return;
        const { column, row } = cellForSpot(spot);
        ctx.strokeRect(
            column * cellWidth + inset,
            row * cellHeight + inset,
            cellWidth - inset * 2,
            cellHeight - inset * 2
        );
    });
}

function updateSelectionPanel() {
    const count = selectedSpots.size;
    const canSave = count > 0 && !isSaving;
    selectionCard.classList.toggle("has-selection", count > 0);
    reserveButton.disabled = !canSave;
    clearButton.disabled = count === 0 || isSaving;

    if (count === 0) {
        selectionTitle.textContent = "No cells selected";
        selectionDetail.textContent = "Tap one or more available squares.";
        reserveButton.textContent = "Select cells first";
        return;
    }

    const visibleSelections = [...selectedSpots].filter(
        (spot) => cellForSpot(spot).mapIndex === activeMap
    );
    selectionTitle.textContent = `${count} ${count === 1 ? "cell" : "cells"} selected`;
    selectionDetail.textContent = count === 1
        ? cellLabel([...selectedSpots][0], true)
        : `${visibleSelections.length} on ${MAP_NAMES[activeMap]}; ${count} total`;
    reserveButton.textContent = isSaving
        ? "Saving reservations..."
        : `Reserve ${count} ${count === 1 ? "cell" : "cells"}`;
}

function updateDivisionUI() {
    mapTitle.textContent = MAP_NAMES[activeMap];
    divisionTabs.forEach((tab) => {
        const isActive = Number(tab.dataset.map) === activeMap;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-pressed", String(isActive));
    });
}

function updateZoomUI() {
    zoomOutButton.disabled = zoomIndex === 0;
    zoomInButton.disabled = zoomIndex === ZOOM_LEVELS.length - 1;
}

function updateInterface() {
    updateDivisionUI();
    updateSelectionPanel();
    updateZoomUI();
    drawMap();
}

function clearSelection() {
    selectedSpots.clear();
    setReserveStatus();
    updateInterface();
}

function selectCanvasCell(event) {
    if (isSaving || !availabilityLoaded) return;

    const rect = canvas.getBoundingClientRect();
    const column = Math.floor((event.clientX - rect.left) / rect.width * NUM_COLUMNS);
    const row = Math.floor((event.clientY - rect.top) / rect.height * NUM_ROWS);
    if (column < 0 || column >= NUM_COLUMNS || row < 0 || row >= NUM_ROWS) return;

    const spot = spotForCell(column, row);
    const status = cellStatus(spot);
    setReserveStatus();

    if (status === "selected") {
        selectedSpots.delete(spot);
        setMapStatus(`${cellLabel(spot)} removed from the selection.`);
    } else if (status === "available") {
        selectedSpots.add(spot);
        setMapStatus(`${cellLabel(spot)} selected. You may select more cells or reserve now.`);
    } else {
        const message = status === "research"
            ? "That cell is already reserved for research."
            : "A hunter has already reserved that cell.";
        setMapStatus(`${message} Choose an available cell.`, "warning");
    }

    updateInterface();
}

async function loadHunterProfiles() {
    if (hunterProfiles) return hunterProfiles;

    const snapshot = await db
        .collection("reserved")
        .doc("hunters")
        .collection("hunterID")
        .get();

    hunterProfiles = snapshot.docs;

    let deer = 0;
    let hours = 0;
    hunterProfiles.forEach((profile) => {
        const data = profile.data() || {};
        deer += numberFrom(data.buck) + numberFrom(data.button) + numberFrom(data.doe);
        hours += numberFrom(data.hours);
    });

    document.getElementById("seasonHunters").textContent = String(hunterProfiles.length);
    document.getElementById("seasonDeer").textContent = String(deer);
    document.getElementById("seasonHours").textContent = Number.isInteger(hours)
        ? String(hours)
        : hours.toFixed(1);

    return hunterProfiles;
}

async function loadStatistics(date, requestId) {
    const statsStatus = document.getElementById("statsStatus");
    statsStatus.textContent = "Loading hunter totals...";

    try {
        const profiles = await loadHunterProfiles();
        const dailySnapshots = await Promise.all(
            profiles.map((profile) => profile.ref.collection("dates").doc(date).get())
        );
        if (requestId !== loadRequest) return;

        const activeHunters = dailySnapshots.filter(
            (snapshot) => cellsFromSnapshot(snapshot).length > 0
        ).length;

        document.getElementById("dailyHunters").textContent = String(activeHunters);
        document.getElementById("dailySpots").textContent = String(hunterSpots.size);
        document.getElementById("dailyHunterCount").textContent = String(activeHunters);
        document.getElementById("dailyHunterCount").setAttribute(
            "aria-label",
            `${activeHunters} active ${activeHunters === 1 ? "hunter" : "hunters"}`
        );
        document.getElementById("statsDateLabel").textContent = formatDateLabel(date);
        statsStatus.textContent = "";
    } catch (error) {
        console.error("Could not load hunter statistics:", error);
        statsStatus.textContent = "Hunter totals could not be loaded with the current connection or permissions.";
    }
}

async function loadHunterMessage() {
    try {
        const snapshot = await hunterMessageDocument().get();
        const data = snapshot.data() || {};
        const text = typeof data.text === "string" ? data.text : "";
        const active = Boolean(data.active && text.trim());
        hunterMessage.value = active ? text : "";
        noticeState.textContent = active ? "Active" : "None";
        noticeState.classList.toggle("is-active", active);
    } catch (error) {
        console.error("Could not load the hunter message:", error);
        messageStatus.textContent = "The current message could not be loaded.";
    }
}

async function refreshData(userRequested = false) {
    const date = selectedDate();
    const requestId = ++loadRequest;
    availabilityLoaded = false;
    selectedSpots.clear();
    refreshButton.disabled = true;
    setReserveStatus();
    setMapStatus(
        userRequested
            ? `Refreshing ${formatDateLabel(date)}...`
            : `Loading ${formatDateLabel(date)}...`
    );
    updateInterface();

    try {
        const [researchSnapshot, hunterSnapshot] = await Promise.all([
            dateDocument("researchers", date).get(),
            dateDocument("hunters", date).get()
        ]);
        if (requestId !== loadRequest) return;

        researchSpots = new Set(cellsFromSnapshot(researchSnapshot));
        hunterSpots = new Set(cellsFromSnapshot(hunterSnapshot));
        availabilityLoaded = true;

        const refreshedAt = new Date();
        lastUpdated.textContent = `Last refreshed ${refreshedAt.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit"
        })}`;
        setMapStatus(
            `Showing ${formatDateLabel(date)}. Tap available cells to build a research reservation.`
        );
        updateInterface();
        await loadStatistics(date, requestId);
    } catch (error) {
        if (requestId !== loadRequest) return;
        console.error("Could not load reservation availability:", error);
        setMapStatus(
            "Availability could not be loaded. Check the connection and try Refresh.",
            "warning"
        );
    } finally {
        if (requestId === loadRequest) refreshButton.disabled = false;
    }
}

async function reserveSelectedCells() {
    if (selectedSpots.size === 0 || isSaving || !availabilityLoaded) return;

    const date = selectedDate();
    const spotsToReserve = [...selectedSpots];
    const researchRef = dateDocument("researchers", date);
    const hunterRef = dateDocument("hunters", date);
    isSaving = true;
    setReserveStatus("Checking availability and saving...");
    updateSelectionPanel();

    try {
        await db.runTransaction(async (transaction) => {
            const researchSnapshot = await transaction.get(researchRef);
            const hunterSnapshot = await transaction.get(hunterRef);
            const currentResearch = new Set(cellsFromSnapshot(researchSnapshot));
            const currentHunters = new Set(cellsFromSnapshot(hunterSnapshot));
            const conflict = spotsToReserve.find(
                (spot) => currentResearch.has(spot) || currentHunters.has(spot)
            );

            if (conflict !== undefined) {
                const error = new Error(`${cellLabel(conflict, true)} was just reserved.`);
                error.code = "cell-unavailable";
                throw error;
            }

            transaction.set(researchRef, {
                cells: firebase.firestore.FieldValue.arrayUnion(...spotsToReserve)
            }, { merge: true });
        });

        selectedSpots.clear();
        await refreshData(false);
        setMapStatus(
            `${spotsToReserve.length} research ${spotsToReserve.length === 1 ? "cell is" : "cells are"} reserved for ${formatDateLabel(date)}.`,
            "success"
        );
        setReserveStatus("Research reservation saved.", "success");
    } catch (error) {
        console.error("Could not reserve research cells:", error);
        if (error.code === "cell-unavailable") {
            selectedSpots.clear();
            await refreshData(false);
            setMapStatus(`${error.message} The map has been refreshed.`, "warning");
            setReserveStatus("Choose another available cell.");
        } else {
            setReserveStatus("Nothing was saved. Check the connection and try again.");
        }
    } finally {
        isSaving = false;
        updateInterface();
    }
}

async function publishHunterMessage() {
    const text = hunterMessage.value.trim();
    if (!text) {
        messageStatus.textContent = "Type a message before publishing.";
        hunterMessage.focus();
        return;
    }

    document.getElementById("publishMessage").disabled = true;
    messageStatus.textContent = "Publishing...";
    try {
        await hunterMessageDocument().set({
            text,
            active: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        noticeState.textContent = "Active";
        noticeState.classList.add("is-active");
        messageStatus.textContent = "Message published to all hunter reservation screens.";
    } catch (error) {
        console.error("Could not publish the hunter message:", error);
        messageStatus.textContent = "The message was not published. Check the connection and try again.";
    } finally {
        document.getElementById("publishMessage").disabled = false;
    }
}

async function clearHunterMessage() {
    document.getElementById("clearMessage").disabled = true;
    messageStatus.textContent = "Clearing...";
    try {
        await hunterMessageDocument().set({
            text: "",
            active: false,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        hunterMessage.value = "";
        noticeState.textContent = "None";
        noticeState.classList.remove("is-active");
        messageStatus.textContent = "The hunter message has been cleared.";
    } catch (error) {
        console.error("Could not clear the hunter message:", error);
        messageStatus.textContent = "The message could not be cleared. Check the connection and try again.";
    } finally {
        document.getElementById("clearMessage").disabled = false;
    }
}

function changeMap(nextMap) {
    if (nextMap === activeMap) return;
    activeMap = nextMap;
    mapViewport.scrollTo({ top: 0, left: 0 });
    setMapStatus(`Showing ${MAP_NAMES[activeMap]}. Tap available cells.`);
    updateInterface();
}

function changeZoom(direction) {
    const nextIndex = Math.min(
        ZOOM_LEVELS.length - 1,
        Math.max(0, zoomIndex + direction)
    );
    if (nextIndex === zoomIndex) return;
    zoomIndex = nextIndex;
    updateZoomUI();
    resizeCanvas();
}

function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
}

canvas.addEventListener("click", selectCanvasCell);
reserveButton.addEventListener("click", reserveSelectedCells);
clearButton.addEventListener("click", () => {
    clearSelection();
    setMapStatus("Selection cleared. Tap available cells.");
});
refreshButton.addEventListener("click", () => {
    hunterProfiles = null;
    refreshData(true);
    loadHunterMessage();
});
zoomInButton.addEventListener("click", () => changeZoom(1));
zoomOutButton.addEventListener("click", () => changeZoom(-1));

divisionTabs.forEach((tab) => {
    tab.addEventListener("click", () => changeMap(Number(tab.dataset.map)));
});

document.getElementById("noticeButton").addEventListener("click", () => {
    messageStatus.textContent = "";
    openDialog(document.getElementById("noticeDialog"));
});
document.getElementById("statsButton").addEventListener("click", () => {
    openDialog(document.getElementById("statsDialog"));
});
document.getElementById("helpButton").addEventListener("click", () => {
    openDialog(document.getElementById("helpDialog"));
});
document.getElementById("publishMessage").addEventListener("click", publishHunterMessage);
document.getElementById("clearMessage").addEventListener("click", clearHunterMessage);

document.addEventListener("research-date-change", () => refreshData(false));
mapImages.forEach((image) => image.addEventListener("load", drawMap));
window.addEventListener("resize", scheduleCanvasResize);

if (typeof ResizeObserver === "function") {
    new ResizeObserver(scheduleCanvasResize).observe(mapViewport);
}

updateInterface();
scheduleCanvasResize();
refreshData(false);
loadHunterMessage();
