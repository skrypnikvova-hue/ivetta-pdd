// ===== ПРОВЕРКА LOCALSTORAGE =====
function isLocalStorageAvailable() {
    try {
        const test = '__storage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch (e) {
        return false;
    }
}

if (!isLocalStorageAvailable()) {
    alert('Внимание! localStorage недоступен. Проверьте настройки Safari: Настройки → Safari → Блокировать все cookie (должно быть ВЫКЛЮЧЕНО). Также убедитесь, что вы не в режиме "Частный доступ".');
}

// ===== ПЕРЕМЕННЫЕ СОСТОЯНИЯ =====
let allQuestions = [];
let currentQuestions = [];
let index = 0;
let currentMode = 'all';
let currentTicketNum = 1;
let currentTopicName = '';
let showAnswer = false;
let topicsList = [];

// ===== НАДЕЖНОЕ СОХРАНЕНИЕ И ЗАГРУЗКА =====
function getStorageKey() {
    if (currentMode === 'ticket') return 'prog_ticket_' + currentTicketNum;
    if (currentMode === 'topic') return 'prog_topic_' + encodeURIComponent(currentTopicName);
    if (currentMode === 'mistakes') return 'prog_mistakes';
    return 'prog_all';
}

function saveProgress() {
    try {
        const key = getStorageKey();
        localStorage.setItem(key, String(index));
        localStorage.setItem('last_mode', currentMode);
        localStorage.setItem('last_ticket', String(currentTicketNum));
        localStorage.setItem('last_topic', currentTopicName);
        localStorage.setItem('showAnswer', String(showAnswer));
        console.log('💾 Сохранено:', key, '=', index, '| mode:', currentMode, '| ticket:', currentTicketNum, '| topic:', currentTopicName);
    } catch (e) {
        console.error('❌ Ошибка сохранения:', e);
    }
}

function loadProgress() {
    try {
        currentMode = localStorage.getItem('last_mode') || 'all';
        currentTicketNum = parseInt(localStorage.getItem('last_ticket')) || 1;
        currentTopicName = localStorage.getItem('last_topic') || '';
        showAnswer = localStorage.getItem('showAnswer') === 'true';

        const key = getStorageKey();
        const savedIndex = localStorage.getItem(key);
        index = savedIndex !== null ? parseInt(savedIndex) : 0;

        console.log(' Загружено:', key, '=', index, '| mode:', currentMode, '| ticket:', currentTicketNum, '| topic:', currentTopicName);
        console.log('📋 Все ключи localStorage:', Object.keys(localStorage));

        document.getElementById('showAnswer').checked = showAnswer;
    } catch (e) {
        console.error('❌ Ошибка загрузки:', e);
        index = 0;
    }
}

// ===== ЗАГРУЗКА ДАННЫХ =====
async function loadData() {
    try {
        const response = await fetch('tickets_cd_2026.json');
        allQuestions = await response.json();
        console.log('✅ Загружено вопросов:', allQuestions.length);
        
        try {
            const topicsResponse = await fetch('topics.json');
            topicsList = await topicsResponse.json();
            console.log('✅ Загружено тем:', topicsList.length);
        } catch (e) {
            console.warn('⚠️ Не удалось загрузить topics.json:', e);
        }
        
        loadProgress();
        updateQuestionsList();
    } catch (e) {
        console.error('❌ Ошибка загрузки:', e);
        document.getElementById('question').textContent = 'Ошибка загрузки вопросов';
    }
}

// ===== ПЕРЕКЛЮЧЕНИЕ РЕЖИМА =====
function switchMode(mode, newTicketNum, newTopicName) {
    // Сохраняем прогресс со СТАРЫМИ значениями
    saveProgress();
    
    // Меняем режим и параметры
    currentMode = mode;
    if (newTicketNum !== undefined) currentTicketNum = newTicketNum;
    if (newTopicName !== undefined) currentTopicName = newTopicName;
    
    // Загружаем прогресс для НОВОГО режима
    const key = getStorageKey();
    const savedIndex = localStorage.getItem(key);
    index = savedIndex !== null ? parseInt(savedIndex) : 0;
    
    console.log('🔄 Переключение на:', mode, '| ticket:', currentTicketNum, '| topic:', currentTopicName, '| index:', index);
    
    saveProgress();
    updateQuestionsList();
}

// ===== ОБНОВЛЕНИЕ СПИСКА ВОПРОСОВ =====
async function updateQuestionsList() {
    let filtered = allQuestions;
    
    if (currentMode === 'ticket') {
        filtered = allQuestions.filter(function(q) { return q.ticket === currentTicketNum; });
    } else if (currentMode === 'mistakes') {
        const mistakes = JSON.parse(localStorage.getItem('mistakes') || '[]');
        filtered = allQuestions.filter(function(q) { return mistakes.includes(q.id); });
    } else if (currentMode === 'topic') {
        try {
            const topicFileName = currentTopicName + '.json';
            const topicResponse = await fetch('topics/' + topicFileName);
            const topicData = await topicResponse.json();
            const topicQuestionIds = topicData.map(function(item) { return item.id; });
            filtered = allQuestions.filter(function(q) { return topicQuestionIds.includes(q.id); });
            console.log('📚 Тема "' + currentTopicName + '": найдено ' + filtered.length + ' вопросов');
        } catch (e) {
            console.error('❌ Ошибка загрузки темы:', e);
            filtered = [];
        }
    }
    
    currentQuestions = filtered;
    
    if (index >= currentQuestions.length) {
        index = 0;
    }
    
    render();
}

// ===== ОТРИСОВКА ВОПРОСА =====
function render() {
    const progressEl = document.getElementById('progress');
    const questionEl = document.getElementById('question');
    const imageContainer = document.getElementById('imageContainer');
    const questionImage = document.getElementById('questionImage');
    const answersEl = document.getElementById('answers');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (currentQuestions.length === 0) {
        progressEl.innerHTML = 'Нет вопросов';
        questionEl.textContent = 'В этом разделе пока пусто.';
        imageContainer.style.display = 'none';
        answersEl.innerHTML = '';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
    }
    
    const q = currentQuestions[index];
    const total = currentQuestions.length;
    
    const title = currentMode === 'ticket' ? 'Билет ' + currentTicketNum :
                  currentMode === 'mistakes' ? 'Работа над ошибками' :
                  currentMode === 'topic' ? currentTopicName : 'Все вопросы';
    
    progressEl.innerHTML = title + '<br>' + (index + 1) + ' / ' + total;
    questionEl.textContent = q.text;
    
    if (q.image) {
        const filename = q.image.split('/').pop();
        questionImage.src = 'images/' + filename;
        imageContainer.style.display = 'block';
    } else {
        imageContainer.style.display = 'none';
    }
    
    answersEl.innerHTML = '';
    q.answers.forEach(function(a) {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = a.text;
        
        if (showAnswer && a.isCorrect) {
            btn.classList.add('correct');
        }
        
        btn.addEventListener('click', function() {
            handleAnswerClick(btn, a, q);
        });
        answersEl.appendChild(btn);
    });
    
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === total - 1;
}

// ===== ОБРАБОТКА КЛИКА ПО ОТВЕТУ =====
function handleAnswerClick(btn, answer, question) {
    document.querySelectorAll('.answer-btn').forEach(function(b) {
        b.classList.remove('correct', 'wrong');
    });
    
    if (answer.isCorrect) {
        btn.classList.add('correct');
        let mistakes = JSON.parse(localStorage.getItem('mistakes') || '[]');
        mistakes = mistakes.filter(function(id) { return id !== question.id; });
        localStorage.setItem('mistakes', JSON.stringify(mistakes));
    } else {
        btn.classList.add('wrong');
        let mistakes = JSON.parse(localStorage.getItem('mistakes') || '[]');
        if (!mistakes.includes(question.id)) {
            mistakes.push(question.id);
            localStorage.setItem('mistakes', JSON.stringify(mistakes));
        }
    }
    
    setTimeout(function() {
        if (index < currentQuestions.length - 1) {
            index++;
            render();
            saveProgress();
        } else {
            alert('🎉 Раздел пройден!');
        }
    }, 800);
}

// ===== РЕГИСТРАЦИЯ SERVICE WORKER =====
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
        .then(function(reg) { console.log('✅ SW зарегистрирован'); })
        .catch(function(err) { console.log('❌ SW ошибка:', err); });
}

// ===== ФУНКЦИИ ДЛЯ МОДАЛЬНЫХ ОКОН =====
window.selectMode = function(mode) {
    closeAllMenus();
    if (mode === 'ticket') {
        setTimeout(function() { showTicketMenu(); }, 100);
    } else if (mode === 'topic') {
        setTimeout(function() { showTopicsMenu(); }, 100);
    } else {
        switchMode(mode);
    }
};

window.showTicketMenu = function() {
    const grid = document.getElementById('ticketGrid');
    grid.innerHTML = '';
    for (let i = 1; i <= 40; i++) {
        const btn = document.createElement('button');
        btn.className = 'menu-btn';
        btn.textContent = i;
        btn.onclick = (function(num) {
            return function() {
                closeAllMenus();
                setTimeout(function() { switchMode('ticket', num); }, 100);
            };
        })(i);
        grid.appendChild(btn);
    }
    document.getElementById('ticketOverlay').style.display = 'flex';
};

window.showTopicsMenu = function() {
    const list = document.getElementById('topicsList');
    list.innerHTML = '';
    topicsList.forEach(function(topic) {
        const btn = document.createElement('button');
        btn.className = 'menu-btn';
        btn.textContent = topic;
        btn.onclick = function() {
            closeAllMenus();
            setTimeout(function() { switchMode('topic', undefined, topic); }, 100);
        };
        list.appendChild(btn);
    });
    document.getElementById('topicsOverlay').style.display = 'flex';
};

window.closeMenu = function() { closeAllMenus(); };
window.closeTicketMenu = function() { closeAllMenus(); };
window.closeTopicsMenu = function() { closeAllMenus(); };

function closeAllMenus() {
    document.getElementById('menuOverlay').style.display = 'none';
    document.getElementById('ticketOverlay').style.display = 'none';
    document.getElementById('topicsOverlay').style.display = 'none';
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====
document.addEventListener('DOMContentLoaded', function() {
    loadData();
    
    document.getElementById('showAnswer').addEventListener('change', function(e) {
        showAnswer = e.target.checked;
        saveProgress();
        render();
    });
    
    document.getElementById('logoBtn').addEventListener('click', function() {
        document.getElementById('menuOverlay').style.display = 'flex';
    });
    
    document.getElementById('prevBtn').addEventListener('click', function() {
        if (index > 0) {
            index--;
            render();
            saveProgress();
        }
    });
    
    document.getElementById('nextBtn').addEventListener('click', function() {
        if (index < currentQuestions.length - 1) {
            index++;
            render();
            saveProgress();
        }
    });
});