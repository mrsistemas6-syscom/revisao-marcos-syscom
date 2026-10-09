// SYSCOM · Revisão do Gestor · Rodada 2 (K4.2)
// JavaScript puro, sem dependências. Uma pergunta por vez, com autosave.
(function () {
  'use strict';

  // Chave própria desta revisão. NÃO reutiliza a chave da revisão anterior (K4.1).
  var STORAGE_KEY = 'syscom-human-review-k42-v1';
  var EXPORT_SCHEMA = 'syscom-human-review-k42@1.0.0';
  var EXPORT_FILE = 'syscom-human-review-k42.json';
  var SOURCE = 'human_review_k42';
  var REVIEWER_ID = 'gestor_syscom';
  var REVIEWER_DISPLAY = 'Gestor SYSCOM';
  var SKIP_CODE = 'UNKNOWN';

  var data = null;
  var questions = [];
  var screens = {};
  var answers = {};      // question_id -> registro de resposta (formato de exportação)
  var position = 0;
  var started = false;
  var storageOk = true;
  var lastFocus = null;

  var $ = function (id) { return document.getElementById(id); };

  // ---------------------------------------------------------------------------------
  // Utilidades de DOM (sempre textContent; nada de innerHTML com texto de dados)
  // ---------------------------------------------------------------------------------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'checked') node.checked = !!v;
        else if (k === 'value') node.value = v;
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function show(id) {
    ['view-home', 'view-question', 'view-summary'].forEach(function (v) { $(v).hidden = (v !== id); });
    $('btn-go-summary').hidden = !(started && id !== 'view-summary');
    window.scrollTo(0, 0);
    var heading = id === 'view-home' ? $('home-title') : id === 'view-summary' ? $('summary-title') : $('question-title');
    if (heading) heading.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------------
  // Armazenamento (autosave)
  // ---------------------------------------------------------------------------------
  function loadSaved() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (!saved || saved.v !== 1) return;
      answers = saved.answers && typeof saved.answers === 'object' ? saved.answers : {};
      position = Math.min(Math.max(parseInt(saved.position, 10) || 0, 0), questions.length - 1);
      started = !!saved.started;
    } catch (e) {
      storageOk = false;
    }
  }

  function save() {
    var stamp = new Date();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        v: 1, answers: answers, position: position, started: started, saved_at: stamp.toISOString()
      }));
      storageOk = true;
      $('save-status').textContent = 'Salvo automaticamente às ' +
        stamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      storageOk = false;
      $('save-status').textContent = 'Não foi possível salvar neste navegador';
    }
    $('storage-warning').hidden = storageOk;
  }

  // ---------------------------------------------------------------------------------
  // Regras de resposta
  // ---------------------------------------------------------------------------------
  function optionOf(q, code) {
    for (var i = 0; i < q.options.length; i++) if (q.options[i].code === code) return q.options[i];
    return null;
  }

  function nonEmpty(s) { return typeof s === 'string' && s.trim().length > 0; }

  // Resposta completa = não exige texto, ou exige e o texto existe.
  function isComplete(q, a) {
    if (!a) return false;
    var opt = optionOf(q, a.answer_code);
    if (!opt) return false;
    if (opt.field && opt.field.required) return nonEmpty(a[opt.field.export_as]);
    return true;
  }

  function buildRecord(q, code, text, previous) {
    var opt = optionOf(q, code);
    var rec = {
      question_id: q.question_id,
      question_family_key: q.question_family_key,
      screen_id: q.screen_id,
      pilot_id: q.pilot_id,
      mode: q.mode,
      answer_code: code,
      answered_at: new Date().toISOString(),
      source: SOURCE,
      provenance: Object.assign({}, q.provenance, {
        reviewer_id: REVIEWER_ID,
        reviewer_display: REVIEWER_DISPLAY,
        reviewer_binding: 'portal_fixed_role',
        portal: 'k4-2-review',
        export_schema: EXPORT_SCHEMA
      })
    };
    // Campos opcionais só existem quando preenchidos (nunca string vazia).
    if (opt && opt.field && nonEmpty(text)) rec[opt.field.export_as] = text.trim();
    if (previous && previous.answer_code === code && previous.answered_at &&
        sameText(previous, rec)) rec.answered_at = previous.answered_at;
    return rec;
  }

  function sameText(a, b) {
    return (a.human_explanation || '') === (b.human_explanation || '') &&
           (a.condition_or_exception || '') === (b.condition_or_exception || '');
  }

  function currentQuestion() { return questions[position]; }

  function readForm(q) {
    var checked = document.querySelector('input[name="answer"]:checked');
    if (!checked) return;
    var code = checked.value;
    var ta = document.getElementById('answer-text');
    var text = ta ? ta.value : '';
    answers[q.question_id] = buildRecord(q, code, text, answers[q.question_id]);
    save();
    updateProgress();
  }

  // ---------------------------------------------------------------------------------
  // Tela de pergunta
  // ---------------------------------------------------------------------------------
  function sameScreenInfo(i) {
    var q = questions[i];
    var group = [];
    questions.forEach(function (x, idx) { if (x.pilot_id === q.pilot_id) group.push(idx); });
    return { previousSame: i > 0 && questions[i - 1].pilot_id === q.pilot_id, group: group, nth: group.indexOf(i) + 1 };
  }

  var KIND_TAG = {
    lookup_alias: 'Confirmação rápida de busca',
    legacy: 'Pendência da revisão anterior'
  };

  function renderQuestion() {
    var q = currentQuestion();
    var a = answers[q.question_id];
    var info = sameScreenInfo(position);
    var card = $('question-card');
    clear(card);

    // Cabeçalho: tela, aviso de agrupamento, VER TELA
    var head = el('div', { class: 'qc-head' });
    var titleBlock = el('div', { class: 'qc-title-block' });
    if (KIND_TAG[q.kind]) titleBlock.appendChild(el('span', { class: 'tag', text: KIND_TAG[q.kind] }));
    titleBlock.appendChild(el('p', { class: 'qc-screen-label', text: 'Tela' }));
    titleBlock.appendChild(el('h2', { id: 'question-title', class: 'qc-screen', tabindex: '-1', text: q.screen_name }));
    if (info.previousSame) {
      titleBlock.appendChild(el('p', { class: 'same-screen', text: 'Mais uma dúvida sobre esta tela.' }));
    } else if (info.group.length > 1) {
      titleBlock.appendChild(el('p', { class: 'same-screen', text: 'Esta tela tem ' + info.group.length + ' dúvidas.' }));
    }
    head.appendChild(titleBlock);
    if (q.has_screen_view) {
      var viewBtn = el('button', { type: 'button', class: 'btn btn-outline btn-sm', id: 'btn-view-screen', text: 'VER TELA' });
      viewBtn.addEventListener('click', function () { openScreenModal(q.pilot_id); });
      head.appendChild(viewBtn);
    }
    card.appendChild(head);

    // Pergunta
    card.appendChild(el('p', { class: 'qc-label', text: 'Pergunta' }));
    card.appendChild(el('p', { class: 'qc-question', text: q.question }));

    if (q.suspicion) card.appendChild(el('div', { class: 'suspicion', text: q.suspicion }));

    // Por que estamos perguntando?
    card.appendChild(el('div', { class: 'qc-block' }, [
      el('h3', { text: 'Por que estamos perguntando?' }),
      el('p', { text: q.why })
    ]));
    // O que a IA já sabe
    if (q.ai_knows) {
      card.appendChild(el('div', { class: 'qc-block qc-block-soft' }, [
        el('h3', { text: 'O que a IA já sabe' }),
        el('p', { text: q.ai_knows })
      ]));
    }

    // Respostas
    var fieldset = el('fieldset', { class: 'answers' }, [el('legend', { text: 'Sua resposta' })]);
    q.options.forEach(function (opt) {
      var id = 'answer-' + opt.code;
      var input = el('input', {
        type: 'radio', name: 'answer', id: id, value: opt.code,
        checked: !!(a && a.answer_code === opt.code)
      });
      var label = el('label', { class: 'answer-option' + (a && a.answer_code === opt.code ? ' selected' : ''), for: id }, [
        input, el('span', { class: 'answer-label', text: opt.label })
      ]);
      input.addEventListener('change', function () { onOptionChange(q, opt); });
      fieldset.appendChild(label);
    });
    card.appendChild(fieldset);

    var fieldHost = el('div', { id: 'field-host', class: 'field-host' });
    card.appendChild(fieldHost);
    card.appendChild(el('p', { class: 'validation', id: 'validation', role: 'alert', hidden: true }));

    if (a) renderField(q, optionOf(q, a.answer_code), a);

    updateProgress();
    $('btn-prev').disabled = position === 0;
    $('btn-next').textContent = position === questions.length - 1 ? 'Concluir' : 'Próxima →';
  }

  function renderField(q, opt, a) {
    var host = $('field-host');
    clear(host);
    if (!opt || !opt.field) return;
    var f = opt.field;
    var labelText = f.label + (f.required ? '' : ' (opcional)');
    var ta = el('textarea', {
      id: 'answer-text', rows: f.kind === 'detail' ? '3' : '4',
      'aria-required': f.required ? 'true' : null,
      placeholder: f.kind === 'detail' ? 'Se não houver, deixe em branco.' : 'Explique do seu jeito...'
    });
    ta.value = (a && a[f.export_as]) || '';
    ta.addEventListener('input', function () { hideValidation(); readForm(q); });
    host.appendChild(el('label', { for: 'answer-text', class: 'field-label', text: labelText }));
    host.appendChild(ta);
  }

  function onOptionChange(q, opt) {
    document.querySelectorAll('.answer-option').forEach(function (n) {
      var input = n.querySelector('input');
      n.classList.toggle('selected', input.checked);
    });
    hideValidation();
    readForm(q);
    renderField(q, opt, answers[q.question_id]);
    var ta = $('answer-text');
    if (ta && opt.field && opt.field.required) ta.focus();
  }

  function showValidation(msg) {
    var v = $('validation');
    if (!v) return;
    v.textContent = msg;
    v.hidden = false;
  }
  function hideValidation() {
    var v = $('validation');
    if (v) v.hidden = true;
  }

  function updateProgress() {
    var total = questions.length;
    var done = questions.filter(function (q) { return isComplete(q, answers[q.question_id]); }).length;
    $('progress-label').textContent = 'Pergunta ' + (position + 1) + ' de ' + total;
    $('progress-answered').textContent = done + ' de ' + total + ' com resposta';
    var pct = Math.round((done / total) * 100);
    $('progress-fill').style.width = pct + '%';
    $('progress-bar').setAttribute('aria-valuenow', String(pct));
  }

  // ---------------------------------------------------------------------------------
  // Navegação
  // ---------------------------------------------------------------------------------
  function goTo(i) {
    position = Math.min(Math.max(i, 0), questions.length - 1);
    save();
    renderQuestion();
    show('view-question');
  }

  function onNext() {
    var q = currentQuestion();
    var a = answers[q.question_id];
    if (!a) {
      showValidation('Escolha uma resposta para continuar. Se não souber, use "Pular / Não sei".');
      return;
    }
    if (!isComplete(q, a)) {
      showValidation('Escreva a explicação para continuar. Se preferir, escolha NÃO SEI.');
      var ta = $('answer-text');
      if (ta) ta.focus();
      return;
    }
    if (position >= questions.length - 1) { openSummary(); return; }
    goTo(position + 1);
  }

  function onSkip() {
    var q = currentQuestion();
    var a = answers[q.question_id];
    // Sem resposta (ou resposta incompleta): registra NÃO SEI, que é um resultado legítimo.
    if (!a || !isComplete(q, a)) {
      answers[q.question_id] = buildRecord(q, SKIP_CODE, '', null);
    }
    if (position >= questions.length - 1) { save(); openSummary(); return; }
    goTo(position + 1);
  }

  function onPrev() { if (position > 0) goTo(position - 1); }

  // ---------------------------------------------------------------------------------
  // Resumo final
  // ---------------------------------------------------------------------------------
  function computeStats() {
    var s = { total: questions.length, answered: 0, unknown: 0, na: 0, explanations: 0,
              lookupConfirmed: 0, lookupTotal: 0, pending: [], incomplete: [] };
    questions.forEach(function (q) {
      if (q.kind === 'lookup_alias') s.lookupTotal++;
      var a = answers[q.question_id];
      if (!a) { s.pending.push(q); return; }
      if (!isComplete(q, a)) { s.pending.push(q); s.incomplete.push(q); return; }
      if (a.answer_code === 'UNKNOWN') s.unknown++;
      else if (a.answer_code === 'NOT_APPLICABLE') s.na++;
      else s.answered++;
      if (nonEmpty(a.human_explanation) || nonEmpty(a.condition_or_exception)) s.explanations++;
      if (q.kind === 'lookup_alias' && a.answer_code === 'SAME') s.lookupConfirmed++;
    });
    return s;
  }

  function openSummary() {
    started = true;
    save();
    var s = computeStats();
    $('summary-lead').textContent = s.pending.length === 0
      ? 'Você chegou ao fim. Obrigado: suas respostas já podem ser exportadas.'
      : 'Ainda há ' + s.pending.length + (s.pending.length === 1 ? ' pendência' : ' pendências') +
        '. Você pode exportar assim mesmo ou voltar para responder.';

    var grid = $('summary-grid');
    clear(grid);
    [
      [s.answered, 'perguntas respondidas'],
      [s.unknown, 'não sei'],
      [s.na, 'não se aplica'],
      [s.explanations, 'explicações fornecidas'],
      [s.lookupConfirmed + ' de ' + s.lookupTotal, 'buscas confirmadas'],
      [s.pending.length, 'pendências ainda abertas']
    ].forEach(function (pair) {
      grid.appendChild(el('div', { class: 'summary-stat' }, [
        el('span', { class: 'summary-number', text: String(pair[0]) }),
        el('span', { class: 'summary-label', text: pair[1] })
      ]));
    });

    var box = $('pending-box');
    var list = $('pending-list');
    clear(list);
    box.hidden = s.pending.length === 0;
    s.pending.forEach(function (q) {
      var incomplete = s.incomplete.indexOf(q) !== -1;
      var btn = el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Responder' });
      btn.addEventListener('click', function () { goTo(q.position - 1); });
      list.appendChild(el('li', {}, [
        el('span', { class: 'pending-text' }, [
          el('strong', { text: q.screen_name }), ' · ' + q.question,
          incomplete ? el('em', { class: 'pending-incomplete', text: ' (falta a explicação; esta resposta não será exportada)' }) : null
        ]),
        btn
      ]));
    });

    var n = data.home.optional_not_included;
    $('optional-note').textContent = 'Existem ' + n +
      ' dúvidas opcionais que não são necessárias para continuar o projeto.';
    $('action-feedback').textContent = '';
    show('view-summary');
  }

  // ---------------------------------------------------------------------------------
  // Exportação
  // ---------------------------------------------------------------------------------
  function buildExport() {
    var s = computeStats();
    var list = [];
    questions.forEach(function (q) {
      var a = answers[q.question_id];
      if (a && isComplete(q, a)) list.push(a);   // incompleta nunca é exportada
    });
    return {
      schema: EXPORT_SCHEMA,
      batch_id: 'k4-2-scale',
      stage: data.stage,
      source: SOURCE,
      reviewer_id: REVIEWER_ID,
      reviewer_display: REVIEWER_DISPLAY,
      reviewed_at: new Date().toISOString(),
      answers: list,
      metrics: {
        total_questions: s.total,
        answered: s.answered,
        unknown: s.unknown,
        not_applicable: s.na,
        explanations: s.explanations,
        lookup_confirmed: s.lookupConfirmed,
        pending: s.pending.length
      },
      pending_question_ids: s.pending.map(function (q) { return q.question_id; })
    };
  }

  function feedback(msg) { $('action-feedback').textContent = msg; }

  function exportReview() {
    var json = JSON.stringify(buildExport(), null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = EXPORT_FILE;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    feedback('Revisão exportada no arquivo ' + EXPORT_FILE + '.');
  }

  function copyReview() {
    var json = JSON.stringify(buildExport(), null, 2);
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = json;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      feedback(ok ? 'Revisão copiada.' : 'Não consegui copiar. Use EXPORTAR REVISÃO.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function () { feedback('Revisão copiada.'); }, fallback);
    } else {
      fallback();
    }
  }

  // ---------------------------------------------------------------------------------
  // VER TELA (representação esquemática; nunca imagem do sistema)
  // ---------------------------------------------------------------------------------
  function chipRow(label, items, cls) {
    if (!items || !items.length) return null;
    return el('div', { class: 'sch-row' }, [
      el('span', { class: 'sch-row-label', text: label }),
      el('div', { class: 'sch-chips' }, items.map(function (it) {
        var text = typeof it === 'string' ? it : it.label;
        var kids = [text];
        if (it && it.type) kids.push(el('span', { class: 'chip-type', text: it.type }));
        return el('span', { class: 'chip ' + cls }, kids);
      }))
    ]);
  }

  // Alterna entre "ajustada ao modal" e "tamanho real" (com rolagem), dentro do próprio modal.
  function toggleZoom() {
    var wrap = $('preview-wrap');
    var btn = $('preview-zoom');
    if (!wrap || !btn) return;
    var on = !wrap.classList.contains('zoomed');
    wrap.classList.toggle('zoomed', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    $('preview-hint').textContent = on
      ? 'Tamanho real. Role para ver o resto. Clique na imagem para voltar.'
      : 'Clique na imagem para ampliar.';
  }

  // "Captura da tela": só existe versão sanitizada (nomes de empresas ocultados).
  function previewSection(s) {
    var p = s.preview;
    var sec = el('section', { class: 'modal-section' }, [el('h3', { text: 'Captura da tela' })]);
    if (p && p.status === 'PUBLIC_SAFE_PREVIEW' && p.src) {
      var img = el('img', {
        class: 'preview-img', src: p.src, alt: p.alt,
        width: String(p.width), height: String(p.height)
      });
      var btn = el('button', {
        type: 'button', class: 'preview-zoom', id: 'preview-zoom',
        'aria-pressed': 'false', 'aria-describedby': 'preview-hint'
      }, [img]);
      btn.addEventListener('click', toggleZoom);
      var hint = el('p', { class: 'preview-hint', id: 'preview-hint', text: 'Clique na imagem para ampliar.' });
      img.addEventListener('error', function () {
        clear(sec);
        sec.appendChild(el('h3', { text: 'Captura da tela' }));
        sec.appendChild(el('p', { class: 'schematic-empty', text: 'Não consegui carregar a captura. Veja a representação abaixo.' }));
      });
      sec.appendChild(el('div', { class: 'preview-wrap', id: 'preview-wrap' }, [btn]));
      sec.appendChild(hint);
      sec.appendChild(el('p', { class: 'modal-note', text: 'Versão sanitizada: o nome da empresa e dados reais foram ocultados.' }));
    } else {
      sec.appendChild(el('p', { class: 'schematic-empty', text: 'A captura desta tela não está disponível aqui. Veja a representação abaixo.' }));
    }
    return sec;
  }

  // "O que a IA já sabe": resumos já existentes das perguntas desta tela (sem repetir).
  function knowsSection(pilotId) {
    var seen = {}, notes = [];
    questions.forEach(function (q) {
      if (q.pilot_id === pilotId && q.ai_knows && !seen[q.ai_knows]) { seen[q.ai_knows] = true; notes.push(q.ai_knows); }
    });
    if (!notes.length) return null;
    return el('section', { class: 'modal-section' }, [
      el('h3', { text: 'O que a IA já sabe' })
    ].concat(notes.map(function (n) { return el('p', { class: 'knows-text', text: n }); })));
  }

  function openScreenModal(pilotId) {
    var s = screens[pilotId];
    if (!s) return;
    lastFocus = document.activeElement;
    $('screen-modal-title').textContent = s.name;
    $('screen-modal-path').textContent = s.menu_path ? 'Onde fica no sistema: ' + s.menu_path : '';
    var body = $('screen-modal-body');
    clear(body);
    body.appendChild(previewSection(s));
    var sc = s.schematic;
    var box = el('div', { class: 'sch-box' });
    [
      chipRow('Abas', sc.tabs, 'chip-plain'),
      chipRow('Grupos', sc.groups, 'chip-plain'),
      chipRow('Campos', sc.fields, 'chip-field'),
      chipRow('Botões', sc.actions, 'chip-action')
    ].forEach(function (r) { if (r) box.appendChild(r); });
    (sc.grids || []).forEach(function (g) {
      var r = chipRow('Colunas da lista', g.columns, 'chip-grid');
      if (r) box.appendChild(r);
    });
    body.appendChild(el('section', { class: 'modal-section' }, [
      el('h3', { text: 'Representação esquemática' }),
      box,
      el('p', { class: 'modal-note', text: 'Representação simples, montada só com os nomes de campos e botões.' })
    ]));
    var knows = knowsSection(pilotId);
    if (knows) body.appendChild(knows);
    $('screen-modal-overlay').hidden = false;
    $('screen-modal-overlay').querySelector('.modal-dialog').scrollTop = 0;
    document.body.classList.add('modal-open');
    $('screen-modal-close').focus();
  }

  function closeScreenModal() {
    $('screen-modal-overlay').hidden = true;
    document.body.classList.remove('modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function trapFocus(e) {
    if (e.key !== 'Tab' || $('screen-modal-overlay').hidden) return;
    var nodes = $('screen-modal-overlay').querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
    if (!nodes.length) return;
    var first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ---------------------------------------------------------------------------------
  // Início
  // ---------------------------------------------------------------------------------
  function renderHome() {
    $('home-total').textContent = String(data.home.total_questions);
    $('home-minutes').textContent = String(data.home.estimated_minutes);
    var s = computeStats();
    var hasProgress = started || Object.keys(answers).length > 0;
    $('btn-start').textContent = hasProgress ? 'CONTINUAR REVISÃO' : 'COMEÇAR REVISÃO';
    $('btn-restart').hidden = !hasProgress;
    var note = $('resume-note');
    note.hidden = !hasProgress;
    if (hasProgress) {
      note.textContent = 'Você já respondeu ' + (s.total - s.pending.length) + ' de ' + s.total +
        ' perguntas. Suas respostas estão salvas neste navegador.';
    }
  }

  function onStart() {
    started = true;
    var s = computeStats();
    // retoma de onde parou; se tudo já foi respondido, vai direto ao resumo
    if (s.pending.length === 0 && Object.keys(answers).length === questions.length) { openSummary(); return; }
    goTo(position);
  }

  // SYSCOM no topo: volta à Home SEM mexer nas respostas nem no armazenamento.
  // (não chama save(), não limpa nada; a Home passa a oferecer CONTINUAR REVISÃO se houver progresso)
  function goHome() {
    if (!$('screen-modal-overlay').hidden) closeScreenModal();
    renderHome();
    show('view-home');
  }

  function onRestart() {
    if (!window.confirm('Apagar as respostas salvas e recomeçar do zero?')) return;
    answers = {};
    position = 0;
    started = false;
    save();
    renderHome();
    show('view-home');
  }

  // ---------------------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------------------
  function bind() {
    $('btn-start').addEventListener('click', onStart);
    $('btn-restart').addEventListener('click', onRestart);
    $('btn-prev').addEventListener('click', onPrev);
    $('btn-skip').addEventListener('click', onSkip);
    $('btn-next').addEventListener('click', onNext);
    $('btn-go-summary').addEventListener('click', openSummary);
    $('btn-home').addEventListener('click', goHome);
    $('screen-modal-close-btn').addEventListener('click', closeScreenModal);
    $('btn-export').addEventListener('click', exportReview);
    $('btn-copy').addEventListener('click', copyReview);
    $('btn-back-questions').addEventListener('click', function () { goTo(position); });
    $('screen-modal-close').addEventListener('click', closeScreenModal);
    $('screen-modal-overlay').addEventListener('click', function (e) {
      if (e.target === $('screen-modal-overlay')) closeScreenModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('screen-modal-overlay').hidden) closeScreenModal();
      trapFocus(e);
    });
  }

  function fail(msg) {
    var box = $('load-error');
    box.textContent = msg;
    box.hidden = false;
  }

  function init() {
    bind();
    fetch('data/review-data.json')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        data = d;
        questions = d.questions;
        screens = d.screens;
        if (d.storage_key && d.storage_key !== STORAGE_KEY) {
          throw new Error('chave de armazenamento inconsistente');
        }
        loadSaved();
        $('storage-warning').hidden = storageOk;
        renderHome();
        show('view-home');
      })
      .catch(function () {
        fail('Não consegui carregar as perguntas. Se você abriu o arquivo direto do disco, abra pelo servidor local: ' +
             'na pasta do portal, rode "py -m http.server 8000" e acesse http://localhost:8000/.');
      });
  }

  document.addEventListener('DOMContentLoaded', init);

  // Gancho de teste (somente leitura do estado). Não altera o comportamento do portal.
  window.__k42 = { storageKey: STORAGE_KEY, buildExport: function () { return buildExport(); } };
})();
