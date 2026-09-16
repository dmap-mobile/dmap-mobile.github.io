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
let refreshRequest = 0;
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
const researchNoticeUpdated = document.getElementById("researchNoticeUpdated");
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
    if (!mapStatus) return;
    mapStatus.textContent = message;
    mapStatus.classList.toggle("is-warning", tone === "warning");
    mapStatus.classList.toggle("is-success", tone === "success");
}

function setReserveStatus(message = "", tone = "") {
    if (!reserveStatus) return;
    reserveStatus.textContent = message;
    reserveStatus.classList.toggle("is-success", tone === "success");
}

function formatNoticeTime(timestamp) {
    if (!timestamp) return "";
    try {
        const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
        if (Number.isNaN(date.getTime())) return "";
        return `Updated ${date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
    } catch (error) {
        return "";
    }
}

async function loadResearchNotice() {
    const notice = await getHunterNotice();
    if (researchNotice) researchNotice.hidden = !notice.active;
    if (researchNoticePreview) researchNoticePreview.textContent = notice.active ? notice.text : "";
    if (researchNoticeText) researchNoticeText.textContent = notice.active ? notice.text : "";
    if (researchNoticeUpdated) researchNoticeUpdated.textContent = formatNoticeTime(notice.updatedAt);
}

function updateMapViewportSize() {
    if (!mapViewport) return;

    const width = Math.max(1, mapViewport.clientWidth);
    const screenHeight = Math.max(
        1,
        window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight
    );
    const isLandscape = width > screenHeight;
    const contentReserve = isLandscape ? 180 : 330;
    const idealHeight = width * (NUM_ROWS / NUM_COLUMNS);
    const screenLimitedHeight = Math.max(220, screenHeight - contentReserve);
    const height = Math.max(220, Math.min(520, idealHeight, screenLimitedHeight));

    mapViewport.style.setProperty("--map-height", `${Math.round(height)}px`);
}

function resizeCanvas() {
    updateMapViewportSize();

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
    canvas.width = Math.max(1, Math.round(cssWidth * pixelRatio));
    canvas.height = Math.max(1, Math.round(cssHeight * pixelRatio));
    drawMap();

    requestAnimationFrame(() => {
        const maxScrollLeft = Math.max(0, mapViewport.scrollWidth - mapViewport.clientWidth);
        const maxScrollTop = Math.max(0, mapViewport.scrollHeight - mapViewport.clientHeight);
        mapViewport.scrollLeft = Math.min(maxScrollLeft, Math.max(0, oldCenterX * mapViewport.scrollWidth - mapViewport.clientWidth / 2));
        mapViewport.scrollTop = Math.min(maxScrollTop, Math.max(0, oldCenterY * mapViewport.scrollHeight - mapViewport.clientHeight / 2));
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
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
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
        fillCell(column, row, "rgba(181, 46, 59, 0.78)");
        hatchResearchCell(column, row);
    } else if (status === "hunter") {
        fillCell(column, row, "rgba(57, 70, 79, 0.82)");
    } else if (status === "yours") {
        fillCell(column, row, "rgba(18, 102, 122, 0.84)");
        const cellWidth = canvas.width / NUM_COLUMNS;
        const cellHeight = canvas.height / NUM_ROWS;
        const inset = Math.max(3, canvas.width / 500);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.98)";
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
    ctx.strokeStyle = "rgba(17, 31, 26, 0.68)";
    ctx.lineWidth = Math.max(1, width / 1500);
    ctx.stroke();

    if (selectionIsValid()) {
        const { column, row } = cellForSpot(selectedSpot);
        fillCell(column, row, "rgba(240, 163, 35, 0.36)");
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
        selectionDetail.textContent = `${MAP_NAMES[activeMap]} — review this square before reserving it.`;
        reserveButton.textContent = isReserving ? "Saving reservation…" : "Reserve this spot";
    } else {
        selectionTitle.textContent = "No spot selected";
        selectionDetail.textContent = "Tap an available square on the map.";
        reserveButton.textContent = "Select a spot first";
    }
}

function updateTodayReservations() {
    const count = thisHunterSpots.length;
    const reservationCount = document.getElementById("reservationCount");
    if (reservationCount) {
        reservationCount.textContent = String(count);
        reservationCount.setAttribute("aria-label", `${count} ${count === 1 ? "spot" : "spots"} reserved`);
    }

    const dialogCount = document.getElementById("dialogReservationCount");
    if (dialogCount) dialogCount.textContent = String(count);

    const list = document.getElementById("todayReservations");
    if (!list) return;
    list.replaceChildren();

    if (!count) {
        const item = document.createElement("li");
        item.textContent = "No spots reserved yet.";
        list.appendChild(item);
        return;
    }

    thisHunterSpots.forEach((spot) => {
        const item = document.createElement("li");
        item.textContent = cellLabel(spot, true);
        list.appendChild(item);
    });
}

function updateCurrentHunterStats() {
    const deerTotal = document.getElementById("deerCount");
    const hoursTotal = document.getElementById("hoursCount");
    if (deerTotal) deerTotal.textContent = String(buck + button + doe);
    if (hoursTotal) hoursTotal.textContent = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function updateHunterStatistics(stats) {
    const values = {
        dailyHunters: stats.activeHunters,
        dailySpots: stats.dailySpots,
        seasonHunters: stats.registeredHunters,
        seasonDeer: stats.seasonDeer,
        seasonHours: Number.isInteger(stats.seasonHours) ? stats.seasonHours : stats.seasonHours.toFixed(1)
    };

    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value);
    });

    const statsStatus = document.getElementById("statsStatus");
    if (statsStatus) statsStatus.textContent = "Statistics are based on the latest successful refresh.";
}

function updateDivisionUI() {
    if (mapTitle) mapTitle.textContent = MAP_NAMES[activeMap];
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
    updateCurrentHunterStats();
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
    const column = Math.floor(((event.clientX - rect.left) / rect.width) * NUM_COLUMNS);
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * NUM_ROWS);
    if (column < 0 || column >= NUM_COLUMNS || row < 0 || row >= NUM_ROWS) return;

    const spot = spotForCell(column, row);
    const status = spotStatus(spot);
    setReserveStatus();

    if (status === "available") {
        selectedSpot = spot;
        setMapStatus(`${cellLabel(spot)} selected. Review it below, then reserve it.`);
    } else {
        selectedSpot = -1;
        const messages = {
            research: "That square is reserved for research. Choose another square.",
            hunter: "Another hunter has reserved that square. Choose another square.",
            yours: "You have already reserved that square today."
        };
        setMapStatus(messages[status], "warning");
    }

    updateInterface();
}

async function refreshAvailability(userRequested = false, allowDuringReservation = false) {
    if (isReserving && !allowDuringReservation) return;

    const requestId = ++refreshRequest;
    if (refreshButton) refreshButton.disabled = true;
    availabilityLoaded = false;
    setMapStatus(userRequested ? "Refreshing availability…" : "Loading today’s availability…");

    try {
        const loaded = await pullReserveSpots();
        if (requestId !== refreshRequest) return;

        rebuildAvailabilityIndex();
        if (selectedSpot >= 0 && spotStatus(selectedSpot) !== "available") selectedSpot = -1;

        const [noticeResult, statsResult] = await Promise.allSettled([
            loadResearchNotice(),
            pullHunterStatistics(loaded.date)
        ]);

        if (requestId !== refreshRequest) return;

        if (statsResult.status === "fulfilled") {
            updateHunterStatistics(statsResult.value);
        } else {
            const statsStatus = document.getElementById("statsStatus");
            if (statsStatus) statsStatus.textContent = "Statistics could not be loaded. Try Refresh again.";
            console.warn("Could not load hunter statistics:", statsResult.reason);
        }

        if (noticeResult.status === "rejected") {
            console.warn("Could not load the hunter notice:", noticeResult.reason);
            if (researchNotice) researchNotice.hidden = true;
        }

        const refreshedAt = new Date();
        if (lastUpdated) {
            lastUpdated.textContent = `Last refreshed ${refreshedAt.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit"
            })}`;
        }
        setMapStatus("Tap an available square on the map. Colored squares cannot be selected.");
        updateInterface();
    } catch (error) {
        if (requestId !== refreshRequest) return;
        console.error("Could not refresh reservation availability:", error);
        setMapStatus("Availability could not be loaded. Check the connection and try Refresh.", "warning");
        setReserveStatus("No reservation was changed.");
    } finally {
        if (requestId === refreshRequest && refreshButton) refreshButton.disabled = false;
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
        isReserving = false;
        await refreshAvailability(false, true);
        selectedSpot = -1;
        setMapStatus(`${cellLabel(spotToReserve, true)} is reserved for you.`, "success");
        setReserveStatus("Reservation saved.", "success");
    } catch (error) {
        console.error("Could not reserve cell:", error);
        if (error.code === "cell-unavailable" || error.message?.includes("just reserved")) {
            selectedSpot = -1;
            isReserving = false;
            await refreshAvailability(false, true);
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
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
        if (!dialog.open) dialog.showModal();
    } else {
        dialog.setAttribute("open", "");
    }
}

function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
}

function clearSessionAndLogout() {
    sessionStorage.removeItem("hunterID");
    sessionStorage.removeItem("hunterId");
    window.location.replace("../index.html");
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

divisionTabs.forEach((tab) => {
    tab.addEventListener("click", () => changeMap(Number(tab.dataset.map)));
});

const todayButton = document.getElementById("todayButton");
const statsButton = document.getElementById("statsButton");
const infoDialog = document.getElementById("infoDialog");
if (todayButton) todayButton.addEventListener("click", () => openDialog(infoDialog));
if (statsButton) statsButton.addEventListener("click", () => openDialog(infoDialog));

const noticeButton = document.getElementById("noticeButton");
const noticeDialog = document.getElementById("noticeDialog");
if (noticeButton) noticeButton.addEventListener("click", () => openDialog(noticeDialog));

const helpButton = document.getElementById("helpButton");
const helpDialog = document.getElementById("helpDialog");
if (helpButton) helpButton.addEventListener("click", () => openDialog(helpDialog));

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(document.getElementById(button.dataset.closeDialog)));
});

const logoutButton = document.getElementById("logout");
const logoutDialog = document.getElementById("logoutDialog");
const noReservationDialog = document.getElementById("noReservationDialog");
if (logoutButton) {
    logoutButton.addEventListener("click", (event) => {
        event.preventDefault();
        if (!availabilityLoaded) {
            setMapStatus("Wait for the map to finish loading before logging out.", "warning");
            return;
        }
        if (thisHunterSpots.length === 0) {
            openDialog(noReservationDialog);
            return;
        }
        openDialog(logoutDialog);
    });
}

const confirmLogoutButton = document.getElementById("confirmLogout");
if (confirmLogoutButton) confirmLogoutButton.addEventListener("click", clearSessionAndLogout);

mapImages.forEach((image) => image.addEventListener("load", drawMap));
window.addEventListener("resize", scheduleCanvasResize);
window.visualViewport?.addEventListener("resize", scheduleCanvasResize);
document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !isReserving) refreshAvailability(false);
});

if (typeof ResizeObserver === "function") {
    new ResizeObserver(scheduleCanvasResize).observe(mapViewport);
}

const hunterLabel = document.getElementById("hunterLabel");
if (hunterLabel) hunterLabel.textContent = `Hunter #${sessionStorage.getItem("hunterID")}`;

rebuildAvailabilityIndex();
updateInterface();
scheduleCanvasResize();
refreshAvailability(false);

window.setInterval(() => {
    if (!document.hidden && !isReserving) refreshAvailability(false);
}, 2 * 60 * 1000);
