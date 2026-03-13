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

// --- БОЕВОЙ ДУХ ---
let moraleMap = {}; // { square: currentMorale }
let immortalSquares = {}; // { square: remainingMoves }
let xrayBishop = null; // square of bishop with active x-ray
let activeAbility = null; // { type, square, data }
const pieceAbilities = {
    p: 'Мгновенное превращение в слона.',
    n: 'Перемещение на любую свободную клетку доски.',
    b: 'Сквозное взятие через фигуры на следующем ходу.',
    r: 'Захват до 3 фигур по одной линии за один ход.',
    q: 'Бессмертие на 3 следующих хода.',
    k: 'Гнев Монарха: Призыв верного Ферзя на любое свободное поле.'
};

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
        console.log('[CLIENT] boardElement raw click', e.target);
        const sq = getSquareFromEvent(e);
        console.log(`[CLIENT] boardElement square detected: ${sq}`);
        if (sq) handleSquareClick(sq);
    });

    initPieces();
}

function getSquareFromEvent(e) {
    const el = e.target.closest('[data-square]');
    return el ? el.dataset.square : null;
}

function initPieces() {
    console.log('[CLIENT] initPieces starting');
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
    console.log('[CLIENT] initPieces finished');
}

function createPieceDOM(sq, color, type) {
    const img = document.createElement('img');
    img.src = pieceImages[color][type];
    img.className = 'piece';
    img.draggable = true;
    img.dataset.square = sq;

    const coords = getSquareCoords(sq);
    img.style.top = coords.r * 12.5 + '%';
    img.style.left = coords.c * 12.5 + '%';

    img.addEventListener('dragstart', (e) => {
        if (currentHistoryIndex < historyMoves.length - 1) {
            e.preventDefault();
            return;
        }
        const pSq = img.dataset.square;
        const p = game.get(pSq);
        if (!p || p.color !== game.turn()) {
            e.preventDefault();
            return;
        }
        if (isMultiplayer && p.color !== myColor) {
            e.preventDefault();
            return;
        }

        selectedSquare = pSq;
        validMoves = filterMovesByAppetite(game.moves({ square: pSq, verbose: true }));
        renderHighlights();
        e.dataTransfer.setData('text/plain', pSq);
        setTimeout(() => img.classList.add('dragging'), 0);
    });

    img.addEventListener('dragend', () => img.classList.remove('dragging'));

    boardElement.appendChild(img);
    domPieces[sq] = img;
}

function renderHighlights() {
    Object.values(domSquares).forEach(s => {
        s.classList.remove('selected', 'valid-move', 'valid-capture', 'ability-target');
        const sq = s.dataset.square;

        if (selectedSquare === sq) s.classList.add('selected');

        // Подсветка целей способности
        if (activeAbility) {
            let isTarget = false;
            if (activeAbility.type === 'knight_teleport' || activeAbility.type === 'king_spawn') {
                if (!game.get(sq)) isTarget = true;
            } else if (activeAbility.type === 'rook_multi') {
                const p = game.get(sq);
                if (p && p.color !== game.turn()) {
                    // Проверка что на одной линии с ладьей
                    const lsq = activeAbility.square;
                    if (lsq[0] === sq[0] || lsq[1] === sq[1]) isTarget = true;
                }
            }
            if (isTarget) s.classList.add('ability-target');
        }

        const move = validMoves.find(m => m.to === sq);
        if (move) {
            if (domPieces[sq]) {
                s.classList.add('valid-capture');
            } else {
                s.classList.add('valid-move');
            }
        }

        // Рентген слона
        if (xrayBishop && selectedSquare === xrayBishop) {
            // Здесь мы могли бы добавить кастомные хайлайты, 
            // но проще добавить их в validMoves при клике.
        }
    });

    // Специальная подсветка бессмертия
    for (const sq in domPieces) {
        if (immortalSquares[sq]) domPieces[sq].classList.add('immortal');
    }
}

function handleSquareClick(square) {
    console.log(`[CLIENT] handleSquareClick clicked: ${square}`);
    if (currentHistoryIndex < historyMoves.length - 1) return;

    // Перехват клика для активной способности
    if (activeAbility) {
        handleAbilityTargetClick(square);
        return;
    }

    // Показываем инфо о фигуре
    const clickedPiece = game.get(square);
    if (clickedPiece) showPieceInfo(square);

    if (selectedSquare) {
        console.log(`[CLIENT] selectedSquare: ${selectedSquare}, target: ${square}`);
        if (makeMove(selectedSquare, square, 'q')) {
            selectedSquare = null;
            validMoves = [];
            renderHighlights();
            return;
        }
        console.log(`[CLIENT] makeMove returned false for ${selectedSquare} -> ${square}`);
    }

    const piece = game.get(square);
    if (piece && piece.color === game.turn()) {
        if (isMultiplayer && piece.color !== myColor) return;

        selectedSquare = square;
        let moves = game.moves({ square: square, verbose: true });
        console.log(`[CLIENT] moves found for ${square}: ${moves.length}`);

        // Рентген слона
        if (xrayBishop === square) {
            moves = getXrayBishopMoves(square);
        }

        validMoves = filterMovesByAppetite(moves);
    } else {
        selectedSquare = null;
        validMoves = [];
    }

    renderHighlights();
}

function makeMove(from, to, promotion = 'q', emit = true) {
    console.log(`[CLIENT] makeMove(${from}, ${to})`);
    if (currentHistoryIndex < historyMoves.length - 1) return false;

    // Бессмертие: только Король может съесть бессмертную фигуру
    if (immortalSquares[to]) {
        const piece = game.get(from);
        if (piece && piece.type !== 'k') {
            showToast('Эта фигура бессмертна (ее может съесть только Король)!');
            return false;
        }
    }

    // Проверка аппетита + кастомные ходы (рентген)
    let allMoves = game.moves({ square: from, verbose: true });
    if (xrayBishop === from) allMoves = getXrayBishopMoves(from);

    const allowedMoves = filterMovesByAppetite(allMoves);
    const moveData = allowedMoves.find(m => m.to === to);

    if (!moveData) {
        // Если это рентген-взятие, которого нет в chess.js (с перепрыгиванием), 
        // мы должны обработать его вручную
        if (xrayBishop === from && allMoves.some(m => m.to === to)) {
            // Ручное выполнение рентген-взятия
            executeXrayCapture(from, to, emit);
            return true;
        }
        return false;
    }

    // Вычисляем позиции своих фигур ДО хода (для декремента)
    const movingColor = game.turn();
    const boardBefore = game.board();
    const ownSquares = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = boardBefore[r][c];
            if (p && p.color === movingColor) {
                ownSquares.push(String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r));
            }
        }
    }

    let move = null;
    try {
        move = game.move({ from, to, promotion });
    } catch (e) { return false; }

    if (move) {
        historyMoves.push(move);
        currentHistoryIndex = historyMoves.length - 1;

        // Обновляем аппетит
        applyAppetiteForMove(move, game, ownSquares);
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
        wPart.innerText = wMove.isAbility ? (wMove.san || '⚡ Способность') : wMove.san;
        wPart.addEventListener('click', () => jumpToHistory(i));
        moveEl.appendChild(wPart);

        // Черный ход
        if (historyMoves[i + 1]) {
            const bMove = historyMoves[i + 1];
            const bPart = document.createElement('div');
            bPart.className = `move-part ${currentHistoryIndex === i + 1 ? 'active' : ''}`;
            bPart.innerText = bMove.isAbility ? (bMove.san || '⚡ Способность') : bMove.san;
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
    initMoraleMap();
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

function initMoraleMap() {
    moraleMap = {};
    immortalSquares = {};
    xrayBishop = null;
    activeAbility = null;
    const board = game.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c]) {
                const sq = String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r);
                moraleMap[sq] = 0;
            }
        }
    }
}

function getChebyshevDist(sq1, sq2) {
    const c1 = sq1.charCodeAt(0) - 'a'.charCodeAt(0);
    const r1 = 8 - parseInt(sq1[1]);
    const c2 = sq2.charCodeAt(0) - 'a'.charCodeAt(0);
    const r2 = 8 - parseInt(sq2[1]);
    return Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2));
}

function applyMoraleAfterCapture(captureSq, capturingColor) {
    const board = game.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece) {
                const sq = String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r);
                const dist = getChebyshevDist(captureSq, sq);
                let change = 0;

                if (dist <= 1) {
                    change = (piece.color === capturingColor) ? 5 : -5;
                } else if (dist <= 2) {
                    change = (piece.color === capturingColor) ? 2 : -2;
                }

                if (change !== 0) {
                    moraleMap[sq] = Math.max(-10, Math.min(10, (moraleMap[sq] || 0) + change));
                }
            }
        }
    }
}

function filterMovesByAppetite(moves) {
    return moves.filter(move => {
        if (!move.captured) return true;
        const currentSatiety = appetiteMap[move.from] || 0;
        const maxSat = pieceMaxSatiety[move.piece];
        // Можно есть если сытость строго меньше максимума
        return currentSatiety < maxSat;
    });
}

// ownPieceSquares — позиции своих фигур (снатчала хода), чтобы точно знать где декрементировать
// ownPieceSquares — позиции своих фигур (сначала хода), чтобы точно знать где декрементировать
function applyAppetiteForMove(move, gameObj, ownPieceSquares) {
    const DECAY = 5;

    // Шаг 1: декремент всех своих фигур (по позициям ДО хода)
    for (const sq of ownPieceSquares) {
        appetiteMap[sq] = Math.max(0, (appetiteMap[sq] || 0) - DECAY);
        // Бессмертие убывает за ход
        if (immortalSquares[sq] > 0) {
            immortalSquares[sq]--;
            if (immortalSquares[sq] <= 0) delete immortalSquares[sq];
        }
    }

    // Шаг 2: сохраняем данные фигуры
    const currentSatiety = appetiteMap[move.from] || 0;
    const currentMorale = moraleMap[move.from] || 0;
    const currentImmortal = immortalSquares[move.from];

    // Удаляем старые привязки
    delete appetiteMap[move.from];
    delete moraleMap[move.from];
    delete immortalSquares[move.from];

    if (move.captured) {
        let capturedSq = move.to;
        if (move.flags.includes('e')) capturedSq = move.to[0] + move.from[1]; // взятие на проходе
        delete appetiteMap[capturedSq];
        delete moraleMap[capturedSq];
        delete immortalSquares[capturedSq];

        const movingType = move.promotion || move.piece;
        const maxSat = pieceMaxSatiety[movingType];
        const foodValue = pieceMaxSatiety[move.captured];
        const rawNew = currentSatiety + foodValue;
        // Переполнение: всё выше максимума делится на 2
        appetiteMap[move.to] = rawNew <= maxSat
            ? rawNew
            : maxSat + Math.floor((rawNew - maxSat) / 2);

        // Переносим остальные данные (мораль перенесем после обновления)
        moraleMap[move.to] = currentMorale;
        if (currentImmortal) immortalSquares[move.to] = currentImmortal;

        // Применяем эффект боевого духа ко всем
        applyMoraleAfterCapture(capturedSq, move.color);
    } else {
        appetiteMap[move.to] = currentSatiety;
        moraleMap[move.to] = currentMorale;
        if (currentImmortal) immortalSquares[move.to] = currentImmortal;
    }

    // Рокировка — двигаем данные ладьи
    if (move.flags.includes('k') || move.flags.includes('q')) {
        const rookFrom = (move.flags.includes('k') ? 'h' : 'a') + move.from[1];
        const rookTo = (move.flags.includes('k') ? 'f' : 'd') + move.from[1];

        appetiteMap[rookTo] = appetiteMap[rookFrom] || 0;
        moraleMap[rookTo] = moraleMap[rookFrom] || 0;
        if (immortalSquares[rookFrom]) immortalSquares[rookTo] = immortalSquares[rookFrom];

        delete appetiteMap[rookFrom];
        delete moraleMap[rookFrom];
        delete immortalSquares[rookFrom];
    }

    // Сохраняем снимок бессмертия для отмены (deep copy)
    // Сохраняем снимки состояния для отмены (deep copy)
    move._appetiteSnapshot = JSON.parse(JSON.stringify(appetiteMap));
    move._moraleSnapshot = JSON.parse(JSON.stringify(moraleMap));
    move._immortalSnapshot = JSON.parse(JSON.stringify(immortalSquares));
}

function rebuildAppetiteMap() {
    const tempGame = new Chess();
    appetiteMap = {};
    moraleMap = {};
    immortalSquares = {};
    xrayBishop = null;
    activeAbility = null;

    const initBoard = tempGame.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (initBoard[r][c]) {
                const sq = String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r);
                appetiteMap[sq] = 0;
                moraleMap[sq] = 0;
            }
        }
    }

    for (let i = 0; i <= currentHistoryIndex; i++) {
        const move = historyMoves[i];
        // Вычисляем позиции своих фигур ДО хода
        const boardBefore = tempGame.board();
        const ownSquares = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = boardBefore[r][c];
                if (p && p.color === move.color) {
                    ownSquares.push(String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r));
                }
            }
        }
        if (move.isAbility) {
            // Ручное обновление для способностей, которые chess.js не переваривает
            const piece = tempGame.remove(move.from);
            tempGame.put({ type: move.promotion || move.piece, color: move.color }, move.to);
            if (move.rookMultiTargets) {
                // Удаляем съеденные ладьей фигуры
                for (const t of move.rookMultiTargets) {
                    tempGame.remove(t);
                }
            }
            if (move.isSelfDestruct) {
                tempGame.remove(move.from);
                if (move.collateralTarget) tempGame.remove(move.collateralTarget);
            }
            toggleTurn(tempGame);
        } else {
            tempGame.move(move);
        }

        applyAppetiteForMove(move, tempGame, ownSquares);

        // Восстанавливаем мораль и аппетит из снимков, если они есть (для полной точности при способностях)
        if (move._appetiteSnapshot) appetiteMap = JSON.parse(JSON.stringify(move._appetiteSnapshot));
        if (move._moraleSnapshot) moraleMap = JSON.parse(JSON.stringify(move._moraleSnapshot));
        if (move._immortalSnapshot) immortalSquares = JSON.parse(JSON.stringify(move._immortalSnapshot));
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
    const satietyPct = maxSat > 0 ? (satiety / maxSat) * 100 : 0;

    const morale = moraleMap[square] || 0;
    const isImmortal = !!immortalSquares[square];

    document.getElementById('piece-info-img').src = pieceImages[piece.color][piece.type];
    let nameText = pieceNames[piece.type] + (piece.color === 'w' ? ' (белая)' : ' (чёрная)');
    if (isImmortal) nameText += ' 🛡️ [БЕССМЕРТЕН]';
    document.getElementById('piece-info-name').innerText = nameText;

    // Сытость
    const satietyFill = document.getElementById('satiety-bar-fill');
    satietyFill.style.width = satietyPct + '%';
    if (satietyPct >= 80) satietyFill.style.background = '#ef4444';
    else if (satietyPct >= 40) satietyFill.style.background = '#eab308';
    else satietyFill.style.background = '#22c55e';
    document.getElementById('satiety-value').innerText = `${satiety}/${maxSat}`;

    // Боевой дух
    const moraleNeg = document.getElementById('morale-bar-neg');
    const moralePos = document.getElementById('morale-bar-pos');
    const moraleVal = document.getElementById('morale-value');
    if (morale < 0) {
        moraleNeg.style.width = (Math.abs(morale) / 10 * 100) + '%';
        moralePos.style.width = '0%';
    } else {
        moraleNeg.style.width = '0%';
        moralePos.style.width = (morale / 10 * 100) + '%';
    }
    moraleVal.innerText = (morale >= 0 ? '+' : '') + morale;

    // Способность
    const abilityDesc = document.getElementById('ability-description');
    const abilityBtn = document.getElementById('ability-btn');

    if (morale === -10) {
        abilityDesc.innerText = '💥 Самоуничтожение: удаляет фигуру. 50% шанс взорвать случайную вражескую фигуру рядом.';
    } else {
        abilityDesc.innerText = pieceAbilities[piece.type];
    }

    // Кнопка активации доступна только при достижении +10 морали
    if (morale === 10) {
        abilityBtn.style.display = 'block';
        // Если это наш ход и наша фигура
        if (game.turn() === piece.color && (!isMultiplayer || piece.color === myColor)) {
            abilityBtn.disabled = false;
        } else {
            abilityBtn.disabled = true;
        }
    } else {
        abilityBtn.style.display = 'none';
    }

    // Кнопка самоуничтожения доступна при -10 морали
    const destructBtn = document.getElementById('destruct-btn');
    if (morale === -10) {
        destructBtn.style.display = 'block';
        if (game.turn() === piece.color && (!isMultiplayer || piece.color === myColor)) {
            destructBtn.disabled = false;
        } else {
            destructBtn.disabled = true;
        }
    } else {
        destructBtn.style.display = 'none';
    }

    emptyEl.style.display = 'none';
    contentEl.style.display = 'block';
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

// --- АППЕТИТ: ПЕРЕМЕННЫЕ УДАЛИТЬ ЛИШНЕЕ ЕСЛИ ЕСТЬ ---

// --- БОЕВОЙ ДУХ: СПОСОБНОСТИ ---
const abilityBtn = document.getElementById('ability-btn');
const abilityModal = document.getElementById('ability-choice-modal');
const abilityChoices = document.getElementById('ability-modal-choices');
const abilityCancel = document.getElementById('ability-cancel-btn');

abilityBtn.addEventListener('click', () => {
    if (selectedInfoSquare) {
        activateAbility(selectedInfoSquare);
    }
});

abilityCancel.addEventListener('click', () => {
    abilityModal.style.display = 'none';
    activeAbility = null;
});

function selfDestruct(square, emit = true) {
    const piece = game.get(square);
    if (!piece) return;

    let collateralTarget = null;
    if (emit && Math.random() < 0.5) {
        const neighbors = [];
        const r = 8 - parseInt(square[1]);
        const c = square.charCodeAt(0) - 'a'.charCodeAt(0);
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                    const nsq = String.fromCharCode('a'.charCodeAt(0) + nc) + (8 - nr);
                    const targetPiece = game.get(nsq);
                    if (targetPiece && targetPiece.color !== piece.color) neighbors.push(nsq);
                }
            }
        }
        if (neighbors.length > 0) collateralTarget = neighbors[Math.floor(Math.random() * neighbors.length)];
    }

    if (emit) emitAbility({ type: 'self_destruct', square, collateralTarget });
    else collateralTarget = data?.collateralTarget;

    showToast(`${pieceNames[piece.type]} совершил(а) самоуничтожение`);

    // Эффект морали на окружающих (как при захвате врагом)
    applyMoraleAfterCapture(square, piece.color === 'w' ? 'b' : 'w');

    game.remove(square);
    delete appetiteMap[square];
    delete moraleMap[square];
    delete immortalSquares[square];

    if (collateralTarget) {
        const victim = game.get(collateralTarget);
        if (victim) {
            game.remove(collateralTarget);
            delete appetiteMap[collateralTarget];
            delete moraleMap[collateralTarget];
            delete immortalSquares[collateralTarget];
        }
    }

    toggleTurn(game);

    // Записываем в историю
    const fakeMove = {
        from: square, to: square, color: piece.color, piece: piece.type,
        flags: 'n', isAbility: true, isSelfDestruct: true,
        collateralTarget,
        san: `💥 ${piece.type.toUpperCase()}-Boom`
    };
    historyMoves.push(fakeMove);
    currentHistoryIndex = historyMoves.length - 1;

    initBoard();
    renderHighlights();
    updateStatus();
    updateHistoryUI();
    updatePieceInfoPanel();
}
function activateAbility(square) {
    const piece = game.get(square);
    if (!piece || moraleMap[square] !== 10) return;

    // Сбрасываем мораль
    moraleMap[square] = 0;
    updatePieceInfoPanel();

    if (piece.type === 'p') {
        // Вычисляем ownSquares ДО хода
        const boardBefore = game.board();
        const ownSquares = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = boardBefore[r][c];
                if (p && p.color === piece.color) {
                    ownSquares.push(String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r));
                }
            }
        }

        // Автоматическое превращение в слона (на месте)
        game.remove(square);
        game.put({ type: 'b', color: piece.color }, square);

        const move = {
            from: square, to: square, color: piece.color, piece: 'p', promotion: 'b',
            flags: 'p', isAbility: true,
            san: '⚡ Pawn→B'
        };
        historyMoves.push(move);
        currentHistoryIndex = historyMoves.length - 1;

        applyAppetiteForMove(move, game, ownSquares);
        toggleTurn(game);
        emitAbility({ type: 'pawn_change', square, pieceType: 'b' });

        initBoard();
        renderHighlights();
        updateStatus();
        updateHistoryUI();
        showToast('Пешка превратилась в слона');
    } else if (piece.type === 'n') {
        activeAbility = { type: 'knight_teleport', square: square };
        showToast('Выберите пустую клетку для телепортации коня');
        renderHighlights();
    } else if (piece.type === 'b') {
        xrayBishop = square;
        emitAbility({ type: 'bishop_xray', square });
        showToast('Слон получил сквозное взятие на 1 ход');
        renderHighlights();
    } else if (piece.type === 'r') {
        activeAbility = { type: 'rook_multi', square: square, targets: [] };
        showToast('Выберите до 3 фигур по линии для захвата (клик на ладью для подтверждения)');
        renderHighlights();
    } else if (piece.type === 'q') {
        immortalSquares[square] = 3;
        emitAbility({ type: 'queen_immortal', square });
        showToast('Ферзь стал бессмертным на 3 хода');
        updatePieceInfoPanel();
        renderHighlights();
    } else if (piece.type === 'k') {
        activeAbility = { type: 'king_spawn', square: square, pieceType: 'q' };
        showToast(`Выберите пустую клетку для спавна ферзя`);
        renderHighlights();
    }
}

function emitAbility(data) {
    if (isMultiplayer && currentRoomId && socket) {
        data.roomId = currentRoomId;
        socket.emit('use_ability', data);
    }
}

function applyOpponentAbility(data) {
    const { type, square, targets, pieceType, target } = data;
    moraleMap[square] = 0; // Сброс морали у инициатора

    if (type === 'pawn_change') {
        const piece = game.get(square);
        if (piece) {
            game.remove(square);
            game.put({ type: pieceType, color: piece.color }, square);
            toggleTurn(game);
        }
    } else if (type === 'knight_teleport') {
        const p = game.get(square);
        if (p) {
            game.remove(square);
            game.put({ type: 'n', color: p.color }, target);
            appetiteMap[target] = appetiteMap[square] || 0;
            delete appetiteMap[square];
            moraleMap[target] = 0;
            delete moraleMap[square];
            toggleTurn(game);
        }
    } else if (type === 'bishop_xray') {
        xrayBishop = square;
    } else if (type === 'rook_multi') {
        activeAbility = { type: 'rook_multi', square, targets };
        executeRookMulti(false);
    } else if (type === 'queen_immortal') {
        immortalSquares[square] = 3;
    } else if (type === 'king_spawn') {
        const p = game.get(square);
        if (p) {
            game.put({ type: pieceType, color: p.color }, target);
            appetiteMap[target] = 0;
            moraleMap[target] = 0;
            toggleTurn(game);
        }
    } else if (type === 'bishop_xray_action') {
        executeXrayCapture(data.from, data.to, false);
    } else if (type === 'self_destruct') {
        selfDestruct(square, false, data);
    }

    initBoard();
    renderHighlights();
    updateStatus();
    updatePieceInfoPanel();
}

function handleAbilityTargetClick(square) {
    if (!activeAbility) return;

    if (activeAbility.type === 'knight_teleport') {
        if (!game.get(square)) {
            const from = activeAbility.square;
            const p = game.get(from);
            game.remove(from);
            game.put({ type: 'n', color: p.color }, square);

            // Синхронизируем состояние
            appetiteMap[square] = appetiteMap[from] || 0;
            delete appetiteMap[from];
            moraleMap[square] = 0;
            delete moraleMap[from];

            emitAbility({ type: 'knight_teleport', square: from, target: square });

            // Вычисляем ownSquares ДО хода
            const boardBefore = game.board();
            const ownSquares = [];
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const piece = boardBefore[r][c];
                    if (piece && piece.color === p.color) {
                        ownSquares.push(String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r));
                    }
                }
            }

            // Записываем в историю
            const moveData = {
                from: from, to: square, color: p.color, piece: 'n',
                flags: 'n', isAbility: true,
                san: '⚡ N-Jump'
            };
            historyMoves.push(moveData);
            currentHistoryIndex = historyMoves.length - 1;

            applyAppetiteForMove(moveData, game, ownSquares);
            toggleTurn(game);
            finishAbility('Конь телепортировался');
        }
    } else if (activeAbility.type === 'king_spawn') {
        if (!game.get(square)) {
            const from = activeAbility.square;
            const p = game.get(from);
            game.put({ type: activeAbility.pieceType, color: p.color }, square);
            appetiteMap[square] = 0;
            moraleMap[square] = 0;

            emitAbility({ type: 'king_spawn', square: from, target: square, pieceType: activeAbility.pieceType });

            // Вычисляем ownSquares ДО хода
            const boardBefore = game.board();
            const ownSquares = [];
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const piece = boardBefore[r][c];
                    if (piece && piece.color === p.color) {
                        ownSquares.push(String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r));
                    }
                }
            }

            // Записываем в историю
            const move = {
                from: square, to: square, color: p.color, piece: activeAbility.pieceType,
                flags: 'n', isAbility: true,
                san: `⚡ Spawn-${activeAbility.pieceType.toUpperCase()}`
            };
            historyMoves.push(move);
            currentHistoryIndex = historyMoves.length - 1;

            applyAppetiteForMove(move, game, ownSquares);
            toggleTurn(game);
            finishAbility('Фигура призвана');
        }
    } else if (activeAbility.type === 'rook_multi') {
        const p = game.get(square);
        const lsq = activeAbility.square;
        const piece = game.get(lsq);
        if (p && p.color !== piece.color && (lsq[0] === square[0] || lsq[1] === square[1])) {
            if (!activeAbility.targets.includes(square)) {
                activeAbility.targets.push(square);
                showToast(`Цель ${activeAbility.targets.length}/3 выбрана`);
                if (activeAbility.targets.length === 3) executeRookMulti();
                renderHighlights();
            }
        } else if (square === activeAbility.square && activeAbility.targets.length > 0) {
            executeRookMulti();
        }
    }
}

function executeRookMulti(emit = true) {
    if (!activeAbility) return;
    const targets = [...activeAbility.targets];
    if (targets.length === 0) return;

    const from = activeAbility.square;
    const piece = game.get(from);
    if (!piece) return;
    const color = piece.color;

    if (emit) emitAbility({ type: 'rook_multi', square: from, targets });

    // Сортируем по дистанции и берём последнюю
    targets.sort((a, b) => getChebyshevDist(from, a) - getChebyshevDist(from, b));
    const lastTarget = targets[targets.length - 1];
    const intermediates = targets.slice(0, -1);

    // Удаляем промежуточные фигуры
    for (const t of intermediates) {
        game.remove(t);
        delete appetiteMap[t];
        delete moraleMap[t];
    }

    // Вычисляем ownSquares ДО хода
    const boardBefore = game.board();
    const ownSquares = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = boardBefore[r][c];
            if (p && p.color === color) {
                ownSquares.push(String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r));
            }
        }
    }

    activeAbility = null;

    // Пытаемся сделать ход к последней цели
    // Сначала удалим цель (чтобы chess.js не проверял легальность взятия если оно "странное")
    const captured = game.get(lastTarget);
    game.remove(lastTarget);

    const move = game.move({ from, to: lastTarget, promotion: 'q' });
    if (move) {
        move.isAbility = true;
        move.san = '⚡ Rook-Multi';
        move.rookMultiTargets = intermediates;
        if (captured) move.captured = captured.type;
        historyMoves.push(move);
        currentHistoryIndex = historyMoves.length - 1;
        applyAppetiteForMove(move, game, ownSquares);
        if (emit && isMultiplayer) socket.emit('make_move', { roomId: currentRoomId, move });
        finishAbility('Ладья уничтожила цели');
    } else {
        // Fallback
        appetiteMap[lastTarget] = appetiteMap[from] || 0;
        moraleMap[lastTarget] = moraleMap[from] || 0;
        if (immortalSquares[from]) immortalSquares[lastTarget] = immortalSquares[from];
        game.remove(from);
        game.put({ type: 'r', color }, lastTarget);

        const fakeMove = {
            from, to: lastTarget, color, piece: 'r', flags: 'c', captured: captured ? captured.type : 'p',
            isAbility: true, san: '⚡ Rook-Multi', rookMultiTargets: intermediates
        };
        historyMoves.push(fakeMove);
        currentHistoryIndex = historyMoves.length - 1;

        delete appetiteMap[from];
        delete moraleMap[from];
        delete immortalSquares[from];

        applyAppetiteForMove(fakeMove, game, ownSquares);
        if (emit && isMultiplayer) socket.emit('make_move', { roomId: currentRoomId, move: fakeMove });
        finishAbility('Ладья уничтожила цели');
    }
}

function finishAbility(msg) {
    activeAbility = null;
    initBoard();
    renderHighlights();
    updateStatus();
    updatePieceInfoPanel();
    if (msg) showToast(msg);
}

function getXrayBishopMoves(square) {
    const piece = game.get(square);
    const moves = [];
    const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const startC = square.charCodeAt(0) - 'a'.charCodeAt(0);
    const startR = 8 - parseInt(square[1]);

    for (const [dr, dc] of directions) {
        let r = startR + dr;
        let c = startC + dc;
        while (r >= 0 && r < 8 && c >= 0 && c < 8) {
            const targetSq = String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r);
            const targetPiece = game.get(targetSq);

            if (targetPiece) {
                if (targetPiece.color !== piece.color) {
                    moves.push({ from: square, to: targetSq, captured: targetPiece.type, verbose: true, flags: 'c' });
                }
                // В обычном режиме здесь break, но в рентгене идем дальше
            } else {
                moves.push({ from: square, to: targetSq, verbose: true, flags: 'n' });
            }
            r += dr;
            c += dc;
        }
    }
    return moves;
}

function executeXrayCapture(from, to, emit) {
    const piece = game.get(from);
    if (!piece) return;

    if (emit) emitAbility({ type: 'bishop_xray_action', from, to });

    const color = piece.color;
    const captured = game.get(to);

    // Вычисляем ownSquares
    const boardBefore = game.board();
    const ownSquares = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = boardBefore[r][c];
            if (p && p.color === color) {
                ownSquares.push(String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r));
            }
        }
    }

    // Принудительно очищаем клетку цели для шахматного движка
    game.remove(to);

    const move = game.move({ from, to, promotion: 'q' });
    if (move) {
        move.isAbility = true;
        move.san = '⚡ Bishop-XRay';
        if (captured) move.captured = captured.type;
        historyMoves.push(move);
        currentHistoryIndex = historyMoves.length - 1;
        applyAppetiteForMove(move, game, ownSquares);
        xrayBishop = null;
        if (emit && isMultiplayer) socket.emit('make_move', { roomId: currentRoomId, move });
        finishAbility('Слон совершил прыжок');
    } else {
        // Вручную если chess.js блокирует (например, фигуры на пути)
        appetiteMap[to] = appetiteMap[from] || 0;
        moraleMap[to] = moraleMap[from] || 0;
        if (immortalSquares[from]) immortalSquares[to] = immortalSquares[from];
        game.remove(from);
        game.put({ type: 'b', color }, to);

        const fakeMove = {
            from, to, color, piece: 'b', flags: 'c', captured: captured ? captured.type : 'p',
            isAbility: true, san: '⚡ Bishop-XRay'
        };
        historyMoves.push(fakeMove);
        currentHistoryIndex = historyMoves.length - 1;

        delete appetiteMap[from];
        delete moraleMap[from];
        delete immortalSquares[from];

        applyAppetiteForMove(fakeMove, game, ownSquares);
        toggleTurn(game);
        xrayBishop = null;
        if (emit && isMultiplayer) socket.emit('make_move', { roomId: currentRoomId, move: fakeMove });
        finishAbility('Слон совершил прыжок');
    }
}

function showAbilityChoice(title, choices, callback) {
    document.getElementById('ability-modal-title').innerText = title;
    abilityChoices.innerHTML = '';
    choices.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'ability-choice-btn';
        btn.innerText = c.label;
        btn.onclick = () => {
            abilityModal.style.display = 'none';
            callback(c.value);
        };
        abilityChoices.appendChild(btn);
    });
    abilityModal.style.display = 'flex';
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
    window.socket = socket;

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

    socket.on('opponent_ability', (data) => {
        applyOpponentAbility(data);
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
