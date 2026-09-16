const hunterId = sessionStorage.getItem("clockoutHunterID") || "";
const hunterNames = {
    // Add approved hunter names here if the final deployment should show names.
};

const personLabel = hunterNames[hunterId] || (hunterId ? `Hunter #${hunterId}` : "Your hunter account");
document.getElementById("clockoutPerson").textContent = `${personLabel}: your catch was recorded successfully.`;

document.getElementById("backToLogin").addEventListener("click", () => {
    sessionStorage.removeItem("clockoutHunterID");
    window.location.replace("../index.html");
});
