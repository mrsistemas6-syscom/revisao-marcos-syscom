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

      let actionButton = '';
      if (questionCount > 0) {
        actionButton = `<button class="btn btn-primary btn-sm btn-answer-screen" data-pilot-id="${screen.pilot_id}">Responder</button>`;
      } else {
        actionButton = `<button class="btn btn-outline btn-sm" disabled>Ver</button>`;
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
            ${actionButton}
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

  function renderQuestion() {
    if (!allQuestions[currentQuestionIndex]) {
      showCompletion();
      return;
    }

    const q = allQuestions[currentQuestionIndex];
    const card = document.getElementById('question-card');
    
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

    card.innerHTML = `
      <div class="question-header">
        <div class="question-context">
          <strong>${q.screen_name}</strong> (${q.pilot_id}) · ${q.subject}
        </div>
        ${existingKnowledge}
        <div class="question-text">${q.question}</div>
        ${impact}
      </div>
      <div class="question-body">
        <div class="answer-options" id="answer-options">
          ${renderAnswerOptions(q)}
        </div>
        <div class="explanation-field" id="explanation-field">
          <label for="explanation-text">Como funciona aqui?</label>
          <textarea id="explanation-text" placeholder="Explique do seu jeito..."></textarea>
        </div>
      </div>
    `;

    updateProgress();
    restoreAnswer(q.question_id);
    setupAnswerListeners();
  }

  function renderAnswerOptions(q) {
    // Simplified answer set
    const options = [
      { code: 'SAME', label: 'SIM, FUNCIONA ASSIM' },
      { code: 'DIFFERENT', label: 'FUNCIONA DIFERENTE' },
      { code: 'UNKNOWN', label: 'NÃO SEI' },
      { code: 'NOT_APPLICABLE', label: 'NÃO SE APLICA' }
    ];

    return options.map(opt => `
      <div class="answer-option" data-code="${opt.code}">
        <input type="radio" name="answer" value="${opt.code}" id="answer-${opt.code}">
        <label for="answer-${opt.code}">${opt.label}</label>
      </div>
    `).join('');
  }

  function setupAnswerListeners() {
    const options = document.querySelectorAll('.answer-option');
    options.forEach(opt => {
      opt.addEventListener('click', () => {
        const radio = opt.querySelector('input[type="radio"]');
        radio.checked = true;
        
        options.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');

        const code = opt.dataset.code;
        const needsExplanation = code === 'DIFFERENT';
        const explanationField = document.getElementById('explanation-field');
        
        if (needsExplanation) {
          explanationField.classList.add('visible');
        } else {
          explanationField.classList.remove('visible');
        }

        saveCurrentAnswer();
      });
    });

    const explanationText = document.getElementById('explanation-text');
    if (explanationText) {
      explanationText.addEventListener('input', saveCurrentAnswer);
    }
  }

  function saveCurrentAnswer() {
    const q = allQuestions[currentQuestionIndex];
    if (!q) return;

    const selectedOption = document.querySelector('input[name="answer"]:checked');
    if (!selectedOption) return;

    const answer = {
      question_id: q.question_id,
      knowledge_key: q.knowledge_key,
      screen_id: q.screen_id,
      pilot_id: q.pilot_id,
      answer_code: selectedOption.value,
      explanation: document.getElementById('explanation-text')?.value || '',
      answered_at: new Date().toISOString()
    };

    answers[q.question_id] = answer;
    localStorage.setItem(STORAGE_ANSWERS, JSON.stringify(answers));
    localStorage.setItem(STORAGE_POSITION, currentQuestionIndex.toString());
  }

  function restoreAnswer(questionId) {
    const answer = answers[questionId];
    if (!answer) return;

    const radio = document.querySelector(`input[name="answer"][value="${answer.answer_code}"]`);
    if (radio) {
      radio.checked = true;
      const option = radio.closest('.answer-option');
      option.classList.add('selected');

      if (answer.answer_code === 'DIFFERENT') {
        const explanationField = document.getElementById('explanation-field');
        explanationField.classList.add('visible');
        document.getElementById('explanation-text').value = answer.explanation || '';
      }
    }
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
    document.getElementById('review-actions').style.display = 'none';
    
    const completionMsg = document.getElementById('completion-message');
    completionMsg.style.display = 'block';
    
    const answered = Object.keys(answers).length;
    const knowledgeCleared = new Set(Object.values(answers).map(a => a.knowledge_key)).size;
    
    document.getElementById('final-answered-count').textContent = answered;
    document.getElementById('knowledge-cleared-count').textContent = knowledgeCleared;
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
  }

  function exportReview() {
    const reviewExport = {
      schema: 'syscom-human-review-k4@1.0.0',
      batch_id: reviewData.batch_id,
      stage: reviewData.stage,
      reviewer: reviewerName || prompt('Seu nome (para identificação):') || 'Anonymous',
      reviewed_at: new Date().toISOString(),
      baseline_knowledge_sources: [reviewData.baseline_knowledge],
      answers: Object.values(answers),
      metrics: {
        total_questions: allQuestions.length,
        answered: Object.keys(answers).length,
        knowledge_keys_cleared: new Set(Object.values(answers).map(a => a.knowledge_key)).size
      }
    };

    if (reviewExport.reviewer !== 'Anonymous') {
      localStorage.setItem(STORAGE_REVIEWER, reviewExport.reviewer);
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
    const reviewExport = {
      schema: 'syscom-human-review-k4@1.0.0',
      batch_id: reviewData.batch_id,
      stage: reviewData.stage,
      reviewer: reviewerName || 'Anonymous',
      reviewed_at: new Date().toISOString(),
      baseline_knowledge_sources: [reviewData.baseline_knowledge],
      answers: Object.values(answers),
      metrics: {
        total_questions: allQuestions.length,
        answered: Object.keys(answers).length,
        knowledge_keys_cleared: new Set(Object.values(answers).map(a => a.knowledge_key)).size
      }
    };

    const text = JSON.stringify(reviewExport, null, 2);
    navigator.clipboard.writeText(text)
      .then(() => alert('Revisão copiada para a área de transferência!'))
      .catch(err => {
        console.error('Erro ao copiar:', err);
        alert('Erro ao copiar. Use o botão Exportar.');
      });
  }

})();
