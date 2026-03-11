const pieceImages = {
    'w': {
        'p': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wp.png',
        'n': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wn.png',
        'b': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wb.png',
        'r': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wr.png',
        'q': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wq.png',
        'k': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wk.png'
    },
    'b': {
        'p': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bp.png',
        'n': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bn.png',
        'b': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bb.png',
        'r': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/br.png',
        'q': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bq.png',
        'k': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bk.png'
    }
};

let game = new Chess();
let selectedSquare = null;
let validMoves = [];
let domPieces = {}; // Справочник: square -> img element
let domSquares = {}; // Справочник: square -> div element

const boardElement = document.getElementById('chessboard');
const statusElement = document.getElementById('game-status');
const resetBtn = document.getElementById('reset-btn');
const movesList = document.getElementById('moves-list');
const scoreWhiteEl = document.getElementById('score-white');
const scoreBlackEl = document.getElementById('score-black');
const capturedWhiteEl = document.getElementById('captured-white');
const capturedBlackEl = document.getElementById('captured-black');

const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnUndo = document.getElementById('undo-btn');

const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const sortOrder = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };

// История и навигация
let currentHistoryIndex = -1;
let historyMoves = []; // Содержит объекты ходов из chess.js

// Мультиплеер
let socket = null;
let isMultiplayer = false;
let myColor = 'w';
let currentRoomId = null;

// Переворот доски
let isBoardFlipped = false;

// --- АППЕТИТ ---
const pieceMaxSatiety = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 100 };
const pieceNames = { p: 'Пешка', n: 'Конь', b: 'Слон', r: 'Ладья', q: 'Ферзь', k: 'Король' };
let appetiteMap = {}; // { square: currentSatiety }

function getSquareCoords(sq) {
    if (isBoardFlipped) {
        return {
            r: parseInt(sq[1]) - 1,
            c: 'h'.charCodeAt(0) - sq.charCodeAt(0)
        };
    } else {
        return {
            r: 8 - parseInt(sq[1]),
            c: sq.charCodeAt(0) - 'a'.charCodeAt(0)
        };
    }
}

// --- НАВИГАЦИЯ ---
const navTabs = {
    play: { nav: document.getElementById('nav-play'), view: document.getElementById('view-play'), title: 'Игра', sub: '' },
    multi: { nav: document.getElementById('nav-multiplayer'), view: document.getElementById('view-multiplayer'), title: 'Игра по сети', sub: 'Сыграйте с другом по коду комнаты' },
    history: { nav: document.getElementById('nav-history'), view: document.getElementById('view-history'), title: 'Обзор партий', sub: 'История ходов текущей игры' },
    rules: { nav: document.getElementById('nav-rules'), view: document.getElementById('view-rules'), title: 'Справка', sub: 'Правила классических шахмат' }
};

function switchTab(tabId) {
    Object.values(navTabs).forEach(tab => {
        if (tab.nav) tab.nav.classList.remove('active');
        if (tab.view) tab.view.style.display = 'none';
    });
    const tab = navTabs[tabId];
    if (tab.nav) tab.nav.classList.add('active');
    if (tab.view) tab.view.style.display = 'flex';
    document.getElementById('page-heading').innerText = tab.title;
    document.getElementById('page-subheading').innerText = tab.sub;
}

navTabs.play.nav.addEventListener('click', (e) => { e.preventDefault(); switchTab('play'); });
if (navTabs.multi.nav) navTabs.multi.nav.addEventListener('click', (e) => { e.preventDefault(); switchTab('multi'); });
if (navTabs.history.nav) navTabs.history.nav.addEventListener('click', (e) => { e.preventDefault(); switchTab('history'); });
if (navTabs.rules.nav) navTabs.rules.nav.addEventListener('click', (e) => { e.preventDefault(); switchTab('rules'); });


// --- ИГРОВАЯ ЛОГИКА ---
function initBoard() {
    boardElement.innerHTML = '';

    // 1. Рисуем клетки доски один раз
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let sq;
            if (isBoardFlipped) {
                sq = String.fromCharCode('h'.charCodeAt(0) - c) + (r + 1);
            } else {
                sq = String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r);
            }
            const squareEl = document.createElement('div');
            squareEl.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
            squareEl.dataset.square = sq;

            boardElement.appendChild(squareEl);
            domSquares[sq] = squareEl;
        }
    }

    // 2. Обработчики событий Drag-and-Drop на доске (Event Delegation)
    boardElement.addEventListener('dragover', (e) => {
        e.preventDefault(); // Разрешаем сброс
        const sq = getSquareFromEvent(e);
        if (sq && validMoves.some(m => m.to === sq)) {
            e.dataTransfer.dropEffect = 'move';
        } else {
            e.dataTransfer.dropEffect = 'none';
        }
    });

    boardElement.addEventListener('dragenter', (e) => {
        e.preventDefault();
        const sq = getSquareFromEvent(e);
        if (sq && validMoves.some(m => m.to === sq)) {
            if (domSquares[sq]) domSquares[sq].classList.add('drag-target');
        }
    });

    boardElement.addEventListener('dragleave', (e) => {
        const sq = getSquareFromEvent(e);
        if (sq && domSquares[sq]) domSquares[sq].classList.remove('drag-target');
    });

    boardElement.addEventListener('drop', (e) => {
        e.preventDefault();
        const sq = getSquareFromEvent(e);
        Object.values(domSquares).forEach(s => s.classList.remove('drag-target'));

        if (sq) {
            const from = e.dataTransfer.getData('text/plain');
            if (from && from !== sq) {
                makeMove(from, sq, 'q');
            }
        }
    });

    boardElement.addEventListener('click', (e) => {
        const sq = getSquareFromEvent(e);
        if (sq) handleSquareClick(sq);
    });

    initPieces();
}

function getSquareFromEvent(e) {
    const el = e.target.closest('[data-square]');
    return el ? el.dataset.square : null;
}

function initPieces() {
    // Удаляем старые фигуры при новой игре
    Object.values(domPieces).forEach(img => img.remove());
    domPieces = {};

    const board = game.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r);
            const p = board[r][c];
            if (p) createPieceDOM(sq, p.color, p.type);
        }
    }
}

function createPieceDOM(sq, color, type) {
    const img = document.createElement('img');
    img.src = pieceImages[color][type];
    img.className = 'piece';
    img.draggable = true;
    img.dataset.square = sq;

    // Абсолютное позиционирование для CSS transition
    const coords = getSquareCoords(sq);
    img.style.top = `${coords.r * 12.5}%`;
    img.style.left = `${coords.c * 12.5}%`;

    img.addEventListener('dragstart', (e) => {
        if (currentHistoryIndex < historyMoves.length - 1) {
            e.preventDefault();
            return;
        }

        const pieceSq = img.dataset.square;
        const p = game.get(pieceSq);

        if (!p || p.color !== game.turn()) {
            e.preventDefault();
            return;
        }

        // Блокировка в мультиплеере
        if (isMultiplayer && p.color !== myColor) {
            e.preventDefault();
            return;
        }

        selectedSquare = pieceSq;
        validMoves = filterMovesByAppetite(game.moves({ square: pieceSq, verbose: true }));
        renderHighlights();

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', pieceSq);

        setTimeout(() => img.classList.add('dragging'), 0);
    });

    img.addEventListener('dragend', () => {
        img.classList.remove('dragging');
    });

    boardElement.appendChild(img);
    domPieces[sq] = img;
}

function renderHighlights() {
    Object.values(domSquares).forEach(s => {
        s.classList.remove('selected', 'valid-move', 'valid-capture');
        const sq = s.dataset.square;

        if (selectedSquare === sq) s.classList.add('selected');

        const move = validMoves.find(m => m.to === sq);
        if (move) {
            if (domPieces[sq]) {
                s.classList.add('valid-capture');
            } else {
                s.classList.add('valid-move');
            }
        }
    });
}

function handleSquareClick(square) {
    if (currentHistoryIndex < historyMoves.length - 1) return; // Блокировка хода в прошлом

    // Показываем инфо о фигуре при клике на любую клетку
    const clickedPiece = game.get(square);
    if (clickedPiece) showPieceInfo(square);

    if (selectedSquare) {
        if (makeMove(selectedSquare, square, 'q')) return;
    }

    const piece = game.get(square);
    if (piece && piece.color === game.turn()) {
        if (isMultiplayer && piece.color !== myColor) return; // Блокировка

        selectedSquare = square;
        validMoves = filterMovesByAppetite(game.moves({ square: square, verbose: true }));
    } else {
        selectedSquare = null;
        validMoves = [];
    }

    renderHighlights();
}

function makeMove(from, to, promotion = 'q', emit = true) {
    if (currentHistoryIndex < historyMoves.length - 1) return false; // Защита от хода из прошлого

    // Проверка аппетита: если фигура сыта — взятие запрещено независимо от источника хода
    const allMoves = game.moves({ square: from, verbose: true });
    const allowedMoves = filterMovesByAppetite(allMoves);
    const targetPiece = game.get(to);
    if (targetPiece) {
        // Это взятие — проверяем, есть ли этот ход в разрешённых
        const isCapAllowed = allowedMoves.some(m => m.to === to);
        if (!isCapAllowed) return false;
    }

    let move = null;
    try {
        move = game.move({ from, to, promotion });
    } catch (e) { return false; }

    if (move) {
        historyMoves.push(move);
        currentHistoryIndex = historyMoves.length - 1;

        // Обновляем аппетит
        applyAppetiteForMove(move, game);
        updatePieceInfoPanel();

        if (isMultiplayer && emit && socket) {
            socket.emit('make_move', { roomId: currentRoomId, move: move });
        }

        animateMove(move);
        selectedSquare = null;
        validMoves = [];
        renderHighlights();
        updateStatus();
        updateHistoryUI();
        playSound('move');
        return true;
    }
    return false;
}

function animateMove(move) {
    // Взятие на проходе
    if (move.flags.includes('e')) {
        const capturedSq = move.to[0] + move.from[1];
        if (domPieces[capturedSq]) {
            domPieces[capturedSq].remove();
            delete domPieces[capturedSq];
        }
    } else if (move.captured) {
        // Обычное взятие
        if (domPieces[move.to]) {
            domPieces[move.to].remove();
            delete domPieces[move.to];
        }
    }

    // Перебираем элемент фигуры в словаре
    const pEl = domPieces[move.from];
    delete domPieces[move.from];
    domPieces[move.to] = pEl;
    pEl.dataset.square = move.to;

    // Анимируем перемещение (меняем координаты CSS)
    const coords = getSquareCoords(move.to);
    pEl.style.top = `${coords.r * 12.5}%`;
    pEl.style.left = `${coords.c * 12.5}%`;

    if (move.promotion) {
        pEl.src = pieceImages[move.color][move.promotion];
    }

    // Анимация рокировки
    if (move.flags.includes('k') || move.flags.includes('q')) {
        let rookFrom, rookTo;
        if (move.flags.includes('k')) {
            rookFrom = 'h' + move.from[1];
            rookTo = 'f' + move.from[1];
        } else {
            rookFrom = 'a' + move.from[1];
            rookTo = 'd' + move.from[1];
        }

        const rEl = domPieces[rookFrom];
        delete domPieces[rookFrom];
        domPieces[rookTo] = rEl;
        rEl.dataset.square = rookTo;

        const rc = getSquareCoords(rookTo);
        rEl.style.top = `${rc.r * 12.5}%`;
        rEl.style.left = `${rc.c * 12.5}%`;
    }
}

function animateUndoMove(move) {
    // В отличие от animateMove, мы должны двигать фигуру с move.to на move.from

    // Забираем элемент с целевой клетки (если он там есть)
    const pEl = domPieces[move.to];

    if (pEl) {
        delete domPieces[move.to];
        domPieces[move.from] = pEl;
        pEl.dataset.square = move.from;

        // Анимируем CSS координаты
        const coords = getSquareCoords(move.from);
        pEl.style.top = `${coords.r * 12.5}%`;
        pEl.style.left = `${coords.c * 12.5}%`;

        // Если было превращение - возвращаем пешку
        if (move.promotion) {
            pEl.src = pieceImages[move.color]['p'];
        }
    }

    // Если было взятие - восстанавливаем съеденную фигуру
    if (move.captured) {
        let capturedSq = move.to;
        if (move.flags.includes('e')) {
            // Взятие на проходе - восстанавливаем пешку на нужной линии
            capturedSq = move.to[0] + move.from[1];
        }

        // Создаем DOM элемент съеденной фигуры
        const enemyColor = move.color === 'w' ? 'b' : 'w';

        // Создаем фигуру сразу на нужной клетке, без анимации "появления"
        createPieceDOM(capturedSq, enemyColor, move.captured);
    }

    // Обратная рокировка
    if (move.flags.includes('k') || move.flags.includes('q')) {
        let rookFrom, rookTo;
        if (move.flags.includes('k')) {
            rookFrom = 'h' + move.from[1];
            rookTo = 'f' + move.from[1];
        } else {
            rookFrom = 'a' + move.from[1];
            rookTo = 'd' + move.from[1];
        }

        // В истории ладья стояла на rookTo, а двигаем её обратно на rookFrom
        const rEl = domPieces[rookTo];
        delete domPieces[rookTo];
        domPieces[rookFrom] = rEl;
        rEl.dataset.square = rookFrom;

        const rc = getSquareCoords(rookFrom);
        rEl.style.top = `${rc.r * 12.5}%`;
        rEl.style.left = `${rc.c * 12.5}%`;
    }
}

function updateStatus() {
    let status = '';
    let moveColor = game.turn() === 'w' ? 'Белые' : 'Черные';

    if (game.in_checkmate()) {
        status = `Мат! Победили ${game.turn() === 'w' ? 'Черные' : 'Белые'}`;
        statusElement.style.color = '#ef4444';
        statusElement.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
        statusElement.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    } else if (game.in_draw()) {
        status = 'Ничья!';
        statusElement.style.color = '#eab308';
        statusElement.style.backgroundColor = 'rgba(234, 179, 8, 0.2)';
        statusElement.style.borderColor = 'rgba(234, 179, 8, 0.3)';
    } else {
        status = `Ход: ${moveColor}`;
        if (game.in_check()) {
            status += ' (Шах!)';
            statusElement.style.color = '#ef4444';
            statusElement.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
            statusElement.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        } else {
            statusElement.style.color = '#60a5fa';
            statusElement.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
            statusElement.style.borderColor = 'rgba(59, 130, 246, 0.3)';
        }
    }

    statusElement.innerText = status;
    updateCapturedAndScore();
}

function updateCapturedAndScore() {
    const history = game.history({ verbose: true });

    const whiteCaptured = [];
    const blackCaptured = [];

    let whiteScore = 0;
    let blackScore = 0;

    history.forEach(move => {
        if (move.captured) {
            if (move.color === 'w') {
                whiteCaptured.push(move.captured);
                whiteScore += pieceValues[move.captured] || 0;
            } else {
                blackCaptured.push(move.captured);
                blackScore += pieceValues[move.captured] || 0;
            }
        }
    });

    // Сортировка по ценности фигур
    whiteCaptured.sort((a, b) => sortOrder[a] - sortOrder[b]);
    blackCaptured.sort((a, b) => sortOrder[a] - sortOrder[b]);

    // Белые фигуры, которые съели черные, отображаются у Черных сверху
    if (capturedBlackEl) {
        capturedBlackEl.innerHTML = '';
        blackCaptured.forEach(p => {
            const img = document.createElement('img');
            img.src = pieceImages['w'][p]; // белая картинка съеденной фигуры
            img.className = 'captured-piece';
            capturedBlackEl.appendChild(img);
        });
    }

    // Черные фигуры, которые съели белые, отображаются у Белых снизу
    if (capturedWhiteEl) {
        capturedWhiteEl.innerHTML = '';
        whiteCaptured.forEach(p => {
            const img = document.createElement('img');
            img.src = pieceImages['b'][p]; // черная картинка
            img.className = 'captured-piece';
            capturedWhiteEl.appendChild(img);
        });
    }

    const diff = whiteScore - blackScore;
    if (scoreWhiteEl && scoreBlackEl) {
        if (diff > 0) {
            scoreWhiteEl.innerText = `+${diff}`;
            scoreBlackEl.innerText = '';
        } else if (diff < 0) {
            scoreBlackEl.innerText = `+${Math.abs(diff)}`;
            scoreWhiteEl.innerText = '';
        } else {
            scoreWhiteEl.innerText = '';
            scoreBlackEl.innerText = '';
        }
    }
}

function updateHistoryUI() {
    if (historyMoves.length === 0) {
        movesList.innerHTML = '<p class="empty-state">Сделайте первый ход, чтобы начать запись партии.</p>';
        updateNavButtons();
        return;
    }

    movesList.innerHTML = '';
    for (let i = 0; i < historyMoves.length; i += 2) {
        const moveNumber = (i / 2) + 1;

        const moveEl = document.createElement('div');
        moveEl.className = 'move-item';

        const numSpan = document.createElement('span');
        numSpan.className = 'move-num';
        numSpan.innerText = `${moveNumber}.`;
        moveEl.appendChild(numSpan);

        // Белый ход
        const wMove = historyMoves[i];
        const wPart = document.createElement('div');
        wPart.className = `move-part ${currentHistoryIndex === i ? 'active' : ''}`;
        wPart.innerText = wMove.san;
        wPart.addEventListener('click', () => jumpToHistory(i));
        moveEl.appendChild(wPart);

        // Черный ход
        if (historyMoves[i + 1]) {
            const bMove = historyMoves[i + 1];
            const bPart = document.createElement('div');
            bPart.className = `move-part ${currentHistoryIndex === i + 1 ? 'active' : ''}`;
            bPart.innerText = bMove.san;
            bPart.addEventListener('click', () => jumpToHistory(i + 1));
            moveEl.appendChild(bPart);
        }

        movesList.appendChild(moveEl);
    }

    // Прокрутка (только если мы на последнем ходу)
    if (currentHistoryIndex === historyMoves.length - 1) {
        movesList.scrollTop = movesList.scrollHeight;
    }

    updateNavButtons();
}

function updateNavButtons() {
    btnPrev.disabled = currentHistoryIndex < 0;
    btnNext.disabled = currentHistoryIndex >= historyMoves.length - 1;
    btnUndo.disabled = historyMoves.length === 0;
}

function jumpToHistory(index) {
    if (index === currentHistoryIndex) return;

    // Если разница ровно 1 шаг - анимируем. Иначе - мгновенный скачок со сбросом.
    const isForwardStep = index === currentHistoryIndex + 1;
    const isBackwardStep = index === currentHistoryIndex - 1;

    let moveToAnimate = null;
    let isUndo = false;

    if (isForwardStep) {
        moveToAnimate = historyMoves[index];
    } else if (isBackwardStep) {
        moveToAnimate = historyMoves[currentHistoryIndex];
        isUndo = true;
    }

    // Пересоздаем игру (логику) до нужного момента
    game.reset();
    for (let i = 0; i <= index; i++) {
        game.move(historyMoves[i]);
    }

    currentHistoryIndex = index;

    if (moveToAnimate) {
        if (isUndo) {
            animateUndoMove(moveToAnimate);
        } else {
            animateMove(moveToAnimate);
        }
        playSound('move');
    } else {
        // Мгновенный перерендер из-за большого прыжка
        initPieces();
    }

    selectedSquare = null;
    validMoves = [];
    renderHighlights();
    updateStatus();
    updateHistoryUI();
    rebuildAppetiteMap();
    updatePieceInfoPanel();
}

btnPrev.addEventListener('click', () => {
    if (currentHistoryIndex >= 0) {
        jumpToHistory(currentHistoryIndex - 1);
    }
});

btnNext.addEventListener('click', () => {
    if (currentHistoryIndex < historyMoves.length - 1) {
        jumpToHistory(currentHistoryIndex + 1);
    }
});

function performUndo() {
    if (historyMoves.length > 0) {
        // Отменяем последний ход
        const targetIndex = currentHistoryIndex === historyMoves.length - 1
            ? currentHistoryIndex - 1
            : currentHistoryIndex;

        historyMoves = historyMoves.slice(0, targetIndex + 1);
        jumpToHistory(targetIndex);
    }
}

btnUndo.addEventListener('click', () => {
    if (historyMoves.length === 0) return;

    if (isMultiplayer && currentRoomId && socket) {
        socket.emit('request_undo', currentRoomId);
        showToast('Запрос об отмене отправлен сопернику...');
    } else {
        performUndo();
    }
});

function resetGameData() {
    game.reset();
    historyMoves = [];
    currentHistoryIndex = -1;
    selectedSquare = null;
    validMoves = [];
    appetiteMap = {};

    isBoardFlipped = isMultiplayer && (myColor === 'b');
    const colEl = document.querySelector('.board-column');
    if (colEl) {
        if (isBoardFlipped) colEl.classList.add('flipped');
        else colEl.classList.remove('flipped');
    }

    initBoard();
    initAppetiteMap();
    clearPieceInfo();
    renderHighlights();
    updateStatus();
    updateHistoryUI();
}

resetBtn.addEventListener('click', () => {
    isMultiplayer = false;
    currentRoomId = null;
    resetGameData();
    if (navTabs.history.nav && navTabs.history.nav.classList.contains('active')) {
        switchTab('play');
    }
});

function playSound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'move') {
            osc.frequency.setValueAtTime(200, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
        }
    } catch (e) { }
}

// Запуск приложения
initBoard();
updateStatus();
updateHistoryUI();

// --- СИСТЕМА УВЕДОМЛЕНИЙ ---
function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// --- АППЕТИТ: ФУНКЦИИ ---
function initAppetiteMap() {
    appetiteMap = {};
    const board = game.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c]) {
                const sq = String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r);
                appetiteMap[sq] = 0;
            }
        }
    }
}

function filterMovesByAppetite(moves) {
    return moves.filter(move => {
        if (!move.captured) return true;
        const currentSatiety = appetiteMap[move.from] || 0;
        const maxSat = pieceMaxSatiety[move.piece];
        const foodValue = pieceMaxSatiety[move.captured];
        return currentSatiety + foodValue <= maxSat;
    });
}

function applyAppetiteForMove(move, gameObj) {
    const DECAY = 5;
    const currentSatiety = appetiteMap[move.from] || 0;

    delete appetiteMap[move.from];

    if (move.captured) {
        let capturedSq = move.to;
        if (move.flags.includes('e')) capturedSq = move.to[0] + move.from[1];
        delete appetiteMap[capturedSq];

        const movingType = move.promotion || move.piece;
        const maxSat = pieceMaxSatiety[movingType];
        const foodValue = pieceMaxSatiety[move.captured];
        appetiteMap[move.to] = Math.min(currentSatiety + foodValue, maxSat);
    } else {
        appetiteMap[move.to] = currentSatiety;
    }

    if (move.promotion) {
        const newMax = pieceMaxSatiety[move.promotion];
        appetiteMap[move.to] = Math.min(appetiteMap[move.to] || 0, newMax);
    }

    // Рокировка — двигаем ладью в appetiteMap
    if (move.flags.includes('k') || move.flags.includes('q')) {
        const rookFrom = (move.flags.includes('k') ? 'h' : 'a') + move.from[1];
        const rookTo = (move.flags.includes('k') ? 'f' : 'd') + move.from[1];
        appetiteMap[rookTo] = appetiteMap[rookFrom] || 0;
        delete appetiteMap[rookFrom];
    }

    // Убыль сытости у фигур СОПЕРНИКА (чтобы еда показывалась полностью в текущем ходе)
    const opponentColor = move.color === 'w' ? 'b' : 'w';
    const board = gameObj.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && p.color === opponentColor) {
                const sq = String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r);
                appetiteMap[sq] = Math.max(0, (appetiteMap[sq] || 0) - DECAY);
            }
        }
    }
}

function rebuildAppetiteMap() {
    const tempGame = new Chess();
    appetiteMap = {};
    const initBoard = tempGame.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (initBoard[r][c]) {
                const sq = String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r);
                appetiteMap[sq] = 0;
            }
        }
    }

    for (let i = 0; i <= currentHistoryIndex; i++) {
        const move = historyMoves[i];
        tempGame.move(move);
        applyAppetiteForMove(move, tempGame);
    }
}

// --- АППЕТИТ: UI ---
let selectedInfoSquare = null;

function showPieceInfo(square) {
    const piece = game.get(square);
    const emptyEl = document.getElementById('piece-info-empty');
    const contentEl = document.getElementById('piece-info-content');
    if (!piece || !emptyEl || !contentEl) return;

    selectedInfoSquare = square;
    const satiety = appetiteMap[square] || 0;
    const maxSat = pieceMaxSatiety[piece.type];
    const pct = maxSat > 0 ? (satiety / maxSat) * 100 : 0;

    document.getElementById('piece-info-img').src = pieceImages[piece.color][piece.type];
    document.getElementById('piece-info-name').innerText =
        pieceNames[piece.type] + (piece.color === 'w' ? ' (белая)' : ' (чёрная)');

    const fill = document.getElementById('satiety-bar-fill');
    fill.style.width = pct + '%';
    if (pct >= 80) fill.style.background = '#ef4444'; // красный — почти полная
    else if (pct >= 40) fill.style.background = '#eab308'; // жёлтый — средняя
    else fill.style.background = '#22c55e'; // зелёный — голодная

    document.getElementById('satiety-value').innerText = `${satiety}/${maxSat}`;

    emptyEl.style.display = 'none';
    contentEl.style.display = 'flex';
}

function updatePieceInfoPanel() {
    if (selectedInfoSquare) {
        const piece = game.get(selectedInfoSquare);
        if (piece) {
            showPieceInfo(selectedInfoSquare);
        } else {
            clearPieceInfo();
        }
    }
}

function clearPieceInfo() {
    selectedInfoSquare = null;
    const emptyEl = document.getElementById('piece-info-empty');
    const contentEl = document.getElementById('piece-info-content');
    if (emptyEl) emptyEl.style.display = 'flex';
    if (contentEl) contentEl.style.display = 'none';
}

// --- ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ---
const nicknameInput = document.getElementById('nickname-input');
const sidebarUserName = document.getElementById('sidebar-user-name');

function loadProfile() {
    const savedName = localStorage.getItem('chessNickname');
    if (savedName) {
        if (nicknameInput) nicknameInput.value = savedName;
        if (sidebarUserName) sidebarUserName.innerText = savedName;
    }
}

if (nicknameInput) {
    nicknameInput.addEventListener('change', (e) => {
        const newName = e.target.value.trim() || 'Гость';
        localStorage.setItem('chessNickname', newName);
        if (sidebarUserName) sidebarUserName.innerText = newName;
    });
}

loadProfile();

// --- ЛОГИКА СОКЕТОВ ---
let isConnecting = false;

function ensureSocketConnection(callback) {
    if (typeof io === 'undefined') {
        showToast('Ошибка загрузки библиотеки Socket.io');
        return;
    }

    // Фиксированный адрес сервера
    let url = 'https://keratose-clausal-nguyet.ngrok-free.dev';

    if (socket) {
        if (socket.io && socket.io.uri === url && socket.connected) {
            callback();
            return;
        } else if (socket.io && socket.io.uri === url && isConnecting) {
            socket.once('connect', callback);
            return;
        } else {
            socket.disconnect();
        }
    }

    isConnecting = true;
    socket = io(url, {
        extraHeaders: {
            "ngrok-skip-browser-warning": "69420"
        }
    });

    socket.on('connect', () => {
        isConnecting = false;
        callback();
    });

    socket.on('connect_error', (err) => {
        isConnecting = false;
        showToast('Ошибка подключения к серверу: ' + err.message);
        const btn = document.getElementById('create-room-btn');
        if (btn) btn.disabled = false;
        const jBtn = document.getElementById('join-room-btn');
        if (jBtn) jBtn.disabled = false;
    });

    socket.on('room_created', (data) => {
        currentRoomId = data.roomId;
        myColor = data.color;
        document.getElementById('room-code').innerText = currentRoomId;
        document.getElementById('room-code-display').style.display = 'block';
        showToast('Комната создана! Отправьте код сопернику.');
    });

    socket.on('room_joined', (data) => {
        currentRoomId = data.roomId;
        myColor = data.color;
    });

    socket.on('game_started', (data) => {
        isMultiplayer = true;

        let opponentName = myColor === 'w' ? data.guestName : data.hostName;
        let msg = myColor === 'w'
            ? 'Белыми (вы ходите первыми)!'
            : 'Черными (ждите хода соперника).';
        showToast(`Матч найден! Противник: ${opponentName}. Вы играете ${msg}`);

        resetGameData();
        switchTab('play');

        // Обновляем имена в интерфейсе
        const nameTop = document.querySelector('.player-info.top .name');
        const nameBottom = document.querySelector('.player-info.bottom .name');

        const myName = nicknameInput ? nicknameInput.value.trim() || 'Гость' : 'Гость';

        if (nameTop && nameBottom) {
            // В мультиплеере: myColor всегда снизу, кроме случая когда мы черные (тогда доска переворачивается, и мы все равно снизу)
            nameBottom.innerHTML = `${myName} (${myColor === 'w' ? 'Белые' : 'Черные'}) <span class="score-badge" id="score-${myColor === 'w' ? 'white' : 'black'}"></span> <span class="badge" id="game-status">Ожидание...</span>`;
            nameTop.innerHTML = `${opponentName} (${myColor === 'w' ? 'Черные' : 'Белые'}) <span class="score-badge" id="score-${myColor === 'w' ? 'black' : 'white'}"></span>`;
        }
    });

    socket.on('opponent_move', (move) => {
        // Применяем ход от соперника (с флагом emit = false)
        makeMove(move.from, move.to, move.promotion, false);
    });

    socket.on('undo_requested', () => {
        const modal = document.getElementById('undo-modal');
        if (modal) modal.classList.add('show');
    });

    socket.on('undo_accepted', () => {
        showToast('Соперник согласился.');
        performUndo();
    });

    socket.on('undo_rejected', () => {
        showToast('Соперник отказался отменять ход.');
    });

    socket.on('opponent_disconnected', () => {
        showToast('Соперник отключился.');
        isMultiplayer = false;
        currentRoomId = null;
    });

    socket.on('error_message', (msg) => {
        const errEl = document.getElementById('join-error');
        if (errEl) {
            errEl.innerText = msg;
            errEl.style.display = 'block';
        } else {
            showToast(msg);
        }
    });
}

// Обработчики кнопок мультиплеера
const createBtn = document.getElementById('create-room-btn');
if (createBtn) {
    createBtn.addEventListener('click', () => {
        createBtn.disabled = true;
        ensureSocketConnection(() => {
            const color = document.getElementById('host-color-select').value;
            const nickname = nicknameInput ? nicknameInput.value.trim() || 'Гость' : 'Гость';
            socket.emit('create_room', { color, nickname });
        });
    });
}

const joinBtn = document.getElementById('join-room-btn');
if (joinBtn) {
    joinBtn.addEventListener('click', () => {
        const code = document.getElementById('join-room-input').value.trim();
        if (code.length > 0) {
            joinBtn.disabled = true;
            ensureSocketConnection(() => {
                const nickname = nicknameInput ? nicknameInput.value.trim() || 'Гость' : 'Гость';
                socket.emit('join_room', { roomId: code, nickname });
                joinBtn.disabled = false;
            });
        }
    });
}

const acceptUndoBtn = document.getElementById('undo-accept-btn');
if (acceptUndoBtn) {
    acceptUndoBtn.addEventListener('click', () => {
        document.getElementById('undo-modal').classList.remove('show');
        if (currentRoomId && socket) {
            socket.emit('accept_undo', currentRoomId);
            performUndo(); // Также откатываем у себя
        }
    });
}

const rejectUndoBtn = document.getElementById('undo-reject-btn');
if (rejectUndoBtn) {
    rejectUndoBtn.addEventListener('click', () => {
        document.getElementById('undo-modal').classList.remove('show');
        if (currentRoomId && socket) {
            socket.emit('reject_undo', currentRoomId);
        }
    });
}
