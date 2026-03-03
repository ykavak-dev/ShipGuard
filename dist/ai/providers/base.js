"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIProvider = void 0;
// ═════════════════════════════════════════════════════════════════════════════
// Abstract AIProvider
// ═════════════════════════════════════════════════════════════════════════════
class AIProvider {
    constructor() {
        this.tokenUsage = { input: 0, output: 0, cost: 0 };
    }
    getTokenUsage() {
        return { ...this.tokenUsage };
    }
    trackTokens(input, output, cost) {
        this.tokenUsage.input += input;
        this.tokenUsage.output += output;
        this.tokenUsage.cost += cost;
    }
}
exports.AIProvider = AIProvider;
//# sourceMappingURL=base.js.map