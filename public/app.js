const $ = (id) => document.getElementById(id);

function sessionId() {
  return $("sessionId").value.trim() || "dashboard";
}

function setOutput(data) {
  $("output").textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

function applyScreenshot(dataUrl) {
  const img = $("screenshot");
  const placeholder = $("screenshotPlaceholder");
  if (dataUrl) {
    img.src = dataUrl;
    img.style.display = "block";
    placeholder.style.display = "none";
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
    placeholder.style.display = "block";
  }
}

function applyPageState(state) {
  if (state?.url) {
    $("pageState").textContent = `${state.title || "(no title)"} — ${state.url}`;
    $("urlInput").value = state.url;
  }
}

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId(), ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// --- Tabs ---------------------------------------------------------------

document.querySelectorAll("#tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    btn.classList.add("active");
    $(`tab-${btn.dataset.tab}`).classList.remove("hidden");
  });
});

// --- Navigate -------------------------------------------------------------

$("navForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = $("urlInput").value.trim();
  if (!url) return;
  setOutput("Navigating...");
  try {
    const data = await api("/api/navigate", { url });
    applyPageState(data);
    applyScreenshot(data.screenshot);
    setOutput(data);
  } catch (err) {
    setOutput(`Error: ${err.message}`);
  }
});

$("refreshBtn").addEventListener("click", async () => {
  try {
    const data = await fetch(`/api/state?session_id=${encodeURIComponent(sessionId())}`).then((r) => r.json());
    applyPageState(data);
    applyScreenshot(data.screenshot);
    setOutput(data);
  } catch (err) {
    setOutput(`Error: ${err.message}`);
  }
});

$("closeSessionBtn").addEventListener("click", async () => {
  await api("/api/close", {});
  applyScreenshot(null);
  $("pageState").textContent = "Session closed.";
  setOutput("Session closed.");
});

// --- Fetch ------------------------------------------------------------------

$("fetchBtn").addEventListener("click", async () => {
  try {
    const data = await api("/api/fetch", {
      selector: $("fetchSelector").value.trim() || undefined,
      mode: $("fetchMode").value,
    });
    setOutput(data.result);
  } catch (err) {
    setOutput(`Error: ${err.message}`);
  }
});

// --- Edit ---------------------------------------------------------------

$("editBtn").addEventListener("click", async () => {
  const text = $("editText").value;
  const html = $("editHtml").value;
  try {
    const data = await api("/api/edit", {
      selector: $("editSelector").value.trim(),
      text: text ? text : undefined,
      html: html ? html : undefined,
      all_matches: $("editAll").checked,
    });
    applyScreenshot(data.screenshot);
    setOutput(data);
  } catch (err) {
    setOutput(`Error: ${err.message}`);
  }
});

// --- Click / Fill -------------------------------------------------------

$("clickBtn").addEventListener("click", async () => {
  try {
    const data = await api("/api/click", { selector: $("clickSelector").value.trim() });
    applyPageState(data);
    applyScreenshot(data.screenshot);
    setOutput(data);
  } catch (err) {
    setOutput(`Error: ${err.message}`);
  }
});

$("fillBtn").addEventListener("click", async () => {
  try {
    const data = await api("/api/fill", {
      selector: $("fillSelector").value.trim(),
      value: $("fillValue").value,
    });
    applyScreenshot(data.screenshot);
    setOutput(data);
  } catch (err) {
    setOutput(`Error: ${err.message}`);
  }
});

// --- JS -------------------------------------------------------------------

$("jsBtn").addEventListener("click", async () => {
  try {
    const data = await api("/api/js", { script: $("jsScript").value });
    applyScreenshot(data.screenshot);
    setOutput(data.result);
  } catch (err) {
    setOutput(`Error: ${err.message}`);
  }
});

// --- Login ------------------------------------------------------------------

$("loginBtn").addEventListener("click", async () => {
  try {
    const data = await api("/api/login", {
      url: $("loginUrl").value.trim() || undefined,
      username_selector: $("loginUserSel").value.trim(),
      password_selector: $("loginPassSel").value.trim(),
      submit_selector: $("loginSubmitSel").value.trim(),
      username: $("loginUser").value,
      password: $("loginPass").value,
    });
    applyPageState(data);
    applyScreenshot(data.screenshot);
    setOutput(data);
  } catch (err) {
    setOutput(`Error: ${err.message}`);
  }
});

applyScreenshot(null);
