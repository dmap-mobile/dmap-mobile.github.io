const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");
const mapViewport = document.getElementById("mapViewport");

const NUM_COLUMNS = 31;
const NUM_ROWS = 23;
const MAP_OFFSET = 10000;
const MAP_NAMES = ["Korstian Division", "Durham Division"];
const ZOOM_LEVELS = [1, 1.35, 1.7];

let activeMap = 0;
let selectedSpot = -1;
let zoomIndex = 0;
let isReserving = false;
let resizeFrame = null;
let researchSpotIndex = new Set();
let hunterSpotIndex = new Set();
let thisHunterSpotIndex = new Set();

const mapImages = [new Image(), new Image()];
mapImages[0].src = "../Images/KorstianMap(1).jpg";
mapImages[1].src = "../Images/KorstianMap(2).jpg";

const reserveButton = document.getElementById("reserveCell");
const cancelButton = document.getElementById("cancelCell");
const refreshButton = document.getElementById("refreshMap");
const zoomInButton = document.getElementById("zoomIn");
const zoomOutButton = document.getElementById("zoomOut");
const mapTitle = document.getElementById("mapTitle");
const mapStatus = document.getElementById("mapStatus");
const selectionCard = document.querySelector(".selection-card") || document.querySelector(".action-panel");
const selectionTitle = document.getElementById("selectionTitle");
const selectionDetail = document.getElementById("selectionDetail");
const reserveStatus = document.getElementById("reserveStatus");
const lastUpdated = document.getElementById("lastUpdated");
const researchNotice = document.getElementById("researchNotice");
const researchNoticePreview = document.getElementById("researchNoticePreview");
const researchNoticeText = document.getElementById("researchNoticeText");
const divisionTabs = [...document.querySelectorAll(".division-tab")];

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
    return includeDivision ? `${MAP_NAMES[cell.mapIndex]} — ${location}` : location;
}

function rebuildAvailabilityIndex() {
    researchSpotIndex = new Set(reservedSpots);
    hunterSpotIndex = new Set(hunterSpots);
    thisHunterSpotIndex = new Set(thisHunterSpots);
}

function spotStatus(spot) {
    if (researchSpotIndex.has(spot)) return "research";
    if (thisHunterSpotIndex.has(spot)) return "yours";
    if (hunterSpotIndex.has(spot)) return "hunter";
    return "available";
}

function selectionIsValid() {
    return selectedSpot >= 0 && spotStatus(selectedSpot) === "available";
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

async function loadResearchNotice() {
    const noticeRef = db
        .collection("reserved")
        .doc("researchers")
        .collection("messages")
        .doc("hunters");
    const snapshot = await noticeRef.get();
    const data = snapshot.data() || {};
    const text = typeof data.text === "string" ? data.text.trim() : "";
    const active = Boolean(data.active && text);

    if (researchNotice) researchNotice.hidden = !active;
    if (researchNoticePreview) researchNoticePreview.textContent = active ? text : "";
    if (researchNoticeText) researchNoticeText.textContent = active ? text : "";
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

function hatchResearchCell(column, row) {
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

function drawReservationOverlay(spot, status) {
    const { column, row } = cellForSpot(spot);
    if (status === "research") {
        fillCell(column, row, "rgba(181, 46, 59, 0.76)");
        hatchResearchCell(column, row);
    } else if (status === "hunter") {
        fillCell(column, row, "rgba(57, 70, 79, 0.78)");
    } else if (status === "yours") {
        fillCell(column, row, "rgba(18, 102, 122, 0.82)");
        const cellWidth = canvas.width / NUM_COLUMNS;
        const cellHeight = canvas.height / NUM_ROWS;
        const inset = Math.max(3, canvas.width / 500);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.lineWidth = Math.max(2, canvas.width / 700);
        ctx.strokeRect(
            column * cellWidth + inset,
            row * cellHeight + inset,
            cellWidth - inset * 2,
            cellHeight - inset * 2
        );
    }
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
            const status = spotStatus(spot);
            if (status !== "available") drawReservationOverlay(spot, status);
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

    if (selectionIsValid()) {
        const { column, row } = cellForSpot(selectedSpot);
        fillCell(column, row, "rgba(240, 163, 35, 0.35)");
        const inset = Math.max(2, width / 900);
        ctx.strokeStyle = "#f0a323";
        ctx.lineWidth = Math.max(5, width / 260);
        ctx.strokeRect(
            column * cellWidth + inset,
            row * cellHeight + inset,
            cellWidth - inset * 2,
            cellHeight - inset * 2
        );
    }
}

function updateSelectionPanel() {
    const valid = selectionIsValid();
    if (selectionCard) selectionCard.classList.toggle("has-selection", valid);
    if (reserveButton) reserveButton.disabled = !valid || isReserving;
    if (cancelButton) cancelButton.disabled = !valid || isReserving;

    if (valid) {
        selectionTitle.textContent = cellLabel(selectedSpot);
        selectionDetail.textContent = MAP_NAMES[activeMap];
        reserveButton.textContent = isReserving ? "Saving reservation…" : `Reserve ${cellLabel(selectedSpot)}`;
    } else {
        selectionTitle.textContent = "No spot selected";
        selectionDetail.textContent = "Tap an available square on the map.";
        reserveButton.textContent = "Select a spot first";
    }
}

function updateTodayReservations() {
    const count = thisHunterSpots.length;
    const reservationCount = document.getElementById("reservationCount");
    reservationCount.textContent = String(count);
    reservationCount.setAttribute(
        "aria-label",
        `${count} ${count === 1 ? "spot" : "spots"} reserved`
    );
    document.getElementById("dialogReservationCount").textContent = String(count);
    document.getElementById("todayReservations").textContent = count
        ? thisHunterSpots.map((spot) => cellLabel(spot, true)).join("; ")
        : "No spots reserved yet.";
}

function updateStats() {
    document.getElementById("deerCount").textContent = String(buck + button + doe);
    document.getElementById("hoursCount").textContent = Number.isInteger(hours)
        ? String(hours)
        : hours.toFixed(1);
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
    if (zoomOutButton) zoomOutButton.disabled = zoomIndex === 0;
    if (zoomInButton) zoomInButton.disabled = zoomIndex === ZOOM_LEVELS.length - 1;
}

function updateInterface() {
    updateDivisionUI();
    updateSelectionPanel();
    updateTodayReservations();
    updateStats();
    updateZoomUI();
    drawMap();
}

function clearSelection(clearMessage = true) {
    selectedSpot = -1;
    if (clearMessage) setReserveStatus();
    updateInterface();
}

function selectCanvasCell(event) {
    if (isReserving || !availabilityLoaded) return;

    const rect = canvas.getBoundingClientRect();
    const column = Math.floor((event.clientX - rect.left) / rect.width * NUM_COLUMNS);
    const row = Math.floor((event.clientY - rect.top) / rect.height * NUM_ROWS);
    if (column < 0 || column >= NUM_COLUMNS || row < 0 || row >= NUM_ROWS) return;

    const spot = spotForCell(column, row);
    const status = spotStatus(spot);
    setReserveStatus();

    if (status === "available") {
        selectedSpot = spot;
        setMapStatus(`${cellLabel(spot)} selected. Review it in the panel, then reserve it.`);
    } else {
        selectedSpot = -1;
        const messages = {
            research: "That square is reserved for research. Choose an uncolored square.",
            hunter: "Another hunter has already reserved that square. Choose another one.",
            yours: "You have already reserved that square today."
        };
        setMapStatus(messages[status], "warning");
    }

    updateInterface();
}

async function refreshAvailability(userRequested = false) {
    if (refreshButton) refreshButton.disabled = true;
    setMapStatus(userRequested ? "Refreshing availability…" : "Loading today’s availability…");

    try {
        await pullReserveSpots();
        try {
            await loadResearchNotice();
        } catch (noticeError) {
            console.warn("Could not refresh the research notice:", noticeError);
        }
        rebuildAvailabilityIndex();
        if (selectedSpot >= 0 && spotStatus(selectedSpot) !== "available") selectedSpot = -1;
        const refreshedAt = new Date();
        if (lastUpdated) lastUpdated.textContent = `Last refreshed ${refreshedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
        setMapStatus("Tap an available square on the map. Colored squares cannot be selected.");
        updateInterface();
    } catch (error) {
        console.error("Could not refresh reservation availability:", error);
        setMapStatus("Availability could not be loaded. Check the connection and try Refresh.", "warning");
        setReserveStatus("No reservation was changed.");
    } finally {
        if (refreshButton) refreshButton.disabled = false;
    }
}

async function reserveSelectedSpot() {
    if (!selectionIsValid() || isReserving) return;

    const spotToReserve = selectedSpot;
    isReserving = true;
    setReserveStatus("Saving your reservation…");
    updateSelectionPanel();

    try {
        await reserveHunterCell(spotToReserve);
        await pullReserveSpots();
        rebuildAvailabilityIndex();
        selectedSpot = -1;
        setMapStatus(`${cellLabel(spotToReserve, true)} is reserved for you.`, "success");
        setReserveStatus("Reservation saved.", "success");
    } catch (error) {
        console.error("Could not reserve cell:", error);
        if (error.code === "cell-unavailable" || error.message?.includes("just reserved")) {
            await refreshAvailability(false);
            selectedSpot = -1;
            setMapStatus("That square was just taken. The map has been refreshed.", "warning");
            setReserveStatus("Please choose another available square.");
        } else {
            setReserveStatus("The reservation was not saved. Check the connection and try again.");
        }
    } finally {
        isReserving = false;
        updateInterface();
    }
}

function changeMap(nextMap) {
    if (nextMap === activeMap) return;
    activeMap = nextMap;
    selectedSpot = -1;
    setReserveStatus();
    setMapStatus(`Showing ${MAP_NAMES[activeMap]}. Tap an available square.`);
    mapViewport.scrollTo({ top: 0, left: 0 });
    updateInterface();
}

function changeZoom(direction) {
    const nextIndex = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, zoomIndex + direction));
    if (nextIndex === zoomIndex) return;
    zoomIndex = nextIndex;
    updateZoomUI();
    resizeCanvas();
}

function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
}

if (canvas) canvas.addEventListener("click", selectCanvasCell);
if (reserveButton) reserveButton.addEventListener("click", reserveSelectedSpot);
if (cancelButton) {
    cancelButton.addEventListener("click", () => {
        clearSelection();
        setMapStatus("Selection cleared. Tap an available square.");
    });
}

if (refreshButton) refreshButton.addEventListener("click", () => refreshAvailability(true));
if (zoomInButton) zoomInButton.addEventListener("click", () => changeZoom(1));
if (zoomOutButton) zoomOutButton.addEventListener("click", () => changeZoom(-1));

if (divisionTabs) {
    divisionTabs.forEach((tab) => {
        tab.addEventListener("click", () => changeMap(Number(tab.dataset.map)));
    });
}

const helpBtn = document.getElementById("helpButton");
if (helpBtn) {
    helpBtn.addEventListener("click", () => {
        openDialog(document.getElementById("helpDialog"));
    });
}

const todayBtn = document.getElementById("todayButton");
if (todayBtn) {
    todayBtn.addEventListener("click", () => {
        openDialog(document.getElementById("todayDialog"));
    });
}

if (researchNotice) {
    researchNotice.addEventListener("click", () => {
        openDialog(document.getElementById("researchNoticeDialog"));
    });
}

const logoutBtn = document.getElementById("logout");
if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        openDialog(document.getElementById("logoutDialog"));
    });
}

const confirmLogoutBtn = document.getElementById("confirmLogout");
if (confirmLogoutBtn) {
    confirmLogoutBtn.addEventListener("click", () => {
        sessionStorage.removeItem("hunterId");
        sessionStorage.removeItem("hunterID");
        loggedIn = false;
        hID = null;
        window.location.href = "../index.html";
    });
}

mapImages.forEach((image) => image.addEventListener("load", drawMap));
window.addEventListener("resize", scheduleCanvasResize);
document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !isReserving) refreshAvailability(false);
});

if (typeof ResizeObserver === "function") {
    new ResizeObserver(scheduleCanvasResize).observe(mapViewport);
}

const hunterLabel = document.getElementById("hunterLabel");
if (hunterLabel) {
    hunterLabel.textContent = `Hunter #${sessionStorage.getItem("hunterID")}`;
}
rebuildAvailabilityIndex();
updateInterface();
scheduleCanvasResize();
refreshAvailability(false);

// Keep a shared tablet reasonably current without making a network request every few seconds.
setInterval(() => {
    if (!document.hidden && !isReserving) refreshAvailability(false);
}, 2 * 60 * 1000);
