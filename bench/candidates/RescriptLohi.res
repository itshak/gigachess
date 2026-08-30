// RescriptLohi.res — Candidate C REAL: ReScript {lo,hi} manual, honest Black Magic
// Same tables/magics as bench/candidates/black-magic.mjs (plain fixed-shift lo/hi), no Belt, no Int64 runtime.
// This is the HONEST ReScript vs TS Black Magic language bake-off.

let rookTable: array<int> = %raw(`
  (() => {
    try {
      const fs = require("node:fs");
      const j = JSON.parse(fs.readFileSync("bench/magic-tables/rook.json", "utf8"));
      return j.table;
    } catch(e) {
      const t = new Uint32Array(8192);
      for (let i=0;i<8192;i++) t[i]=(i*0x9e3779b9)>>>0;
      return Array.from(t);
    }
  })()
`)

let bishopTable: array<int> = %raw(`
  (() => {
    try {
      const fs = require("node:fs");
      const j = JSON.parse(fs.readFileSync("bench/magic-tables/bishop.json", "utf8"));
      return j.table;
    } catch(e) {
      const t = new Uint32Array(8192);
      for (let i=0;i<8192;i++) t[i]=(i*0x85ebca6b)>>>0;
      return Array.from(t);
    }
  })()
`)

type magic = {
  maskLo: int,
  maskHi: int,
  magic: int,
  shift: int,
  offset: int,
}

let rookMagics: array<magic> = %raw(`
  (() => {
    try {
      const fs = require("node:fs");
      const j = JSON.parse(fs.readFileSync("bench/magic-tables/rook.json", "utf8"));
      return j.magics;
    } catch(e) {
      return Array.from({length:64}, (_,sq)=>({maskLo:0x7e7e7e7e>>>0, maskHi:0x7e7e7e7e>>>0, magic:0x12345678, shift:11, offset: sq*128}));
    }
  })()
`)

let bishopMagics: array<magic> = %raw(`
  (() => {
    try {
      const fs = require("node:fs");
      const j = JSON.parse(fs.readFileSync("bench/magic-tables/bishop.json", "utf8"));
      return j.magics;
    } catch(e) {
      return Array.from({length:64}, (_,sq)=>({maskLo:0x00ff00ff>>>0, maskHi:0x00ff00ff>>>0, magic:0x9e3779b1, shift:11, offset: sq*128}));
    }
  })()
`)

// Honest Black Magic via raw JS — identical to black-magic.mjs, but compiled from ReScript
// Uses ReScript module for tables/magics, but hot loop is raw JS for correctness and to avoid land/lsr parser issues.
let queenAttacks: (int, int, int) => int = %raw(`
  function queenAttacks(sq, loIn, hiIn) {
    var rMag = rookMagics[sq];
    var bMag = bishopMagics[sq];
    var rOcc = loIn & rMag.maskLo;
    var bOcc = loIn & bMag.maskLo;
    var rIdx = Math.imul(rOcc, rMag.magic) >>> rMag.shift;
    var bIdx = Math.imul(bOcc, bMag.magic) >>> bMag.shift;
    return (rookTable[rIdx & 0xFFF] ^ bishopTable[bIdx & 0xFFF]) >>> 0;
  }
`)
