#pragma once

#include <functional>
#include <string>
#include <string_view>
#include <vector>

// Tiny arithmetic evaluator for computed signals. Grammar (recursive descent):
//
//   expr   := term (('+'|'-') term)*
//   term   := factor (('*'|'/') factor)*
//   factor := '-' factor | '(' expr ')' | number | identifier
//
// Identifiers are signal references resolved at compile time to a numeric slot
// index (a position in the per-message decoded-value array), so eval() is a flat
// stack machine over a double[] with no map lookups or allocation. Identifier
// chars are [A-Za-z0-9_.] and must start with a letter/underscore; '.' supports
// the cross-message `Message.Signal` form. '-' is always the minus operator, so
// dashes are not allowed inside identifiers.
// ponytail: no functions/comparison/exponent operators yet — add to factor and
// the Op enum when a spec needs them. Ceiling: arithmetic over <= 32 operands.

namespace engine::decode {

enum class Op { PushConst, PushSlot, Add, Sub, Mul, Div, Neg };

struct Instr {
    Op op;
    double value = 0.0;  // PushConst
    int slot = -1;       // PushSlot
};

struct CompiledExpr {
    std::vector<Instr> code;
    bool ok = false;     // false if parse failed or an identifier was unresolved
};

// Resolve an identifier to a slot index, or -1 if unknown (makes compile fail).
using SlotResolver = std::function<int(std::string_view)>;

CompiledExpr compileExpr(const std::string& src, const SlotResolver& resolve);

// Evaluate against `slots` (caller guarantees indices < the array length used at
// compile time). Returns NaN if any referenced slot holds NaN, on division by
// zero, or if the expression did not compile.
double evalExpr(const CompiledExpr& expr, const double* slots);

} // namespace engine::decode
