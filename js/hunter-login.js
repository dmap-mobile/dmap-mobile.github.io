sessionStorage.removeItem("hunterID");
sessionStorage.removeItem("hunterId");

const numberSelect = document.getElementById("hunterNumber");
const initialSelect = document.getElementById("hunterInitial");
const submitButton = document.getElementById("submitID");
const message = document.getElementById("hunterMessage");

const firstOption = document.createElement("option");
firstOption.value = "";
firstOption.textContent = "Choose a number";
firstOption.selected = true;
firstOption.disabled = true;
numberSelect.appendChild(firstOption);

for (let number = 1; number <= 50; number += 1) {
    const option = document.createElement("option");
    option.value = String(number);
    option.textContent = String(number);
    numberSelect.appendChild(option);
}

const initialPlaceholder = document.createElement("option");
initialPlaceholder.value = "";
initialPlaceholder.textContent = "Choose an initial";
initialPlaceholder.selected = true;
initialPlaceholder.disabled = true;
initialSelect.appendChild(initialPlaceholder);

for (const initial of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const option = document.createElement("option");
    option.value = initial;
    option.textContent = initial;
    initialSelect.appendChild(option);
}

async function checkHunterIdentity() {
    const number = numberSelect.value;
    const initial = initialSelect.value;
    if (!number || !initial) {
        message.textContent = "Choose both your first initial and hunter number.";
        return;
    }

    submitButton.textContent = "Checking…";
    submitButton.disabled = true;
    message.textContent = "";

    try {
        const hunterIdRef = db
            .collection("reserved")
            .doc("hunters")
            .collection("hunterID")
            .doc("h" + number);

        const snapshot = await hunterIdRef.get();
        const registeredInitial = String(snapshot.data()?.initial || "").toUpperCase();

        if (registeredInitial === initial) {
            sessionStorage.setItem("hunterID", number);
            window.location.replace("reserve.html");
            return;
        }

        message.textContent = "That initial and hunter number do not match.";
    } catch (error) {
        console.error("Could not verify hunter identity:", error);
        message.textContent = "The system could not connect. Check the connection and try again.";
    } finally {
        submitButton.textContent = "Enter reservation map";
        submitButton.disabled = false;
    }
}

submitButton.addEventListener("click", checkHunterIdentity);
