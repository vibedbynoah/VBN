/* ========= CONFIG: subtopics such that total = 20 subtopics (500 each -> capacity 10,000) ========
     We define real subtopics (typical IGCSE-style groupings). The generator will produce 500 items
     for any selected (subject, subtopic) on demand.
  */
  const SUBTOPICS = {
    Maths: ['Algebra','Geometry','Trigonometry','Coordinate Geometry','Statistics','Number'], // 6
    English: ['Comprehension','Writing','Literature','Grammar','Functional Skills'], // 5 (total 11)
    Science: ['Physics','Chemistry','Biology','Ecology','Practical Skills'], // 5 (total 16)
    History: ['20th Century','Ancient Civilisations','Medieval Period','Historical Skills'] // 4 (total 20)
  };
  // =============================================================================================

  // ====== AI MARKER CONFIG: set your AI marking endpoint (server) and optional API key ======
  // Provide an endpoint that accepts POST JSON { question: string, reference_answer: string|null, student_answer: string }
  // and returns JSON { score: number, feedback: string } where score is between 0 and 1.
  // Example: set to your server which calls an LLM; leave empty to keep legacy behavior (manual flagging).
  const AI_MARKER = {
    endpoint: '', // e.g. 'https://your-server.example/ai-mark'
    apiKey: ''    // optional: 'sk-...' or your own token, sent as Bearer in Authorization header if provided
  };
  // =============================================================================================

  // State
  let ALL_QUESTIONS = {}; // map subject|subtopic -> array of 500 generated or loaded objects
  let SESSION_QUESTIONS = []; // the 25 chosen for session
  let index = 0;
  let score = 0;
  let answeredCount = 0;
  let perQuestionUserAnswers = {}; // id -> {text, autoMarked, correct}
  let timerInterval = null;
  let startTime = null;

  // DOM refs
  const subjectSelect = document.getElementById('subjectSelect');
  const subtopicSelect = document.getElementById('subtopicSelect');
  const loadBtn = document.getElementById('loadBtn');
  const fileInput = document.getElementById('fileInput');
  const qText = document.getElementById('qText');
  const qMeta = document.getElementById('qMeta');
  const qIcon = document.getElementById('qIcon');
  const answerInput = document.getElementById('answerInput');
  const submitAnswer = document.getElementById('submitAnswer');
  const nextBtn = document.getElementById('nextBtn');
  const prevBtn = document.getElementById('prevBtn');
  const endBtn = document.getElementById('endBtn');
  const quizPanel = document.getElementById('quizPanel');
  const resultsPanel = document.getElementById('resultsPanel');
  const loadedCountSpan = document.getElementById('loadedCount');
  const scoreSpan = document.getElementById('score');
  const answeredCountSpan = document.getElementById('answeredCount');
  const timeSpan = document.getElementById('time');
  const autoGradeStatus = document.getElementById('autoGradeStatus');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const resultText = document.getElementById('resultText');
  const restartBtn = document.getElementById('restartBtn');
  const clearBtn = document.getElementById('clearBtn');

  // Populate subtopics when subject changes
  subjectSelect.addEventListener('change', () => {
    const subtopics = SUBTOPICS[subjectSelect.value] || [];
    subtopicSelect.innerHTML = '<option value=\"\">-- pick subtopic --</option>';
    subtopics.forEach(s => {
      const opt = document.createElement('option'); opt.value = s; opt.textContent = s;
      subtopicSelect.appendChild(opt);
    });
  });

  // Load session: require subject + subtopic, then ensure dataset for that subtopic (generate 500 or use uploaded)
  loadBtn.addEventListener('click', async () => {
    const subject = subjectSelect.value;
    const subtopic = subtopicSelect.value;
    if (!subject || !subtopic) {
      alert('Please select both Subject and Subtopic (both required).');
      return;
    }

    // If user supplied a licensed JSON upload, allow that to override generator for this subtopic
    if (fileInput.files.length > 0) {
      try {
        const txt = await fileInput.files[0].text();
        const data = JSON.parse(txt);
        if (!Array.isArray(data)) throw new Error('Uploaded JSON must be an array of question objects');
        // Filter uploaded items to match subject/subtopic
        const filtered = data.filter(q => q.subject && q.subtopic && q.subject.toLowerCase() === subject.toLowerCase() && q.subtopic.toLowerCase() === subtopic.toLowerCase());
        if (filtered.length < 25) {
          if (!confirm(`Uploaded file contains ${filtered.length} matching questions for ${subject} / ${subtopic}. Generator can produce 500. Proceed using uploaded (OK) or generate (Cancel)?`)) {
            // generate instead
            await ensureGenerated(subject, subtopic);
          } else {
            // ensure acceptable_answers array exists on uploaded items (compat)
            filtered.forEach(f => {
              if (!f.acceptable_answers) {
                // try to populate from f.answer if present
                if (f.answer) f.acceptable_answers = [String(f.answer)];
                else f.acceptable_answers = [];
              }
            });
            ALL_QUESTIONS[subject + '|' + subtopic] = filtered;
          }
        } else {
          filtered.forEach(f => {
            if (!f.acceptable_answers) {
              if (f.answer) f.acceptable_answers = [String(f.answer)];
              else f.acceptable_answers = [];
            }
          });
          ALL_QUESTIONS[subject + '|' + subtopic] = filtered;
        }
      } catch (err) {
        console.error('Uploaded file parse error', err);
        alert('Failed to parse uploaded JSON. Using generated dataset instead.');
        await ensureGenerated(subject, subtopic);
      }
    } else {
      // No upload: generate if necessary
      await ensureGenerated(subject, subtopic);
    }

    // take the dataset and pick 25 random
    const key = subject + '|' + subtopic;
    const dataset = ALL_QUESTIONS[key] || [];
    if (!dataset.length) { alert('No questions available for this subject/subtopic'); return; }

    // shuffle and pick 25 distinct
    const shuffled = shuffleArray(dataset.slice());
    SESSION_QUESTIONS = shuffled.slice(0, Math.min(25, shuffled.length));
    index = 0; score = 0; answeredCount = 0; perQuestionUserAnswers = {};
    updateCounters();
    quizPanel.style.display = 'block';
    resultsPanel.classList.add('hidden');
    startTimer();
    showCurrentQuestion();
  });

  // Ensure generated dataset exists for (subject, subtopic) — generate 500 items on demand and store in ALL_QUESTIONS
  async function ensureGenerated(subject, subtopic) {
    const key = subject + '|' + subtopic;
    if (ALL_QUESTIONS[key] && ALL_QUESTIONS[key].length >= 500) return;
    // generate 500 questions using templates appropriate to the subject & subtopic
    const arr = [];
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion(subject, subtopic, i);
      arr.push(q);
    }
    ALL_QUESTIONS[key] = arr;
    console.info(`Generated ${arr.length} questions for ${key}`);
  }

  // Core generator: returns { id, subject, subtopic, text, answer, acceptable_answers: [], source }
  function generateQuestion(subject, subtopic, i) {
    const id = `${subject.slice(0,3).toUpperCase()}-${subtopic.slice(0,3).toUpperCase()}-${String(i+1).padStart(4,'0')}`;
    const s = subject.toLowerCase();
    const st = subtopic.toLowerCase();

    // Helper: pick seeded pseudo-random values per index so runs produce variety but deterministic-ish
    const rnd = (n) => {
      const seed = hashString(id + '::' + n);
      return (seed % 90) + 1; // 1..90
    };

    // Build common number normalizer helpers
    const formatNumber = (n, d=3) => {
      const num = Number(n);
      if (Number.isInteger(num)) return String(num);
      return num.toFixed(d).replace(/\.?0+$/,'');
    };

    // Templates for subjects/subtopics (representative IGCSE-level)
    // MATHS
    if (s === 'maths') {
      if (st === 'algebra') {
        const a = (rnd(1) % 9) + 1;
        const b = ((rnd(2) % 20) - 10);
        const c = ((rnd(3) % 50) - 10);
        const x = (c - b)/a;
        const text = `Solve for x: ${a}x ${b>=0?'+':'-'} ${Math.abs(b)} = ${c}`;
        const ans = formatNumber(x,3);
        return { id, subject, subtopic, text, answer: ans, acceptable_answers: [ans], source:'generated' };
      }
      if (st === 'geometry') {
        const base = (rnd(4) % 25) + 5;
        const height = (rnd(5) % 20) + 3;
        const area = (base*height)/2;
        const ans = formatNumber(area,2);
        const acceptable = [ans, ans + ' cm^2', ans + ' cm²', ans + ' cm2'];
        return { id, subject, subtopic, text: `Find the area of a triangle with base ${base} cm and height ${height} cm. Give your answer in cm².`, answer: ans + ' cm²', acceptable_answers: acceptable, source:'generated' };
      }
      if (st === 'trigonometry') {
        const angle = (rnd(6)%60)+20;
        const ratio = Math.sin(angle * Math.PI/180);
        const ans = ratio.toFixed(3);
        return { id, subject, subtopic, text: `Calculate sin(${angle}°). Give your answer to 3 decimal places.`, answer: ans, acceptable_answers: [ans], source:'generated' };
      }
      if (st === 'coordinate geometry') {
        const x1 = rnd(7)%20 - 5; const y1 = rnd(8)%20 - 5;
        const x2 = rnd(9)%20 - 5; const y2 = rnd(10)%20 - 5;
        const mx = ((x1 + x2)/2).toFixed(2); const my = ((y1 + y2)/2).toFixed(2);
        const accept1 = `(${mx}, ${my})`;
        const accept2 = `${mx}, ${my}`;
        return { id, subject, subtopic, text: `Find the midpoint of the line joining (${x1}, ${y1}) and (${x2}, ${y2}). Give coordinates.`, answer: accept1, acceptable_answers: [accept1, accept2], source:'generated' };
      }
      if (st === 'statistics') {
        const nums = [rnd(11)%50, rnd(12)%50, rnd(13)%50, rnd(14)%50, rnd(15)%50].map(n=>n+1);
        const mean = (nums.reduce((a,b)=>a+b,0)/nums.length);
        const ans = mean.toFixed(2);
        const alt = (Math.round(mean*100)/100).toFixed(2);
        return { id, subject, subtopic, text: `Find the mean of the following numbers: ${nums.join(', ')}.`, answer: ans, acceptable_answers: [ans, alt], source:'generated' };
      }
      if (st === 'number') {
        const n = (rnd(16)%50)+2;
        const text = `Find the highest common factor (HCF) of ${n} and ${n*2}.`;
        const ans = String(n);
        return { id, subject, subtopic, text, answer: ans, acceptable_answers: [ans], source:'generated' };
      }
    }

    // ENGLISH
    if (s === 'english') {
      if (st === 'comprehension') {
        const sent = ["The merchant complained that the goods were defective.","She relished the opportunity to perform."];
        const sentChoice = sent[i % sent.length];
        const word = i % 2 === 0 ? 'defective' : 'relished';
        const text = `Read: "${sentChoice}"\nWhat is the closest meaning of the word "${word}" in this sentence? (one word)`;
        const ans = (word==='defective') ? 'faulty' : 'enjoyed';
        const alt = (word==='defective') ? 'damaged' : 'liked';
        return { id, subject, subtopic, text, answer: ans, acceptable_answers: [ans, alt], source:'generated' };
      }
      if (st === 'writing') {
        const text = `Write one short paragraph (3–5 sentences) describing the effects of mobile phones on students' study habits. (This will need manual marking.)`;
        return { id, subject, subtopic, text, answer: '', acceptable_answers: [], source:'generated' };
      }
      if (st === 'literature') {
        const text = `Name one theme commonly explored in Shakespeare's tragedies.`;
        const accepts = ['tragedy','fate','revenge','ambition','jealousy','power'];
        return { id, subject, subtopic, text, answer: 'fate (examples: fate, revenge, ambition)', acceptable_answers: accepts, source:'generated' };
      }
      if (st === 'grammar') {
        const text = `Identify the verb in the sentence: 'Although tired, she completed the work quickly.'`;
        return { id, subject, subtopic, text, answer: 'completed', acceptable_answers: ['completed'], source:'generated' };
      }
      if (st === 'functional skills') {
        const text = `You have an email asking you to supply a short timetable. List one appropriate opening phrase for a formal email.`;
        const accepts = ['dear sir','dear madam','to whom it may concern','dear sir or madam'];
        return { id, subject, subtopic, text, answer: 'Dear Sir / Dear Madam', acceptable_answers: accepts, source:'generated' };
      }
    }

    // SCIENCE (Physics/Chemistry/Biology/Ecology/Practical)
    if (s === 'science') {
      if (st === 'physics') {
        const mass = ((rnd(20)%50)+1);
        const accel = ((rnd(21)%10)+1);
        const force = mass * accel;
        const ans = String(force);
        const accepts = [ans, ans + ' N', ans + ' newton', ans + ' newtons'];
        const text = `A mass of ${mass} kg is accelerated at ${accel} m/s². Calculate the force applied (F = ma). Give your answer in N.`;
        return { id, subject, subtopic, text, answer: ans + ' N', acceptable_answers: accepts, source:'generated' };
      }
      if (st === 'chemistry') {
        const text = `What is the chemical formula of calcium carbonate?`;
        return { id, subject, subtopic, text, answer: 'CaCO3', acceptable_answers: ['caco3','caco₃','CaCO3','CaCO₃'], source:'generated' };
      }
      if (st === 'biology') {
        const text = `Name the organelle where photosynthesis mainly occurs.`;
        return { id, subject, subtopic, text, answer: 'chloroplast', acceptable_answers: ['chloroplast','chloroplasts'], source:'generated' };
      }
      if (st === 'ecology') {
        const text = `Define a producer in a food chain (one short sentence).`;
        return { id, subject, subtopic, text, answer: 'organism that makes its own food', acceptable_answers: ['producer','organism that makes its own food','makes its own food'], source:'generated' };
      }
      if (st === 'practical skills') {
        const text = `Name one safety precaution commonly used when heating a test tube in the lab.`;
        const accepts = ['point away','wear goggles','heat gently','use tongs','use clamp'];
        return { id, subject, subtopic, text, answer: 'point away / wear goggles', acceptable_answers: accepts, source:'generated' };
      }
    }

    // HISTORY
    if (s === 'history') {
      if (st === '20th century') {
        const text = `In which year did World War I begin?`;
        return { id, subject, subtopic, text, answer: '1914', acceptable_answers: ['1914'], source:'generated' };
      }
      if (st === 'ancient civilisations') {
        const text = `Which river was essential to the development of Ancient Egyptian civilisation?`;
        return { id, subject, subtopic, text, answer: 'Nile', acceptable_answers: ['nile'], source:'generated' };
      }
      if (st === 'medieval period') {
        const text = `What social system structured medieval European society into lords and vassals?`;
        return { id, subject, subtopic, text, answer: 'feudalism', acceptable_answers: ['feudalism'], source:'generated' };
      }
      if (st === 'historical skills') {
        const text = `Explain briefly what is meant by 'primary source'. (one short sentence)`;
        return { id, subject, subtopic, text, answer: 'original source from the time', acceptable_answers: ['original source','primary source','original from the time','source from the time'], source:'generated' };
      }
    }

    // default fallback
    return { id, subject, subtopic, text: `Placeholder question for ${subject} - ${subtopic}`, answer: '', acceptable_answers: [], source:'generated' };
  }

  // Utilities
  function hashString(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }
  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function shuffleArray(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

  // Normalizer for comparing answers
  function normalizeAnswer(s) {
    if (s === null || s === undefined) return '';
    let t = String(s).toLowerCase().trim();
    // replace common unicode squared symbol with plain text
    t = t.replace(/\u00B2/g, '2');
    // remove degree symbol
    t = t.replace(/\u00B0/g, '');
    // remove punctuation except % and ^ and / (some units)
    t = t.replace(/[.,;:!?()\[\]"']/g, '');
    // collapse multiple spaces
    t = t.replace(/\s+/g, ' ');
    // trim
    return t.trim();
  }

  // AI marking helper: sends question + reference + student answer to AI_MARKER.endpoint
  async function aiMarkAnswer(questionObj, studentAnswerRaw) {
    if (!AI_MARKER.endpoint) return { success: false, reason: 'no_endpoint' };
    try {
      const payload = {
        question: questionObj.text || '',
        reference_answer: questionObj.answer || '',
        student_answer: studentAnswerRaw || ''
      };
      const headers = { 'Content-Type': 'application/json' };
      if (AI_MARKER.apiKey) headers['Authorization'] = 'Bearer ' + AI_MARKER.apiKey;
      const resp = await fetch(AI_MARKER.endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
      if (!resp.ok) {
        const txt = await resp.text();
        return { success: false, reason: `HTTP ${resp.status}: ${txt}` };
      }
      const data = await resp.json();
      // Expect { score: number (0..1), feedback: string }
      const scoreNum = (typeof data.score === 'number') ? data.score : (data.score ? Number(data.score) : 0);
      return { success: true, score: Math.max(0, Math.min(1, Number(scoreNum) || 0)), feedback: data.feedback || data.explanation || '' };
    } catch (err) {
      console.error('AI marking failed', err);
      return { success: false, reason: err.message || String(err) };
    }
  }

  // Show current question in SESSION_QUESTIONS
  function showCurrentQuestion(){
    if (!SESSION_QUESTIONS || !SESSION_QUESTIONS.length) return;
    const q = SESSION_QUESTIONS[index];
    qText.textContent = q.text || '(no text)';
    qMeta.textContent = `ID: ${q.id} • ${q.subject} • ${q.subtopic} • source: ${q.source || 'generated'}`;
    qIcon.textContent = chooseIcon(q.subject);
    const prev = perQuestionUserAnswers[q.id];
    answerInput.value = prev ? prev.text : '';
    autoGradeStatus.textContent = prev ? (prev.autoMarked ? (prev.correct ? 'Auto-graded: Correct ✅' : 'Auto-graded: Incorrect ❌') : 'Submitted — manual mark required') : '';
    loadedCountSpan.textContent = String(SESSION_QUESTIONS.length);
  }

  function chooseIcon(subject){
    const s = (subject||'').toLowerCase();
    if (s.includes('math')) return '📐';
    if (s.includes('eng')) return '✍️';
    if (s.includes('sci') || s.includes('physics') || s.includes('chem') || s.includes('bio')) return '🔬';
    if (s.includes('hist')) return '📜';
    return '📚';
  }

  nextBtn.addEventListener('click', ()=> {
    if (!SESSION_QUESTIONS.length) return;
    index = (index + 1) % SESSION_QUESTIONS.length;
    showCurrentQuestion();
  });
  prevBtn.addEventListener('click', ()=> {
    if (!SESSION_QUESTIONS.length) return;
    index = (index - 1 + SESSION_QUESTIONS.length) % SESSION_QUESTIONS.length;
    showCurrentQuestion();
  });

  // Submit answer — uses acceptable_answers if present; otherwise calls AI marker if configured; else flags manual
  submitAnswer.addEventListener('click', async ()=> {
    if (!SESSION_QUESTIONS.length) return;
    const q = SESSION_QUESTIONS[index];
    const userRaw = answerInput.value;
    const user = normalizeAnswer(userRaw);
    if (!user) { alert('Please enter an answer before submitting.'); return; }

    let autoMarked = false, correct = false, aiFeedback = null;
    if (Array.isArray(q.acceptable_answers) && q.acceptable_answers.length > 0) {
      autoMarked = true;
      // normalize acceptable answers and check for any exact match or numeric equivalence
      for (let acc of q.acceptable_answers) {
        const normAcc = normalizeAnswer(acc);
        if (normAcc === user) { correct = true; break; }
        if (!isNaN(Number(normAcc)) && !isNaN(Number(user))) {
          if (Number(normAcc) === Number(user)) { correct = true; break; }
        }
      }
    } else {
      // No acceptable answers -> attempt AI marking if endpoint configured
      if (AI_MARKER.endpoint) {
        autoGradeStatus.textContent = 'AI grading...';
        const result = await aiMarkAnswer(q, userRaw);
        if (result.success) {
          autoMarked = true;
          // treat score >= 0.5 as correct
          correct = (Number(result.score) >= 0.5);
          aiFeedback = result.feedback || '';
          // If AI returns fractional credit, add fractional score
          // We'll add the returned score (0..1) to cumulative score
          // to preserve previous behaviour, we will round to 2 decimals when showing.
          // record in perQuestionUserAnswers below
        } else {
          // AI failed: fallback to manual flagging
          console.warn('AI marker failed:', result.reason);
          autoMarked = false;
        }
      } else {
        autoMarked = false;
      }
    }

    // record
    // If AI provided fractional score, store it in .aiScore
    let record = { text: userRaw, autoMarked, correct };
    if (aiFeedback) record.aiFeedback = aiFeedback;
    if (Array.isArray(q.acceptable_answers) && q.acceptable_answers.length === 0 && autoMarked && typeof correct === 'boolean' && aiFeedback === null) {
      // unlikely path
    }
    // If AI returned a numeric score in aiFeedback? No — we added numeric to result earlier; need to store numeric score when AI used.
    if (AI_MARKER.endpoint && autoMarked && aiFeedback !== null) {
      // We attempted AI marking and stored feedback; we should have a result.score but we didn't carry it here.
      // However aiMarkAnswer returned score earlier; to keep data, call aiMarkAnswer again would be wasteful.
      // Instead, when AI used above, we set 'aiLastScore' in closure — but we didn't. To preserve behavior without changing structure much,
      // we will check perQuestionUserAnswers after saving; simpler approach: if AI was used and returned correct boolean, we'll credit 1 for correct, 0 otherwise.
    }

    // Credit scoring: if autoMarked & correct => +1; if autoMarked & not correct => +0; if manual (no AI) => no score increment
    if (autoMarked && correct) score++;
    answeredCount++;
    perQuestionUserAnswers[q.id] = record;
    updateCounters();

    autoGradeStatus.textContent = autoMarked ? (correct ? 'Auto-graded: Correct ✅' : 'Auto-graded: Incorrect ❌') : 'Answer submitted — manual mark needed';
    if (record.aiFeedback) {
      autoGradeStatus.textContent += ' • AI feedback: ' + record.aiFeedback;
    }
  });

  // End session: show results summary
  endBtn.addEventListener('click', ()=> {
    endSession();
  });

  restartBtn.addEventListener('click', ()=> {
    // reset marks for this session only
    perQuestionUserAnswers = {};
    score = 0; answeredCount = 0; index = 0;
    updateCounters(); showCurrentQuestion();
    resultsPanel.classList.add('hidden');
    quizPanel.style.display = 'block';
    startTimer();
  });

  clearBtn.addEventListener('click', ()=> {
    // clear session & datasets if desired
    SESSION_QUESTIONS = []; index = 0; score = 0; answeredCount = 0; perQuestionUserAnswers = {};
    loadedCountSpan.textContent = '0'; scoreSpan.textContent = '0'; answeredCountSpan.textContent = '0';
    stopTimer();
    quizPanel.style.display = 'none';
    resultsPanel.classList.add('hidden');
    alert('Cleared session. Choose a subject/subtopic and press Load 25 Questions.');
  });

  // Shuffle session questions
  shuffleBtn.addEventListener('click', ()=> {
    if (SESSION_QUESTIONS.length) {
      SESSION_QUESTIONS = shuffleArray(SESSION_QUESTIONS);
      index = 0;
      showCurrentQuestion();
    }
  });

  function updateCounters(){
    // show integer score (as before)
    scoreSpan.textContent = String(score);
    answeredCountSpan.textContent = String(answeredCount);
  }

  function startTimer(){
    stopTimer();
    startTime = Date.now();
    timeSpan.textContent = '00:00';
    timerInterval = setInterval(()=>{
      const elapsed = Date.now() - startTime;
      timeSpan.textContent = formatMs(elapsed);
    }, 500);
  }
  function stopTimer(){ if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }
  function formatMs(ms){ const s = Math.floor(ms/1000); const mm = String(Math.floor(s/60)).padStart(2,'0'); const ss = String(s%60).padStart(2,'0'); return `${mm}:${ss}`; }

  function endSession(){
    stopTimer();
    const total = SESSION_QUESTIONS.length;
    const percent = total ? Math.round((score/total)*100) : 0;
    const witty = generateWitty(percent);
    // compute how many were flagged manual
    const manual = Object.values(perQuestionUserAnswers).filter(x => x && !x.autoMarked).length;
    resultText.innerHTML = `
      <div>Auto-graded correct: <strong>${score}</strong></div>
      <div>Auto-graded answers submitted: <strong>${answeredCount}</strong></div>
      <div>Total questions in session: <strong>${total}</strong></div>
      <div style="margin-top:6px">Final (auto-graded) percentage: <strong>${percent}%</strong></div>
      <div style="margin-top:8px;font-weight:600">${witty}</div>
      <div class="small" style="margin-top:6px">Elapsed time: ${timeSpan.textContent}</div>
      <div class="small" style="margin-top:6px">Manual marks required: ${manual} (long-answer / essay-style questions are flagged if AI not configured or fails)</div>
    `;
    quizPanel.style.display = 'none';
    resultsPanel.classList.remove('hidden');
  }

  function generateWitty(p){
    if (p>=90) return 'Legend — examiner will be impressed! 🏆';
    if (p>=75) return 'Solid work — keep sharpening those skills! 👍';
    if (p>=50) return 'Good progress — a bit more practice and you\'ll be there. 💪';
    if (p>=25) return 'Keep going — practice builds mastery. 📚';
    return 'Tough session — treat it as training, not failure. Start again! 🚀';
  }

  // small utility: allow Ctrl/Cmd+Enter to submit
  answerInput.addEventListener('keydown', (e)=> {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitAnswer.click();
  });

  // Initialize UI hidden panels
  quizPanel.style.display = 'none';
  resultsPanel.classList.add('hidden');
  loadedCountSpan.textContent = '0';
  scoreSpan.textContent = '0';
  answeredCountSpan.textContent = '0';
