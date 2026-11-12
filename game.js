// Who Fired? — a calm, untimed version for older players.
// Each round shows the 9 images one neuron liked best. The player picks the
// brain area it came from:  Edges = V1,  Shapes = V4,  Objects = IT.
//
// Flow:  start -> warm-up (meet each group, then 3 practice rounds that don't
//        count) -> ready -> 10 real rounds -> results.
//
// Data comes from neurons.js (window.NEURONS), built by tools/build_index.py.

(() => {
  "use strict";

  const ROUNDS = 10;
  const REGIONS = ["V1", "V4", "IT"];
  const NAMES = { V1: "Edges", V4: "Shapes", IT: "Objects" };
  const CLASSES = { V1: "edges", V4: "shapes", IT: "objects" };
  const TELLS = {
    V1: "This cell is in an early part of the brain called V1. It notices small edges, where light meets dark.",
    V4: "This cell is in a middle part of the brain called V4. It notices shapes: curves, round forms and textures.",
    IT: "This cell is in a later part of the brain called IT. It notices whole objects, like faces and animals.",
  };
  const INTROS = {
    V1: "These brain cells like edges, where light meets dark. Here are the pictures one of them liked best.",
    V4: "These brain cells like shapes: curves, round forms and textures. Here are the pictures one of them liked best.",
    IT: "These brain cells like whole objects, such as faces, animals and things you could name. Here are the pictures one of them liked best.",
  };

  // Hand-picked neurons with clear, typical favourites, used only in the
  // warm-up and kept out of the real game.
  const EXAMPLES = {
    meet:     { V1: "V1_113", V4: "V4_201025_neuron77", IT: "IT_4" },
    practice: { V1: "V1_94",  V4: "V4_211022_neuron19", IT: "IT_3" },
  };

  // ---------- data ----------
  const ALL = window.NEURONS || [];
  const byId = Object.fromEntries(ALL.map(n => [n.id, n]));
  const exampleIds = new Set([...Object.values(EXAMPLES.meet), ...Object.values(EXAMPLES.practice)]);
  const byRegion = Object.fromEntries(REGIONS.map(r => [r, ALL.filter(n => n.region === r && !exampleIds.has(n.id))]));
  const decks = {};

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function drawNeuron() {
    const region = REGIONS[Math.floor(Math.random() * REGIONS.length)];
    if (!decks[region] || decks[region].length === 0) decks[region] = shuffle(byRegion[region].slice());
    return decks[region].pop();
  }
  // Example neuron for a warm-up step, falling back to a random one if the
  // hand-picked id is missing (e.g. after the data is rebuilt differently).
  const example = (kind, region) => byId[EXAMPLES[kind][region]] || byRegion[region][0];

  const imgSrc = (n, f) => `${n.dir}/${f}`;
  const gridHtml = n => n.top.map(f => `<img src="${imgSrc(n, f)}" alt="">`).join("");
  const dotsHtml = (count, current) => Array.from({ length: count }, (_, i) =>
    `<i class="${i < current ? "done" : i === current ? "now" : ""}"></i>`).join("");

  // ---------- dom ----------
  const $ = id => document.getElementById(id);
  const screens = {
    start: $("screen-start"), learn: $("screen-learn"), play: $("screen-play"),
    ready: $("screen-ready"), over: $("screen-over"),
  };
  const el = {
    grid: $("grid"), reveal: $("reveal"), verdict: $("reveal-verdict"),
    answer: $("reveal-answer"), tell: $("reveal-tell"), btnNext: $("btn-next"),
    hint: $("hint"), hintStrip: $("hint-strip"), btnHint: $("btn-hint"),
    progressText: $("progress-text"), dots: $("progress-dots"),
    choices: [...document.querySelectorAll(".choice")],
  };

  const state = { screen: "start" };

  function show(name) {
    for (const [k, s] of Object.entries(screens)) s.hidden = k !== name;
    state.screen = name;
    window.scrollTo(0, 0);
  }

  // ---------- warm-up: meet the groups ----------
  function startWarmup() {
    state.learnStep = 0;
    show("learn");
    renderLearn();
  }

  function renderLearn() {
    const region = REGIONS[state.learnStep];
    const n = example("meet", region);
    $("learn-progress").textContent = `Warm-up: group ${state.learnStep + 1} of ${REGIONS.length}`;
    $("learn-dots").innerHTML = dotsHtml(REGIONS.length, state.learnStep);
    const name = $("learn-name");
    name.textContent = NAMES[region];
    name.className = `group-name ${CLASSES[region]}`;
    $("learn-desc").textContent = INTROS[region];
    $("learn-grid").innerHTML = gridHtml(n);
    $("btn-learn-next").textContent = state.learnStep < REGIONS.length - 1 ? "Next" : "Let's practice";
    $("btn-learn-next").focus();
  }

  function learnNext() {
    state.learnStep++;
    if (state.learnStep < REGIONS.length) renderLearn();
    else startPractice();
  }

  // ---------- rounds (shared by practice and the real game) ----------
  function startPractice() {
    startRounds("practice", shuffle(REGIONS.map(r => example("practice", r))));
  }

  function startGame() {
    startRounds("game", Array.from({ length: ROUNDS }, drawNeuron));
  }

  function startRounds(mode, queue) {
    Object.assign(state, {
      mode, queue, round: 0, correct: 0, phase: "guess", hinted: false, roundStart: 0,
      log: mode === "game" ? [] : state.log, // per-round record, for comparing people with a DNN
    });
    show("play");
    nextRound();
  }

  function nextRound() {
    const total = state.queue.length;
    state.round++;
    const n = state.queue[state.round - 1];
    const upcoming = state.queue[state.round];
    if (upcoming) for (const f of upcoming.top) new Image().src = imgSrc(upcoming, f); // preload
    state.phase = "guess";
    state.hinted = false;
    state.roundStart = performance.now();

    el.grid.innerHTML = gridHtml(n);
    el.reveal.hidden = true;
    $("choices").hidden = false;
    el.hint.hidden = true;
    el.btnHint.hidden = false;
    el.btnHint.disabled = false;
    el.choices.forEach(b => (b.disabled = false));

    el.progressText.textContent = state.mode === "practice"
      ? `Practice ${state.round} of ${total} (this one doesn't count)`
      : `Picture set ${state.round} of ${total}`;
    el.dots.innerHTML = dotsHtml(total, state.round - 1);
  }

  function showHint() {
    if (state.phase !== "guess" || state.hinted) return;
    state.hinted = true;
    const n = state.queue[state.round - 1];
    el.hintStrip.innerHTML = n.bottom.map(f => `<img src="${imgSrc(n, f)}" alt="">`).join("");
    el.hint.hidden = false;
    el.btnHint.disabled = true;
  }

  // Neuron number and average activation, shown after the player answers.
  // Responses are in the data's own units (normalized, can be negative).
  function statsHtml(n) {
    const fmt = x => (typeof x === "number" ? x.toFixed(2) : "–");
    const label = `${n.region} neuron #${n.num}` + (n.session ? ` (recording ${n.session})` : "");
    return `<b>${label}</b><br>` +
      `Average activation: <b>${fmt(n.mean_top)}</b> for these ${n.top.length} pictures, ` +
      `${fmt(n.mean_all)} across all ${n.n} pictures`;
  }

  function guess(region) {
    if (state.phase !== "guess") return;
    state.phase = "reveal";
    const n = state.queue[state.round - 1];
    const ok = region === n.region;
    if (ok) state.correct++;
    if (state.mode === "game") {
      state.log.push({
        id: n.id, truth: n.region, guess: region, correct: ok,
        seconds: +((performance.now() - state.roundStart) / 1000).toFixed(2), hinted: state.hinted,
      });
    }

    el.choices.forEach(b => (b.disabled = true));
    $("choices").hidden = true;
    el.btnHint.hidden = true;
    el.hint.hidden = true;

    el.reveal.style.setProperty("--c", `var(--${CLASSES[n.region]})`);
    el.verdict.textContent = ok ? "Well done!" : "Good try.";
    el.verdict.className = "verdict " + (ok ? "good" : "soft");
    el.answer.innerHTML = `This brain cell likes <b>${NAMES[n.region]}</b>`;
    el.tell.textContent = TELLS[n.region];
    $("reveal-stats").innerHTML = statsHtml(n);
    const last = state.round >= state.queue.length;
    el.btnNext.textContent = !last ? "Next" : state.mode === "practice" ? "Continue" : "See how I did";
    el.reveal.hidden = false;
    el.btnNext.focus();
  }

  function advance() {
    if (state.phase !== "reveal") return;
    if (state.round < state.queue.length) return nextRound();
    if (state.mode === "practice") show("ready");
    else endGame();
  }

  function endGame() {
    state.phase = "over";
    show("over");
    $("final-correct").textContent = state.correct;
    $("final-total").textContent = state.queue.length;
    const ratio = state.correct / state.queue.length;
    $("final-message").textContent =
      ratio >= 0.8 ? "Wonderful work. You have a sharp eye." :
      ratio >= 0.5 ? "Nice work. You're getting the hang of it." :
      "Thank you for playing. These are tricky, and every round helps.";
    window.lastGameLog = state.log; // inspect from the console
  }

  // ---------- input ----------
  $("btn-start").addEventListener("click", startWarmup);
  $("btn-skip").addEventListener("click", startGame);
  $("btn-learn-next").addEventListener("click", learnNext);
  $("btn-ready").addEventListener("click", startGame);
  $("btn-again").addEventListener("click", startGame);
  el.btnNext.addEventListener("click", advance);
  el.btnHint.addEventListener("click", showHint);
  el.choices.forEach(b => b.addEventListener("click", () => guess(b.dataset.region)));

  // Optional keyboard: 1 / 2 / 3 to answer.
  const KEYMAP = { "1": "V1", "2": "V4", "3": "IT" };
  document.addEventListener("keydown", e => {
    if (e.repeat || state.screen !== "play") return;
    if (KEYMAP[e.key]) guess(KEYMAP[e.key]);
  });

  if (!ALL.length) {
    document.querySelector(".lead").textContent = "No picture data found. Run: python tools/build_index.py";
    $("btn-start").disabled = true;
    $("btn-skip").disabled = true;
  }
})();
