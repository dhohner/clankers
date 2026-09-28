"use strict";

// The interview page: it shows the open round and the earlier rounds of one session, keeps
// the draft of the open round in browser storage, and sends the round in one submit.
// Round data reaches the page as text only, so every write uses DOM text APIs.

const TOKEN_HEADER = "X-Interview-Token";
const RETRY_MS = 1000;
const DRAFT_PREFIX = "to-prd-interview-draft";
const STATUS_WORDS = {
  connecting: "Connecting",
  round_open: "Round open",
  round_submitted: "Round submitted",
  agent_works: "Agent works",
  ended: "Session ended",
  unavailable: "Server not available",
};
const MESSAGES = {
  connecting: "Connecting to the interview server.",
  round_submitted: "The server holds your answers. The agent reads them next.",
  agent_works: "The agent works with your answers. The next round shows here without a reload.",
  ended: "The interview session has ended. This page takes no more answers.",
  unavailable: "The interview server is not available. The page connects again once it runs.",
  no_token: "The page link holds no token. Run interview open for a new link.",
};
const ALTERNATIVES = [
  { choice: "written", label: "Write my own answer" },
  { choice: "decide_later", label: "Decide later" },
  { choice: "out_of_scope", label: "Out of scope" },
];
const REASON_LABELS = {
  decide_later: "Why decide later?",
  out_of_scope: "Why is it out of scope?",
};
const CHOICE_WORDS = {
  option: "Option",
  written: "Written answer",
  decide_later: "Decide later",
  out_of_scope: "Out of scope",
};

// The token stays in the fragment, so a reload keeps it, and it goes out only in the header.
const token = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
const statusElement = document.getElementById("status");
const statusWord = document.getElementById("status-word");
const currentTitle = document.getElementById("current-title");
const currentMessage = document.getElementById("current-message");
const roundElement = document.getElementById("round");
const historySection = document.getElementById("history");
const historyList = document.getElementById("history-list");

let session = "";
// The open round with its draft and its controls, or null.
let current = null;
let historyKey = "";
// The fault of a rejected submit whose round closed, shown until a new round opens.
let rejection = "";
let ended = false;
let refreshing = null;
let refreshAgain = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setStatus(state) {
  statusElement.dataset.state = state;
  statusWord.textContent = STATUS_WORDS[state];
  document.title = `${STATUS_WORDS[state]} · PRD interview`;
}

function showMessage(text) {
  currentMessage.textContent = text;
  currentMessage.hidden = !text;
}

// Draft storage: one entry per session and round, in the storage of the page origin.

function draftKey(roundId) {
  return `${DRAFT_PREFIX}:${session}:${roundId}`;
}

function emptyDraft(round) {
  const answers = {};
  for (const question of round.questions) {
    answers[question.node] = { choice: "", selected: [], written: "", reason: "", note: "" };
  }
  return { answers, comment: "" };
}

function text(value) {
  return typeof value === "string" ? value : "";
}

// A stored draft is read field by field, so a stale or edited entry cannot break the page.
function loadDraft(round) {
  const draft = emptyDraft(round);
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(draftKey(round.id)) ?? "null");
  } catch {
    return draft;
  }
  if (!stored || typeof stored !== "object") return draft;
  draft.comment = text(stored.comment);
  for (const question of round.questions) {
    const saved = stored.answers?.[question.node];
    if (!saved || typeof saved !== "object") continue;
    const labels = question.options.map((option) => option.label);
    const selected = Array.isArray(saved.selected)
      ? labels.filter((label) => saved.selected.includes(label))
      : [];
    const answer = draft.answers[question.node];
    answer.choice = Object.hasOwn(CHOICE_WORDS, text(saved.choice)) ? saved.choice : "";
    answer.selected = question.multi_select ? selected : selected.slice(0, 1);
    answer.written = text(saved.written);
    answer.reason = text(saved.reason);
    answer.note = text(saved.note);
    if (answer.choice === "option" && !answer.selected.length) answer.choice = "";
  }
  return draft;
}

function saveDraft(open) {
  try {
    localStorage.setItem(draftKey(open.round.id), JSON.stringify(open.draft));
  } catch {
    // Without storage the draft lives only in the open page.
  }
}

function removeDraft(roundId) {
  try {
    localStorage.removeItem(draftKey(roundId));
  } catch {
    // Nothing is stored without storage.
  }
}

function answerComplete(question, answer) {
  switch (answer.choice) {
    case "option":
      return question.multi_select ? answer.selected.length > 0 : answer.selected.length === 1;
    case "written":
      return answer.written.trim() !== "";
    case "decide_later":
    case "out_of_scope":
      return answer.reason.trim() !== "";
    default:
      return false;
  }
}

function submitBody() {
  const answers = current.round.questions.map((question) => {
    const answer = current.draft.answers[question.node];
    const item = { node: question.node, choice: answer.choice, note: answer.note };
    if (answer.choice === "option") item.selected = answer.selected;
    else if (answer.choice === "written") item.written = answer.written;
    else item.reason = answer.reason;
    return item;
  });
  return { round: current.round.id, answers, comment: current.draft.comment };
}

function textField(labelText, value, onInput, className) {
  const label = element("label", `field ${className}`);
  const caption = element("span", "field-label", labelText);
  const area = element("textarea");
  area.rows = 2;
  area.value = value;
  area.addEventListener("input", () => onInput(area.value));
  label.append(caption, area);
  return { label, caption, area };
}

function choiceControl(type, name, labelText, className) {
  const label = element("label", `choice ${className}`);
  const input = element("input");
  input.type = type;
  input.name = name;
  const body = element("span", "choice-body");
  body.append(element("span", "choice-label", labelText));
  label.append(input, body);
  return { label, input, body };
}

function buildQuestion(question, index, total) {
  const answer = current.draft.answers[question.node];
  const fieldset = element("fieldset", "question");
  const legend = element("legend", "question-head");
  legend.append(
    element("span", "question-count", `Question ${index + 1} of ${total}`),
    element("span", "question-label", question.label),
  );
  const prompt = element("p", "question-text", question.question);
  const kind = element(
    "p",
    "question-kind",
    question.multi_select ? "Choose one or more options" : "Choose one option",
  );

  // A single-select question shares one radio group between options and alternatives.
  const optionName = `${question.node}-option`;
  const alternativeName = question.multi_select ? `${question.node}-alternative` : optionName;
  const options = element("div", "choices");
  const optionInputs = question.options.map((option) => {
    const control = choiceControl(
      question.multi_select ? "checkbox" : "radio",
      optionName,
      option.label,
      "choice-option",
    );
    if (option.recommended) control.body.append(element("span", "choice-mark", "Recommended"));
    control.body.append(element("span", "choice-description", option.description));
    control.input.addEventListener("change", () => {
      if (question.multi_select) {
        const chosen = answer.choice === "option" ? answer.selected : [];
        answer.selected = question.options
          .map((item) => item.label)
          .filter((label) =>
            label === option.label ? control.input.checked : chosen.includes(label),
          );
        answer.choice = answer.selected.length ? "option" : "";
      } else {
        answer.selected = [option.label];
        answer.choice = "option";
      }
      changed();
    });
    options.append(control.label);
    return { label: option.label, input: control.input };
  });

  const alternatives = element("div", "choices choices-alternative");
  const alternativeInputs = {};
  let written = null;
  for (const alternative of ALTERNATIVES) {
    const control = choiceControl("radio", alternativeName, alternative.label, "choice-alternative");
    control.input.addEventListener("change", () => {
      answer.choice = alternative.choice;
      answer.selected = [];
      changed();
    });
    alternativeInputs[alternative.choice] = control.input;
    alternatives.append(control.label);
    if (alternative.choice === "written") {
      written = textField("Written answer", answer.written, (value) => {
        answer.written = value;
        if (value.trim() && answer.choice !== "written") {
          answer.choice = "written";
          answer.selected = [];
        }
        changed();
      }, "field-written");
      alternatives.append(written.label);
    }
  }
  const reason = textField("", answer.reason, (value) => {
    answer.reason = value;
    changed();
  }, "field-reason");
  const reasonWord = element("span");
  reason.caption.replaceChildren(reasonWord, element("span", "field-required", "Required"));
  alternatives.append(reason.label);

  const note = textField("Note (optional)", answer.note, (value) => {
    answer.note = value;
    changed();
  }, "field-note");

  fieldset.append(legend, prompt, kind, options, alternatives, note.label);

  function sync() {
    for (const option of optionInputs) {
      option.input.checked = answer.choice === "option" && answer.selected.includes(option.label);
    }
    for (const [choice, input] of Object.entries(alternativeInputs)) {
      input.checked = answer.choice === choice;
    }
    const needsReason = Object.hasOwn(REASON_LABELS, answer.choice);
    reason.label.hidden = !needsReason;
    reason.area.required = needsReason;
    reasonWord.textContent = needsReason ? REASON_LABELS[answer.choice] : "";
    written.area.required = answer.choice === "written";
    fieldset.dataset.complete = String(answerComplete(question, answer));
  }

  return { fieldset, sync };
}

function buildRound(round) {
  current = { round, draft: loadDraft(round), questions: [], submitting: false, fault: "" };
  rejection = "";
  const total = round.questions.length;
  const container = element("div", "round");
  const questions = element("div", "questions");
  for (const [index, question] of round.questions.entries()) {
    const built = buildQuestion(question, index, total);
    current.questions.push(built);
    questions.append(built.fieldset);
  }
  const comment = textField("Comment on the round (optional)", current.draft.comment, (value) => {
    current.draft.comment = value;
    changed();
  }, "field-comment");

  const footer = element("div", "round-footer");
  const progress = element("p", "round-progress");
  progress.setAttribute("aria-live", "polite");
  const submit = element("button", "round-submit", "Submit round");
  submit.type = "button";
  submit.addEventListener("click", submitRound);
  const faults = element("div", "round-faults");
  faults.setAttribute("role", "alert");
  footer.append(progress, submit);
  container.append(questions, comment.label, footer, faults);
  Object.assign(current, { container, comment: comment.area, progress, submit, faults });

  currentTitle.textContent = `${round.id} · ${total} ${total === 1 ? "question" : "questions"}`;
  roundElement.replaceChildren(container);
  refreshControls();
}

function refreshControls() {
  let complete = 0;
  for (const [index, question] of current.round.questions.entries()) {
    current.questions[index].sync();
    if (answerComplete(question, current.draft.answers[question.node])) complete += 1;
  }
  const total = current.round.questions.length;
  const ready = complete === total;
  current.progress.textContent = ready
    ? "Each question has an answer."
    : `${complete} of ${total} ${total === 1 ? "question has" : "questions have"} an answer.`;
  current.submit.disabled = !ready || current.submitting || ended;
}

function changed() {
  saveDraft(current);
  refreshControls();
}

// Another page can answer the round while its submit waits, so the round may have closed.
function showFaults(open, title, lines) {
  open.fault = `${title} ${lines.join(" ")}`;
  if (current !== open) {
    rejection = `${open.round.id}: ${open.fault}`;
    showMessage(rejection);
    return;
  }
  const list = element("ul", "fault-list");
  list.append(...lines.map((line) => element("li", "", line)));
  open.faults.replaceChildren(element("p", "fault-title", title), list);
}

function clearFaults() {
  current.faults.replaceChildren();
  current.fault = "";
  current.unreachable = false;
}

function faultLines(status, body) {
  if (status === 400 && Array.isArray(body?.faults)) {
    return body.faults.map((fault) => `${text(fault.path)}: ${text(fault.message)}. ${text(fault.fix)}`);
  }
  if (status === 409) return ["The round already has answers from another page."];
  if (status === 403) return ["The server refused the page. Run interview open for a new link."];
  return [`The server answered with status ${status}.`];
}

async function submitRound() {
  const open = current;
  if (!open || open.submit.disabled) return;
  open.submitting = true;
  open.fault = "";
  refreshControls();
  try {
    const response = await fetch("/api/answers", {
      method: "POST",
      headers: { [TOKEN_HEADER]: token, "Content-Type": "application/json" },
      body: JSON.stringify(submitBody()),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      // The round may have closed and its draft gone while the submit waited.
      saveDraft(open);
      showFaults(open, "The server rejected the submit.", faultLines(response.status, body));
      return;
    }
    removeDraft(open.round.id);
    // The server announces the change before it answers, so a state read may have closed the
    // round or opened the next one already.
    if (current !== open) return;
    closeRound();
    setStatus("round_submitted");
    showMessage(MESSAGES.round_submitted);
    refresh();
  } catch {
    saveDraft(open);
    showFaults(open, "The submit did not reach the server.", [
      "The server is not available. The draft stays; submit again once it runs.",
    ]);
    open.unreachable = true;
    setStatus("unavailable");
  } finally {
    open.submitting = false;
    if (current === open) refreshControls();
  }
}

function closeRound() {
  if (current.fault) rejection = `${current.round.id}: ${current.fault}`;
  current = null;
  currentTitle.textContent = "PRD interview";
  roundElement.replaceChildren();
}

function answerText(answer) {
  switch (answer.choice) {
    case "option":
      return answer.selected.join(", ");
    case "written":
      return answer.written;
    default:
      return answer.reason;
  }
}

function describe(list, term, value) {
  if (!value.trim()) return;
  list.append(element("dt", "", term), element("dd", "", value));
}

function buildPastRound(item) {
  const { round, answers } = item;
  const details = element("details", "past-round");
  const summary = element("summary", "past-round-summary");
  const count = round.questions.length;
  summary.append(
    element("span", "past-round-id", round.id),
    element("span", "past-round-count", `${count} ${count === 1 ? "question" : "questions"}`),
  );
  const list = element("ol", "past-questions");
  const byNode = new Map(answers.answers.map((answer) => [answer.node, answer]));
  for (const question of round.questions) {
    const answer = byNode.get(question.node);
    const entry = element("li", "past-question");
    entry.append(
      element("p", "past-question-label", question.label),
      element("p", "past-question-text", question.question),
    );
    if (answer) {
      const facts = element("dl", "past-answer");
      describe(facts, CHOICE_WORDS[answer.choice] ?? answer.choice, answerText(answer) || "—");
      describe(facts, "Note", answer.note);
      entry.append(facts);
    }
    list.append(entry);
  }
  details.append(summary, list);
  if (answers.comment) {
    const comment = element("dl", "past-answer past-comment");
    describe(comment, "Comment", answers.comment);
    details.append(comment);
  }
  return details;
}

function renderHistory(history) {
  const key = history.map((item) => item.round.id).join(" ");
  if (key === historyKey) return;
  historyKey = key;
  historySection.hidden = history.length === 0;
  historyList.replaceChildren(...history.map(buildPastRound));
}

function render(state) {
  session = state.session;
  renderHistory(state.history);
  if (state.round) {
    if (current?.round.id !== state.round.id) buildRound(state.round);
    else if (current.unreachable) clearFaults();
    setStatus("round_open");
    showMessage("");
    return;
  }
  if (current) closeRound();
  setStatus(state.state);
  showMessage(rejection || (MESSAGES[state.state] ?? ""));
}

async function loadState() {
  const response = await fetch("/api/page", { headers: { [TOKEN_HEADER]: token }, cache: "no-store" });
  if (!response.ok) throw new Error(`page state answered ${response.status}`);
  return response.json();
}

// Refreshes run one at a time, and a change during a refresh starts one more.
function refresh() {
  if (refreshing) {
    refreshAgain = true;
    return refreshing;
  }
  refreshing = (async () => {
    do {
      refreshAgain = false;
      try {
        const state = await loadState();
        if (!ended) render(state);
      } catch {
        if (!ended) showUnavailable();
      }
    } while (refreshAgain);
    refreshing = null;
  })();
  return refreshing;
}

function showUnavailable() {
  setStatus("unavailable");
  if (!current) showMessage(MESSAGES.unavailable);
}

function showEnded() {
  ended = true;
  setStatus("ended");
  showMessage(MESSAGES.ended);
  if (current) {
    for (const question of current.questions) question.fieldset.disabled = true;
    current.comment.disabled = true;
    refreshControls();
  }
}

// The server counts the page as connected while the page stream stays open, and it writes
// `data: changed` or `data: ended` lines on it. A dropped stream connects again.
async function readEvents(response) {
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const message = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (message === "data: ended") {
        showEnded();
        return;
      }
      refresh();
      end = buffer.indexOf("\n\n");
    }
  }
}

async function holdConnection() {
  while (!ended) {
    try {
      const response = await fetch("/api/presence", {
        headers: { [TOKEN_HEADER]: token },
        cache: "no-store",
      });
      if (response.ok) await readEvents(response);
    } catch {
      // The server is not reachable; the loop tries again.
    }
    if (ended) return;
    showUnavailable();
    await delay(RETRY_MS);
  }
}

if (token) {
  showMessage(MESSAGES.connecting);
  holdConnection();
} else {
  setStatus("unavailable");
  showMessage(MESSAGES.no_token);
}
