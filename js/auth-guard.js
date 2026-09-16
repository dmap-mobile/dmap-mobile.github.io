// Auth Guard for Hunter routes
(function () {
    const hunterID = sessionStorage.getItem("hunterID");
    const validSession = Boolean(hunterID && /^\d+$/.test(hunterID) && hunterID !== "0");
    if (!validSession) window.location.replace("hunter-login.html");
})();
