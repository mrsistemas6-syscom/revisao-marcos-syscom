/* ==========================================================================
   SYSCOM · K4.1 — Portal de Revisão do Gestor
   JavaScript puro. Sem framework. Sem dependência externa. Sem rede
   (exceto o fetch local de data/review-data.json quando servido via http/https).
   ========================================================================== */
(function () {
  "use strict";

  var STORAGE_KEY = "syscom-k4-review-answers-v1";
  var DATA = null;
  var state = {
    answers: {},          // question_id -> { code, label, explanation }
    activeScreen: 0,      // index into DATA.candidates
    reviewerName: "",
    demoStep: 0
  };

  // ------------------------------------------------------------------ utils
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, opts) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts["class"]) node.className = opts["class"];
    if (opts.text) node.textContent = opts.text;
    if (opts.html) node.innerHTML = opts.html;
    if (opts.attrs) {
      var keys = [];
      for (var k in opts.attrs) { if (opts.attrs.hasOwnProperty(k)) keys.push(k); }
      keys.forEach(function (k) { node.setAttribute(k, opts.attrs[k]); });
    }
    return node;
  }
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ------------------------------------------------------------------ load data
  function loadData() {
    var promise = fetch("data/review-data.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    return promise["catch"](function (err) {
      console.error("Falha ao carregar review-data.json", err);
      qs("#conteudo").insertAdjacentHTML(
        "afterbegin",
        '<p style="padding:24px;color:#f0b25f">Não foi possível carregar os dados do painel (data/review-data.json). ' +
        "Se você abriu o arquivo diretamente (file://), alguns navegadores bloqueiam o carregamento local. " +
        "Sirva a pasta como site estático (veja README_DEPLOY.md) ou abra pelo GitHub Pages.</p>"
      );
      throw err;
    });
  }

  // ==========================================================================
  // Métricas
  // ==========================================================================
  function renderMetrics() {
    var m = DATA.metrics;
    var items = [
      { value: m.analyzed, label: "Telas analisadas" },
      { value: m.completed, label: "Processadas com sucesso" },
      { value: m.auto_pass, label: "Sem revisão obrigatória" },
      { value: m.sample_qa, label: "Amostras para QA" },
      { value: m.selected_for_review, label: "Selecionadas para validação estratégica" },
      { value: m.failed, label: "Falhas", zero: true }
    ];
    var grid = qs("#metrics-grid");
    grid.innerHTML = "";
    items.forEach(function (it) {
      var card = el("div", { "class": "card metric-card" });
      var val = el("div", { "class": "metric-value" + (it.zero && it.value === 0 ? " is-zero" : ""), text: String(it.value) });
      var lab = el("div", { "class": "metric-label", text: it.label });
      card.appendChild(val);
      card.appendChild(lab);
      grid.appendChild(card);
    });
  }

  // ==========================================================================
  // Como funciona — trilho
  // ==========================================================================
  var FLOW_STEPS = [
    { title: "Tela", detail: "A captura de uma tela real do SYSCOM, já existente no acervo. Nenhuma imagem nova é aberta nesta etapa." },
    { title: "IA observa", detail: "A IA registra o que está visível: campos, botões, abas, grids. Sem interpretar — só descrever." },
    { title: "IA interpreta", detail: "A IA formula uma hipótese sobre para que a tela serve e como cada controle deve se comportar." },
    { title: "Identifica padrões", detail: "A IA compara a tela com outras do lote e aponta estruturas que se repetem — sem tratar repetição como prova." },
    { title: "Separa dúvidas", detail: "O que não está na evidência disponível vira pergunta aberta, nunca palpite disfarçado de fato." },
    { title: "Humano confirma", detail: "Uma pessoa nomeada responde às perguntas selecionadas. Só isso vira conhecimento confirmado, e só na tela revisada." }
  ];
  function renderFlow() {
    var rail = qs("#flow-rail");
    var detail = qs("#flow-detail");
    rail.innerHTML = "";
    FLOW_STEPS.forEach(function (step, i) {
      var btn = el("button", {
        "class": "flow-step",
        attrs: { type: "button", role: "listitem", "aria-pressed": "false" }
      });
      btn.appendChild(el("span", { "class": "flow-step-n", text: String(i + 1) }));
      btn.appendChild(el("span", { "class": "flow-step-title", text: step.title }));
      btn.addEventListener("click", function () { activateFlowStep(i); });
      btn.addEventListener("mouseenter", function () { activateFlowStep(i); });
      rail.appendChild(btn);
      if (i < FLOW_STEPS.length - 1) {
        var arrow = el("span", { "class": "flow-arrow", attrs: { "aria-hidden": "true" } });
        arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
        rail.appendChild(arrow);
      }
    });
    function activateFlowStep(i) {
      qsa(".flow-step", rail).forEach(function (b, idx) {
        b.classList.toggle("is-active", idx === i);
        b.setAttribute("aria-pressed", idx === i ? "true" : "false");
      });
      detail.textContent = FLOW_STEPS[i].detail;
    }
    activateFlowStep(0);
  }

  // ==========================================================================
  // Padrões candidatos
  // ==========================================================================
  function renderPatterns() {
    var grid = qs("#patterns-grid");
    grid.innerHTML = "";
    DATA.patterns_overview.forEach(function (p) {
      var pct = Math.round((p.screens_with / p.screens_total) * 100);
      var card = el("div", { "class": "card pattern-card" });
      card.appendChild(el("span", { "class": "badge-candidate", text: "Padrão candidato" }));
      card.appendChild(el("div", { "class": "pattern-name", text: p.label }));
      card.appendChild(el("div", { "class": "pattern-ratio", text: p.screens_with + "/" + p.screens_total + " telas" }));
      var bar = el("div", { "class": "pattern-bar" });
      bar.appendChild(el("span", { attrs: { style: "width:" + pct + "%" } }));
      card.appendChild(bar);
      var noteText = p.missing_titles.length
        ? "Não aparece em: " + p.missing_titles.join(", ") + "."
        : "Aparece em todas as telas do lote.";
      card.appendChild(el("div", { "class": "pattern-note", text: noteText }));
      grid.appendChild(card);
    });
    qs("#pattern-validated-source").textContent = DATA.prior_validated_source.screen_title;
  }

  // ==========================================================================
  // As 20 telas
  // ==========================================================================
  var CLASS_ORDER = ["AUTO_PASS", "SAMPLE_QA", "AI_RECHECK", "SOURCE_GAP", "HUMAN_DECISION"];
  var activeFilter = "ALL";

  function renderScreenFilters() {
    var wrap = qs("#screens-filters");
    wrap.innerHTML = "";
    var counts = { ALL: DATA.screens.length };
    DATA.screens.forEach(function (s) { counts[s.review_class] = (counts[s.review_class] || 0) + 1; });

    function makeChip(key, label) {
      var chip = el("button", {
        "class": "filter-chip" + (activeFilter === key ? " is-active" : ""),
        text: label + " (" + (counts[key] || 0) + ")",
        attrs: { type: "button" }
      });
      chip.addEventListener("click", function () {
        activeFilter = key;
        renderScreenFilters();
        renderScreensGrid();
      });
      wrap.appendChild(chip);
    }
    makeChip("ALL", "Todas");
    CLASS_ORDER.forEach(function (c) {
      if (counts[c]) makeChip(c, DATA.review_classes[c].short);
    });
  }

  function renderScreensGrid() {
    var grid = qs("#screens-grid");
    grid.innerHTML = "";
    var list = DATA.screens.filter(function (s) {
      return activeFilter === "ALL" || s.review_class === activeFilter;
    });
    list.forEach(function (s) {
      var card = el("article", { "class": "card screen-card" + (s.is_candidate ? " is-candidate" : "") });
      var top = el("div", { "class": "screen-card-top" });
      var left = el("div");
      left.appendChild(el("div", { "class": "screen-card-title", text: s.title }));
      left.appendChild(el("div", { "class": "screen-card-module", text: s.module + " › " + s.submodule + " · " + s.kind_label }));
      top.appendChild(left);
      top.appendChild(el("span", {
        "class": "class-pill",
        text: s.review_class_label,
        attrs: { "data-class": s.review_class, title: s.review_class_meaning }
      }));
      card.appendChild(top);

      var stats = el("div", { "class": "screen-card-stats" });
      stats.appendChild(makeStat(s.counts.fields, "campos"));
      stats.appendChild(makeStat(s.counts.buttons, "botões"));
      stats.appendChild(makeStat(s.counts.lookups, "buscas"));
      stats.appendChild(makeStat(s.open_questions, "perguntas"));
      card.appendChild(stats);

      if (s.is_candidate) {
        var flag = el("span", { "class": "candidate-flag" });
        flag.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg> Selecionada para revisão estratégica';
        card.appendChild(flag);
      }
      grid.appendChild(card);
    });
    function makeStat(value, label) {
      var s = el("span");
      s.innerHTML = "<b>" + value + "</b> " + escapeHtml(label);
      return s;
    }
  }

  // ==========================================================================
  // Mockup esquemático (sem screenshot)
  // ==========================================================================
  function renderMock(structure, title) {
    var frame = el("div", { "class": "mock-frame" });
    var titlebar = el("div", { "class": "mock-titlebar" });
    titlebar.appendChild(el("span", { "class": "mock-dot", attrs: { "aria-hidden": "true" } }));
    titlebar.appendChild(el("span", { text: title }));
    var hasXIcon = (structure.buttons || []).some(function (b) { return /ícone x/i.test(b.label || ""); });
    if (hasXIcon) titlebar.appendChild(el("span", { "class": "mock-x", text: "×" }));
    frame.appendChild(titlebar);

    var body = el("div", { "class": "mock-body" });

    (structure.fields || []).forEach(function (f) {
      if (f.count && f.count > 3) {
        // digit-style rows (e.g. Números x Letras) — represent as compact grid of boxes
        var row = el("div", { "class": "mock-field" });
        row.appendChild(el("span", { "class": "mock-field-label", text: f.label === "(sem rótulo)" ? "" : f.label }));
        var boxesWrap = el("div", { attrs: { style: "flex:1;display:flex;gap:3px;flex-wrap:wrap" } });
        for (var i = 0; i < Math.min(f.count, 10); i++) {
          boxesWrap.appendChild(el("span", {
            attrs: { style: "width:20px;height:20px;border:1px solid #c7cede;border-radius:3px;background:#fff" }
          }));
        }
        row.appendChild(boxesWrap);
        body.appendChild(row);
        return;
      }
      var field = el("div", { "class": "mock-field" });
      field.appendChild(el("span", { "class": "mock-field-label", text: f.label === "(sem rótulo)" ? "" : f.label }));
      var input = el("span", { "class": "mock-field-input", text: (f.values && f.values[0]) || "" });
      field.appendChild(input);
      if (f.lookup) field.appendChild(el("span", { "class": "mock-field-btn", text: "..." }));
      body.appendChild(field);
    });

    (structure.grids || []).forEach(function (g) {
      var gridBox = el("div");
      var head = el("div", { "class": "mock-grid-head" });
      (g.columns || []).forEach(function (col) {
        head.appendChild(el("span", { text: col === "(sem rótulo)" ? "" : col }));
      });
      var gridWrap = el("div", { "class": "mock-grid" });
      gridWrap.appendChild(head);
      var emptyRow = el("div", { "class": "mock-grid-row" });
      (g.columns || []).forEach(function () { emptyRow.appendChild(el("span", { html: "&nbsp;" })); });
      gridWrap.appendChild(emptyRow);
      gridBox.appendChild(gridWrap);
      body.appendChild(gridBox);
    });

    frame.appendChild(body);

    var footer = el("div", { "class": "mock-footer" });
    (structure.buttons || []).forEach(function (b) {
      if (/ícone x/i.test(b.label)) return;
      var isPrimary = /gravar/i.test(b.label) && b.state === "habilitado";
      var isDisabled = /cinza/i.test(b.state || "");
      footer.appendChild(el("span", {
        "class": "mock-btn" + (isPrimary ? " is-primary" : "") + (isDisabled ? " is-disabled" : ""),
        text: b.label.replace(/\[\.\.\.\] de\s*/i, "").replace(/["“”]/g, "")
      }));
    });
    frame.appendChild(footer);

    return frame;
  }

  // ==========================================================================
  // As 4 candidatas (destaque)
  // ==========================================================================
  function renderCandidates() {
    var list = qs("#candidates-list");
    list.innerHTML = "";
    DATA.candidates.forEach(function (c, idx) {
      var card = el("article", { "class": "card candidate-card" });

      var left = el("div");
      left.appendChild(renderMock(c.structure, c.title));
      var caption = el("p", { "class": "mock-caption", text: "Representação esquemática gerada a partir dos dados estruturados — não é a captura real." });
      left.appendChild(caption);

      var right = el("div");
      right.appendChild(el("div", { "class": "candidate-rank", text: "Candidata " + (idx + 1) + " de 4" }));
      right.appendChild(el("h3", { "class": "candidate-title", text: c.title }));
      right.appendChild(el("p", { "class": "candidate-why", text: c.plain_summary }));

      right.appendChild(makeBlock("Por que foi escolhida", c.focus));
      right.appendChild(makeBlock("O que a IA identificou", c.structure.purpose.text));
      right.appendChild(makeBlock("O que queremos confirmar", c.gain.summary));

      var actions = el("div", { "class": "candidate-actions" });
      var btn = el("a", { "class": "btn btn-primary", text: "Revisar esta tela", attrs: { href: "#revisar" } });
      btn.addEventListener("click", function () {
        openReview();
        setActiveScreen(idx);
      });
      actions.appendChild(btn);
      right.appendChild(actions);

      card.appendChild(left);
      card.appendChild(right);
      list.appendChild(card);
    });

    function makeBlock(label, text) {
      var b = el("div", { "class": "candidate-block" });
      b.appendChild(el("div", { "class": "candidate-block-label", text: label }));
      b.appendChild(el("div", { "class": "candidate-block-text", text: text }));
      return b;
    }
  }

  // ==========================================================================
  // Revisão humana — modo focado
  // ==========================================================================
  function openReview() {
    qs("#review-intro").classList.add("hidden");
    qs("#review-shell").classList.add("is-open");
    renderReviewTabs();
    renderReviewScreen();
  }

  function setActiveScreen(idx) {
    state.activeScreen = idx;
    renderReviewTabs();
    renderReviewScreen();
    document.getElementById("revisar").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function screenAnsweredCount(screen) {
    return screen.questions.filter(function (q) { return !!state.answers[q.id]; }).length;
  }
  function screenComplete(screen) {
    return screenAnsweredCount(screen) === screen.questions.length;
  }

  function renderReviewTabs() {
    var nav = qs("#review-tabs");
    nav.innerHTML = "";
    DATA.candidates.forEach(function (c, idx) {
      var tab = el("button", {
        "class": "review-tab" + (idx === state.activeScreen ? " is-active" : "") + (screenComplete(c) ? " is-complete" : ""),
        attrs: { type: "button" }
      });
      var check = el("span", { "class": "review-tab-check", text: screenComplete(c) ? "✓" : String(idx + 1) });
      tab.appendChild(check);
      tab.appendChild(document.createTextNode(c.title));
      tab.addEventListener("click", function () { setActiveScreen(idx); });
      nav.appendChild(tab);
    });
    updateProgress();
  }

  function updateProgress() {
    var totalQ = DATA.candidates.reduce(function (sum, c) { return sum + c.questions.length; }, 0);
    var answeredQ = Object.keys(state.answers).length;
    qs("#review-progress-text").textContent = "Tela " + (state.activeScreen + 1) + " de " + DATA.candidates.length;
    var pct = Math.round((answeredQ / totalQ) * 100);
    qs("#review-progress-fill").style.width = pct + "%";
    qs("#exp-screens").textContent = String(DATA.candidates.length);
    qs("#exp-answered").textContent = String(answeredQ);
    qs("#exp-pending").textContent = String(totalQ - answeredQ);
    qs("#export-warning").classList.toggle("is-visible", answeredQ < totalQ);
  }

  var ANSWER_SETS = {
    pattern: [
      { code: "SAME", label: "FUNCIONA ASSIM" },
      { code: "DIFFERENT", label: "FUNCIONA DIFERENTE" },
      { code: "UNKNOWN", label: "NÃO SEI" },
      { code: "NOT_APPLICABLE", label: "NÃO SE APLICA" }
    ],
    hypothesis: [
      { code: "SAME", label: "FUNCIONA ASSIM" },
      { code: "DIFFERENT", label: "FUNCIONA DIFERENTE" },
      { code: "UNKNOWN", label: "NÃO SEI" },
      { code: "NOT_APPLICABLE", label: "NÃO SE APLICA" }
    ],
    open: [
      { code: "EXPLAINED", label: "SEI EXPLICAR" },
      { code: "UNKNOWN", label: "NÃO SEI" },
      { code: "NOT_APPLICABLE", label: "NÃO SE APLICA" }
    ]
  };
  var NEEDS_EXPLANATION = ["DIFFERENT", "EXPLAINED"];

  function renderReviewScreen() {
    var c = DATA.candidates[state.activeScreen];
    var panel = qs("#review-screen-panel");
    panel.innerHTML = "";

    var side = el("div", { "class": "review-side" });
    side.appendChild(renderMock(c.structure, c.title));
    var meta = el("div", { "class": "card", attrs: { style: "margin-top:16px" } });
    meta.appendChild(el("h3", { text: c.title }));
    meta.appendChild(el("p", { text: c.family }));
    side.appendChild(meta);

    var questionsWrap = el("div", { "class": "review-questions" });
    c.questions.forEach(function (q) { questionsWrap.appendChild(renderQuestionCard(q)); });

    panel.appendChild(side);
    panel.appendChild(questionsWrap);

    qs("#btn-prev-screen").disabled = state.activeScreen === 0;
    qs("#btn-next-screen").textContent = state.activeScreen === DATA.candidates.length - 1
      ? "Ir para exportação →"
      : "Próxima tela →";
  }

  function renderQuestionCard(q) {
    var card = el("div", { "class": "card question-card", attrs: { "data-question-id": q.id } });

    var top = el("div", { "class": "question-top" });
    top.appendChild(el("span", { "class": "question-subject", text: q.subject }));
    top.appendChild(el("span", { "class": "tag-chip", text: q.tag_label, attrs: { "data-tag": q.tag } }));
    card.appendChild(top);

    card.appendChild(el("p", { "class": "question-text", text: q.text }));
    if (q.basis) card.appendChild(el("p", { "class": "question-basis", text: q.basis }));
    if (q.hint) card.appendChild(el("p", { "class": "question-hint", text: "Dica: " + q.hint }));

    if (q.hypothesis) {
      var hyp = el("div", { "class": "hypothesis-box" });
      hyp.innerHTML = "<b>Hipótese da IA:</b> " + escapeHtml(q.hypothesis.text) +
        " <span class='muted'>(confiança " + escapeHtml(q.hypothesis.confidence_label) + ")</span>";
      card.appendChild(hyp);
    }

    if (q.tag === "VALIDATED_ELSEWHERE" && q.source_screen_if_pattern) {
      var src = q.source_screen_if_pattern;
      var box = el("div", { "class": "confirmed-box" });
      box.innerHTML =
        "<span class='confirmed-label'>Confirmado em outra tela</span>" +
        "“" + escapeHtml(src.confirmed_text) + "” — " + escapeHtml(src.screen_title) +
        " <span class='confirmed-here'>Nesta tela: ainda não confirmado</span>";
      card.appendChild(box);
    }

    var options = el("div", { "class": "answer-options" });
    var set = ANSWER_SETS[q.mode] || ANSWER_SETS.pattern;
    var current = state.answers[q.id];
    set.forEach(function (opt) {
      var btn = el("button", {
        "class": "answer-btn" + (current && current.code === opt.code ? " is-selected" : ""),
        text: opt.label,
        attrs: { type: "button", "data-code": opt.code }
      });
      btn.addEventListener("click", function () { selectAnswer(q, opt); });
      options.appendChild(btn);
    });
    card.appendChild(options);

    var explainWrap = el("div", {
      "class": "explain-field" + (current && NEEDS_EXPLANATION.indexOf(current.code) !== -1 ? " is-visible" : "")
    });
    explainWrap.appendChild(el("label", { text: "Como funciona aqui?", attrs: { "for": "explain-" + q.id } }));
    var textarea = el("textarea", {
      attrs: { id: "explain-" + q.id, placeholder: q.placeholder || "Descreva o comportamento observado nesta tela." }
    });
    if (current && current.explanation) textarea.value = current.explanation;
    textarea.addEventListener("input", function () {
      if (state.answers[q.id]) {
        state.answers[q.id].explanation = textarea.value;
        persist();
      }
    });
    explainWrap.appendChild(textarea);
    card.appendChild(explainWrap);

    function selectAnswer(question, opt) {
      state.answers[question.id] = {
        code: opt.code,
        label: opt.label,
        explanation: (state.answers[question.id] && state.answers[question.id].explanation) || ""
      };
      persist();
      qsa(".answer-btn", options).forEach(function (b) {
        b.classList.toggle("is-selected", b.getAttribute("data-code") === opt.code);
      });
      explainWrap.classList.toggle("is-visible", NEEDS_EXPLANATION.indexOf(opt.code) !== -1);
      renderReviewTabs();
    }

    return card;
  }

  // ------------------------------------------------------------------ autosave
  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        answers: state.answers,
        reviewerName: state.reviewerName,
        savedAt: new Date().toISOString()
      }));
      qs("#autosave-text").textContent = "Respostas salvas neste navegador ✓";
    } catch (e) {
      qs("#autosave-text").textContent = "Não foi possível salvar automaticamente neste navegador.";
    }
  }
  function restore() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      state.answers = saved.answers || {};
      state.reviewerName = saved.reviewerName || "";
      qs("#reviewer-name").value = state.reviewerName;
    } catch (e) { /* ignore corrupt storage */ }
  }

  // ==========================================================================
  // Exportação
  // ==========================================================================
  function buildExportPayload() {
    var now = new Date().toISOString();
    var screens = DATA.candidates.map(function (c) {
      var answers = c.questions.map(function (q) {
        var a = state.answers[q.id];
        return {
          question_id: q.id,
          subject: q.subject,
          candidate_pattern: q.candidate_pattern ? q.candidate_pattern.pattern_id : null,
          answer: a ? a.code : null,
          answer_label: a ? a.label : null,
          human_explanation: a ? (a.explanation || "") : "",
          source_screen_if_pattern: q.source_screen_if_pattern ? q.source_screen_if_pattern.pilot_id : null,
          element_ids: q.element_ids || []
        };
      });
      return {
        screen_id: c.screen_id,
        pilot_id: c.pilot_id,
        answers: answers,
        notes: "",
        completed: answers.every(function (a) { return a.answer !== null; })
      };
    });
    var totalQ = DATA.candidates.reduce(function (s, c) { return s + c.questions.length; }, 0);
    var answeredQ = Object.keys(state.answers).length;
    return {
      schema: DATA.export_contract.schema,
      review_session: {
        id: "k4.1-boss-portal-" + now,
        stage: "K4.1",
        batch_id: "k4-0-canary",
        question_set_total: totalQ,
        started_export_at: now,
        answered: answeredQ,
        pending: totalQ - answeredQ,
        classification: "INTERNAL_ONLY"
      },
      reviewed_at: now,
      reviewed_by: state.reviewerName || null,
      screens: screens
    };
  }

  function doExport() {
    var name = qs("#reviewer-name").value.replace(/^\s+|\s+$/g, "");
    if (!name) {
      qs("#reviewer-name").focus();
      qs("#reviewer-name").style.borderColor = "#f0b25f";
      return;
    }
    state.reviewerName = name;
    persist();
    var payload = buildExportPayload();
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = DATA.export_contract.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ==========================================================================
  // Modo Chefe
  // ==========================================================================
  function initBossMode() {
    var btn = qs("#boss-toggle");
    btn.addEventListener("click", function () {
      var active = document.body.classList.toggle("boss-mode");
      btn.setAttribute("aria-pressed", String(active));
      btn.querySelector("span").textContent = active ? "Sair do Modo Chefe" : "Modo Chefe";
    });
  }

  // ==========================================================================
  // Demonstração automática
  // ==========================================================================
  var DEMO_SLIDES = [
    {
      title: "1. 20 telas analisadas",
      body: "A IA processou 20 telas reais do módulo Tabelas › Faturamento, do início ao fim, sem falhas.",
      example: "20 de 20 telas concluídas. 0 falhas."
    },
    {
      title: "2. Padrões encontrados",
      body: "Os mesmos botões — Gravar, Cancelar, Excluir, Fechar — aparecem quase em todas as telas.",
      example: "Gravar: 20/20 · Fechar: 20/20 · Cancelar: 19/20 · Excluir: 19/20"
    },
    {
      title: "3. A IA não transforma padrão em verdade",
      body: "Ver o mesmo botão em 19 telas não prova como ele funciona. Isso continua sendo hipótese até alguém confirmar.",
      example: "Confirmado por pessoa até hoje: só 1 tela (Cadastro de Fabricante)."
    },
    {
      title: "4. 4 casos escolhidos para humano",
      body: "Cada uma das 4 telas testa um limite diferente do que já foi confirmado — não são as mais fáceis, são as mais informativas.",
      example: "4 telas cobrem diretamente 14 das 20 telas do lote."
    },
    {
      title: "5. Uma pergunta real",
      body: "",
      example: ""
    },
    {
      title: "6. Exportação do conhecimento",
      body: "Ao final da revisão, as respostas são exportadas em um arquivo JSON. Nada é enviado para servidor — o arquivo fica no seu computador.",
      example: "k4-human-review.json — pronto para entregar ao responsável do projeto."
    }
  ];
  function renderDemoSlide() {
    var idx = state.demoStep;
    var s = DEMO_SLIDES[idx];
    var slide = qs("#demo-slide");
    slide.innerHTML = "";
    slide.appendChild(el("h3", { text: s.title }));
    if (s.body) slide.appendChild(el("p", { text: s.body }));

    if (idx === 4) {
      // pick a real question from the first candidate for illustration
      var q = DATA.candidates[0].questions[0];
      slide.appendChild(el("p", { text: "Exemplo real, tirado da tela \"" + DATA.candidates[0].title + "\":" }));
      var box = el("div", { "class": "demo-example" });
      box.innerHTML = "<b>" + escapeHtml(q.subject) + ":</b> " + escapeHtml(q.text);
      slide.appendChild(box);
    } else if (s.example) {
      slide.appendChild(el("div", { "class": "demo-example", text: s.example }));
    }

    qs("#demo-step-count").textContent = (idx + 1) + " / " + DEMO_SLIDES.length;
    var dots = qs("#demo-dots");
    dots.innerHTML = "";
    DEMO_SLIDES.forEach(function (_, i) {
      dots.appendChild(el("span", { "class": i === idx ? "is-active" : "" }));
    });
    qs("#btn-demo-prev").disabled = idx === 0;
    qs("#btn-demo-next").textContent = idx === DEMO_SLIDES.length - 1 ? "Fechar" : "Avançar →";
  }
  function initDemo() {
    var overlay = qs("#demo-overlay");
    qs("#btn-open-demo").addEventListener("click", function () {
      state.demoStep = 0;
      overlay.hidden = false;
      overlay.classList.add("is-open");
      renderDemoSlide();
    });
    function closeDemo() { overlay.classList.remove("is-open"); overlay.hidden = true; }
    qs("#btn-close-demo").addEventListener("click", closeDemo);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeDemo(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.classList.contains("is-open")) closeDemo();
    });
    qs("#btn-demo-prev").addEventListener("click", function () {
      if (state.demoStep > 0) { state.demoStep--; renderDemoSlide(); }
    });
    qs("#btn-demo-next").addEventListener("click", function () {
      if (state.demoStep < DEMO_SLIDES.length - 1) { state.demoStep++; renderDemoSlide(); }
      else closeDemo();
    });
  }

  // ==========================================================================
  // Guia do Gestor — experiência guiada de 7 etapas, dentro da própria página
  // ==========================================================================
  var guideState = { step: 0 };

  function guideSteps() {
    var m = DATA.metrics;
    var patterns = DATA.patterns_overview;

    return [
      // 1 — O que é isto?
      function () {
        var wrap = el("div");
        wrap.appendChild(el("span", { "class": "guide-kicker", text: "Etapa 1 de 7" }));
        wrap.appendChild(el("h3", { text: "O que você está vendo?" }));
        wrap.appendChild(el("p", { text: "Este é o painel de acompanhamento do projeto de documentação inteligente do SYSCOM." }));
        wrap.appendChild(el("p", { text: "A IA analisa as telas do sistema, identifica sua estrutura, registra o que consegue compreender e separa o que ainda precisa de confirmação humana." }));
        wrap.appendChild(el("div", { "class": "guide-callout", text: "Este painel não é a documentação final do SYSCOM." }));
        return wrap;
      },
      // 2 — O que já aconteceu?
      function () {
        var wrap = el("div");
        wrap.appendChild(el("span", { "class": "guide-kicker", text: "Etapa 2 de 7" }));
        wrap.appendChild(el("h3", { text: "O que já aconteceu?" }));
        wrap.appendChild(el("p", {
          text: "Neste lote, " + m.analyzed + " telas foram analisadas automaticamente. As " + m.completed +
            " foram processadas com sucesso e " + (m.failed === 0 ? "nenhuma falhou." : m.failed + " falharam.")
        }));
        var row = el("div", { "class": "guide-stats-row" });
        row.appendChild(makeStatBlock(m.analyzed, "telas analisadas"));
        row.appendChild(makeStatBlock(m.auto_pass, "sem revisão obrigatória"));
        row.appendChild(makeStatBlock(m.sample_qa, "em amostragem"));
        row.appendChild(makeStatBlock(m.failed, "falhas"));
        wrap.appendChild(row);
        return wrap;
      },
      // 3 — O que a IA faz?
      function () {
        var wrap = el("div");
        wrap.appendChild(el("span", { "class": "guide-kicker", text: "Etapa 3 de 7" }));
        wrap.appendChild(el("h3", { text: "O que a IA faz?" }));
        var flow = el("div", { "class": "guide-flow" });
        var steps = ["A IA observa", "A IA interpreta", "Identifica padrões", "Registra dúvidas", "Pede ajuda só quando vale a pena"];
        steps.forEach(function (s, i) {
          flow.appendChild(el("span", { "class": "guide-flow-step", text: s }));
          if (i < steps.length - 1) flow.appendChild(el("span", { "class": "guide-flow-arrow", text: "→" }));
        });
        wrap.appendChild(flow);
        wrap.appendChild(el("p", { text: "A IA não deve transformar uma hipótese em verdade. Quando ela não possui evidência suficiente, a informação continua marcada como dúvida." }));
        return wrap;
      },
      // 4 — Padrões encontrados
      function () {
        var wrap = el("div");
        wrap.appendChild(el("span", { "class": "guide-kicker", text: "Etapa 4 de 7" }));
        wrap.appendChild(el("h3", { text: "Padrões encontrados" }));
        var list = el("div", { "class": "guide-pattern-list" });
        patterns.forEach(function (p) {
          var row = el("div", { "class": "guide-pattern-row" });
          row.appendChild(el("span", { text: p.label }));
          row.appendChild(el("b", { text: p.screens_with + " telas" }));
          list.appendChild(row);
        });
        wrap.appendChild(list);
        wrap.appendChild(el("p", { text: "Esses botões aparecem repetidamente, mas isso ainda não significa que funcionem exatamente da mesma forma em todas as telas." }));
        wrap.appendChild(el("div", {
          "class": "guide-callout",
          text: "PADRÃO CANDIDATO — comportamento confirmado anteriormente em uma tela: " + DATA.prior_validated_source.screen_title + "."
        }));
        return wrap;
      },
      // 5 — Por que só 4 telas?
      function () {
        var wrap = el("div");
        wrap.appendChild(el("span", { "class": "guide-kicker", text: "Etapa 5 de 7" }));
        wrap.appendChild(el("h3", { text: "Por que não revisar as 20?" }));
        wrap.appendChild(el("p", { text: "Revisar todas as telas manualmente eliminaria boa parte do benefício da automação. Por isso a IA selecionou apenas 4 telas que podem ensinar mais sobre os padrões encontrados." }));
        var list = el("div", { "class": "guide-screens-list" });
        DATA.candidates.forEach(function (c) {
          var row = el("div", { "class": "guide-screen-row" });
          row.appendChild(el("b", { text: c.title }));
          row.appendChild(el("span", { text: c.plain_summary }));
          list.appendChild(row);
        });
        wrap.appendChild(list);
        return wrap;
      },
      // 6 — Onde o gestor participa?
      function () {
        var wrap = el("div");
        wrap.appendChild(el("span", { "class": "guide-kicker", text: "Etapa 6 de 7" }));
        wrap.appendChild(el("h3", { text: "Agora entra o conhecimento humano" }));
        wrap.appendChild(el("p", { text: "Nas quatro telas selecionadas, você pode confirmar se a interpretação da IA está correta." }));
        wrap.appendChild(el("p", { text: "As respostas não alteram o sistema. Elas serão exportadas em um arquivo para serem incorporadas ao conhecimento do projeto posteriormente." }));
        var cta = el("a", { "class": "btn btn-primary guide-panel-cta", text: "Ir para a revisão", attrs: { href: "#revisar" } });
        cta.addEventListener("click", function () { closeGuide(); openReview(); });
        wrap.appendChild(cta);
        return wrap;
      },
      // 7 — O que acontece depois?
      function () {
        var wrap = el("div");
        wrap.appendChild(el("span", { "class": "guide-kicker", text: "Etapa 7 de 7" }));
        wrap.appendChild(el("h3", { text: "O que acontece depois?" }));
        var flow = el("div", { "class": "guide-flow" });
        var steps = ["Você responde", "Exportamos a revisão", "A IA incorpora o conhecimento", "Reavaliamos os padrões", "Reduzimos revisões futuras"];
        steps.forEach(function (s, i) {
          flow.appendChild(el("span", { "class": "guide-flow-step", text: s }));
          if (i < steps.length - 1) flow.appendChild(el("span", { "class": "guide-flow-arrow", text: "→" }));
        });
        wrap.appendChild(flow);
        wrap.appendChild(el("p", { text: "O objetivo não é responder tela por tela. O objetivo é ensinar alguns padrões estratégicos e medir quanto desse conhecimento pode ser reaproveitado nas demais telas." }));
        var cta = el("a", { "class": "btn btn-primary guide-panel-cta", text: "Começar revisão", attrs: { href: "#revisar" } });
        cta.addEventListener("click", function () { closeGuide(); openReview(); });
        wrap.appendChild(cta);
        return wrap;
      }
    ];

    function makeStatBlock(value, label) {
      var d = el("div");
      d.appendChild(el("b", { text: String(value) }));
      d.appendChild(el("span", { text: label }));
      return d;
    }
  }

  function renderGuideStep() {
    var steps = guideSteps();
    var idx = guideState.step;
    var slide = qs("#guide-slide");
    slide.innerHTML = "";
    slide.appendChild(steps[idx]());

    qs("#guide-step-count").textContent = (idx + 1) + " de " + steps.length;
    qs("#guide-progress-fill").style.width = Math.round(((idx + 1) / steps.length) * 100) + "%";
    qs("#btn-guide-prev").disabled = idx === 0;
    qs("#btn-guide-next").textContent = idx === steps.length - 1 ? "Concluir" : "Próximo →";
  }

  function openGuide() {
    guideState.step = 0;
    var overlay = qs("#guide-overlay");
    overlay.hidden = false;
    overlay.classList.add("is-open");
    renderGuideStep();
  }
  function closeGuide() {
    var overlay = qs("#guide-overlay");
    overlay.classList.remove("is-open");
    overlay.hidden = true;
  }
  function initGuide() {
    var overlay = qs("#guide-overlay");
    qs("#btn-open-guide").addEventListener("click", openGuide);
    qs("#btn-close-guide").addEventListener("click", closeGuide);
    qs("#btn-skip-guide").addEventListener("click", closeGuide);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeGuide(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.classList.contains("is-open")) closeGuide();
    });
    qs("#btn-guide-prev").addEventListener("click", function () {
      if (guideState.step > 0) { guideState.step--; renderGuideStep(); }
    });
    qs("#btn-guide-next").addEventListener("click", function () {
      var total = guideSteps().length;
      if (guideState.step < total - 1) { guideState.step++; renderGuideStep(); }
      else closeGuide();
    });
  }

  // ==========================================================================
  // Ativa link de navegação atual (scrollspy simples)
  // ==========================================================================
  function initScrollSpy() {
    var links = qsa(".topnav a");
    var sections = links.map(function (a) { return document.querySelector(a.getAttribute("href")); }).filter(Boolean);
    function onScroll() {
      var y = window.scrollY + 100;
      var current = sections[0];
      sections.forEach(function (sec) { if (sec.offsetTop <= y) current = sec; });
      links.forEach(function (a) {
        a.classList.toggle("is-active", a.getAttribute("href") === "#" + current.id);
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // ==========================================================================
  // Wiring geral
  // ==========================================================================
  function initReviewControls() {
    qs("#btn-open-review").addEventListener("click", openReview);
    qs("#cta-start-review").addEventListener("click", function () { openReview(); });
    qs("#btn-prev-screen").addEventListener("click", function () {
      if (state.activeScreen > 0) setActiveScreen(state.activeScreen - 1);
    });
    qs("#btn-next-screen").addEventListener("click", function () {
      if (state.activeScreen < DATA.candidates.length - 1) {
        setActiveScreen(state.activeScreen + 1);
      } else {
        qs("#export-summary").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    qs("#btn-export").addEventListener("click", doExport);
    qs("#reviewer-name").addEventListener("input", function (e) {
      state.reviewerName = e.target.value;
      e.target.style.borderColor = "";
      persist();
    });
  }

  function boot() {
    loadData().then(function (data) {
      DATA = data;
      restore();
      renderMetrics();
      renderFlow();
      renderPatterns();
      renderScreenFilters();
      renderScreensGrid();
      renderCandidates();
      renderReviewTabs();
      updateProgress();
      initBossMode();
      initDemo();
      initGuide();
      initReviewControls();
      initScrollSpy();
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
