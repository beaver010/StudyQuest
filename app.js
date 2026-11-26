/* ============================================
   StudyQuest — логика приложения
   Задачи, очки XP, уровни, серия, сохранение
   ============================================ */

'use strict';

// ---------- Ключи localStorage ----------
const STORAGE_TASKS = 'studyquest_tasks';
const STORAGE_STATE = 'studyquest_state'; // { xp, level, streak, lastDoneDate }

// ---------- Настройки уровней ----------
// Сколько XP нужно для подъёма с каждого уровня
const XP_PER_LEVEL = 100;

// ---------- DOM-элементы ----------
const taskInput = document.getElementById('taskInput');
const taskSubject = document.getElementById('taskSubject');
const addBtn = document.getElementById('addBtn');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const totalScore = document.getElementById('totalScore');
const levelEl = document.getElementById('level');
const xpFill = document.getElementById('xpFill');
const xpText = document.getElementById('xpText');
const streakEl = document.getElementById('streak');
const toast = document.getElementById('toast');
const modal = document.getElementById('levelUpModal');
const modalLevel = document.getElementById('modalLevel');
const modalClose = document.getElementById('modalClose');

const filterButtons = document.querySelectorAll('.filter-btn');

// ---------- Состояние ----------
let tasks = loadTasks();
let state = loadState();
let currentFilter = 'all';
const MAX_LEVEL_VISIBLE = 10; // сколько уровней показать в награде (для ленивых математиков)

// ---------- Работа с localStorage ----------
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_TASKS);
    const data = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];
    // приводим к безопасной структуре
    return data
      .filter((t) => t && typeof t.id === 'string')
      .map((t) => ({
        id: t.id,
        text: String(t.text || ''),
        subject: String(t.subject || '📚'),
        xp: Number(t.xp) || 20,
        done: Boolean(t.done),
        createdAt: t.createdAt || Date.now(),
      }));
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_TASKS, JSON.stringify(tasks));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_STATE);
    const data = raw ? JSON.parse(raw) : {};
    return {
      xp: Number(data.xp) || 0,
      level: Math.max(1, Number(data.level) || 1),
      streak: Number(data.streak) || 0,
      lastDoneDate: data.lastDoneDate || null,
    };
  } catch {
    return { xp: 0, level: 1, streak: 0, lastDoneDate: null };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_STATE, JSON.stringify(state));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Уровни: сколько XP до следующего ----------
function xpMaxForLevel(level) {
  return level * XP_PER_LEVEL;
}

function xpCurrentIntoLevel(level, totalXp) {
  let remaining = totalXp;
  let lvl = 1;
  while (lvl < level && remaining >= xpMaxForLevel(lvl)) {
    remaining -= xpMaxForLevel(lvl);
    lvl++;
  }
  return remaining;
}

// Выбранная сложность из радио-плиток «Легко / Средне / Сложно»
function selectedXp() {
  const checked = document.querySelector('.xp-pick input[name="xp"]:checked');
  return Number(checked ? checked.value : 20);
}

// ---------- Добавление задачи ----------
function addTask() {
  const text = taskInput.value.trim();
  if (!text) {
    showToast('Сначала напиши задачу ✏️');
    taskInput.focus();
    return;
  }

  const task = {
    id: uid(),
    text,
    subject: taskSubject.value,
    xp: selectedXp(),
    done: false,
    createdAt: Date.now(),
  };

  tasks.unshift(task);
  saveTasks();
  taskInput.value = '';
  taskInput.focus();
  render();
  showToast('Задача добавлена! ✅');
}

// ---------- Переключение выполнения ----------
function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  if (!task.done) {
    // Отмечаем выполненной — начисляем XP
    task.done = true;
    awardXp(task, task.xp);
  } else {
    // Снимаем отметку — возвращаем XP (честная игра)
    task.done = false;
    removeXp(task.xp);
  }

  saveTasks();
  saveState();
  render();
}

// ---------- Удаление задачи ----------
function deleteTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  // Если задача была ещё не выполнена — она просто удаляется.
  // Если выполнена — XP уже начислены и остаются (награда заработана).
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks();
  render();
  showToast('Задача удалена 🗑️');
}

// ---------- Начисление XP ----------
function awardXp(task, amount) {
  state.xp += amount;
  updateStreak();

  // Проверка на новый уровень
  const levelsGained = howManyLevelsUp(state.level, state.xp);
  if (levelsGained > 0) {
    state.level += levelsGained;
    showLevelUpModal(state.level);
  }

  saveState();
  showToast(`+${amount} XP за «${shorten(task.text)}» 🎉`);
}

function removeXp(amount) {
  state.xp = Math.max(0, state.xp - amount);
  saveState();
  showToast(`-${amount} XP 😤`);
}

// Сколько раз подряд можно подняться в уровне при текущем XP
function howManyLevelsUp(level, totalXp) {
  let lvl = level;
  let remaining = xpCurrentIntoLevel(level, totalXp);
  while (remaining >= xpMaxForLevel(lvl)) {
    remaining -= xpMaxForLevel(lvl);
    lvl++;
  }
  return lvl - level;
}

// ---------- Серия (streak) ----------
function updateStreak() {
  const today = dateKey(new Date());
  if (state.lastDoneDate === today) {
    // сегодня уже отмечали — серия не растёт повторно
    return;
  }

  const yesterday = dateKey(new Date(Date.now() - 86400000));
  state.streak = state.lastDoneDate === yesterday ? state.streak + 1 : 1;
  state.lastDoneDate = today;
}

function dateKey(d) {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function shorten(text) {
  return text.length > 24 ? text.slice(0, 24) + '…' : text;
}

// ---------- Рендер ----------
function render() {
  const filtered = tasks.filter((t) => {
    if (currentFilter === 'active') return !t.done;
    if (currentFilter === 'done') return t.done;
    return true;
  });

  // Пустое состояние
  // Внутренний HTML блока заполняется статично из index.html,
  // здесь только показываем/скрываем блок.
  emptyState.classList.toggle('hidden', filtered.length > 0);

  // Список
  taskList.innerHTML = '';
  for (const task of filtered) {
    taskList.appendChild(createTaskItem(task));
  }

  updateStats();
}

function createTaskItem(task) {
  const li = document.createElement('li');
  li.className = 'task-item card' + (task.done ? ' done' : '');
  li.dataset.id = task.id;

  // Кнопка-чекбокс
  const check = document.createElement('button');
  check.className = 'task-check';
  check.setAttribute('aria-label', task.done ? 'Снять отметку' : 'Отметить выполненным');
  check.textContent = task.done ? '✓' : '';
  check.addEventListener('click', () => toggleTask(task.id));

  // Предмет
  const subject = document.createElement('span');
  subject.className = 'task-subject';
  subject.textContent = task.subject;

  // Текст
  const span = document.createElement('span');
  span.className = 'task-text';
  span.textContent = task.text;

  // Награда
  const xp = document.createElement('span');
  xp.className = 'task-xp';
  xp.textContent = '+' + task.xp + ' XP';

  // Удалить
  const del = document.createElement('button');
  del.className = 'task-delete';
  del.textContent = '✕';
  del.setAttribute('aria-label', 'Удалить задачу');
  del.addEventListener('click', () => deleteTask(task.id));

  li.append(check, subject, span, xp, del);
  return li;
}

// ---------- Обновление панели статистики ----------
function updateStats() {
  levelEl.textContent = state.level;
  totalScore.textContent = state.xp;

  const intoLevel = xpCurrentIntoLevel(state.level, state.xp);
  const max = xpMaxForLevel(state.level);
  xpFill.style.width = Math.min(100, Math.round((intoLevel / max) * 100)) + '%';
  xpText.textContent = intoLevel + ' / ' + max + ' XP';

  streakEl.textContent = state.streak + '🔥';
}

// ---------- Тост ----------
let toastTimer = null;
function showToast(message, duration = 2200) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ---------- Модалка уровня ----------
function showLevelUpModal(level) {
  modalLevel.textContent = level;
  modal.classList.remove('hidden');
}

function hideLevelUpModal() {
  modal.classList.add('hidden');
}

// ---------- События ----------
addBtn.addEventListener('click', addTask);
taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask();
});
modalClose.addEventListener('click', hideLevelUpModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) hideLevelUpModal();
});

filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    filterButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

// ---------- Старт ----------
render();
