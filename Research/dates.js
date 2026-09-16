(function initializeResearchDateControls() {
    const dateInput = document.getElementById("userDate");
    const previousButton = document.getElementById("previousDate");
    const todayButton = document.getElementById("todayDate");
    const nextButton = document.getElementById("nextDate");

    function localDateKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function dateFromKey(key) {
        const [year, month, day] = key.split("-").map(Number);
        return new Date(year, month - 1, day, 12);
    }

    const todayKey = localDateKey();

    function setDate(key, announce = true) {
        const validKey = key && key >= todayKey ? key : todayKey;
        dateInput.value = validKey;
        previousButton.disabled = validKey <= todayKey;

        if (announce) {
            document.dispatchEvent(new CustomEvent("research-date-change", {
                detail: { date: validKey }
            }));
        }
    }

    function moveDate(days) {
        const date = dateFromKey(dateInput.value || todayKey);
        date.setDate(date.getDate() + days);
        setDate(localDateKey(date));
    }

    dateInput.min = todayKey;
    setDate(todayKey, false);

    dateInput.addEventListener("change", () => setDate(dateInput.value));
    previousButton.addEventListener("click", () => moveDate(-1));
    nextButton.addEventListener("click", () => moveDate(1));
    todayButton.addEventListener("click", () => setDate(todayKey));

    window.researchDate = {
        get: () => dateInput.value || todayKey,
        set: setDate,
        today: todayKey
    };
}());
