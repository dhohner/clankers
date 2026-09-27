// Placeholder page: it shows the current round as text until the interview page exists.
const token = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
const status = document.getElementById("status");
const round = document.getElementById("round");

fetch("/api/round", { headers: { "X-Interview-Token": token } })
  .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
  .then((data) => {
    status.textContent = `Round state: ${data.state}`;
    round.textContent = JSON.stringify(data.round, null, 2);
  })
  .catch((error) => {
    status.textContent = `The server did not return the round (${error}).`;
  });
