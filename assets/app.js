// SYSCOM K4.1 Adaptive Review - JavaScript

(function() {
  'use strict';

  let reviewData = null;
  let allQuestions = [];
  let currentQuestionIndex = 0;
  let answers = {};
  let reviewerName = '';

  // LocalStorage keys
  const STORAGE_ANSWERS = 'k4_review_answers';
  const STORAGE_REVIEWER = 'k4_reviewer_name';
  const STORAGE_POSITION = 'k4_review_position';

  // Init
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    loadReviewData();
    restoreFromLocalStorage();
    setupEventListeners();
  }

  function loadReviewData() {
    fetch('data/review-data.json')
      .then(res => res.json())
      .then(data => {
        reviewData = data;
        buildAllQuestions();
        renderHome();
        renderScreensGrid();
      })
      .catch(err => {
        console.error('Erro ao carregar review-data.json:', err);
        alert('Erro ao carregar dados de revisão');
      });
  }

  function buildAllQuestions() {
    allQuestions = [];
    reviewData.screens.forEach(screen => {
      screen.questions.forEach(q => {
        allQuestions.push({
          ...q,
          screen_id: screen.screen_id,
          pilot_id: screen.pilot_id,
          screen_name: screen.name
        });
      });
    });
  }

  function renderHome() {
    const questionsNeeded = allQuestions.length;
    const screensWithQuestions = reviewData.metrics.screens_with_questions;
    const screensLearned = reviewData.metrics.screens_without_questions;

    document.getElementById('questions-needed').textContent = questionsNeeded;
    document.getElementById('screens-with-questions').textContent = screensWithQuestions;
    document.getElementById('screens-learned').textContent = screensLearned;
  }

  function renderScreensGrid() {
    const grid = document.getElementById('screens-grid');
    if (!grid) return;

    grid.innerHTML = reviewData.screens.map(screen => {
      const statusClass = `status-${screen.status.toLowerCase().replace(/ /g, '-')}`;
      const statusLabel = screen.status.replace(/_/g, ' ');
      const questionCount = screen.questions.length;
      const knowledgeCount = screen.reusable_knowledge_count;

      let actionButtons = '';
      if (screen.status === 'APRENDIDO') {
        actionButtons = `<button class="btn btn-outline btn-sm btn-view-screen" data-pilot-id="${screen.pilot_id}">Ver</button>`;
      } else if (questionCount > 0) {
        // PRECISA DE VOCÊ: tem pergunta nova para responder, além do detalhe.
        actionButtons = `
          <button class="btn btn-primary btn-sm btn-answer-screen" data-pilot-id="${screen.pilot_id}">Responder</button>
          <button class="btn btn-outline btn-sm btn-view-details" data-pilot-id="${screen.pilot_id}">Ver detalhes</button>
        `;
      } else {
        // PARCIAL (ou qualquer estado sem pergunta nova e sem status APRENDIDO): só o detalhe.
        actionButtons = `<button class="btn btn-outline btn-sm btn-view-details" data-pilot-id="${screen.pilot_id}">Ver detalhes</button>`;
      }

      return `
        <div class="screen-card">
          <div class="screen-card-header">
            <h3>${screen.name}</h3>
            <span class="screen-status ${statusClass}">${statusLabel}</span>
          </div>
          <div class="screen-card-meta">
            <div>${questionCount} ${questionCount === 1 ? 'pergunta nova' : 'perguntas novas'}</div>
            <div>${knowledgeCount} ${knowledgeCount === 1 ? 'conhecimento reaproveitado' : 'conhecimentos reaproveitados'}</div>
          </div>
          <div class="screen-card-actions">
            ${actionButtons}
          </div>
        </div>
      `;
    }).join('');

    // Event listeners para botões de responder
    document.querySelectorAll('.btn-answer-screen').forEach(btn => {
      btn.addEventListener('click', () => {
        const pilotId = btn.dataset.pilotId;
        startReviewForScreen(pilotId);
      });
    });

    // Event listeners para "Ver" (APRENDIDO) e "Ver detalhes" (PRECISA DE VOCÊ / PARCIAL)
    document.querySelectorAll('.btn-view-screen, .btn-view-details').forEach(btn => {
      btn.addEventListener('click', () => {
        const pilotId = btn.dataset.pilotId;
        openScreenDetailModal(pilotId);
      });
    });
  }

  // ============================================================================
  // MODAL DE DETALHE DA TELA
  // ============================================================================

  function findScreenByPilotId(pilotId) {
    return reviewData.screens.find(s => s.pilot_id === pilotId) || null;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function renderSchematicSection(schematic) {
    if (!schematic) return '<p class="schematic-empty">Sem representação estrutural disponível para esta tela.</p>';

    const hasAnything = (schematic.fields && schematic.fields.length) ||
      (schematic.actions && schematic.actions.length) ||
      (schematic.grids && schematic.grids.length) ||
      (schematic.tabs && schematic.tabs.length) ||
      (schematic.groups && schematic.groups.length);

    if (!hasAnything) {
      return '<p class="schematic-empty">Sem representação estrutural disponível para esta tela.</p>';
    }

    let rows = '';

    if (schematic.tabs && schematic.tabs.length) {
      rows += `<div class="schematic-row">
        <span class="schematic-row-label">Abas</span>
        ${schematic.tabs.map(t => `<span class="schematic-chip">${escapeHtml(t)}</span>`).join('')}
      </div>`;
    }

    if (schematic.groups && schematic.groups.length) {
      rows += `<div class="schematic-row">
        <span class="schematic-row-label">Grupos</span>
        ${schematic.groups.map(g => `<span class="schematic-chip">${escapeHtml(g)}</span>`).join('')}
      </div>`;
    }

    if (schematic.fields && schematic.fields.length) {
      rows += `<div class="schematic-row">
        <span class="schematic-row-label">Campos</span>
        ${schematic.fields.map(f => `<span class="schematic-chip schematic-chip-field">${escapeHtml(f.label)}
          ${f.type ? `<span class="schematic-chip-type">${escapeHtml(f.type)}</span>` : ''}</span>`).join('')}
      </div>`;
    }

    if (schematic.actions && schematic.actions.length) {
      rows += `<div class="schematic-row">
        <span class="schematic-row-label">Botões</span>
        ${schematic.actions.map(a => `<span class="schematic-chip schematic-chip-action">${escapeHtml(a.label)}</span>`).join('')}
      </div>`;
    }

    if (schematic.grids && schematic.grids.length) {
      rows += schematic.grids.map(g => `<div class="schematic-row">
        <span class="schematic-row-label">Lista</span>
        ${(g.columns || []).map(c => `<span class="schematic-chip schematic-chip-grid">${escapeHtml(c)}</span>`).join('')}
      </div>`).join('');
    }

    return `<div class="schematic-box">${rows}</div>`;
  }

  function renderLearnedKnowledgeSection(learnedKnowledge) {
    if (!learnedKnowledge || learnedKnowledge.length === 0) {
      return '<p class="schematic-empty">Nenhum conhecimento reaproveitado nesta tela ainda.</p>';
    }
    return `<ul class="learned-list">
      ${learnedKnowledge.map(item => `
        <li class="learned-item">
          <div class="learned-item-subject">${escapeHtml(item.subject)}</div>
          <div class="learned-item-origin">${escapeHtml(item.origin)}</div>
          ${item.note ? `<div class="learned-item-note">${escapeHtml(item.note)}</div>` : ''}
        </li>
      `).join('')}
    </ul>`;
  }

  function renderUnknownsSection(unknowns) {
    if (!unknowns || unknowns.length === 0) return '';
    return `
      <div class="modal-section">
        <div class="modal-section-title">Ainda não sabemos</div>
        <ul class="unknowns-list">
          ${unknowns.map(u => `<li class="unknowns-item">${escapeHtml(u)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  function renderPendingQuestionsSection(screen) {
    if (!screen.questions || screen.questions.length === 0) return '';
    return `
      <div class="modal-section">
        <div class="modal-section-title">O que ainda precisamos confirmar</div>
        <ul class="pending-questions-list">
          ${screen.questions.map(q => `<li class="pending-questions-item">${escapeHtml(q.question)}</li>`).join('')}
        </ul>
        <div class="modal-footer-actions">
          <button type="button" class="btn btn-primary btn-sm btn-modal-responder" data-pilot-id="${screen.pilot_id}">Responder agora</button>
        </div>
      </div>
    `;
  }

  function renderWhyNoQuestionSection(screen) {
    if (!screen.why_no_question_needed) return '';
    return `
      <div class="modal-section">
        <div class="modal-section-title">Por que não precisamos perguntar agora?</div>
        <div class="why-no-question-box">${escapeHtml(screen.why_no_question_needed)}</div>
      </div>
    `;
  }

  function statusDisplayLabel(status) {
    const labels = {
      'APRENDIDO': 'A IA já entende esta tela',
      'PRECISA DE VOCÊ': 'Precisa da sua ajuda',
      'PARCIAL': 'Entendimento parcial'
    };
    return labels[status] || status;
  }

  function openScreenDetailModal(pilotId) {
    const screen = findScreenByPilotId(pilotId);
    if (!screen) return;

    const overlay = document.getElementById('screen-modal-overlay');
    const titleEl = document.getElementById('screen-modal-title');
    const statusEl = document.getElementById('screen-modal-status');
    const bodyEl = document.getElementById('screen-modal-body');

    titleEl.textContent = screen.name;

    const statusClass = `status-${screen.status.toLowerCase().replace(/ /g, '-')}`;
    statusEl.className = `modal-status ${statusClass}`;
    statusEl.textContent = statusDisplayLabel(screen.status);

    const focusHtml = screen.focus
      ? `<p class="modal-focus-text">${escapeHtml(screen.focus)}</p>`
      : '';

    bodyEl.innerHTML = `
      ${focusHtml}
      <div class="modal-section">
        <div class="modal-section-title">O que a IA identificou</div>
        ${renderSchematicSection(screen.schematic)}
      </div>
      <div class="modal-section">
        <div class="modal-section-title">O que já aprendemos</div>
        ${renderLearnedKnowledgeSection(screen.learned_knowledge)}
      </div>
      ${renderUnknownsSection(screen.unknowns)}
      ${renderWhyNoQuestionSection(screen)}
      ${renderPendingQuestionsSection(screen)}
    `;

    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const responderBtn = bodyEl.querySelector('.btn-modal-responder');
    if (responderBtn) {
      responderBtn.addEventListener('click', () => {
        closeScreenDetailModal();
        startReviewForScreen(pilotId);
      });
    }
  }

  function closeScreenDetailModal() {
    const overlay = document.getElementById('screen-modal-overlay');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  function startReviewForScreen(pilotId) {
    const firstQuestionIndex = allQuestions.findIndex(q => q.pilot_id === pilotId);
    if (firstQuestionIndex >= 0) {
      currentQuestionIndex = firstQuestionIndex;
      showReviewSection();
      renderQuestion();
    }
  }

  function showReviewSection() {
    document.getElementById('revisao-rapida').style.display = 'block';
    document.getElementById('revisao-rapida').scrollIntoView({ behavior: 'smooth' });
  }

  // Modos sem hipótese estrutural para comparar: resposta é texto livre
  // ("open" = conhecimento novo; "screen_specific" = pergunta de negócio/identidade).
  const OPEN_MODES = ['open', 'screen_specific'];

  function isOpenMode(mode) {
    return OPEN_MODES.indexOf(mode) !== -1;
  }

  function renderQuestion() {
    if (!allQuestions[currentQuestionIndex]) {
      showCompletion();
      return;
    }

    const q = allQuestions[currentQuestionIndex];
    const card = document.getElementById('question-card');
    const openMode = isOpenMode(q.mode);

    const existingKnowledge = q.existing_knowledge
      ? `<div class="question-learned">
           <strong>Já aprendemos:</strong> ${q.existing_knowledge.source}
         </div>`
      : '';

    const impact = q.affected_screens && q.affected_screens.length > 0
      ? `<div class="question-impact">
           Esta resposta pode ajudar ${q.affected_screens.length} ${q.affected_screens.length === 1 ? 'outra tela' : 'outras telas'}
         </div>`
      : '';

    const headerBadge = openMode
      ? `<div class="open-question-badge">Precisamos do seu conhecimento</div>`
      : '';

    const bodyHtml = openMode
      ? renderOpenQuestionBody(q)
      : renderClosedQuestionBody(q);

    card.innerHTML = `
      <div class="question-header">
        <div class="question-context">
          <strong>${q.screen_name}</strong> (${q.pilot_id}) · ${q.subject}
        </div>
        ${headerBadge}
        ${existingKnowledge}
        <div class="question-text">${q.question}</div>
        ${openMode ? '<p class="open-question-subtext">A IA não conseguiu concluir isso pelas telas.</p>' : ''}
        ${impact}
      </div>
      <div class="question-body">
        ${bodyHtml}
        <div class="validation-message" id="validation-message" style="display:none;"></div>
      </div>
    `;

    updateProgress();
    restoreAnswer(q.question_id, openMode);
    setupAnswerListeners(openMode);
  }

  function renderClosedQuestionBody(q) {
    const options = [
      { code: 'SAME', label: 'SIM, FUNCIONA ASSIM' },
      { code: 'DIFFERENT', label: 'FUNCIONA DIFERENTE' },
      { code: 'UNKNOWN', label: 'NÃO SEI' },
      { code: 'NOT_APPLICABLE', label: 'NÃO SE APLICA' }
    ];

    const optionsHtml = options.map(opt => `
      <div class="answer-option" data-code="${opt.code}">
        <input type="radio" name="answer" value="${opt.code}" id="answer-${opt.code}">
        <label for="answer-${opt.code}">${opt.label}</label>
      </div>
    `).join('');

    return `
      <div class="answer-options" id="answer-options">
        ${optionsHtml}
      </div>
      <div class="condition-field" id="condition-field">
        <label for="condition-text">Existe alguma condição, exceção ou detalhe importante? <span class="field-optional">(opcional)</span></label>
        <textarea id="condition-text" placeholder="Ex.: só funciona depois de selecionar o cliente, pede confirmação, depende de outro campo..."></textarea>
      </div>
      <div class="explanation-field" id="explanation-field">
        <label for="explanation-text">Explique como funciona nesta tela.</label>
        <textarea id="explanation-text" placeholder="Explique do seu jeito..."></textarea>
      </div>
    `;
  }

  function renderOpenQuestionBody(q) {
    return `
      <div class="answer-options answer-options-open" id="answer-options">
        <div class="answer-option" data-code="EXPLAINED">
          <input type="radio" name="answer" value="EXPLAINED" id="answer-EXPLAINED">
          <label for="answer-EXPLAINED">SEI EXPLICAR</label>
        </div>
        <div class="answer-option" data-code="UNKNOWN">
          <input type="radio" name="answer" value="UNKNOWN" id="answer-UNKNOWN">
          <label for="answer-UNKNOWN">NÃO SEI</label>
        </div>
        <div class="answer-option" data-code="NOT_APPLICABLE">
          <input type="radio" name="answer" value="NOT_APPLICABLE" id="answer-NOT_APPLICABLE">
          <label for="answer-NOT_APPLICABLE">NÃO SE APLICA</label>
        </div>
      </div>
      <div class="explanation-field" id="explanation-field">
        <label for="explanation-text">Explique do seu jeito.</label>
        <textarea id="explanation-text" placeholder="Explique do seu jeito..."></textarea>
        <p class="explanation-hint">Não precisa escrever muito. Uma ou duas frases claras já ajudam.</p>
      </div>
    `;
  }

  function setupAnswerListeners(openMode) {
    const options = document.querySelectorAll('.answer-option');
    options.forEach(opt => {
      opt.addEventListener('click', () => {
        const radio = opt.querySelector('input[type="radio"]');
        radio.checked = true;

        options.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');

        const code = opt.dataset.code;
        updateFieldVisibility(code, openMode);
        saveCurrentAnswer();
      });
    });

    const explanationText = document.getElementById('explanation-text');
    if (explanationText) {
      explanationText.addEventListener('input', saveCurrentAnswer);
    }

    const conditionText = document.getElementById('condition-text');
    if (conditionText) {
      conditionText.addEventListener('input', saveCurrentAnswer);
    }
  }

  // Mostra/esconde os campos de texto conforme a resposta escolhida:
  // - SAME: campo de condição/exceção opcional
  // - DIFFERENT / EXPLAINED: campo de explicação (obrigatório para concluir)
  // - UNKNOWN / NOT_APPLICABLE: nenhum campo obrigatório
  function updateFieldVisibility(code, openMode) {
    const conditionField = document.getElementById('condition-field');
    const explanationField = document.getElementById('explanation-field');

    if (conditionField) {
      conditionField.classList.toggle('visible', code === 'SAME');
    }
    if (explanationField) {
      const needsExplanation = openMode ? code === 'EXPLAINED' : code === 'DIFFERENT';
      explanationField.classList.toggle('visible', needsExplanation);
    }

    hideValidationMessage();
  }

  function showValidationMessage(text) {
    const el = document.getElementById('validation-message');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
  }

  function hideValidationMessage() {
    const el = document.getElementById('validation-message');
    if (!el) return;
    el.style.display = 'none';
  }

  function saveCurrentAnswer() {
    const q = allQuestions[currentQuestionIndex];
    if (!q) return;

    const selectedOption = document.querySelector('input[name="answer"]:checked');
    if (!selectedOption) return;

    const answerCode = selectedOption.value;
    const explanationValue = (document.getElementById('explanation-text')?.value || '').trim();
    const conditionValue = (document.getElementById('condition-text')?.value || '').trim();

    const answer = {
      question_id: q.question_id,
      knowledge_key: q.knowledge_key,
      screen_id: q.screen_id,
      pilot_id: q.pilot_id,
      mode: q.mode,
      answer_code: answerCode,
      answered_at: new Date().toISOString()
    };

    // condition_or_exception só se aplica à resposta SAME, e só é gravado se preenchido.
    if (answerCode === 'SAME' && conditionValue) {
      answer.condition_or_exception = conditionValue;
    }

    // human_explanation vale para DIFFERENT (fechada) e EXPLAINED (aberta); só grava se preenchido.
    const explanationModeNeedsIt = (isOpenMode(q.mode) && answerCode === 'EXPLAINED') ||
      (!isOpenMode(q.mode) && answerCode === 'DIFFERENT');
    if (explanationModeNeedsIt && explanationValue) {
      answer.human_explanation = explanationValue;
    }

    answers[q.question_id] = answer;
    localStorage.setItem(STORAGE_ANSWERS, JSON.stringify(answers));
    localStorage.setItem(STORAGE_POSITION, currentQuestionIndex.toString());
  }

  function restoreAnswer(questionId, openMode) {
    const answer = answers[questionId];
    if (!answer) return;

    const radio = document.querySelector(`input[name="answer"][value="${answer.answer_code}"]`);
    if (radio) {
      radio.checked = true;
      const option = radio.closest('.answer-option');
      option.classList.add('selected');
      updateFieldVisibility(answer.answer_code, openMode);

      const conditionText = document.getElementById('condition-text');
      if (conditionText && answer.condition_or_exception) {
        conditionText.value = answer.condition_or_exception;
      }

      const explanationText = document.getElementById('explanation-text');
      if (explanationText && answer.human_explanation) {
        explanationText.value = answer.human_explanation;
      }
    }
  }

  // Avalia se a resposta atual (se houver) está completa, segundo a regra:
  // DIFFERENT/EXPLAINED exigem human_explanation; os demais códigos não exigem nada.
  function isAnswerComplete(answer) {
    if (!answer) return false;
    const needsExplanation = (isOpenMode(answer.mode) && answer.answer_code === 'EXPLAINED') ||
      (!isOpenMode(answer.mode) && answer.answer_code === 'DIFFERENT');
    if (needsExplanation) {
      return !!(answer.human_explanation && answer.human_explanation.trim());
    }
    return true;
  }

  function restoreFromLocalStorage() {
    const storedAnswers = localStorage.getItem(STORAGE_ANSWERS);
    if (storedAnswers) {
      answers = JSON.parse(storedAnswers);
    }

    const storedPosition = localStorage.getItem(STORAGE_POSITION);
    if (storedPosition) {
      currentQuestionIndex = parseInt(storedPosition, 10);
    }

    const storedReviewer = localStorage.getItem(STORAGE_REVIEWER);
    if (storedReviewer) {
      reviewerName = storedReviewer;
    }
  }

  function updateProgress() {
    const total = allQuestions.length;
    const current = currentQuestionIndex + 1;
    const answered = Object.keys(answers).length;
    const pending = total - answered;
    const percentComplete = (answered / total) * 100;

    document.getElementById('current-q').textContent = current;
    document.getElementById('total-q').textContent = total;
    document.getElementById('answered-count').textContent = answered;
    document.getElementById('pending-count').textContent = pending;
    document.getElementById('progress-fill').style.width = `${percentComplete}%`;
  }

  function showCompletion() {
    document.getElementById('question-card').style.display = 'none';
    document.querySelector('.review-actions').style.display = 'none';

    const completionMsg = document.getElementById('completion-message');
    completionMsg.style.display = 'block';

    const answeredList = Object.values(answers);
    const answered = answeredList.length;
    const knowledgeCleared = new Set(answeredList.map(a => a.knowledge_key)).size;
    const pending = allQuestions.length - answered;

    // X respostas objetivas: SAME/UNKNOWN/NOT_APPLICABLE em perguntas fechadas (sem explicação exigida).
    const objectiveCount = answeredList.filter(a =>
      !isOpenMode(a.mode) && a.answer_code !== 'DIFFERENT'
    ).length;
    // Y explicações adicionais: toda resposta com human_explanation ou condition_or_exception preenchidos.
    const explanationsCount = answeredList.filter(a =>
      a.human_explanation || a.condition_or_exception
    ).length;
    // Z perguntas abertas respondidas: modo open/screen_specific com resposta registrada.
    const openAnsweredCount = answeredList.filter(a => isOpenMode(a.mode)).length;

    document.getElementById('final-answered-count').textContent = answered;
    document.getElementById('knowledge-cleared-count').textContent = knowledgeCleared;

    const objectiveEl = document.getElementById('final-objective-count');
    if (objectiveEl) objectiveEl.textContent = objectiveCount;
    const explanationsEl = document.getElementById('final-explanations-count');
    if (explanationsEl) explanationsEl.textContent = explanationsCount;
    const openEl = document.getElementById('final-open-count');
    if (openEl) openEl.textContent = openAnsweredCount;
    const pendingEl = document.getElementById('final-pending-count');
    if (pendingEl) pendingEl.textContent = pending;
  }

  function setupEventListeners() {
    // Quick review CTA
    document.getElementById('cta-quick-review')?.addEventListener('click', (e) => {
      e.preventDefault();
      currentQuestionIndex = 0;
      showReviewSection();
      renderQuestion();
    });

    // Navigation buttons
    document.getElementById('btn-prev-question')?.addEventListener('click', () => {
      if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderQuestion();
      }
    });

    document.getElementById('btn-next-question')?.addEventListener('click', () => {
      const q = allQuestions[currentQuestionIndex];
      const currentAnswer = q ? answers[q.question_id] : null;

      // Se a pessoa já começou a responder (marcou uma opção) mas a explicação
      // obrigatória de FUNCIONA DIFERENTE / SEI EXPLICAR está vazia, não avança.
      if (currentAnswer && !isAnswerComplete(currentAnswer)) {
        showValidationMessage('Explique como funciona nesta tela antes de continuar.');
        document.getElementById('explanation-text')?.focus();
        return;
      }

      if (currentQuestionIndex < allQuestions.length - 1) {
        currentQuestionIndex++;
        renderQuestion();
      } else {
        showCompletion();
      }
    });

    document.getElementById('btn-skip-question')?.addEventListener('click', () => {
      if (currentQuestionIndex < allQuestions.length - 1) {
        currentQuestionIndex++;
        renderQuestion();
      } else {
        showCompletion();
      }
    });

    // Export buttons
    document.getElementById('btn-exportar')?.addEventListener('click', exportReview);
    document.getElementById('btn-export-final')?.addEventListener('click', exportReview);
    
    // Copy buttons
    document.getElementById('btn-copiar')?.addEventListener('click', copyReview);
    document.getElementById('btn-copy-final')?.addEventListener('click', copyReview);

    // Modal de detalhe da tela: fechar pelo X, pelo clique fora, ou por Esc
    document.getElementById('screen-modal-close')?.addEventListener('click', closeScreenDetailModal);
    document.getElementById('screen-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'screen-modal-overlay') {
        closeScreenDetailModal();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('screen-modal-overlay');
        if (overlay && overlay.style.display !== 'none') {
          closeScreenDetailModal();
        }
      }
    });
  }

  // Monta o objeto de export. baseline_knowledge_sources cita k3-01 como fonte
  // de conhecimento prévio; as respostas novas de K4 ficam só em "answers" (sem duplicar k3-01 ali).
  function buildReviewExport(reviewerInput) {
    return {
      schema: 'syscom-human-review-k4@1.0.0',
      batch_id: reviewData.batch_id,
      stage: reviewData.stage,
      reviewer: reviewerInput || 'Anonymous',
      reviewed_at: new Date().toISOString(),
      baseline_knowledge_sources: [reviewData.baseline_knowledge],
      answers: Object.values(answers),
      metrics: {
        total_questions: allQuestions.length,
        answered: Object.keys(answers).length,
        knowledge_keys_cleared: new Set(Object.values(answers).map(a => a.knowledge_key)).size
      }
    };
  }

  function exportReview() {
    const reviewer = reviewerName || prompt('Seu nome (para identificação):') || 'Anonymous';
    const reviewExport = buildReviewExport(reviewer);

    if (reviewer !== 'Anonymous') {
      reviewerName = reviewer;
      localStorage.setItem(STORAGE_REVIEWER, reviewer);
    }

    const blob = new Blob([JSON.stringify(reviewExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'syscom-human-review-k4.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert('Revisão exportada com sucesso!');
  }

  function copyReview() {
    const reviewExport = buildReviewExport(reviewerName);
    const text = JSON.stringify(reviewExport, null, 2);
    navigator.clipboard.writeText(text)
      .then(() => alert('Revisão copiada para a área de transferência!'))
      .catch(err => {
        console.error('Erro ao copiar:', err);
        alert('Erro ao copiar. Use o botão Exportar.');
      });
  }

})();
