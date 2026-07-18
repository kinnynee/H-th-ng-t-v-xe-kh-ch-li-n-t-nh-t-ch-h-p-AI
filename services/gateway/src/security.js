import { GraphQLError } from "graphql";

function operationMetrics(document) {
  let aliases = 0;
  let fields = 0;
  let maxDepth = 0;
  let introspection = false;

  function visitSelectionSet(selectionSet, depth) {
    if (!selectionSet) return;
    maxDepth = Math.max(maxDepth, depth);
    for (const selection of selectionSet.selections ?? []) {
      if (selection.kind === "Field") {
        fields += 1;
        if (selection.alias) aliases += 1;
        if (String(selection.name?.value ?? "").startsWith("__")) introspection = true;
        visitSelectionSet(selection.selectionSet, depth + 1);
      } else if (selection.selectionSet) {
        visitSelectionSet(selection.selectionSet, depth);
      }
    }
  }

  for (const definition of document.definitions ?? []) {
    visitSelectionSet(definition.selectionSet, 1);
  }
  return { aliases, fields, maxDepth, introspection };
}

export function createGraphQLSecurityRule({
  allowIntrospection = false,
  maxAliases = 20,
  maxFields = 150,
  maxDepth = 12
} = {}) {
  return (context) => ({
    Document(node) {
      const metrics = operationMetrics(node);
      if (!allowIntrospection && metrics.introspection) {
        context.reportError(new GraphQLError("GraphQL introspection is disabled."));
      }
      if (metrics.aliases > maxAliases) {
        context.reportError(new GraphQLError(`GraphQL alias limit exceeded (${maxAliases}).`));
      }
      if (metrics.fields > maxFields) {
        context.reportError(new GraphQLError(`GraphQL field limit exceeded (${maxFields}).`));
      }
      if (metrics.maxDepth > maxDepth) {
        context.reportError(new GraphQLError(`GraphQL depth limit exceeded (${maxDepth}).`));
      }
    }
  });
}

export function createFixedWindowRateLimiter({ limit = 120, windowMs = 60_000 } = {}) {
  const clients = new Map();
  return (key, now = Date.now()) => {
    const current = clients.get(key);
    if (!current || now >= current.resetAt) {
      const next = { count: 1, resetAt: now + windowMs };
      clients.set(key, next);
      return { allowed: true, remaining: limit - 1, resetAt: next.resetAt };
    }
    current.count += 1;
    return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
  };
}
