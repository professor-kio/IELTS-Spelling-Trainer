let wordList = [];
let currentIndex = 0;
let timerInterval = null;
let audioLoopInterval = null;
let timeLeft = 20;
let timeLimit = 20;
let selectedPreset = 0;

let submittedCount = 0;
let correctCount = 0;
let wrongCount = 0;
let missedCount = 0;
let userResults = []; 
let currentMode = 'realtime';
let systemVoices = [];

const setupArea = document.getElementById('setup-area');
const trainerArea = document.getElementById('trainer-area');
const resultsArea = document.getElementById('results-area');
const fileInput = document.getElementById('file-input');
const textInput = document.getElementById('text-input');
const userInput = document.getElementById('user-input');
const diffDisplay = document.getElementById('diff-display');
const timerBar = document.getElementById('timer-bar');
const voiceSelect = document.getElementById('voice-select');
const timerSelect = document.getElementById('timer-select');
const loopToggle = document.getElementById('loop-audio-toggle');
const shuffleToggle = document.getElementById('shuffle-toggle');
const dedupeToggle = document.getElementById('dedupe-toggle');
const smartReviewToggle = document.getElementById('smart-review-toggle');
const wordCountInput = document.getElementById('word-count-input');
const loadingStatus = document.getElementById('loading-status');
const confirmModal = document.getElementById('confirm-modal');

// Smart Review Helper Functions using localStorage
function getWeakWords() {
  return JSON.parse(localStorage.getItem('ielts_weak_words') || '[]');
}

function saveWeakWord(word) {
  let weakWords = getWeakWords();
  word = word.toLowerCase();
  if (!weakWords.includes(word)) {
    weakWords.push(word);
    localStorage.setItem('ielts_weak_words', JSON.stringify(weakWords));
  }
}

function removeWeakWord(word) {
  let weakWords = getWeakWords();
  word = word.toLowerCase();
  weakWords = weakWords.filter(w => w !== word);
  localStorage.setItem('ielts_weak_words', JSON.stringify(weakWords));
}

function clearWeakWords() {
  localStorage.removeItem('ielts_weak_words');
  alert('Cleared all saved weak words!');
}

// Handle preset toggles
function setPreset(val, btn) {
  selectedPreset = val;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// Populate System Voices dynamically
function populateVoiceList() {
  if ('speechSynthesis' in window) {
    systemVoices = window.speechSynthesis.getVoices();
    voiceSelect.innerHTML = '';

    const englishVoices = systemVoices.filter(v => v.lang.startsWith('en'));
    const otherVoices = systemVoices.filter(v => !v.lang.startsWith('en'));
    const sorted = [...englishVoices, ...otherVoices];

    sorted.forEach((voice) => {
      const option = document.createElement('option');
      option.textContent = `${voice.name} (${voice.lang})`;
      option.value = voice.name;
      
      if (voice.name.includes('Natural') || voice.name.includes('Google') || voice.lang === 'en-GB' || voice.lang === 'en-US') {
        option.selected = true;
      }
      voiceSelect.appendChild(option);
    });
  }
}

populateVoiceList();
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = populateVoiceList;
}

// Handle TXT & PDF Uploads
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.name.endsWith('.pdf')) {
    loadingStatus.style.display = 'inline';
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let extractedText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        extractedText += pageText + ' ';
      }

      textInput.value = extractedText;
    } catch (err) {
      alert('Failed to read PDF file. Make sure it contains selectable text.');
      console.error(err);
    } finally {
      loadingStatus.style.display = 'none';
    }
  } else {
    const reader = new FileReader();
    reader.onload = (event) => { textInput.value = event.target.result; };
    reader.readAsText(file);
  }
});

// Extract ONLY pure letters (removes single-letter words)
function extractWordsFromPassage(rawText) {
  let extracted = rawText
    .split(/[^\p{L}]+/gu)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 1);

  if (dedupeToggle.checked) {
    extracted = Array.from(new Set(extracted));
  }

  return extracted;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function startPractice() {
  const rawText = textInput.value.trim();
  if (!rawText) {
    alert('Please enter or upload a passage/text first.');
    return;
  }

  let extracted = extractWordsFromPassage(rawText);
  if (extracted.length === 0) {
    alert('No valid letter-based words found in the text.');
    return;
  }

  // Smart Review prioritization
  if (smartReviewToggle.checked) {
    const weakWords = getWeakWords();
    const priorityWords = extracted.filter(w => weakWords.includes(w));
    const regularWords = extracted.filter(w => !weakWords.includes(w));

    if (shuffleToggle.checked) {
      shuffleArray(priorityWords);
      shuffleArray(regularWords);
    }

    extracted = [...priorityWords, ...regularWords];
  } else if (shuffleToggle.checked) {
    shuffleArray(extracted);
  }

  // Determine total practice size
  const customCount = parseInt(wordCountInput.value, 10) || 0;
  let targetLength = customCount + selectedPreset;

  if (targetLength <= 0) {
    targetLength = extracted.length;
  }

  wordList = extracted.slice(0, Math.min(targetLength, extracted.length));

  currentMode = document.querySelector('input[name="mode"]:checked').value;
  timeLimit = parseInt(timerSelect.value, 10);
  
  currentIndex = 0;
  submittedCount = 0;
  correctCount = 0;
  wrongCount = 0;
  missedCount = 0;
  userResults = [];

  document.getElementById('submitted-count').innerText = '0';
  document.getElementById('missed-count').innerText = '0';

  setupArea.style.display = 'none';
  resultsArea.style.display = 'none';
  trainerArea.style.display = 'flex';

  loadWord();
}

function loadWord() {
  stopAudioLoop();

  if (currentIndex >= wordList.length) {
    showResults();
    return;
  }

  userInput.value = '';
  document.getElementById('progress-text').innerText = `Word ${currentIndex + 1} of ${wordList.length}`;
  
  if (currentMode === 'anonymous') {
    diffDisplay.innerHTML = '&nbsp;';
  } else {
    renderDiff();
  }

  userInput.focus();
  
  speakCurrentWord();
  if (loopToggle.checked) {
    audioLoopInterval = setInterval(() => {
      speakCurrentWord();
    }, 2500);
  }

  startTimer();
}

function speakCurrentWord(forceManual = false) {
  const word = wordList[currentIndex];
  if (!word || !('speechSynthesis' in window)) return;

  if (forceManual) {
    window.speechSynthesis.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(word);
  const selectedVoiceName = voiceSelect.value;
  const selectedVoiceObj = systemVoices.find(v => v.name === selectedVoiceName);

  if (selectedVoiceObj) {
    utterance.voice = selectedVoiceObj;
  }
  
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

function stopAudioLoop() {
  if (audioLoopInterval) {
    clearInterval(audioLoopInterval);
    audioLoopInterval = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function startTimer() {
  clearInterval(timerInterval);
  timeLeft = timeLimit;
  updateTimerBar();

  timerInterval = setInterval(() => {
    timeLeft -= 0.1;
    updateTimerBar();

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      submitWord();
    }
  }, 100);
}

function updateTimerBar() {
  const percentage = Math.max(0, (timeLeft / timeLimit) * 100);
  timerBar.style.width = percentage + '%';
}

function renderDiff() {
  const targetWord = wordList[currentIndex];
  const typedText = userInput.value;
  let html = '';

  for (let i = 0; i < typedText.length; i++) {
    const typedChar = typedText[i];
    const targetChar = targetWord[i];

    if (targetChar && typedChar.toLowerCase() === targetChar.toLowerCase()) {
      html += `<span class="char-correct">${typedChar}</span>`;
    } else {
      html += `<span class="char-wrong">${typedChar}</span>`;
    }
  }

  diffDisplay.innerHTML = html || '&nbsp;';
}

userInput.addEventListener('input', () => {
  if (currentMode === 'realtime') {
    renderDiff();
  }
});

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearInterval(timerInterval);
    submitWord();
  }
});

function submitWord() {
  stopAudioLoop();
  clearInterval(timerInterval);

  const targetWord = wordList[currentIndex];
  const typedText = userInput.value.trim();

  let status = 'wrong';

  if (typedText.length === 0) {
    status = 'missed';
    missedCount++;
    saveWeakWord(targetWord);
    document.getElementById('missed-count').innerText = missedCount;
  } else {
    submittedCount++;
    document.getElementById('submitted-count').innerText = submittedCount;

    if (typedText.toLowerCase() === targetWord.toLowerCase()) {
      status = 'correct';
      correctCount++;
      removeWeakWord(targetWord);
    } else {
      wrongCount++;
      saveWeakWord(targetWord);
    }
  }

  userResults.push({
    target: targetWord,
    typed: typedText,
    status: status
  });

  currentIndex++;
  loadWord();
}

function promptFinishEarly() {
  stopAudioLoop();
  clearInterval(timerInterval);
  confirmModal.style.display = 'flex';
}

function closeModal() {
  confirmModal.style.display = 'none';
  userInput.focus();
  startTimer();
  if (loopToggle.checked) {
    audioLoopInterval = setInterval(() => {
      speakCurrentWord();
    }, 2500);
  }
}

function confirmFinishEarly() {
  confirmModal.style.display = 'none';

  for (let i = currentIndex; i < wordList.length; i++) {
    const w = wordList[i];
    saveWeakWord(w);
    userResults.push({
      target: w,
      typed: '',
      status: 'missed'
    });
    missedCount++;
  }

  showResults();
}

function showResults() {
  stopAudioLoop();
  clearInterval(timerInterval);
  trainerArea.style.display = 'none';
  resultsArea.style.display = 'flex';

  document.getElementById('res-total').innerText = wordList.length;
  document.getElementById('res-correct').innerText = correctCount;
  document.getElementById('res-wrong').innerText = wrongCount;
  document.getElementById('res-missed').innerText = missedCount;
  
  const accuracy = Math.round((correctCount / wordList.length) * 100);
  document.getElementById('res-accuracy').innerText = accuracy + '%';

  const tbody = document.getElementById('results-table-body');
  tbody.innerHTML = '';

  userResults.forEach(res => {
    const tr = document.createElement('tr');
    let formattedTyped = '';
    let statusBadge = '';

    if (res.status === 'missed') {
      formattedTyped = '<i style="color:#757575">(No input - Missed)</i>';
      statusBadge = '<span class="status-badge badge-missed">Missed</span>';
    } else {
      for (let i = 0; i < res.typed.length; i++) {
        const typedChar = res.typed[i];
        const targetChar = res.target[i];

        if (targetChar && typedChar.toLowerCase() === targetChar.toLowerCase()) {
          formattedTyped += `<span class="char-correct">${typedChar}</span>`;
        } else {
          formattedTyped += `<span class="char-wrong">${typedChar}</span>`;
        }
      }

      if (res.status === 'correct') {
        statusBadge = '<span class="status-badge badge-correct">Correct</span>';
      } else {
        statusBadge = '<span class="status-badge badge-wrong">Wrong</span>';
      }
    }

    tr.innerHTML = `
      <td>${res.target}</td>
      <td>${formattedTyped}</td>
      <td>${statusBadge}</td>
    `;

    tbody.appendChild(tr);
  });
}

function resetApp() {
  stopAudioLoop();
  resultsArea.style.display = 'none';
  setupArea.style.display = 'flex';
}