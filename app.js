// API helpers
const api = {
    async getTasks() {
        const res = await fetch('/api/tasks');
        if (!res.ok) throw new Error('Failed to fetch tasks');
        return res.json();
    },

    async createTask(content, category) {
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, category })
        });
        if (!res.ok) throw new Error('Failed to create task');
        return res.json();
    },

    async updateTask(id, data) {
        const res = await fetch(`/api/tasks/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed to update task');
        return res.json();
    },

    async deleteTask(id) {
        const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete task');
    },

    async getNote() {
        const res = await fetch('/api/note');
        if (!res.ok) throw new Error('Failed to fetch note');
        return res.json();
    },

    async updateNote(content) {
        const res = await fetch('/api/note', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        if (!res.ok) throw new Error('Failed to update note');
        return res.json();
    }
};

// State
let tasks = [];

// Initialize app
async function init() {
    await loadTasks();
    await loadNote();
    setupEventListeners();
}

// Load tasks from API
async function loadTasks() {
    try {
        tasks = await api.getTasks();
        renderQuickTasks();
        renderKanbanCards();
        updateAllCounts();
    } catch (err) {
        console.error('Failed to load tasks:', err);
    }
}

// Load note from API
async function loadNote() {
    try {
        const note = await api.getNote();
        document.getElementById('notesArea').value = note.content;
    } catch (err) {
        console.error('Failed to load note:', err);
    }
}

// Quick Tasks (sidebar todo list)
function renderQuickTasks() {
    const todoList = document.getElementById('todoList');
    todoList.innerHTML = '';

    const quickTasks = tasks.filter(t => t.category === 'quick-list');

    quickTasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'todo-item';

        const span = document.createElement('span');
        span.textContent = task.content;

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '×';
        deleteBtn.addEventListener('click', () => deleteQuickTask(task.id));

        li.appendChild(span);
        li.appendChild(deleteBtn);
        todoList.appendChild(li);
    });
}

async function addQuickTask() {
    const input = document.getElementById('todoInput');
    const content = input.value.trim();

    if (content) {
        try {
            await api.createTask(content, 'quick-list');
            input.value = '';
            await loadTasks();
        } catch (err) {
            console.error('Failed to add quick task:', err);
        }
    }
}

async function deleteQuickTask(id) {
    try {
        await api.deleteTask(id);
        await loadTasks();
    } catch (err) {
        console.error('Failed to delete quick task:', err);
    }
}

// Kanban Cards
function renderKanbanCards() {
    renderColumn('todo', 'todoCards');
    renderColumn('in-progress', 'inProgressCards');
    renderColumn('done', 'doneCards');
}

function renderColumn(category, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const columnTasks = tasks.filter(t => t.category === category);

    columnTasks.forEach(task => {
        const cardEl = createCardElement(task);
        container.appendChild(cardEl);
    });
}

function createCardElement(task) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.draggable = true;
    cardEl.dataset.id = task.id;
    cardEl.dataset.category = task.category;

    const content = document.createElement('div');
    content.className = 'card-content';
    content.textContent = task.content;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'card-delete';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCard(task.id);
    });

    cardEl.appendChild(content);
    cardEl.appendChild(deleteBtn);

    // Drag events
    cardEl.addEventListener('dragstart', handleDragStart);
    cardEl.addEventListener('dragend', handleDragEnd);

    return cardEl;
}

async function addCard(category) {
    const containerId = category === 'todo' ? 'todoCards' :
                        category === 'in-progress' ? 'inProgressCards' :
                        'doneCards';
    const container = document.getElementById(containerId);

    // Check if input already exists
    if (container.querySelector('.card-input-wrapper')) return;

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'card-input-wrapper';

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'enter card details...';

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'card-input-buttons';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'save';
    saveBtn.textContent = 'add';
    saveBtn.addEventListener('click', async () => {
        const content = textarea.value.trim();
        if (content) {
            try {
                await api.createTask(content, category);
                await loadTasks();
            } catch (err) {
                console.error('Failed to create card:', err);
            }
        }
        inputWrapper.remove();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cancel';
    cancelBtn.textContent = 'cancel';
    cancelBtn.addEventListener('click', () => inputWrapper.remove());

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveBtn.click();
        }
        if (e.key === 'Escape') {
            cancelBtn.click();
        }
    });

    buttonsDiv.appendChild(saveBtn);
    buttonsDiv.appendChild(cancelBtn);
    inputWrapper.appendChild(textarea);
    inputWrapper.appendChild(buttonsDiv);

    container.insertBefore(inputWrapper, container.firstChild);
    textarea.focus();
}

async function deleteCard(id) {
    try {
        await api.deleteTask(id);
        await loadTasks();
    } catch (err) {
        console.error('Failed to delete card:', err);
    }
}

// Drag and Drop
let draggedCard = null;

function handleDragStart(e) {
    draggedCard = e.target;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.cards-container').forEach(container => {
        container.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e) {
    e.preventDefault();
    const container = e.currentTarget;
    container.classList.remove('drag-over');

    if (!draggedCard) return;

    const taskId = parseInt(draggedCard.dataset.id);
    const oldCategory = draggedCard.dataset.category;
    const newCategory = container.parentElement.dataset.status;

    if (oldCategory !== newCategory) {
        try {
            await api.updateTask(taskId, { category: newCategory });
            await loadTasks();
        } catch (err) {
            console.error('Failed to move card:', err);
        }
    }

    draggedCard = null;
}

// Notes
let notesTimeout;

async function updateNotes() {
    const content = document.getElementById('notesArea').value;
    try {
        await api.updateNote(content);
    } catch (err) {
        console.error('Failed to save note:', err);
    }
}

// Counter Functions
function updateCount(category) {
    const column = document.querySelector(`.column[data-status="${category}"]`);
    if (!column) return;
    const countEl = column.querySelector('.count');
    const count = tasks.filter(t => t.category === category).length;
    countEl.textContent = count;
}

function updateAllCounts() {
    updateCount('todo');
    updateCount('in-progress');
    updateCount('done');
}

// Event Listeners
function setupEventListeners() {
    // Quick tasks
    document.getElementById('addTodoBtn').addEventListener('click', addQuickTask);
    document.getElementById('todoInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addQuickTask();
    });

    // Add card buttons
    document.querySelectorAll('.add-card-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            addCard(e.target.dataset.column);
        });
    });

    // Drag and drop
    document.querySelectorAll('.cards-container').forEach(container => {
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('dragleave', handleDragLeave);
        container.addEventListener('drop', handleDrop);
    });

    // Notes with debounce
    document.getElementById('notesArea').addEventListener('input', () => {
        clearTimeout(notesTimeout);
        notesTimeout = setTimeout(updateNotes, 500);
    });
}

// Start
init();
