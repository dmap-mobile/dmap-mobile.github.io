const bucksInput = document.getElementById("bucks");
const buttonsInput = document.getElementById("buttons");
const doesInput = document.getElementById("does");
const checkoutStatus = document.getElementById("checkoutStatus");
const submitButton = document.getElementById("submit");
let reservationCheckComplete = false;
let hasReservationToday = false;

function setCheckoutStatus(message, isError = true) {
    if (!checkoutStatus) return;
    checkoutStatus.textContent = message;
    checkoutStatus.style.color = isError ? "var(--error)" : "var(--success)";
}

function setupCounter(idPrefix, inputElement) {
    const minus = document.getElementById(idPrefix + "Minus");
    const plus = document.getElementById(idPrefix + "Plus");
    const display = document.getElementById(idPrefix + "Val");
    const maximum = 10;

    const render = (value) => {
        inputElement.value = String(value);
        display.textContent = String(value);
    };

    minus.addEventListener("click", () => {
        const value = Math.max(0, Number(inputElement.value) - 1);
        render(value);
    });

    plus.addEventListener("click", () => {
        const value = Math.min(maximum, Number(inputElement.value) + 1);
        render(value);
    });
}

function numberValue(input) {
    const value = Number(input?.value);
    return Number.isInteger(value) && value >= 0 ? value : 0;
}

function roundHours(value) {
    return Math.round(Math.max(0, value) * 10) / 10;
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

async function addData() {
    if (!submitButton) return;

    if (!reservationCheckComplete || !hasReservationToday) {
        setCheckoutStatus("Reserve a hunting spot before recording a catch or clocking out.");
        return;
    }

    const hunterId = sessionStorage.getItem("hunterID");
    if (!hunterId || !/^\d+$/.test(hunterId) || hunterId === "0") {
        window.location.replace("hunter-login.html");
        return;
    }

    const catchCounts = {
        buck: numberValue(bucksInput),
        button: numberValue(buttonsInput),
        doe: numberValue(doesInput)
    };

    submitButton.disabled = true;
    submitButton.textContent = "Saving…";
    setCheckoutStatus("Saving your catch and calculating hunting time…", false);

    const dateKey = getLocalDateKey();
    const hunterRef = hunterDocument(hunterId);
    const dateRef = hunterRef.collection("dates").doc(dateKey);

    try {
        await db.runTransaction(async (transaction) => {
            const hunterSnapshot = await transaction.get(hunterRef);
            const dateSnapshot = await transaction.get(dateRef);
            const hunterData = hunterSnapshot.data() || {};
            const dateData = dateSnapshot.data() || {};

            const previousDailyHours = asNumber(dateData.hours);
            const startTime = asNumber(dateData.start);
            const elapsedHours = startTime
                ? roundHours((Date.now() - startTime) / (1000 * 60 * 60))
                : previousDailyHours;
            const dailyHours = Math.max(previousDailyHours, elapsedHours);
            const previousSeasonHours = asNumber(hunterData.hours);
            const nextSeasonHours = roundHours(previousSeasonHours - previousDailyHours + dailyHours);

            transaction.set(dateRef, {
                buck: asNumber(dateData.buck) + catchCounts.buck,
                button: asNumber(dateData.button) + catchCounts.button,
                doe: asNumber(dateData.doe) + catchCounts.doe,
                hours: dailyHours,
                clockedOutAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            transaction.set(hunterRef, {
                buck: asNumber(hunterData.buck) + catchCounts.buck,
                button: asNumber(hunterData.button) + catchCounts.button,
                doe: asNumber(hunterData.doe) + catchCounts.doe,
                hours: nextSeasonHours,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });

        sessionStorage.setItem("clockoutHunterID", hunterId);
        sessionStorage.removeItem("hunterID");
        sessionStorage.removeItem("hunterId");
        window.location.replace("clockout.html");
    } catch (error) {
        console.error("Could not save today’s catch:", error);
        setCheckoutStatus("Your catch was not saved. Check the connection and try again.");
        submitButton.textContent = "Submit catch & clock out";
        submitButton.disabled = false;
    }
}

setupCounter("bucks", bucksInput);
setupCounter("buttons", buttonsInput);
setupCounter("does", doesInput);
submitButton.addEventListener("click", addData);

async function checkReservationEligibility() {
    try {
        hasReservationToday = await hunterHasReservationToday();
        reservationCheckComplete = true;

        if (!hasReservationToday) {
            setCheckoutStatus("Reserve a hunting spot before logging deer or clocking out.");
            submitButton.textContent = "Reserve a spot first";
            submitButton.disabled = true;
            return;
        }

        setCheckoutStatus("Your reservation is confirmed. Record your catch below.", false);
        submitButton.textContent = "Submit catch & clock out";
        submitButton.disabled = false;
    } catch (error) {
        console.error("Could not verify today’s reservation:", error);
        setCheckoutStatus("The system could not verify your reservation. Return to Reserve and try again.");
        submitButton.textContent = "Reservation check failed";
        submitButton.disabled = true;
    }
}

const logoutButton = document.getElementById("logout");
const logoutDialog = document.getElementById("logoutDialog");
logoutButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (!reservationCheckComplete || !hasReservationToday) {
        setCheckoutStatus("Reserve a hunting spot before logging out for the day.");
        return;
    }
    openDialog(logoutDialog);
});

document.getElementById("confirmLogout").addEventListener("click", clearSessionAndLogout);
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(document.getElementById(button.dataset.closeDialog)));
});

checkReservationEligibility();
