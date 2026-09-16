var reservedSpots = [];
var hunterSpots = [];
var thisHunterSpots = [];
var buck = 0;
var button = 0;
var doe = 0;
var hours = 0.0;
var availabilityLoaded = false;

function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function asNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function asCellArray(snapshot) {
    const cells = snapshot.data()?.cells;
    return Array.isArray(cells) ? cells : [];
}

async function pullReserveSpots(date = new Date()) {
    const thisDate = typeof date === "string" ? date : getLocalDateKey(date);

    const researchRef = db
        .collection("reserved")
        .doc("researchers")
        .collection("dates")
        .doc(thisDate);

    const hunterRef = db
        .collection("reserved")
        .doc("hunters")
        .collection("dates")
        .doc(thisDate);

    const hunterIDRef = db
        .collection("reserved")
        .doc("hunters")
        .collection("hunterID")
        .doc("h" + sessionStorage.getItem("hunterID"))
        .collection("dates")
        .doc(thisDate);

    const statsRef = db
        .collection("reserved")
        .doc("hunters")
        .collection("hunterID")
        .doc("h" + sessionStorage.getItem("hunterID"));

    const [researchSnap, hunterSnap, hunterIdSnap, statsSnap] = await Promise.all([
        researchRef.get(),
        hunterRef.get(),
        hunterIDRef.get(),
        statsRef.get()
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

async function reserveHunterCell(spot, date = new Date()) {
    if (!Number.isInteger(spot) || spot < 0) {
        throw new Error("No valid cell was selected.");
    }

    const thisDate = typeof date === "string" ? date : getLocalDateKey(date);
    const researchRef = db
        .collection("reserved")
        .doc("researchers")
        .collection("dates")
        .doc(thisDate);
    const hunterRef = db
        .collection("reserved")
        .doc("hunters")
        .collection("dates")
        .doc(thisDate);
    const hunterIdRef = db
        .collection("reserved")
        .doc("hunters")
        .collection("hunterID")
        .doc("h" + sessionStorage.getItem("hunterID"))
        .collection("dates")
        .doc(thisDate);

    await db.runTransaction(async (transaction) => {
        // Firestore retries this check if either availability document changes.
        const researchSnap = await transaction.get(researchRef);
        const hunterSnap = await transaction.get(hunterRef);
        const researchCells = asCellArray(researchSnap);
        const allHunterCells = asCellArray(hunterSnap);

        if (researchCells.includes(spot) || allHunterCells.includes(spot)) {
            const conflict = new Error("That spot was just reserved by someone else.");
            conflict.code = "cell-unavailable";
            throw conflict;
        }

        const cellUpdate = {
            cells: firebase.firestore.FieldValue.arrayUnion(spot),
            start: Date.now()
        };
        transaction.set(hunterRef, cellUpdate, { merge: true });
        transaction.set(hunterIdRef, cellUpdate, { merge: true });
    });
}
