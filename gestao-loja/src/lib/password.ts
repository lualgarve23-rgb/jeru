// Regras de senha (loja.md §7B): mínimo 8 caracteres, ao menos 1 letra e 1 número
export function passwordRuleError(next: string): string | null {
  if (next.length < 8) return "A nova senha deve ter pelo menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(next) || !/\d/.test(next))
    return "A nova senha deve conter ao menos uma letra e um número.";
  return null;
}
