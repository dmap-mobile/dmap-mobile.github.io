const bucksInput = document.querySelector("#bucks");
const buttonsInput = document.querySelector("#buttons");
const doesInput = document.querySelector("#does");

const setupCounter = (idPrefix, inputEl) => {
    const minus = document.getElementById(idPrefix + "Minus");
    const plus = document.getElementById(idPrefix + "Plus");
    const valDisplay = document.getElementById(idPrefix + "Val");
    
    minus.addEventListener("click", () => {
        let val = parseInt(inputEl.value) || 0;
        if (val > 0) {
            val--;
            inputEl.value = val;
            valDisplay.textContent = val;
        }
    });
    
    plus.addEventListener("click", () => {
        let val = parseInt(inputEl.value) || 0;
        if (val < 10) { // arbitrary max
            val++;
            inputEl.value = val;
            valDisplay.textContent = val;
        }
    });
};

setupCounter("bucks", bucksInput);
setupCounter("buttons", buttonsInput);
setupCounter("does", doesInput);

async function addData(){
    const submitBtn = document.getElementById("submit");
    submitBtn.textContent = "Submitting...";
    submitBtn.disabled = true;

    const formatter = new Intl.DateTimeFormat("fr-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });
    const thisDate = formatter.format(new Date());

    const hunterRef = db.collection("reserved").doc("hunters").collection("hunterID").doc("h" + sessionStorage.getItem("hunterID"));
    var snap = await hunterRef.get();
    var pBuck = parseInt(snap.data()?.buck) || 0;
    var pButton = parseInt(snap.data()?.button) || 0;
    var pDoe = parseInt(snap.data()?.doe) || 0;
    var pHours = parseInt(snap.data()?.hours) || 0;

    const dataRef = hunterRef.collection("dates").doc(thisDate);
    var snap2 = await dataRef.get();
    var tBuck = parseInt(snap2.data()?.buck) || 0;
    var tButton = parseInt(snap2.data()?.button) || 0;
    var tDoe = parseInt(snap2.data()?.doe) || 0;
    var tStart = parseInt(snap2.data()?.start) || 0;
    var tHours = (parseInt(snap2.data()?.hours) || 0) / 1000 / 60 / 60;

    var nums = [parseInt(bucksInput.value), parseInt(buttonsInput.value), parseInt(doesInput.value), (Date.now() - tStart) / 1000 / 60 / 60];

    try{
        await dataRef.update({
            buck: tBuck + nums[0],
            button: tButton + nums[1],
            doe: tDoe + nums[2],
            hours: nums[3]
        });
        
        await hunterRef.update({
            buck: pBuck + nums[0],
            button: pButton + nums[1],
            doe: pDoe + nums[2],
            hours: pHours - tHours + nums[3]
        });

        // Clear session and go to root to redirect to login
        sessionStorage.removeItem("hunterID");
        alert("Success! You are now logged out.");
        window.location.href = '../index.html';
        
    } catch (e) {
        console.error(e);
        alert("Error saving data. Please try again.");
        submitBtn.textContent = "Submit & Clock Out";
        submitBtn.disabled = false;
    }
}

document.getElementById("submit").onclick = function() {
    addData();
};
