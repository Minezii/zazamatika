/**
 * Custom Chess Engine
 * Mimics basic chess.js API for compatibility.
 */
class Chess {
    constructor(fen) {
        this.SQUARES = this._generateSquares();
        this._history = [];
        this._header = {};
        this._comments = {};
        this._debug = true;
        this.load(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    }

    _log(msg) {
        if (!this._debug) return;
        if (typeof window !== 'undefined' && window.socket) {
            window.socket.emit('log', `[ENGINE] ${msg}`);
        } else {
            console.log(`[ENGINE] ${msg}`);
        }
    }

    _generateSquares() {
        const squares = [];
        for (let i = 8; i >= 1; i--) {
            for (let j = 0; j < 8; j++) {
                squares.push(String.fromCharCode(97 + j) + i);
            }
        }
        return squares;
    }

    reset() {
        this.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
        this._history = [];
    }

    load(fen) {
        const tokens = fen.split(/\s+/);
        const position = tokens[0];
        const rows = position.split('/');

        this._board = Array(8).fill(null).map(() => Array(8).fill(null));

        for (let i = 0; i < 8; i++) {
            let col = 0;
            for (let j = 0; j < rows[i].length; j++) {
                const char = rows[i][j];
                if (!isNaN(char)) {
                    col += parseInt(char);
                } else {
                    const color = char === char.toUpperCase() ? 'w' : 'b';
                    const type = char.toLowerCase();
                    this._board[i][col] = { type, color };
                    col++;
                }
            }
        }

        this._turn = tokens[1] || 'w';
        this._castling = tokens[2] || 'KQkq';
        this._enPassant = (tokens[3] === '-') ? null : tokens[3];
        this._halfMoves = parseInt(tokens[4] || '0');
        this._fullMoves = parseInt(tokens[5] || '1');

        return true;
    }

    fen() {
        let fen = '';
        for (let i = 0; i < 8; i++) {
            let empty = 0;
            for (let j = 0; j < 8; j++) {
                const piece = this._board[i][j];
                if (piece) {
                    if (empty > 0) fen += empty;
                    empty = 0;
                    fen += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
                } else {
                    empty++;
                }
            }
            if (empty > 0) fen += empty;
            if (i < 7) fen += '/';
        }

        fen += ` ${this._turn}`;
        fen += ` ${this._castling || '-'}`;
        fen += ` ${this._enPassant || '-'}`;
        fen += ` ${this._halfMoves}`;
        fen += ` ${this._fullMoves}`;

        return fen;
    }

    board() {
        // Returns the 8x8 array representation
        return this._board.map(row => [...row]);
    }

    turn() {
        return this._turn;
    }

    get(square) {
        const { r, c } = this._sqToCoords(square);
        return this._board[r][c];
    }

    put(piece, square) {
        const { r, c } = this._sqToCoords(square);
        this._board[r][c] = { type: piece.type, color: piece.color };
    }

    remove(square) {
        const { r, c } = this._sqToCoords(square);
        const piece = this._board[r][c];
        this._board[r][c] = null;
        return piece;
    }

    _sqToCoords(square) {
        const c = square.charCodeAt(0) - 97;
        const r = 8 - parseInt(square[1]);
        return { r, c };
    }

    _coordsToSq(r, c) {
        return String.fromCharCode(97 + c) + (8 - r);
    }

    moves(options = {}) {
        const square = options.square;
        const verbose = options.verbose;
        let moves = [];

        this._log(`Generating moves for square: ${square || 'all'}`);

        if (square) {
            const piece = this.get(square);
            if (!piece) {
                this._log(`No piece on ${square}`);
                return [];
            }
            if (piece.color !== this._turn) {
                this._log(`Piece on ${square} is ${piece.color}, but it is ${this._turn}'s turn`);
                return [];
            }
            moves = this._generateMovesForPiece(square);
        } else {
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const piece = this._board[r][c];
                    if (piece && piece.color === this._turn) {
                        moves.push(...this._generateMovesForPiece(this._coordsToSq(r, c)));
                    }
                }
            }
        }

        // Filter moves that leave the king in check
        moves = moves.filter(m => !this._leavesKingInCheck(m));

        if (verbose) {
            return moves;
        } else {
            return moves.map(m => m.san || this._moveToSan(m));
        }
    }

    _generateMovesForPiece(square) {
        const { r, c } = this._sqToCoords(square);
        const piece = this._board[r][c];
        const moves = [];

        if (piece.type === 'p') {
            const dir = piece.color === 'w' ? -1 : 1;
            const startRow = piece.color === 'w' ? 6 : 1;

            // Single push
            if (!this._board[r + dir][c]) {
                this._addPawnMove(moves, square, this._coordsToSq(r + dir, c), dir);
                // Double push
                if (r === startRow && !this._board[r + 2 * dir][c]) {
                    moves.push({ from: square, to: this._coordsToSq(r + 2 * dir, c), color: piece.color, piece: 'p', flags: 'b' });
                }
            }

            // Captures
            for (let dc of [-1, 1]) {
                const nc = c + dc;
                if (nc >= 0 && nc < 8) {
                    const target = this._board[r + dir][nc];
                    if (target && target.color !== piece.color) {
                        this._addPawnMove(moves, square, this._coordsToSq(r + dir, nc), dir, target.type);
                    } else if (this._enPassant === this._coordsToSq(r + dir, nc)) {
                        moves.push({ from: square, to: this._coordsToSq(r + dir, nc), color: piece.color, piece: 'p', captured: 'p', flags: 'e' });
                    }
                }
            }
        } else if (piece.type === 'n') {
            const steps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
            for (let [dr, dc] of steps) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                    const target = this._board[nr][nc];
                    if (!target || target.color !== piece.color) {
                        moves.push({ from: square, to: this._coordsToSq(nr, nc), color: piece.color, piece: 'n', captured: target ? target.type : null, flags: target ? 'c' : 'n' });
                    }
                }
            }
        } else if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
            const dirs = [];
            if (piece.type === 'b' || piece.type === 'q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
            if (piece.type === 'r' || piece.type === 'q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);

            for (let [dr, dc] of dirs) {
                let nr = r + dr, nc = c + dc;
                while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                    const target = this._board[nr][nc];
                    if (target) {
                        if (target.color !== piece.color) {
                            moves.push({ from: square, to: this._coordsToSq(nr, nc), color: piece.color, piece: piece.type, captured: target.type, flags: 'c' });
                        }
                        break;
                    }
                    moves.push({ from: square, to: this._coordsToSq(nr, nc), color: piece.color, piece: piece.type, flags: 'n' });
                    nr += dr;
                    nc += dc;
                }
            }
        } else if (piece.type === 'k') {
            const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
            for (let [dr, dc] of dirs) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                    const target = this._board[nr][nc];
                    if (!target || target.color !== piece.color) {
                        moves.push({ from: square, to: this._coordsToSq(nr, nc), color: piece.color, piece: 'k', captured: target ? target.type : null, flags: target ? 'c' : 'n' });
                    }
                }
            }

            // Castling
            if (!this.in_check()) {
                if (piece.color === 'w') {
                    if (this._castling.includes('K') && !this._board[7][5] && !this._board[7][6] && !this._isSquareAttacked('f1', 'b') && !this._isSquareAttacked('g1', 'b')) {
                        moves.push({ from: 'e1', to: 'g1', color: 'w', piece: 'k', flags: 'k' });
                    }
                    if (this._castling.includes('Q') && !this._board[7][1] && !this._board[7][2] && !this._board[7][3] && !this._isSquareAttacked('d1', 'b') && !this._isSquareAttacked('c1', 'b')) {
                        moves.push({ from: 'e1', to: 'c1', color: 'w', piece: 'k', flags: 'q' });
                    }
                } else {
                    if (this._castling.includes('k') && !this._board[0][5] && !this._board[0][6] && !this._isSquareAttacked('f8', 'w') && !this._isSquareAttacked('g8', 'w')) {
                        moves.push({ from: 'e8', to: 'g8', color: 'b', piece: 'k', flags: 'k' });
                    }
                    if (this._castling.includes('q') && !this._board[0][1] && !this._board[0][2] && !this._board[0][3] && !this._isSquareAttacked('d8', 'w') && !this._isSquareAttacked('c8', 'w')) {
                        moves.push({ from: 'e8', to: 'c8', color: 'b', piece: 'k', flags: 'q' });
                    }
                }
            }
        }

        return moves;
    }

    _addPawnMove(moves, from, to, dir, captured = null) {
        const promotionRow = this._turn === 'w' ? 0 : 7;
        const { r } = this._sqToCoords(to);
        if (r === promotionRow) {
            ['q', 'r', 'b', 'n'].forEach(type => {
                moves.push({ from, to, color: this._turn, piece: 'p', captured, promotion: type, flags: captured ? 'pc' : 'p' });
            });
        } else {
            moves.push({ from, to, color: this._turn, piece: 'p', captured, flags: captured ? 'c' : 'n' });
        }
    }

    _leavesKingInCheck(move) {
        const originalFen = this.fen();
        this._makeInternalMove(move);
        const kingSq = this._findKing(move.color);
        const inCheck = this._isSquareAttacked(kingSq, move.color === 'w' ? 'b' : 'w');
        this.load(originalFen);
        return inCheck;
    }

    _makeInternalMove(move) {
        const { r: r1, c: c1 } = this._sqToCoords(move.from);
        const { r: r2, c: c2 } = this._sqToCoords(move.to);
        const piece = this._board[r1][c1];

        // En passant
        if (move.flags === 'e') {
            const epDir = piece.color === 'w' ? 1 : -1;
            this._board[r2 + epDir][c2] = null;
        }

        // Move piece
        this._board[r1][c1] = null;
        this._board[r2][c2] = { type: move.promotion || piece.type, color: piece.color };

        // Castling
        if (move.flags === 'k') {
            if (piece.color === 'w') { this._board[7][7] = null; this._board[7][5] = { type: 'r', color: 'w' }; }
            else { this._board[0][7] = null; this._board[0][5] = { type: 'r', color: 'b' }; }
        } else if (move.flags === 'q') {
            if (piece.color === 'w') { this._board[7][0] = null; this._board[7][3] = { type: 'r', color: 'w' }; }
            else { this._board[0][0] = null; this._board[0][3] = { type: 'r', color: 'b' }; }
        }

        // Update turn
        this._turn = this._turn === 'w' ? 'b' : 'w';
    }

    _findKing(color) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this._board[r][c];
                if (piece && piece.type === 'k' && piece.color === color) {
                    return this._coordsToSq(r, c);
                }
            }
        }
        return null; // Should not happen
    }

    _isSquareAttacked(square, byColor) {
        const { r, c } = this._sqToCoords(square);

        // Attacked by Knight
        const nSteps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        for (let [dr, dc] of nSteps) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const p = this._board[nr][nc];
                if (p && p.type === 'n' && p.color === byColor) return true;
            }
        }

        // Attacked by King
        const kSteps = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        for (let [dr, dc] of kSteps) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const p = this._board[nr][nc];
                if (p && p.type === 'k' && p.color === byColor) return true;
            }
        }

        // Attacked by Pawn
        const pDir = byColor === 'w' ? 1 : -1;
        for (let dc of [-1, 1]) {
            const nr = r + pDir, nc = c + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const p = this._board[nr][nc];
                if (p && p.type === 'p' && p.color === byColor) return true;
            }
        }

        // Attacked by sliding pieces (Rook, Bishop, Queen)
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
        for (let [dr, dc] of dirs) {
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const p = this._board[nr][nc];
                if (p) {
                    if (p.color === byColor) {
                        const isDiagonal = dr !== 0 && dc !== 0;
                        if (isDiagonal && (p.type === 'b' || p.type === 'q')) return true;
                        if (!isDiagonal && (p.type === 'r' || p.type === 'q')) return true;
                    }
                    break;
                }
                nr += dr;
                nc += dc;
            }
        }

        return false;
    }

    move(moveInput) {
        let moveData;
        if (typeof moveInput === 'string') {
            // Basic SAN parsing (not fully implemented, enough for history if needed)
            // For simplicity in this app, we mainly use {from: 'e2', to: 'e4'}
            // But we still need to generate Move objects for history/emit
            moveData = this._parseMove(moveInput);
        } else {
            moveData = moveInput;
        }

        const legalMoves = this.moves({ verbose: true });
        this._log(`Attempting move: ${JSON.stringify(moveData)}. Legal moves count: ${legalMoves.length}`);

        const move = legalMoves.find(m =>
            m.from === moveData.from &&
            m.to === moveData.to &&
            (!moveData.promotion || m.promotion === moveData.promotion)
        );

        if (!move) {
            this._log(`Move ${JSON.stringify(moveData)} not found in legal moves`);
            return null;
        }
        const { r: r1, c: c1 } = this._sqToCoords(move.from);
        const { r: r2, c: c2 } = this._sqToCoords(move.to);
        const piece = this._board[r1][c1];

        // SAN generation
        move.san = this._moveToSan(move);

        // Half-move clock (50-move rule)
        if (piece.type === 'p' || move.captured) {
            this._halfMoves = 0;
        } else {
            this._halfMoves++;
        }

        // Castling rights update
        if (piece.type === 'k') {
            if (piece.color === 'w') this._castling = this._castling.replace(/[KQ]/g, '');
            else this._castling = this._castling.replace(/[kq]/g, '');
        } else if (piece.type === 'r') {
            if (move.from === 'a1') this._castling = this._castling.replace('Q', '');
            else if (move.from === 'h1') this._castling = this._castling.replace('K', '');
            else if (move.from === 'a8') this._castling = this._castling.replace('q', '');
            else if (move.from === 'h8') this._castling = this._castling.replace('k', '');
        }
        // If capture on corner, update rights too
        if (move.to === 'a1') this._castling = this._castling.replace('Q', '');
        else if (move.to === 'h1') this._castling = this._castling.replace('K', '');
        else if (move.to === 'a8') this._castling = this._castling.replace('q', '');
        else if (move.to === 'h8') this._castling = this._castling.replace('k', '');

        // En passant square
        if (move.flags === 'b') {
            const epDir = piece.color === 'w' ? 1 : -1;
            this._enPassant = this._coordsToSq(r2 + epDir, c2);
        } else {
            this._enPassant = null;
        }

        // Full move number
        if (this._turn === 'b') this._fullMoves++;

        this._makeInternalMove(move);
        this._history.push(move);

        return move;
    }

    undo() {
        const move = this._history.pop();
        if (!move) return null;

        // Simpler to rebuild from history or use snapshots/FEN
        // For efficiency, rebuilding from FEN of previous states in history is better
        // But for this engine we'll just implement basic undo logic or reload FEN
        // Since history doesn't store FENs, we'll need to store them or rethink.
        // Let's just reset and replay history up to n-1.

        const historySnapshot = [...this._history];
        this.reset();
        for (let m of historySnapshot) {
            this.move(m);
        }
        return move;
    }

    history(options = {}) {
        if (options.verbose) return this._history;
        return this._history.map(m => m.san);
    }

    in_check() {
        return this._isSquareAttacked(this._findKing(this._turn), this._turn === 'w' ? 'b' : 'w');
    }

    in_checkmate() {
        return this.in_check() && this.moves().length === 0;
    }

    in_draw() {
        // Simple draw detection: stalemate, 50-move rule, (missing: threefold, insufficient material)
        if (!this.in_check() && this.moves().length === 0) return true; // Stalemate
        if (this._halfMoves >= 100) return true; // 50-move rule
        return false;
    }

    in_stalemate() {
        return !this.in_check() && this.moves().length === 0;
    }

    _moveToSan(move) {
        if (move.flags === 'k') return 'O-O';
        if (move.flags === 'q') return 'O-O-O';

        let san = '';
        if (move.piece !== 'p') {
            san += move.piece.toUpperCase();
            // Disambiguation could be added here
        }

        if (move.captured) {
            if (move.piece === 'p') san += move.from[0];
            san += 'x';
        }

        san += move.to;

        if (move.promotion) {
            san += '=' + move.promotion.toUpperCase();
        }

        if (this._leavesKingInCheckmateAfterMove(move)) {
            san += '#';
        } else if (this._leavesKingInCheckAfterMove(move)) {
            san += '+';
        }

        return san;
    }

    _leavesKingInCheckAfterMove(move) {
        const originalFen = this.fen();
        this._makeInternalMove(move);
        const inCheck = this.in_check();
        this.load(originalFen);
        return inCheck;
    }

    _leavesKingInCheckmateAfterMove(move) {
        const originalFen = this.fen();
        this._makeInternalMove(move);
        const inCheckmate = this.in_checkmate();
        this.load(originalFen);
        return inCheckmate;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Chess;
}
