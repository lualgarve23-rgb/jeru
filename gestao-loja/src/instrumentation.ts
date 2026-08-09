import { type Instrumentation } from "next";

// Observabilidade (#14): todo erro de request no servidor vira uma linha
// JSON estruturada no journal — sem depender de provedor externo.
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  const { logError } = await import("@/lib/log");
  logError("request.erro", err, {
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routeType: context.routeType,
    digest:
      typeof err === "object" && err !== null && "digest" in err
        ? String((err as { digest: unknown }).digest)
        : undefined,
  });
};
