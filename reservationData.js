var reservedSpots = [];
var hunterSpots = [];
var thisHunterSpots = [];
var buck = 0;
var button = 0;
var doe = 0;
var hours = 0;
var availabilityLoaded = false;

function getLocalDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date).reduce((result, part) => {
        if (part.type !== "literal") result[part.type] = part.value;
        return result;
    }, {});

    return `${parts.year}-${parts.month}-${parts.day}`;
}

function asNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function asCellArray(snapshot) {
    const cells = snapshot?.data()?.cells;
    if (!Array.isArray(cells)) return [];

    return cells
        .map((cell) => Number(cell))
        .filter((cell) => Number.isInteger(cell) && cell >= 0);
}

function hunterDocument(hunterId = sessionStorage.getItem("hunterID")) {
    if (!hunterId || !/^\d+$/.test(String(hunterId)) || String(hunterId) === "0") {
        throw new Error("Your hunter session has expired. Please sign in again.");
    }

    return db
        .collection("reserved")
        .doc("hunters")
        .collection("hunterID")
        .doc("h" + hunterId);
}

function dateDocument(owner, date = getLocalDateKey()) {
    return db
        .collection("reserved")
        .doc(owner)
        .collection("dates")
        .doc(typeof date === "string" ? date : getLocalDateKey(date));
}

function hunterMessageDocument() {
    return db
        .collection("reserved")
        .doc("researchers")
        .collection("messages")
        .doc("hunters");
}

async function pullReserveSpots(date = new Date()) {
    const thisDate = typeof date === "string" ? date : getLocalDateKey(date);
    const hunterIdRef = hunterDocument();

    const [researchSnap, hunterSnap, hunterIdSnap, statsSnap] = await Promise.all([
        dateDocument("researchers", thisDate).get(),
        dateDocument("hunters", thisDate).get(),
        hunterIdRef.collection("dates").doc(thisDate).get(),
        hunterIdRef.get()
    ]);

    reservedSpots = asCellArray(researchSnap);
    hunterSpots = asCellArray(hunterSnap);
    thisHunterSpots = asCellArray(hunterIdSnap);

    const stats = statsSnap.data() || {};
    buck = asNumber(stats.buck);
    button = asNumber(stats.button);
    doe = asNumber(stats.doe);
    hours = asNumber(stats.hours);
    availabilityLoaded = true;

    return {
        reservedSpots,
        hunterSpots,
        thisHunterSpots,
        buck,
        button,
        doe,
        hours,
        date: thisDate
    };
}

async function pullHunterStatistics(date = getLocalDateKey()) {
    const thisDate = typeof date === "string" ? date : getLocalDateKey(date);
    const snapshot = await db
        .collection("reserved")
        .doc("hunters")
        .collection("hunterID")
        .get();

    const profiles = snapshot.docs;
    const dailySnapshots = await Promise.all(
        profiles.map((profile) => profile.ref.collection("dates").doc(thisDate).get())
    );

    let seasonDeer = 0;
    let seasonHours = 0;

    profiles.forEach((profile) => {
        const data = profile.data() || {};
        seasonDeer += asNumber(data.buck) + asNumber(data.button) + asNumber(data.doe);
        seasonHours += asNumber(data.hours);
    });

    const activeHunters = dailySnapshots.filter(
        (dailySnapshot) => asCellArray(dailySnapshot).length > 0
    ).length;

    return {
        activeHunters,
        dailySpots: hunterSpots.length,
        registeredHunters: profiles.length,
        seasonDeer,
        seasonHours,
        date: thisDate
    };
}

async function getHunterNotice() {
    const snapshot = await hunterMessageDocument().get();
    const data = snapshot.data() || {};
    const text = typeof data.text === "string" ? data.text.trim() : "";

    return {
        active: Boolean(data.active && text),
        text,
        updatedAt: data.updatedAt || null
    };
}

async function reserveHunterCell(spot, date = new Date()) {
    if (!Number.isInteger(spot) || spot < 0) {
        throw new Error("No valid cell was selected.");
    }

    const thisDate = typeof date === "string" ? date : getLocalDateKey(date);
    const researchRef = dateDocument("researchers", thisDate);
    const hunterRef = dateDocument("hunters", thisDate);
    const hunterIdRef = hunterDocument().collection("dates").doc(thisDate);

    await db.runTransaction(async (transaction) => {
        const researchSnap = await transaction.get(researchRef);
        const hunterSnap = await transaction.get(hunterRef);
        const hunterIdSnap = await transaction.get(hunterIdRef);
        const researchCells = asCellArray(researchSnap);
        const allHunterCells = asCellArray(hunterSnap);

        if (researchCells.includes(spot) || allHunterCells.includes(spot)) {
            const conflict = new Error("That spot was just reserved by someone else.");
            conflict.code = "cell-unavailable";
            throw conflict;
        }

        const now = Date.now();
        const existingGlobalStart = asNumber(hunterSnap.data()?.start);
        const existingHunterStart = asNumber(hunterIdSnap.data()?.start);
        const cellUpdate = {
            cells: firebase.firestore.FieldValue.arrayUnion(spot),
            start: existingGlobalStart || now
        };

        transaction.set(hunterRef, cellUpdate, { merge: true });
        transaction.set(hunterIdRef, {
            cells: firebase.firestore.FieldValue.arrayUnion(spot),
            start: existingHunterStart || now
        }, { merge: true });
    });
}
