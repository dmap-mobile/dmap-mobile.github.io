var storedHunterId = 0;
sessionStorage.setItem("hunterID", 0);
var loggedIn = false;
var hID = 0;

var numberSelect = document.getElementById("hunterNumber");
for (var i = 0; i<=50; i++){
    var opt = document.createElement('option');
    opt.value = i;
    opt.innerHTML = i;
    numberSelect.appendChild(opt);
}

const initials = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
var initialSelect = document.getElementById("hunterInitial");
for (var i = 0; i<initials.length; i++){
    var opt = document.createElement('option');
    opt.value = initials.charAt(i);
    opt.innerHTML = initials.charAt(i);
    initialSelect.appendChild(opt);
}

function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

var submitID = document.getElementById("submitID");
var message = document.getElementById("hunterMessage");

async function checkInitial(date = new Date()){
    submitID.textContent = "Loading...";
    submitID.disabled = true;
    message.textContent = "";

    var number = document.getElementById("hunterNumber").value;
    var initial = document.getElementById("hunterInitial").value;
    
    try {
        const hunterIDRef = db
            .collection("reserved")
            .doc("hunters")
            .collection("hunterID")
            .doc("h" + number);
        
        var snap = await hunterIDRef.get();
        var hunterID = snap.data()?.initial;
        
        if(hunterID === initial){
            hID = number;
            sessionStorage.setItem("hunterID", hID);
            
            // Just go directly to reserve.html on mobile (we added bottom nav to switch anyway)
            window.location.href = 'reserve.html';
        } else {
            message.textContent = "Incorrect Initial/ID combination.";
            submitID.textContent = "Enter Dashboard";
            submitID.disabled = false;
        }
    } catch (e) {
        console.error(e);
        message.textContent = "Error connecting to database.";
        submitID.textContent = "Enter Dashboard";
        submitID.disabled = false;
    }
}

submitID.addEventListener("click", () => {
    checkInitial();
});
