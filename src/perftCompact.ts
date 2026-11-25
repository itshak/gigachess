// Independent perft-only prototype. No public position mutation.
// Each ply owns a compact color/role bitboard state and move list.
import type { Position } from "./types.js";
import { Color } from "./types.js";
import * as a from "./attacks.js";
import { popcountParts } from "./squareSet.js";
import { CASTLE_CLEAR_STD, getCastlingMask } from "./castling.js";
const P = 0, N = 2, B = 4, R = 6, Q = 8, K = 10, W = 24, BLACK = 26, ALL = 28;
const FILE_A = 0x01010101, FILE_H = 0x80808080;
const bitLo = Int32Array.from({ length: 64 }, (_, s) => s < 32 ? 1 << s : 0);
const bitHi = Int32Array.from({ length: 64 }, (_, s) => s >= 32 ? 1 << (s - 32) : 0);
const rookRay = Array.from({ length: 64 }, (_, s) => a.rookAttacks(s, { lo: 0, hi: 0 }));
const bishopRay = Array.from({ length: 64 }, (_, s) => a.bishopAttacks(s, { lo: 0, hi: 0 }));
const CASTLE = 1 << 19, EP = 1 << 20;
type State = {
    bb: Int32Array;
    king: Int8Array;
    turn: number;
    ep: number;
    rights: number;
};
function state(): State { return { bb: new Int32Array(30), king: new Int8Array(2), turn: 0, ep: -1, rights: 0 }; }
function first(lo: number, hi: number) { return lo !== 0 ? 31 - Math.clz32(lo & -lo) : hi !== 0 ? 63 - Math.clz32(hi & -hi) : -1; }
function attacked(bb: Int32Array, target: number, enemy: number, occ: {
    lo: number;
    hi: number;
}, removedPawnLo = 0, removedPawnHi = 0): boolean {
    const p = a.pawnAttacks((1 - enemy / 12) as Color, target), n = a.knightAttacks(target), k = a.kingAttacks(target);
    if (((p.lo & bb[enemy + P] & ~removedPawnLo) | (p.hi & bb[enemy + P + 1] & ~removedPawnHi) |
        (n.lo & bb[enemy + N]) | (n.hi & bb[enemy + N + 1]) | (k.lo & bb[enemy + K]) | (k.hi & bb[enemy + K + 1])) !== 0)
        return true;
    const bLo = bb[enemy + B] | bb[enemy + Q], bHi = bb[enemy + B + 1] | bb[enemy + Q + 1];
    const br = bishopRay[target];
    if (((br.lo & bLo) | (br.hi & bHi)) !== 0) {
        const d = a.bishopAttacks(target, occ);
        if (((d.lo & bLo) | (d.hi & bHi)) !== 0)
            return true;
    }
    const rLo = bb[enemy + R] | bb[enemy + Q], rHi = bb[enemy + R + 1] | bb[enemy + Q + 1];
    const rr = rookRay[target];
    if (((rr.lo & rLo) | (rr.hi & rHi)) !== 0) {
        const d = a.rookAttacks(target, occ);
        if (((d.lo & rLo) | (d.hi & rHi)) !== 0)
            return true;
    }
    return false;
}
function generate(s: State, out: Uint32Array | null): number {
    const bb = s.bb, us = s.turn, own = us * 12, enemy = 12 - own, ownOcc = W + us * 2, enemyOcc = W + (1 - us) * 2;
    const ownLo = bb[ownOcc], ownHi = bb[ownOcc + 1], enemyLo = bb[enemyOcc], enemyHi = bb[enemyOcc + 1];
    const occ = { lo: bb[ALL], hi: bb[ALL + 1] }, ks = s.king[us];
    const pa = a.pawnAttacks(us as Color, ks), na = a.knightAttacks(ks), ka = a.kingAttacks(ks);
    let checkLo = (pa.lo & bb[enemy + P]) | (na.lo & bb[enemy + N]) | (ka.lo & bb[enemy + K]);
    let checkHi = (pa.hi & bb[enemy + P + 1]) | (na.hi & bb[enemy + N + 1]) | (ka.hi & bb[enemy + K + 1]);
    // One empty-ray traversal simultaneously finds direct sliding checks and absolute pins.
    let candLo = (rookRay[ks].lo & (bb[enemy + R] | bb[enemy + Q])) | (bishopRay[ks].lo & (bb[enemy + B] | bb[enemy + Q]));
    let candHi = (rookRay[ks].hi & (bb[enemy + R + 1] | bb[enemy + Q + 1])) | (bishopRay[ks].hi & (bb[enemy + B + 1] | bb[enemy + Q + 1]));
    let pinLo = 0, pinHi = 0;
    for (let half = 0; half < 2; half++) {
        let bits = half === 0 ? candLo : candHi;
        while (bits !== 0) {
            const lsb = bits & -bits, from = half * 32 + 31 - Math.clz32(lsb);
            bits &= bits - 1;
            const bt = a.between(ks, from), bl = bt.lo & occ.lo, bh = bt.hi & occ.hi;
            if ((bl | bh) === 0) {
                if (half === 0)
                    checkLo |= lsb;
                else
                    checkHi |= lsb;
            }
            else if ((bl === 0 || bh === 0) && (((bl | bh) & ((bl | bh) - 1)) === 0)) {
                pinLo |= bl & ownLo;
                pinHi |= bh & ownHi;
            }
        }
    }
    let count = 0;
    const ko = { lo: occ.lo & ~bitLo[ks], hi: occ.hi & ~bitHi[ks] };
    let kl = ka.lo & ~ownLo, kh = ka.hi & ~ownHi;
    for (let half = 0; half < 2; half++) {
        let bits = half === 0 ? kl : kh;
        while (bits !== 0) {
            const to = half * 32 + 31 - Math.clz32(bits & -bits);
            bits &= bits - 1;
            if (!attacked(bb, to, enemy, ko)) {
                if (out)
                    out[count] = ks | (to << 6) | (5 << 16);
                count++;
            }
        }
    }
    // Standard castling only. With king not in check, the removed-king
    // occupancy safely tests transit and destination; rook is still on edge.
    if ((checkLo | checkHi) === 0 && ks === (us ? 60 : 4)) {
        const offset = us ? 56 : 0, rights = s.rights >> (us * 2), occupied = us ? occ.hi : occ.lo, rooks = bb[own + R + us];
        if ((rights & 1) && (rooks & (1 << ((offset + 7) & 31))) && !(occupied & (0x60 << (us ? 24 : 0))) &&
            !attacked(bb, offset + 5, enemy, ko) && !attacked(bb, offset + 6, enemy, ko)) {
            if (out)
                out[count] = ks | ((offset + 6) << 6) | (5 << 16) | CASTLE;
            count++;
        }
        if ((rights & 2) && (rooks & (1 << (offset & 31))) && !(occupied & (0x0e << (us ? 24 : 0))) &&
            !attacked(bb, offset + 3, enemy, ko) && !attacked(bb, offset + 2, enemy, ko)) {
            if (out)
                out[count] = ks | ((offset + 2) << 6) | (5 << 16) | CASTLE;
            count++;
        }
    }
    let maskLo = ~ownLo, maskHi = ~ownHi;
    if ((checkLo | checkHi) !== 0) {
        if ((checkLo !== 0 && checkHi !== 0) || ((checkLo | checkHi) & ((checkLo | checkHi) - 1)) !== 0)
            return count;
        const c = first(checkLo, checkHi), bt = a.between(ks, c);
        maskLo &= bt.lo | checkLo;
        maskHi &= bt.hi | checkHi;
    }
    // Parallel pawn counting for unpinned ordinary moves. Check mask applies
    // after calculating both push steps. Pinned pawns handled individually.
    let pl = bb[own + P], ph = bb[own + P + 1];
    if (!out) {
        const l = pl & ~pinLo, h = ph & ~pinHi;
        let oneLo, oneHi, twoLo, twoHi, leftLo, leftHi, rightLo, rightHi;
        const westL = l & ~FILE_A, westH = h & ~FILE_A, eastL = l & ~FILE_H, eastH = h & ~FILE_H;
        if (us === 0) {
            oneLo = (l << 8) & ~occ.lo;
            oneHi = ((h << 8) | (l >>> 24)) & ~occ.hi;
            twoLo = ((oneLo & 0x00ff0000) << 8) & ~occ.lo;
            twoHi = 0;
            leftLo = (westL << 7) & enemyLo;
            leftHi = ((westH << 7) | (westL >>> 25)) & enemyHi;
            rightLo = (eastL << 9) & enemyLo;
            rightHi = ((eastH << 9) | (eastL >>> 23)) & enemyHi;
        }
        else {
            oneLo = ((l >>> 8) | (h << 24)) & ~occ.lo;
            oneHi = (h >>> 8) & ~occ.hi;
            twoLo = 0;
            twoHi = ((oneHi & 0xff00) >>> 8) & ~occ.hi;
            leftLo = ((westL >>> 9) | (westH << 23)) & enemyLo;
            leftHi = (westH >>> 9) & enemyHi;
            rightLo = ((eastL >>> 7) | (eastH << 25)) & enemyLo;
            rightHi = (eastH >>> 7) & enemyHi;
        }
        oneLo &= maskLo;
        oneHi &= maskHi;
        twoLo &= maskLo;
        twoHi &= maskHi;
        leftLo &= maskLo;
        leftHi &= maskHi;
        rightLo &= maskLo;
        rightHi &= maskHi;
        count += popcountParts(oneLo, oneHi) + popcountParts(twoLo, twoHi) + popcountParts(leftLo, leftHi) + popcountParts(rightLo, rightHi);
        if (us === 0 && (h & 0xff0000))
            count += 3 * (popcountParts(0, oneHi & 0xff000000) + popcountParts(0, leftHi & 0xff000000) + popcountParts(0, rightHi & 0xff000000));
        if (us === 1 && (l & 0xff00))
            count += 3 * (popcountParts(oneLo & 255, 0) + popcountParts(leftLo & 255, 0) + popcountParts(rightLo & 255, 0));
        pl &= pinLo;
        ph &= pinHi;
    }
    const step = us ? -8 : 8;
    for (let half = 0; half < 2; half++) {
        let bits = half === 0 ? pl : ph;
        while (bits !== 0) {
            const lsb = bits & -bits, from = half * 32 + 31 - Math.clz32(lsb);
            bits &= bits - 1;
            const pat = a.pawnAttacks(us as Color, from);
            let dl = pat.lo & enemyLo, dh = pat.hi & enemyHi;
            const one = from + step;
            if (((bitLo[one] & occ.lo) | (bitHi[one] & occ.hi)) === 0) {
                dl |= bitLo[one];
                dh |= bitHi[one];
                if ((from >> 3) === (us ? 6 : 1)) {
                    const two = one + step;
                    if (((bitLo[two] & occ.lo) | (bitHi[two] & occ.hi)) === 0) {
                        dl |= bitLo[two];
                        dh |= bitHi[two];
                    }
                }
            }
            dl &= maskLo;
            dh &= maskHi;
            if ((lsb & (half === 0 ? pinLo : pinHi)) !== 0) {
                const idx = ks * 64 + from;
                dl &= a.LINE_RAY_LO[idx];
                dh &= a.LINE_RAY_HI[idx];
            }
            const promotes = (from >> 3) === (us ? 1 : 6);
            if (!out)
                count += popcountParts(dl, dh) * (promotes ? 4 : 1);
            else
                for (let h = 0; h < 2; h++) {
                    let ts = h === 0 ? dl : dh;
                    while (ts) {
                        const to = h * 32 + 31 - Math.clz32(ts & -ts);
                        ts &= ts - 1;
                        const word = from | (to << 6);
                        if (promotes) {
                            for (let p = 1; p <= 4; p++)
                                out[count++] = word | (p << 12);
                        }
                        else
                            out[count++] = word;
                    }
                }
        }
    }
    // EP is exceptional: test king safety after both pawns disappear from
    // their origin squares, excluding the removed enemy pawn from attack tests.
    if (s.ep >= 0) {
        const ep = s.ep, cap = ep - step, orig = a.pawnAttacks((1 - us) as Color, ep);
        let el = orig.lo & bb[own + P], eh = orig.hi & bb[own + P + 1];
        for (let half = 0; half < 2; half++) {
            let bits = half === 0 ? el : eh;
            while (bits) {
                const from = half * 32 + 31 - Math.clz32(bits & -bits);
                bits &= bits - 1;
                const eo = { lo: (occ.lo & ~(bitLo[from] | bitLo[cap])) | bitLo[ep], hi: (occ.hi & ~(bitHi[from] | bitHi[cap])) | bitHi[ep] };
                if (!attacked(bb, ks, enemy, eo, bitLo[cap], bitHi[cap])) {
                    if (out)
                        out[count] = from | (ep << 6) | EP;
                    count++;
                }
            }
        }
    }
    for (let role = 1; role <= 4; role++) {
        const idx = own + role * 2;
        for (let half = 0; half < 2; half++) {
            let bits = bb[idx + half];
            while (bits) {
                const lsb = bits & -bits, from = half * 32 + 31 - Math.clz32(lsb);
                bits &= bits - 1;
                const at = role === 1 ? a.knightAttacks(from) : role === 2 ? a.bishopAttacks(from, occ) : role === 3 ? a.rookAttacks(from, occ) : a.queenAttacks(from, occ);
                let dl = at.lo & maskLo, dh = at.hi & maskHi;
                if (lsb & (half === 0 ? pinLo : pinHi)) {
                    const i = ks * 64 + from;
                    dl &= a.LINE_RAY_LO[i];
                    dh &= a.LINE_RAY_HI[i];
                }
                if (!out)
                    count += popcountParts(dl, dh);
                else
                    for (let h = 0; h < 2; h++) {
                        let ts = h === 0 ? dl : dh;
                        while (ts) {
                            const to = h * 32 + 31 - Math.clz32(ts & -ts);
                            ts &= ts - 1;
                            out[count++] = from | (to << 6) | (role << 16);
                        }
                    }
            }
        }
    }
    return count;
}
function play(s: State, t: State, m: number) {
    const bb = t.bb;
    bb.set(s.bb);
    t.king.set(s.king);
    const us = s.turn, own = us * 12, enemy = 12 - own, ownOcc = W + us * 2, enemyOcc = W + (1 - us) * 2;
    const from = m & 63, to = (m >> 6) & 63, role = (m >> 16) & 7, promo = (m >> 12) & 15;
    const fl = bitLo[from], fh = bitHi[from], tl = bitLo[to], th = bitHi[to];
    const idx = own + role * 2, final = own + (promo || role) * 2;
    bb[idx] &= ~fl;
    bb[idx + 1] &= ~fh;
    bb[final] |= tl;
    bb[final + 1] |= th;
    bb[ownOcc] = (bb[ownOcc] & ~fl) | tl;
    bb[ownOcc + 1] = (bb[ownOcc + 1] & ~fh) | th;
    if (role === 5)
        t.king[us] = to;
    if (m & CASTLE) {
        const rf = to > from ? from + 3 : from - 4, rt = to > from ? from + 1 : from - 1;
        const rl = bitLo[rf] | bitLo[rt], rh = bitHi[rf] | bitHi[rt];
        bb[own + R] ^= rl;
        bb[own + R + 1] ^= rh;
        bb[ownOcc] ^= rl;
        bb[ownOcc + 1] ^= rh;
    }
    else {
        const cap = m & EP ? to + (us ? 8 : -8) : to, cl = bitLo[cap], ch = bitHi[cap];
        if (((bb[enemyOcc] & cl) | (bb[enemyOcc + 1] & ch)) !== 0) {
            bb[enemyOcc] &= ~cl;
            bb[enemyOcc + 1] &= ~ch;
            for (let r = enemy; r < enemy + 12; r += 2)
                if (((bb[r] & cl) | (bb[r + 1] & ch)) !== 0) {
                    bb[r] &= ~cl;
                    bb[r + 1] &= ~ch;
                    break;
                }
        }
    }
    bb[ALL] = bb[W] | bb[BLACK];
    bb[ALL + 1] = bb[W + 1] | bb[BLACK + 1];
    t.rights = s.rights & CASTLE_CLEAR_STD[from] & CASTLE_CLEAR_STD[to];
    t.turn = 1 - us;
    t.ep = -1;
    if (role === 0 && Math.abs(to - from) === 16) {
        const adjL = ((to & 7) > 0 ? bitLo[to - 1] : 0) | ((to & 7) < 7 ? bitLo[to + 1] : 0), adjH = ((to & 7) > 0 ? bitHi[to - 1] : 0) | ((to & 7) < 7 ? bitHi[to + 1] : 0);
        if (((adjL & bb[enemy + P]) | (adjH & bb[enemy + P + 1])) !== 0)
            t.ep = (from + to) >> 1;
    }
}
export function compactPerft(pos: Position, depth: number): number | undefined {
    if (pos.isChess960 || !a.magicTablesLoaded() || !Number.isInteger(depth) || depth < 2 ||
        (pos.turn !== Color.White && pos.turn !== Color.Black))
        return undefined;
    const root = state(), bb = root.bb, b = pos.board;
    const roles = [b.pawn, b.knight, b.bishop, b.rook, b.queen, b.king];
    // Board's public bitboards can be inspected or edited. Only dispatch
    // to compact state if the color/role partition and cached kings agree.
    if (((b.white.lo & b.black.lo) | (b.white.hi & b.black.hi)) !== 0 ||
        ((b.white.lo | b.black.lo) >>> 0) !== (b.occupied.lo >>> 0) ||
        ((b.white.hi | b.black.hi) >>> 0) !== (b.occupied.hi >>> 0))
        return undefined;
    let seenLo = 0, seenHi = 0;
    for (const role of roles) {
        if (((seenLo & role.lo) | (seenHi & role.hi)) !== 0)
            return undefined;
        seenLo |= role.lo;
        seenHi |= role.hi;
    }
    if ((seenLo >>> 0) !== (b.occupied.lo >>> 0) || (seenHi >>> 0) !== (b.occupied.hi >>> 0))
        return undefined;
    for (let c = 0; c < 2; c++) {
        const occ = c ? b.black : b.white;
        bb[W + c * 2] = occ.lo;
        bb[W + c * 2 + 1] = occ.hi;
        for (let r = 0; r < 6; r++) {
            bb[c * 12 + r * 2] = roles[r].lo & occ.lo;
            bb[c * 12 + r * 2 + 1] = roles[r].hi & occ.hi;
        }
        const ki = c * 12 + K;
        if (popcountParts(bb[ki], bb[ki + 1]) !== 1)
            return undefined;
        root.king[c] = first(bb[ki], bb[ki + 1]);
        if (b.kingSq && b.kingSq[c] >= 0 && b.kingSq[c] !== root.king[c])
            return undefined;
    }
    bb[ALL] = b.occupied.lo;
    bb[ALL + 1] = b.occupied.hi;
    if ((b.pawn.lo & 255) || (b.pawn.hi & 0xff000000))
        return undefined;
    root.turn = pos.turn;
    root.rights = pos.castlingMask ?? getCastlingMask(pos);
    root.ep = pos.epSquare ?? -1;
    if (root.ep >= 0) {
        if (!Number.isInteger(root.ep) || root.ep > 63)
            return undefined;
        const cap = root.ep + (root.turn ? 8 : -8), enemy = (1 - root.turn) * 12;
        if ((root.ep >> 3) !== (root.turn ? 2 : 5) || ((bitLo[root.ep] & bb[ALL]) | (bitHi[root.ep] & bb[ALL + 1])) !== 0 ||
            ((bitLo[cap] & bb[enemy + P]) | (bitHi[cap] & bb[enemy + P + 1])) === 0)
            return undefined;
    }
    if (attacked(bb, root.king[1 - root.turn], root.turn * 12, { lo: bb[ALL], hi: bb[ALL + 1] }))
        return undefined;
    const states = [root, ...Array.from({ length: depth - 1 }, state)], lists = Array.from({ length: depth - 1 }, () => new Uint32Array(256));
    function visit(ply: number): number {
        const s = states[ply];
        if (ply === depth - 1)
            return generate(s, null);
        const out = lists[ply], n = generate(s, out), child = states[ply + 1];
        let total = 0;
        for (let i = 0; i < n; i++) {
            play(s, child, out[i]);
            total += visit(ply + 1);
        }
        return total;
    }
    return visit(0);
}
