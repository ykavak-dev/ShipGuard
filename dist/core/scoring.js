"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateScore = calculateScore;
function calculateScore(result) {
    const { critical, medium, low } = result;
    const score = 100 - (critical * 15 + medium * 6 + low * 2);
    return Math.max(0, score);
}
//# sourceMappingURL=scoring.js.map