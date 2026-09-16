// Auth Guard for Hunter routes
(function() {
    const hunterID = sessionStorage.getItem("hunterID");
    if (!hunterID || hunterID === "0") {
        window.location.replace("hunter-login.html");
    }
})();
