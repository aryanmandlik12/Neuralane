// Toggle day expand/collapse
function toggleDay(idx) {
  const topics = document.getElementById(`topics-${idx}`);
  const toggle = document.getElementById(`toggle-${idx}`);
  if (!topics) return;
  topics.classList.toggle("hidden");
  toggle.classList.toggle("open");
}

// Open all days by default (remove hidden class)
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".day-topics").forEach((el, i) => {
    const toggle = document.getElementById(`toggle-${i + 1}`);
    if (toggle) toggle.classList.add("open");
  });
});

// Handle checkbox change
async function handleCheck(checkbox) {
  const skill = checkbox.dataset.skill;
  const topic = checkbox.dataset.topic;
  const checked = checkbox.checked;

  // Update UI immediately
  const label = checkbox.closest(".topic-item");
  label.classList.toggle("topic-checked", checked);

  try {
    const res = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill_id: skill, topic, checked }),
    });
    const data = await res.json();
    if (data.success) {
      updateProgressUI(data.completion, data.checked_count, data.total);
      updateDayProgress(checkbox);
    }
  } catch (e) {
    console.error("Failed to update progress", e);
  }
}

function updateProgressUI(pct, checked, total) {
  // Circular arc
  const arc = document.getElementById("circleArc");
  if (arc) arc.setAttribute("stroke-dasharray", `${pct}, 100`);

  const pctEl = document.getElementById("progressPct");
  if (pctEl) pctEl.textContent = `${pct}%`;

  const countEl = document.getElementById("checkedCount");
  if (countEl) countEl.textContent = checked;
}

function updateDayProgress(checkbox) {
  // Find the parent day-card
  const dayCard = checkbox.closest(".day-card");
  if (!dayCard) return;
  const dayTopics = dayCard.querySelectorAll(".topic-checkbox");
  const total = dayTopics.length;
  const checked = [...dayTopics].filter(c => c.checked).length;

  // Extract day index from card id
  const cardId = dayCard.id; // "day-card-N"
  const idx = cardId.split("-").pop();

  // Update mini bar
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  const bar = document.getElementById(`dmb-${idx}`);
  if (bar) bar.style.width = `${pct}%`;

  // Update count
  const countEl = document.getElementById(`dtc-${idx}`);
  if (countEl) countEl.textContent = checked;
}

// Check all
async function checkAll(skillId) {
  const boxes = document.querySelectorAll(`.topic-checkbox[data-skill="${skillId}"]`);
  for (const box of boxes) {
    if (!box.checked) {
      box.checked = true;
      box.closest(".topic-item").classList.add("topic-checked");
    }
  }
  // Batch save via individual calls
  const promises = [...boxes].map(box =>
    fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill_id: skillId, topic: box.dataset.topic, checked: true }),
    })
  );
  await Promise.all(promises);
  // Reload to sync
  location.reload();
}

// Uncheck all
async function uncheckAll(skillId) {
  await fetch(`/api/reset/${skillId}`, { method: "POST" });
  location.reload();
}

// Reset progress
async function resetProgress(skillId) {
  if (!confirm("Reset all progress for this skill?")) return;
  await fetch(`/api/reset/${skillId}`, { method: "POST" });
  location.reload();
}
