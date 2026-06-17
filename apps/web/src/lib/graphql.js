export function gql(query, variables = {}) {
  // TODO: Kết nối GraphQL Gateway sau.
  return {
    query,
    variables,
    data: null,
  };
}