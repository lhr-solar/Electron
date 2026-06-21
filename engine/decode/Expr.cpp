#include "Expr.h"

#include <array>
#include <cctype>
#include <cmath>
#include <cstdlib>

namespace engine::decode {

namespace {

// Single-pass recursive-descent parser that emits RPN into CompiledExpr.code.
// Kept as a small struct so the parse helpers share cursor + output state.
struct Parser {
    std::string_view src;
    const SlotResolver& resolve;
    std::size_t pos = 0;
    std::vector<Instr> out;
    bool ok = true;

    void skipSpace() {
        while (pos < src.size() && std::isspace(static_cast<unsigned char>(src[pos]))) ++pos;
    }

    char peek() {
        skipSpace();
        return pos < src.size() ? src[pos] : '\0';
    }

    static bool identStart(char c) { return std::isalpha(static_cast<unsigned char>(c)) || c == '_'; }
    static bool identChar(char c) {
        return std::isalnum(static_cast<unsigned char>(c)) || c == '_' || c == '.';
    }

    void parseExpr() {
        parseTerm();
        for (;;) {
            const char c = peek();
            if (c == '+' || c == '-') {
                ++pos;
                parseTerm();
                out.push_back({c == '+' ? Op::Add : Op::Sub, 0.0, -1});
            } else {
                break;
            }
        }
    }

    void parseTerm() {
        parseFactor();
        for (;;) {
            const char c = peek();
            if (c == '*' || c == '/') {
                ++pos;
                parseFactor();
                out.push_back({c == '*' ? Op::Mul : Op::Div, 0.0, -1});
            } else {
                break;
            }
        }
    }

    void parseFactor() {
        const char c = peek();
        if (c == '-') {
            ++pos;
            parseFactor();
            out.push_back({Op::Neg, 0.0, -1});
            return;
        }
        if (c == '(') {
            ++pos;
            parseExpr();
            if (peek() == ')') ++pos; else ok = false;
            return;
        }
        if (std::isdigit(static_cast<unsigned char>(c)) || c == '.') {
            parseNumber();
            return;
        }
        if (identStart(c)) {
            parseIdent();
            return;
        }
        ok = false;  // unexpected token (or end of input)
    }

    void parseNumber() {
        skipSpace();
        const char* begin = src.data() + pos;
        char* end = nullptr;
        const double v = std::strtod(begin, &end);
        if (end == begin) { ok = false; return; }
        pos += static_cast<std::size_t>(end - begin);
        out.push_back({Op::PushConst, v, -1});
    }

    void parseIdent() {
        skipSpace();
        const std::size_t start = pos;
        while (pos < src.size() && identChar(src[pos])) ++pos;
        const std::string_view name = src.substr(start, pos - start);
        const int slot = resolve(name);
        if (slot < 0) { ok = false; return; }
        out.push_back({Op::PushSlot, 0.0, slot});
    }
};

} // namespace

CompiledExpr compileExpr(const std::string& src, const SlotResolver& resolve) {
    Parser p{src, resolve};
    p.parseExpr();
    p.skipSpace();
    CompiledExpr expr;
    expr.ok = p.ok && p.pos == src.size();
    if (expr.ok) expr.code = std::move(p.out);
    return expr;
}

double evalExpr(const CompiledExpr& expr, const double* slots) {
    if (!expr.ok) return std::nan("");
    std::array<double, 32> stack{};
    std::size_t sp = 0;
    auto push = [&](double v) { if (sp < stack.size()) stack[sp++] = v; };
    auto pop = [&]() -> double { return sp > 0 ? stack[--sp] : std::nan(""); };

    for (const Instr& in : expr.code) {
        switch (in.op) {
            case Op::PushConst: push(in.value); break;
            case Op::PushSlot:  push(slots[in.slot]); break;
            case Op::Neg:       push(-pop()); break;
            case Op::Add: { double b = pop(), a = pop(); push(a + b); break; }
            case Op::Sub: { double b = pop(), a = pop(); push(a - b); break; }
            case Op::Mul: { double b = pop(), a = pop(); push(a * b); break; }
            case Op::Div: {
                double b = pop(), a = pop();
                push(b == 0.0 ? std::nan("") : a / b);
                break;
            }
        }
    }
    return sp == 1 ? stack[0] : std::nan("");
}

} // namespace engine::decode
